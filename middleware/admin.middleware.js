const jwt = require('jsonwebtoken');
const Admin = require('../models/admin.model');

const adminMiddleware = async function(req, res, next) {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ message: 'Требуется авторизация админа' });
        }

        let decoded;
        try {
            // Используем специальный секрет для админских токенов
            decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET);
            
            // Проверяем, что токен действительно админский
            if (!decoded.type || decoded.type !== 'admin') {
                return res.status(403).json({ message: 'Недействительный тип токена' });
            }
        } catch (error) {
            return res.status(401).json({ message: 'Недействительный токен' });
        }

        const admin = await Admin.findById(decoded.adminId);
        if (!admin) {
            return res.status(403).json({ message: 'Администратор не найден' });
        }

        req.admin = admin;
        next();
    } catch (error) {
        return res.status(401).json({ message: 'Ошибка авторизации' });
    }
};

module.exports = adminMiddleware; 