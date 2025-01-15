const express = require('express');
const router = express.Router();
const applicationService = require('../services/application.service');
const { clientAuth, adminAuth } = require('../middleware/auth.middleware');

// Эти роуты должны быть в начале файла
router.get('/export', async (req, res) => {
    try {
        console.log('Export query:', req.query);
        const filters = {
            // Если приходит массив - используем его, если строка - разделяем по запятой
            clients: Array.isArray(req.query.clients) ? req.query.clients : req.query.clients?.split(','),
            companies: Array.isArray(req.query.companies) ? req.query.companies : req.query.companies?.split(','),
            sellers: Array.isArray(req.query.sellers) ? req.query.sellers : req.query.sellers?.split(','),
            statuses: Array.isArray(req.query.statuses) ? req.query.statuses : req.query.statuses?.split(','),
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
        
        const result = await applicationService.getApplicationsForExport(filters);
        res.json(result);
    } catch (error) {
        console.error('Error exporting applications:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Ошибка при экспорте данных' 
        });
    }
});

router.get('/active/count', adminAuth, async (req, res) => {
    try {
        const result = await applicationService.getActiveApplicationsCount();
        res.json(result);
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: 'Ошибка при получении количества активных заявок' 
        });
    }
});

// Получение данных для селекторов
router.get('/selectors', adminAuth, async (req, res) => {
    try {
        const selectors = await applicationService.getAllSelectors();
        res.json(selectors);
    } catch (error) {
        res.status(500).json({ message: error.message || 'Ошибка при получении данных селекторов' });
    }
});

// Создание новой заявки
router.post('/', clientAuth, async (req, res, next) => {
    try {
        const applicationData = {
            userId: req.user.userId,
            ...req.body
        };
        const application = await applicationService.createApplication(applicationData);
        res.status(201).json(application);
    } catch (error) {
        next(error);
    }
});

// Получение заявок пользователя
router.get('/my', clientAuth, async (req, res, next) => {
    try {
        const applications = await applicationService.getUserApplications(req.user.userId);
        res.json(applications);
    } catch (error) {
        next(error);
    }
});

// Получение конкретной заявки
router.get('/:id', clientAuth, async (req, res, next) => {
    try {
        const application = await applicationService.getApplicationById(req.params.id);
        if (!application) {
            return res.status(404).json({ message: 'Заявка не найдена' });
        }
        
        // Проверяем, принадлежит ли заявка пользователю
        if (application.user.toString() !== req.user.userId) {
            return res.status(403).json({ message: 'Нет доступа к этой заявке' });
        }
        
        res.json(application);
    } catch (error) {
        next(error);
    }
});

// Обновление статуса заявки
router.patch('/:id/status', adminAuth, async (req, res, next) => {
    try {
        const { status } = req.body;
        console.log(req.user.userId, 122)
        const application = await applicationService.updateApplicationStatus(
            req.params.id, 
            status,
            req.user.userId
        );
        res.json(application);
    } catch (error) {
        next(error);
    }
});

router.get('/', adminAuth, async (req, res, next) => {
    try {
        const filters = {
            clients: req.query.clients?.split(','),
            companies: req.query.companies?.split(','),
            sellers: req.query.sellers?.split(','),
            statuses: req.query.statuses?.split(','),
            dateStart: req.query.dateStart,
            dateEnd: req.query.dateEnd,
            sumFrom: req.query.sumFrom,
            sumTo: req.query.sumTo,
            search: req.query.search
        };
        console.log(filters, 123)
        const pagination = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 10
        };

        const activeOnly = req.query.activeOnly === 'true';
        const result = await applicationService.getApplications(filters, pagination, activeOnly);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Получение заявок компании
router.get('/company/:id', adminAuth, async (req, res, next) => {
    try {
        const filters = {
            dateStart: req.query.dateStart,
            dateEnd: req.query.dateEnd,
            statuses: req.query.statuses?.split(','),
            sellers: req.query.sellers?.split(','),
            clients: req.query.clients?.split(','),
            sumFrom: req.query.sumFrom,
            sumTo: req.query.sumTo
        };

        const pagination = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 10
        };

        const result = await applicationService.getCompanyApplications(
            req.params.id,
            filters,
            pagination
        );
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Получение детальной информации о заявке
router.get('/:id/details', adminAuth, async (req, res, next) => {
    try {
        const details = await applicationService.getApplicationDetails(req.params.id);
        res.json(details);
    } catch (error) {
        next(error);
    }
});

// Обновление статусов заявки
router.put('/:id/status', adminAuth, async (req, res, next) => {
    try {
        const { statuses } = req.body;
        const result = await applicationService.updateApplicationStatus(req.params.id, statuses, req.user.userId);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Обновление информации о заявке
router.put('/:id', adminAuth, async (req, res, next) => {
    try {
        console.log('Received update request:', {
            id: req.params.id,
            userId: req.user.userId,
            data: req.body.data
        });

        const result = await applicationService.updateApplication(
            req.params.id,
            req.user.userId,
            req.body.data
        );
        res.json(result);
    } catch (error) {
        console.error('Error in application update route:', error);
        res.status(500).json({
            message: error.message || 'Внутренняя ошибка сервера',
            error: error.toString()
        });
    }
});

router.patch('/:applicationId/status', adminAuth, async (req, res, next) => {
    try {
        const { status } = req.body;
        // Преобразуем строку ID в ObjectId
        const adminId = req.user._id;
        
        const result = await applicationService.updateApplicationStatus(
            req.params.applicationId,
            status,
            adminId
        );
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Получение истории заявки
router.get('/:id/history', adminAuth, async (req, res, next) => {
    try {
        const history = await applicationService.getApplicationHistory(req.params.id);
        res.json(history);
    } catch (error) {
        next(error);
    }
});

module.exports = router; 