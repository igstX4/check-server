const mongoose = require('mongoose');

const checkSchema = new mongoose.Schema({
    date: {
        type: Date,
        required: true
    },
    application: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Application',
        required: true
    },
    product: {
        type: String,
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    pricePerUnit: {
        type: Number,
        required: true
    },
    unit: {
        type: String,
        required: true
    }
});

// Преобразование для ответа
checkSchema.set('toJSON', {
    transform: function(doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        ret.date = ret.date.toISOString();
        return ret;
    }
});

module.exports = mongoose.model('Check', checkSchema); 