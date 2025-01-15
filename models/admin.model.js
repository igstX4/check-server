const { Schema, model } = require('mongoose');

const AdminSchema = new Schema({
    name: { 
        type: String, 
        required: true 
    },
    login: { 
        type: String, 
        required: true, 
        unique: true 
    },
    password: { 
        type: String, 
        required: true 
    },
    isSuperAdmin: { 
        type: Boolean, 
        default: false 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = model('Admin', AdminSchema); 