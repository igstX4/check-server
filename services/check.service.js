const Check = require('../models/check.model');
const mongoose = require('mongoose');

class CheckService {
    async getChecks(filters, pagination) {
        try {
            const { 
                companies,
                sellers,
                dateStart,
                dateEnd,
                sumFrom,
                sumTo,
                search
            } = filters;
            console.log(filters, 122);
            const pipeline = [
                // Присоединяем данные заявки
                {
                    $lookup: {
                        from: 'applications',
                        localField: 'application',
                        foreignField: '_id',
                        as: 'applicationData'
                    }
                },
                { $unwind: '$applicationData' },

                // Присоединяем данные компании
                {
                    $lookup: {
                        from: 'companies',
                        localField: 'applicationData.company',
                        foreignField: '_id',
                        as: 'companyData'
                    }
                },
                { $unwind: '$companyData' },

                // Присоединяем данные продавца
                {
                    $lookup: {
                        from: 'sellers',
                        localField: 'applicationData.seller',
                        foreignField: '_id',
                        as: 'sellerData'
                    }
                },
                { $unwind: '$sellerData' },

                // Добавляем вычисляемые поля
                {
                    $addFields: {
                        totalPrice: { $multiply: ['$quantity', '$pricePerUnit'] },
                        vat: { $multiply: [{ $multiply: ['$quantity', '$pricePerUnit'] }, 0.2] }
                    }
                }
            ];

            // Формируем условия фильтрации
            const matchConditions = {};

            if (search) {
                matchConditions.$or = [
                    { 'companyData.name': { $regex: search, $options: 'i' } },
                    { 'sellerData.name': { $regex: search, $options: 'i' } }
                ];
            }

            if (companies && companies.length && companies.some(id => id)) {
                matchConditions['applicationData.company'] = {
                    $in: companies.filter(id => id).map(id => new mongoose.Types.ObjectId(id))
                };
            }

            if (sellers && sellers.length && sellers.some(id => id)) {
                matchConditions['applicationData.seller'] = {
                    $in: sellers.filter(id => id).map(id => new mongoose.Types.ObjectId(id))
                };
            }

            if (dateStart || dateEnd) {
                matchConditions.date = {};
                if (dateStart) matchConditions.date.$gte = new Date(dateStart);
                if (dateEnd) matchConditions.date.$lte = new Date(dateEnd);
            }

            if (sumFrom || sumTo) {
                matchConditions.totalPrice = {};
                if (sumFrom) matchConditions.totalPrice.$gte = parseFloat(sumFrom);
                if (sumTo) matchConditions.totalPrice.$lte = parseFloat(sumTo);
            }

            // Добавляем фильтрацию в пайплайн
            if (Object.keys(matchConditions).length > 0) {
                pipeline.push({ $match: matchConditions });
            }

            // Добавляем сортировку и пагинацию
            pipeline.push(
                { $sort: { date: -1 } },
                { $skip: (pagination.page - 1) * pagination.limit },
                { $limit: pagination.limit }
            );

            // Формируем итоговый документ
            pipeline.push({
                $project: {
                    _id: 1,
                    date: 1,
                    product: 1,
                    quantity: 1,
                    pricePerUnit: 1,
                    unit: 1,
                    totalPrice: 1,
                    vat: 1,
                    application: {
                        _id: '$applicationData._id',
                        company: '$companyData',
                        seller: '$sellerData',
                        totalAmount: '$applicationData.totalAmount',
                        checksCount: '$applicationData.checksCount'
                    }
                }
            });

            // Выполняем запрос
            const [checks, totalCount] = await Promise.all([
                Check.aggregate(pipeline),
                Check.aggregate([...pipeline.slice(0, -3), { $count: 'total' }])
            ]);

            return {
                checks: checks.map(check => ({
                    ...check,
                    id: check._id
                })),
                pagination: {
                    total: totalCount[0]?.total || 0,
                    page: pagination.page,
                    limit: pagination.limit,
                    pages: Math.ceil((totalCount[0]?.total || 0) / pagination.limit)
                }
            };
        } catch (error) {
            console.error('Error in getChecks:', error);
            throw error;
        }
    }

