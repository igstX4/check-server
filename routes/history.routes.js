const express = require('express');
const router = express.Router();
const historyService = require('../services/history.service');
const { adminAuth } = require('../middleware/auth.middleware');

router.get('/application/:applicationId', adminAuth, async (req, res, next) => {
    try {
        const history = await historyService.getApplicationHistory(req.params.applicationId);
        res.json(history);
    } catch (error) {
        next(error);
    }
});

// Добавление записи в историю
router.post('/', adminAuth, async (req, res, next) => {
    try {
        const { applicationId, action, changes } = req.body;
        const record = await historyService.addHistoryRecord(
            applicationId,
            req.user.userId,
            'Admin',
            action,
            changes
        );
        res.status(201).json(record);
    } catch (error) {
        next(error);
    }
});

module.exports = router; 