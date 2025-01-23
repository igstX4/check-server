const express = require('express');
const router = express.Router();
const companyService = require('../services/company.service');
const { clientAuth, adminAuth } = require('../middleware/auth.middleware');

// Получение списка компаний
router.get('/', adminAuth, async (req, res, next) => {
    try {
        const { page = 1, limit = 10, search = '' } = req.query;
        const result = await companyService.getCompanies({ page, limit, search });
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Получение детальной информации о компании
router.get('/:id', adminAuth, async (req, res, next) => {
    try {
        const company = await companyService.getCompanyDetails(req.params.id);
        res.json(company);
    } catch (error) {
        next(error);
    }
});

// Получение заявок компании
router.get('/:id/applications', adminAuth, async (req, res, next) => {
    try {
        const filters = {
            clients: req.query.clients?.split(','),
            dateStart: req.query.dateStart,
            dateEnd: req.query.dateEnd,
            statuses: req.query.statuses?.split(','),
            sellers: req.query.sellers?.split(','),
            sumFrom: req.query.sumFrom,
            sumTo: req.query.sumTo,
            search: req.query.search
        };

        const pagination = {
            page: parseInt(req.query.page) || 1,
            limit: parseInt(req.query.limit) || 10
        };
        
        const result = await companyService.getCompanyApplications(req.params.id, filters, pagination);
        res.json(result);
    } catch (error) {
        next(error);
    }
});

// Обновление информации о компании
router.put('/:id', adminAuth, async (req, res, next) => {
    try {
        const company = await companyService.updateCompany(req.params.id, req.body);
        res.json(company);
    } catch (error) {
        next(error);
    }
});

module.exports = router; 