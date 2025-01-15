const errorMiddleware = function(err, req, res, next) {
    console.error('Error:', err);
    
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            message: 'Ошибка валидации',
            errors: Object.values(err.errors).map(e => e.message)
        });
    }

    if (err.code === 11000) {
        return res.status(400).json({
            message: 'Такой ключ уже существует'
        });
    }

    res.status(500).json({
        message: err.message || 'Внутренняя ошибка сервера'
    });
};

module.exports = errorMiddleware; 