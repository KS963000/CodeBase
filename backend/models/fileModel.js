const mongoose = require("mongoose");
const User = require("./userModel");
const Project = require("./projectModel");

const fileSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    path: {
        type: String,
        required: true
    },
    isFolder: {
        type: Boolean,
        default: false
    },
    content: {
        type: Buffer,
        required: function () { return !this.isFolder; }
    },
    files: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'File'
    }],
    parentFolder: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'File',
        default: null
    },
    authorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    language: {
        type: String,
        required: function () { return !this.isFolder; }
    },
    projectId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true
    },
    fileType: {
        type: String,
        enum: ['main', 'input', 'output', 'other'],
        default: 'other'
    },
    testcases: [{
        input: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'File'
        },
        output: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'File',
            default: null
        }
    }],
}, {
    timestamps: true
});

fileSchema.index(
    { name: "text", description: "text", tags: "text", content: "text" },
    { default_language: "none", language_override: "none" }
);

fileSchema.virtual('fullPath').get(function () {
    return this.path + '/' + this.name;
});

fileSchema.statics.createFolderStructure = async function (structure, parentId = null, authorId, projectId) {
    const createdFiles = [];

    for (const item of structure) {
        const fileData = {
            name: item.name,
            path: item.path,
            isFolder: item.isFolder,
            authorId: authorId,
            parentFolder: parentId,
            projectId: projectId,
            fileType: item.fileType || 'other',
        };

        if (!item.isFolder) {
            fileData.content = item.content || Buffer.from('');
            fileData.language = item.language;
        }

        console.log(`Creating file/folder: ${fileData.name}, Type: ${fileData.fileType}, IsFolder: ${fileData.isFolder}`);

        const file = await this.create(fileData);

        console.log(`Created file/folder: ${file.name}, Type: ${file.fileType}, IsFolder: ${file.isFolder}, ID: ${file._id}`);

        if (item.isFolder && item.files) {
            const childFiles = await this.createFolderStructure(item.files, file._id, authorId, projectId);
            file.files = childFiles.map(f => f._id);
            await file.save();
            createdFiles.push(file, ...childFiles);  // Add both the folder and its children
        } else {
            createdFiles.push(file);
        }
    }

    return createdFiles;
};

fileSchema.statics.getProjectFileStructure = async function(projectId) {
    const project = await Project.findById(projectId).populate('rootFolder');
    if (!project || !project.rootFolder) {
        throw new Error('Project or root folder not found');
    }

    const allItems = await this.find({ projectId: projectId }).sort({ path: 1, name: 1 });

    const root = {
        id: project.rootFolder._id,
        name: project.rootFolder.name,
        type: 'folder',
        children: []
    };

    const buildTree = (item, parentPath) => {
        const itemPath = item.path === '/' ? item.name : `${item.path}/${item.name}`;
        const node = {
            id: item._id,
            name: item.name,
            type: item.isFolder ? 'folder' : 'file',
            path: itemPath,
        };
    
        if (!item.isFolder) {
            node.language = item.language;
            node.fileType = item.fileType
        }
    
        if (itemPath === parentPath) {
            return node;
        }
    
        let parent = root;
        const pathParts = parentPath.split('/').filter(Boolean);
        for (const part of pathParts) {
            parent = parent.children.find(child => child.name === part);
            if (!parent) break;
        }
    
        if (parent) {
            if (!parent.children) parent.children = [];
            parent.children.push(node);
        }
    
        return null;
    };

    for (const item of allItems) {
        buildTree(item, item.path);
    }

    return root;
};

const File = mongoose.model("File", fileSchema);

module.exports = File;