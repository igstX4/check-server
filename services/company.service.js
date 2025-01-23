const Company = require('../models/company.model');
const Application = require('../models/application.model');
const Check = require('../models/check.model');
const mongoose = require('mongoose');
const Seller = require('../models/seller.model');
const User = require('../models/user.model');

class CompanyService {
    async getCompanies({ page, limit, search }) {
        try {
            const query = {};
            if (search) {
                query.$or = [
                    { name: { $regex: search, $options: 'i' } },
                    { inn: { $regex: search, $options: 'i' } }
                ];
            }

            // Преобразуем параметры пагинации в числа
            const pageNum = parseInt(page) || 1;
            const limitNum = parseInt(limit) || 10;

            // Получаем компании с агрегацией для подсчета заявок
            const companies = await Company.aggregate([
                { $match: query },
                {
                    $lookup: {
                        from: 'applications',
                        localField: '_id',
                        foreignField: 'company',
                        as: 'applications'
                    }
                },
                {
                    $addFields: {
                        totalApplications: { $size: '$applications' },
                        activeApplications: {
                            $size: {
                                $filter: {
                                    input: '$applications',
                                    as: 'app',
                                    cond: { $not: { $in: ['us_paid', '$$app.status'] } }
                                }
                            }
                        }
                    }
                },
                {
                    $project: {
                        _id: 1,
                        name: 1,
                        inn: 1,
                        createdAt: 1,
                        totalApplications: 1,
                        activeApplications: 1
                    }
                },
                { $skip: (pageNum - 1) * limitNum },
                { $limit: limitNum }
            ]);

            // Получаем общее количество для пагинации
            const total = await Company.countDocuments(query);

            // Преобразуем _id в id для фронтенда
            const formattedCompanies = companies.map(company => ({
                id: company._id.toString(),
                name: company.name,
                inn: company.inn,
                createdAt: company.createdAt,
                totalApplications: company.totalApplications,
                activeApplications: company.activeApplications
            }));

            return {
                companies: formattedCompanies,
                pagination: {
                    total,
                    page: pageNum,
                    limit: limitNum,
                    pages: Math.ceil(total / limitNum)
                }
            };
        } catch (error) {
            console.error('Error in getCompanies:', error);
            throw error;
        }
    }

    async getCompanyDetails(companyId) {
        try {
            const company = await Company.findById(companyId);
            if (!company) {
                throw new Error('Компания не найдена');
            }

            // Получаем все заявки компании с агрегацией
            const applications = await Application.aggregate([
                { 
                    $match: { 
                        company: new mongoose.Types.ObjectId(companyId) 
                    } 
                },
                {
                    $lookup: {
                        from: 'checks',
                        localField: '_id',
                        foreignField: 'application',
                        as: 'checks'
                    }
                },
                {
                    $addFields: {
                        totalAmount: {
                            $reduce: {
                                input: '$checks',
                                initialValue: 0,
                                in: {
                                    $add: [
                                        '$$value',
                                        { 
                                            $multiply: [
                                                { $ifNull: ['$$this.quantity', 0] },
                                                { $ifNull: ['$$this.pricePerUnit', 0] }
                                            ]
                                        }
                                    ]
                                }
                            }
                        },
                        checksCount: { $size: '$checks' },
                        statuses: { $ifNull: ['$statuses', []] }
                    }
                }
            ]);

            // Считаем статистику
            const statistics = applications.reduce((acc, app) => {
                if (Array.isArray(app.statuses) && !app.statuses.includes('us_paid')) {
                    acc.activeApplications++;
                    acc.activeAmount += app.totalAmount || 0;
                }
                acc.totalApplications++;
                acc.totalAmount += app.totalAmount || 0;
                return acc;
            }, { 
                activeApplications: 0, 
                totalApplications: 0,
                activeAmount: 0,
                totalAmount: 0
            });

            return {
                ...company.toObject(),
                ...statistics
            };
        } catch (error) {
            console.error('Error in getCompanyDetails:', error);
            throw error;
        }
    }

