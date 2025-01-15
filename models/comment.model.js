const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema({
    application: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Application',
        required: true
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        refPath: 'authorType',
        required: true
    },
    authorType: {
        type: String,
        enum: ['Admin', 'User'],
        required: true
    },
    text: {
        type: String,
        required: true
    },
    file: {
        originalName: String,
        filename: String,
        path: String,
        mimetype: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Comment', commentSchema); 