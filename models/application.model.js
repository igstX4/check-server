const mongoose = require('mongoose');

// Создаем схему для автоинкремента
const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
});

const Counter = mongoose.model('Counter', counterSchema);

const applicationSchema = new mongoose.Schema({
    applicationNumber: {
        type: Number,
        unique: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    seller: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Seller',
        required: true
    },
    status: [{
        type: String,
        enum: ['created', 'issued', 'client_paid', 'us_paid'],
        default: ['created']
    }],
    commission: {
        type: Number,
        default: 10,
        min: 0,
        max: 100,
        set: function(v) {
            // Если передан объект, извлекаем percentage
            if (typeof v === 'object' && v.percentage) {
                return parseFloat(v.percentage);
            }
            return parseFloat(v);
        }
    },
    totalAmount: {
        type: Number,
        default: 0
    },
    checksCount: {
        type: Number,
        default: 0
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    history: [{
        type: {
            type: String,
            enum: ['status', 'change'],
            required: true
        },
        admin: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Admin',
            required: true
        },
        message: {
            type: String,
            required: true
        },
        status: {
            type: String,
            required: function() {
                return this.type === 'status';
            }
        },
        action: String,
        userId: String,
        userName: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }]
});

// Добавляем pre-save middleware для автоинкремента
applicationSchema.pre('save', async function(next) {
    if (this.isNew) {
        try {
            const counter = await Counter.findByIdAndUpdate(
                { _id: 'applicationNumber' },
                { $inc: { seq: 1 } },
                { new: true, upsert: true }
            );
            this.applicationNumber = counter.seq;
        } catch (error) {
            return next(error);
        }
    }
    next();
});

// Обновляем преобразование для ответа
applicationSchema.set('toJSON', {
    transform: function(doc, ret) {
        ret.id = ret._id; // Оставляем MongoDB ID
        ret.applicationNumber = ret.applicationNumber; // Добавляем номер заявки
        delete ret._id;
        delete ret.__v;
        ret.createdAt = ret.createdAt.toISOString();
        return ret;
    }
});

// Middleware для обновления количества чеков и общей суммы
applicationSchema.methods.updateTotals = async function() {
    const Check = mongoose.model('Check');
    const checks = await Check.find({ application: this._id });
    
    this.checksCount = checks.length;
    
    // Добавляем проверки и безопасное вычисление
    const totalAmount = checks.reduce((sum, check) => {
        const quantity = Number(check.quantity) || 0;
        const price = Number(check.pricePerUnit) || 0;
        return sum + (quantity * price);
    }, 0);

    // Убеждаемся, что totalAmount - валидное число
    this.totalAmount = isNaN(totalAmount) ? 0 : totalAmount;
    
    // Безопасное вычисление VAT
    this.vat = this.totalAmount * 0.2;
    
    await this.save();
};

// Добавим pre-save middleware для проверки значений
applicationSchema.pre('save', function(next) {
    // Проверяем totalAmount перед сохранением
    if (isNaN(this.totalAmount)) {
        this.totalAmount = 0;
    }
    
    // Проверяем vat перед сохранением
    if (isNaN(this.vat)) {
        this.vat = 0;
    }
    
    // Проверяем checksCount
    if (isNaN(this.checksCount)) {
        this.checksCount = 0;
    }
    
    next();
});

// Добавим виртуальное поле для форматированной комиссии
applicationSchema.virtual('formattedCommission').get(function() {
    return {
        percentage: this.commission.toString(),
        amount: ((this.totalAmount * this.commission) / 100).toFixed(2)
    };
});

module.exports = mongoose.model('Application', applicationSchema); 