const mongoose = require('mongoose');

// Создаем схему для автоинкремента чеков
const checkCounterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
});

const CheckCounter = mongoose.model('CheckCounter', checkCounterSchema);

const checkSchema = new mongoose.Schema({
    checkNumber: {
        type: Number,
        unique: true
    },
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

// Добавляем pre-save middleware для автоинкремента
checkSchema.pre('save', async function(next) {
    if (this.isNew) {
        try {
            const counter = await CheckCounter.findByIdAndUpdate(
                { _id: 'checkNumber' },
                { $inc: { seq: 1 } },
                { new: true, upsert: true }
            );
            this.checkNumber = counter.seq;
        } catch (error) {
            return next(error);
        }
    }
    next();
});

// Обновляем преобразование для ответа
checkSchema.set('toJSON', {
    transform: function(doc, ret) {
        ret.id = ret._id;
        ret.checkNumber = ret.checkNumber;
        delete ret._id;
        delete ret.__v;
        ret.date = ret.date.toISOString();
        return ret;
    }
});

module.exports = {
    Check: mongoose.model('Check', checkSchema),
    CheckCounter: CheckCounter
};