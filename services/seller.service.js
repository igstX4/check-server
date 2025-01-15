const Seller = require('../models/seller.model');

class SellerService {
    async createSeller(data) {
        const existingSeller = await Seller.findOne({ inn: data.inn });
        if (existingSeller) {
            throw new Error('Продавец с таким ИНН уже существует');
        }

        const seller = new Seller(data);
        await seller.save();
        return seller;
    }

    async getAllSellers(filters = {}) {
        const query = {};
        
        // Фильтр по типу
        if (filters.types && filters.types.length > 0) {
            query.type = { $in: filters.types };
        }

        // Поиск по имени или ИНН
        if (filters.search) {
            query.$or = [
                { name: { $regex: filters.search, $options: 'i' } },
                { inn: { $regex: filters.search, $options: 'i' } }
            ];
        }

        return Seller.find(query).sort({ createdAt: -1 });
    }

    async updateSeller(sellerId, data) {
        if (data.inn) {
            const existingSeller = await Seller.findOne({ 
                inn: data.inn,
                _id: { $ne: sellerId }
            });
            if (existingSeller) {
                throw new Error('Продавец с таким ИНН уже существует');
            }
        }

        const seller = await Seller.findByIdAndUpdate(
            sellerId,
            { $set: data },
            { new: true }
        );

        if (!seller) {
            throw new Error('Продавец не найден');
        }

        return seller;
    }

    async deleteSeller(sellerId) {
        const seller = await Seller.findByIdAndDelete(sellerId);
        if (!seller) {
            throw new Error('Продавец не найден');
        }
        return seller;
    }

    async getSellerById(sellerId) {
        const seller = await Seller.findById(sellerId);
        if (!seller) {
            throw new Error('Продавец не найден');
        }
        return {
            id: seller._id,
            name: seller.name,
            inn: seller.inn,
            type: seller.type,
            tg_link: seller.tg_link
        };
    }
}

module.exports = new SellerService(); 