    async createCheck(data) {
        const { applicationId, date, product, quantity, pricePerUnit } = data;

        // Проверяем существование заявки
        const application = await Application.findById(applicationId);
        if (!application) {
            throw new Error('Заявка не найдена');
        }

        // Создаем чек
        const check = new Check({
            application: applicationId,
            date,
            product,
            quantity,
            pricePerUnit
        });

        await check.save();

        // Обновляем общую сумму и количество чеков в заявке
        await application.updateTotals();

        return check;
    }

    async getApplicationChecks(applicationId) {
        return Check.find({ application: applicationId })
            .sort({ date: -1 });
    }

    async updateCheck(checkId, data) {
        const check = await Check.findByIdAndUpdate(
            checkId,
            { $set: data },
            { new: true }
        );

        if (!check) {
            throw new Error('Чек не найден');
        }

        // Обновляем общую сумму в заявке
        const application = await Application.findById(check.application);
        await application.updateTotals();

        return check;
    }

    async deleteCheck(checkId) {
        const check = await Check.findById(checkId);
        if (!check) {
            throw new Error('Чек не найден');
        }

        const applicationId = check.application;
        await check.remove();

        // Обновляем общую сумму в заявке
        const application = await Application.findById(applicationId);
        await application.updateTotals();

        return { success: true };
    }

    async getChecksForExport(filters) {
        try {
            const pipeline = [
                // Присоединяем данные заявки
                {
                    $lookup: {
                        from: 'applications',
                        localField: 'application',
                        foreignField: '_id',
                        as: 'applicationData'
                    }
                },
                { $unwind: '$applicationData' },

                // Присоединяем данные компании
                {
                    $lookup: {
                        from: 'companies',
                        localField: 'applicationData.company',
                        foreignField: '_id',
                        as: 'companyData'
                    }
                },
                { $unwind: '$companyData' },

                // Присоединяем данные продавца
                {
                    $lookup: {
                        from: 'sellers',
                        localField: 'applicationData.seller',
                        foreignField: '_id',
                        as: 'sellerData'
                    }
                },
                { $unwind: '$sellerData' },

                // Добавляем вычисляемые поля
                {
                    $addFields: {
                        totalPrice: { $multiply: ['$quantity', '$pricePerUnit'] },
                        vat: { $multiply: [{ $multiply: ['$quantity', '$pricePerUnit'] }, 0.2] }
                    }
                }
            ];

            // Формируем условия фильтрации
            const matchConditions = {};

            if (filters.companies?.length) {
                matchConditions['applicationData.company'] = {
                    $in: filters.companies.map(id => new mongoose.Types.ObjectId(id))
                };
            }

            if (filters.sellers?.length) {
                matchConditions['applicationData.seller'] = {
                    $in: filters.sellers.map(id => new mongoose.Types.ObjectId(id))
                };
            }

            if (filters.dateStart || filters.dateEnd) {
                matchConditions.date = {};
                if (filters.dateStart) matchConditions.date.$gte = new Date(filters.dateStart);
                if (filters.dateEnd) matchConditions.date.$lte = new Date(filters.dateEnd);
            }

            if (filters.sumFrom || filters.sumTo) {
                matchConditions.totalPrice = {};
                if (filters.sumFrom) matchConditions.totalPrice.$gte = parseFloat(filters.sumFrom);
                if (filters.sumTo) matchConditions.totalPrice.$lte = parseFloat(filters.sumTo);
            }

            // Добавляем фильтрацию в пайплайн
            if (Object.keys(matchConditions).length > 0) {
                pipeline.push({ $match: matchConditions });
            }

            // Сортировка по дате
            pipeline.push({ $sort: { date: -1 } });

            const checks = await Check.aggregate(pipeline);

            const formattedData = checks.map(check => ({
                id: check._id,
                date: new Date(check.date).toLocaleDateString('ru-RU'),
                company: check.companyData.name,
                seller: check.sellerData.name,
                product: check.product,
                quantity: check.quantity,
                pricePerUnit: check.pricePerUnit.toLocaleString('ru-RU') + ' ₽',
                totalPrice: check.totalPrice.toLocaleString('ru-RU') + ' ₽',
                vat: check.vat.toLocaleString('ru-RU') + ' ₽'
            }));

            return {
                success: true,
                data: formattedData,
                total: formattedData.length
            };
        } catch (error) {
            console.error('Error exporting checks:', error);
            throw error;
        }
    }
}

module.exports = new CheckService(); 