    async getCompanyApplications(companyId, filters, pagination) {
        try {
            const matchStage = { 
                company: new mongoose.Types.ObjectId(companyId) 
            };

            // Добавляем поиск по разным полям
            if (filters.search) {
                // Получаем все компании, которые соответствуют поисковому запросу
                const matchingCompanies = await Company.find({
                    $or: [
                        { name: { $regex: filters.search, $options: 'i' } },
                        { inn: { $regex: filters.search, $options: 'i' } }
                    ]
                }).select('_id');

                const companyIds = matchingCompanies.map(c => c._id);

                // Получаем всех продавцов, которые соответствуют поисковому запросу
                const matchingSellers = await Seller.find({
                    $or: [
                        { name: { $regex: filters.search, $options: 'i' } },
                        { inn: { $regex: filters.search, $options: 'i' } }
                    ]
                }).select('_id');

                const sellerIds = matchingSellers.map(s => s._id);

                // Получаем всех пользователей, которые соответствуют поисковому запросу
                const matchingUsers = await User.find({
                    $or: [
                        { name: { $regex: filters.search, $options: 'i' } },
                        { inn: { $regex: filters.search, $options: 'i' } }
                    ]
                }).select('_id');

                const userIds = matchingUsers.map(u => u._id);

                // Объединяем все условия поиска
                matchStage.$or = [
                    { company: { $in: companyIds } },
                    { seller: { $in: sellerIds } },
                    { user: { $in: userIds } }
                ];
            }

            // Фильтр по клиентам (исправляем название поля)
            if (Array.isArray(filters.clients) && filters.clients.length > 0) {
                const validClientIds = filters.clients
                    .filter(id => mongoose.Types.ObjectId.isValid(id))
                    .map(id => new mongoose.Types.ObjectId(id));
                
                if (validClientIds.length) {
                    matchStage.user = { $in: validClientIds };
                }
            }

            // Фильтр по статусам (исправляем логику)
            if (Array.isArray(filters.statuses) && filters.statuses.length > 0) {
                matchStage.status = { 
                    $in: filters.statuses.filter(Boolean)
                };
            }

            // Фильтр по продавцам
            if (Array.isArray(filters.sellers) && filters.sellers.length > 0) {
                const validSellerIds = filters.sellers
                    .filter(id => mongoose.Types.ObjectId.isValid(id))
                    .map(id => new mongoose.Types.ObjectId(id));
                
                if (validSellerIds.length) {
                    matchStage.seller = { $in: validSellerIds };
                }
            }

            // Фильтр по датам
            if (filters.dateStart || filters.dateEnd) {
                const dateMatch = {};
                if (filters.dateStart) {
                    dateMatch.$gte = new Date(filters.dateStart);
                }
                if (filters.dateEnd) {
                    const endDate = new Date(filters.dateEnd);
                    endDate.setHours(23, 59, 59, 999);
                    dateMatch.$lte = endDate;
                }
                if (Object.keys(dateMatch).length > 0) {
                    matchStage.createdAt = dateMatch;
                }
            }

            console.log('Match stage:', JSON.stringify(matchStage, null, 2));

            const pipeline = [
                { $match: matchStage },
                {
                    $lookup: {
                        from: 'checks',
                        localField: '_id',
                        foreignField: 'application',
                        as: 'checks'
                    }
                },
                {
                    $lookup: {
                        from: 'companies',
                        localField: 'company',
                        foreignField: '_id',
                        as: 'companyData'
                    }
                },
                {
                    $lookup: {
                        from: 'sellers',
                        localField: 'seller',
                        foreignField: '_id',
                        as: 'sellerData'
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'user',
                        foreignField: '_id',
                        as: 'userData'
                    }
                },
                {
                    $addFields: {
                        totalAmount: {
                            $reduce: {
                                input: '$checks',
                                initialValue: 0,
                                in: {
                                    $add: [
                                        '$$value',
                                        { 
                                            $multiply: [
                                                { $ifNull: ['$$this.quantity', 0] },
                                                { $ifNull: ['$$this.pricePerUnit', 0] }
                                            ]
                                        }
                                    ]
                                }
                            }
                        },
                        checksCount: { $size: '$checks' },
                        company: { $arrayElemAt: ['$companyData', 0] },
                        seller: { $arrayElemAt: ['$sellerData', 0] },
                        user: { $arrayElemAt: ['$userData', 0] },
                        date: {
                            start: { $min: '$checks.date' },
                            end: { $max: '$checks.date' }
                        }
                    }
                },
                {
                    $project: {
                        companyData: 0,
                        sellerData: 0,
                        userData: 0,
                        checks: 0
                    }
                }
            ];

            // Фильтр по сумме (перемещаем после вычисления totalAmount)
            if (filters.sumFrom || filters.sumTo) {
                const sumMatch = {};
                if (filters.sumFrom) {
                    sumMatch.$gte = parseFloat(filters.sumFrom);
                }
                if (filters.sumTo) {
                    sumMatch.$lte = parseFloat(filters.sumTo);
                }
                if (Object.keys(sumMatch).length > 0) {
                    pipeline.push({
                        $match: { totalAmount: sumMatch }
                    });
                }
            }

            const [applications, totalCount] = await Promise.all([
                Application.aggregate([
                    ...pipeline,
                    { $skip: ((pagination.page || 1) - 1) * (pagination.limit || 10) },
                    { $limit: pagination.limit || 10 }
                ]),
                Application.aggregate([
                    ...pipeline,
                    { $count: 'total' }
                ])
            ]);

            console.log('Found applications:', applications.length);

            return {
                applications,
                pagination: {
                    total: totalCount[0]?.total || 0,
                    page: pagination.page || 1,
                    limit: pagination.limit || 10,
                    pages: Math.ceil((totalCount[0]?.total || 0) / (pagination.limit || 10))
                }
            };
        } catch (error) {
            console.error('Error in getCompanyApplications:', error);
            throw error;
        }
    }

    async updateCompany(companyId, updateData) {
        try {
            const company = await Company.findByIdAndUpdate(
                companyId,
                { $set: updateData },
                { new: true }
            );

            if (!company) {
                throw new Error('Компания не найдена');
            }

            return company;
        } catch (error) {
            throw error;
        }
    }
}

module.exports = new CompanyService(); 