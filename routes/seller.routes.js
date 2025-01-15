const express = require('express');
const router = express.Router();
const sellerService = require('../services/seller.service');
const { adminAuth } = require('../middleware/auth.middleware');

router.post('/', adminAuth, async (req, res) => {
    try {
        const seller = await sellerService.createSeller(req.body);
        res.status(201).json(seller);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.get('/', async (req, res) => {
    try {
        const sellers = await sellerService.getAllSellers(req.query);
        res.json(sellers);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.put('/:id', adminAuth, async (req, res) => {
    try {
        const seller = await sellerService.updateSeller(req.params.id, req.body);
        res.json(seller);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

router.delete('/:id', adminAuth, async (req, res) => {
    try {
        await sellerService.deleteSeller(req.params.id);
        res.json({ message: 'Продавец успешно удален' });
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
});

module.exports = router; 