const express = require('express');
const router = express.Router();
const userService = require('../services/user.service');
const { adminAuth, clientAuth } = require('../middleware/auth.middleware');
const User = require('../models/user.model');
const applicationService = require('../services/application.service');

// Регистрация пользователя (только для админов)
router.post('/register', adminAuth, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) {
            return res.status(400).json({ message: 'Имя обязательно' });
        }
        
        const user = await userService.register(name);
        res.status(201).json(user);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.post('/login', async (req, res, next) => {
    try {
        const { key } = req.body;
        if (!key) {
            return res.status(400).json({ message: 'Ключ обязателен' });
        }

        const user = await userService.login(key);
        res.json(user);
    } catch (error) {
        next(error);
    }
});
router.get('/me', clientAuth, async (req, res, next) => {
    try {
        const user = await User.findById(req.user.userId, { 
            name: 1, 
            createdAt: 1,
            key: 1,
            canSave: 1,
            isBlocked: 1,
            _id: 1
          })
        if (!user) {
            return res.json({message : "нет доступа"})
        }
        res.json(user);
    } catch (error) {
        next(error);
    }
})
router.get('/', adminAuth, async (req, res, next) => {
    try {
        const users = await userService.getAllUsers();
        res.json(users);
    } catch (error) {
        next(error);
    }
});

// Обновление пользователя (только админ)
router.put('/:userId', adminAuth, async (req, res, next) => {
    try {
        const { userId } = req.params;
        const userData = req.body;
        
        const updatedUser = await userService.updateUser(userId, userData);
        res.json(updatedUser);
    } catch (error) {
        next(error);
    }
});

// Удаление пользователя (только админ)
router.delete('/:userId', adminAuth, async (req, res, next) => {
    try {
        const { userId } = req.params;
        await userService.deleteUser(userId);
        res.json({ message: 'Пользователь успешно удален' });
    } catch (error) {
        next(error);
    }
});

// Получение сохраненных компаний пользователя
router.get('/saved-companies', clientAuth, async (req, res, next) => {
    try {
        const companies = await userService.getSavedCompanies(req.user.userId);
        res.json(companies);
    } catch (error) {
        next(error);
    }
});

// Добавление компании в сохраненные
router.post('/saved-companies/:companyId', clientAuth, async (req, res, next) => {
    try {
        const companies = await userService.addSavedCompany(req.user.userId, req.params.companyId);
        res.json(companies);
    } catch (error) {
        next(error);
    }
});

// Удаление компании из сохраненных
router.delete('/saved-companies/:companyId', clientAuth, async (req, res, next) => {
    try {
        const companies = await userService.removeSavedCompany(req.user.userId, req.params.companyId);
        res.json(companies);
    } catch (error) {
        next(error);
    }
});

// Получение детальной информации о пользователе
router.get('/:userId/details', adminAuth, async (req, res, next) => {
    try {
        const { userId } = req.params;
        const userDetails = await userService.getUserDetails(userId);
        res.json(userDetails);
    } catch (error) {
        next(error);
    }
});

// Получение информации о пользователе
router.get('/:userId/info', adminAuth, async (req, res, next) => {
    try {
        const { userId } = req.params;
        const userInfo = await userService.getUserInfo(userId);
        res.json(userInfo);
    } catch (error) {
        next(error);
    }
});

// Получение заявок пользователя с фильтрами
router.get('/:userId/applications', adminAuth, async (req, res, next) => {
    try {
        const { userId } = req.params;
        const { page = 1, limit = 10, ...filters } = req.query;
        
        const applications = await applicationService.getUserApplications(userId, filters, {
            page: parseInt(page),
            limit: parseInt(limit)
        });
        
        res.json(applications);
    } catch (error) {
        next(error);
    }
});

module.exports = router; 