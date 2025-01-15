const mongoose = require('mongoose');

const sellerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    inn: {
        type: String,
        required: true,
        unique: true
    },
    tg_link: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['white', 'elite'],
        default: 'white'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Добавим преобразование даты при отправке
sellerSchema.set('toJSON', {
    transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        ret.createdAt = ret.createdAt.toISOString();
        return ret;
    }
});

module.exports = mongoose.model('Seller', sellerSchema); 