const express = require('express');
const router = express.Router();
const checkService = require('../services/check.service');
const { clientAuth, adminAuth } = require('../middleware/auth.middleware');

// Создание чека
router.post('/', adminAuth, async (req, res, next) => {
    try {
        const check = await checkService.createCheck(req.body);
        res.status(201).json(check);
    } catch (error) {
        next(error);
    }
});

// Получение чеков заявки
router.get('/application/:applicationId', adminAuth, async (req, res, next) => {
    try {
        const checks = await checkService.getApplicationChecks(req.params.applicationId);
        res.json(checks);
    } catch (error) {
        next(error);
    }
});

// Обновление чека
router.put('/:id', adminAuth, async (req, res, next) => {
    try {
        const check = await checkService.updateCheck(req.params.id, req.body);
        res.json(check);
    } catch (error) {
        next(error);
    }
});

// Удаление чека
router.delete('/:id', adminAuth, async (req, res, next) => {
    try {
        await checkService.deleteCheck(req.params.id);
        res.json({ message: 'Чек успешно удален' });
    } catch (error) {
        next(error);
    }
});

// Получение чеков
router.get('/', adminAuth, async (req, res, next) => {
    try {
        const filters = {
            companies: req.query.companies?.split(','),
            sellers: req.query.sellers?.split(','),
            dateStart: req.query.dateStart,
            dateEnd: req.query.dateEnd,
            sumFrom: req.query.sumFrom,
            sumTo: req.query.sumTo,
            search: req.query.search
        };

        const pagination = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 10
        };

        const result = await checkService.getChecks(filters, pagination);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Экспорт чеков
router.get('/export', adminAuth, async (req, res) => {
    try {
        const filters = {
            companies: Array.isArray(req.query.companies) ? req.query.companies : req.query.companies?.split(','),
            sellers: Array.isArray(req.query.sellers) ? req.query.sellers : req.query.sellers?.split(','),
            dateStart: req.query.dateStart,
            dateEnd: req.query.dateEnd,
            sumFrom: req.query.sumFrom,
            sumTo: req.query.sumTo
        };

        // Фильтруем undefined и пустые значения
        Object.keys(filters).forEach(key => {
            if (Array.isArray(filters[key])) {
                filters[key] = filters[key]?.filter(Boolean);
            }
        });
        
        const result = await checkService.getChecksForExport(filters);
        res.json(result);
    } catch (error) {
        console.error('Error exporting checks:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Ошибка при экспорте данных' 
        });
    }
});

module.exports = router; 