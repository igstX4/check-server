const express = require('express');
const router = express.Router();
const AdminService = require('../services/admin.service');
const { adminAuth } = require('../middleware/auth.middleware');
const Admin = require('../models/admin.model');

// Логин (публичный маршрут)
router.post('/login', async (req, res) => {
    try {
        const { login, password } = req.body;
        const adminData = await AdminService.login(login, password);
        return res.json(adminData);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
});

// Получение профиля текущего админа
router.get('/profile', adminAuth, async (req, res) => {
    try {
        const admin = await AdminService.getProfile(req.user.userId);
        if (!admin) {
            return res.status(404).json({ message: 'Админ не найден' });
        }
        return res.json(admin);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
});

// Получение всех админов (только для суперадмина)
router.get('/all', adminAuth, async (req, res) => {
    try {
        const requestingAdmin = await Admin.findById(req.user.userId);
        // console.log()
        if (!requestingAdmin?.isSuperAdmin) {
            return res.status(403).json({ message: 'Доступ запрещен. Требуются права суперадмина' });
        }

        const admins = await AdminService.getAllAdmins();
        return res.json(admins);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
});

// Регистрация нового админа (только для суперадмина)
router.post('/register', adminAuth, async (req, res) => {
    try {
        const requestingAdmin = await Admin.findById(req.user.userId);
        if (!requestingAdmin?.isSuperAdmin) {
            return res.status(403).json({ message: 'Доступ запрещен. Требуются права суперадмина' });
        }

        const { name, login, password } = req.body;
        const admin = await AdminService.register(name, login, password);
        return res.json(admin);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
});

// Обновление админа (только для суперадмина или самого себя)
router.put('/:id', adminAuth, async (req, res) => {
    try {
        const adminId = req.params.id;
        const adminData = req.body;
        const updatedAdmin = await AdminService.updateAdmin(adminId, adminData, req.user);
        return res.json(updatedAdmin);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
});

// Удаление админа (только для суперадмина)
router.delete('/:id', adminAuth, async (req, res) => {
    try {
        const requestingAdmin = await Admin.findById(req.user.userId);
        if (!requestingAdmin?.isSuperAdmin) {
            return res.status(403).json({ message: 'Доступ запрещен. Требуются права суперадмина' });
        }

        const adminId = req.params.id;
        
        const result = await AdminService.deleteAdmin(adminId, req.user.userId);

        return res.json(result);
    } catch (error) {
        return res.status(400).json({ message: error.message });
    }
});

module.exports = router;
