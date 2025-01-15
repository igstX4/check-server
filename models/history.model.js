const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
    application: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Application',
        required: true
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin',
        required: true
    },
    authorType: {
        type: String,
        enum: ['Admin', 'User'],
        required: true
    },
    type: {
        type: String,
        enum: ['status', 'change'],
        required: true
    },
    message: {
        type: String,
        required: true
    },
    status: String,
    action: {
        type: String,
        enum: ['add', 'remove']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('History', historySchema); 