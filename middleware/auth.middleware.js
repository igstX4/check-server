const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

const getUser = async (userId) => {
    const user = await User.findById(userId);
    return user;
}

const authMiddleware = (type = 'client') => {
    return async (req, res, next) => {
        try {
            // Проверяем наличие headers и authorization
            if (!req?.headers?.authorization) {
                return res.status(401).json({ message: 'Не авторизован' });
            }

            const token = req.headers.authorization.split(' ')[1];
            if (!token) {
                return res.status(401).json({ message: 'Не авторизован' });
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            // console.log(type);
            if (type === 'client') {
                const user = await getUser(decoded.userId);
                if (!user) {
                    return res.status(401).json({ message: 'Пользователь не найден2' });
                }
                
                if (user.isBlocked) {
                    return res.status(401).json({ message: 'Ваш аккаунт заблокирован. Обратитесь к администратору.' });
                }
            }
            
            // Добавляем тип пользователя и его ID в request
            req.user = {
                userId: decoded.userId,
                type: decoded.type || type
            };

            next();
        } catch (error) {
            console.error('Auth middleware error:', error);
            return res.status(401).json({ message: 'Ошибка авторизации' });
        }
    };
};

// Middleware для клиентских роутов
const clientAuth = authMiddleware('client');

// Middleware для админских роутов
const adminAuth = authMiddleware('admin');

module.exports = {
    clientAuth,
    adminAuth
}; 