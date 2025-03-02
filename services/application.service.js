const { Application } = require('../models/application.model');
const Company = require('../models/company.model');
const User = require('../models/user.model');
const { Check, CheckCounter: Counter } = require('../models/check.model');
const Seller = require('../models/seller.model');
const History = require('../models/history.model');
const mongoose = require('mongoose');


const Admin = require('../models/admin.model');

const axios = require('axios');



async function sendTelegramMessage(userName, applicationId, companyName, companyInn, checksCount) {
    const TELEGRAM_BOT_TOKEN = '7666198160:AAF35lyKhT_OLfwgzAuCCvwpRjMLedXN_jU';
    const CHAT_ID = '-1002399620468'; // ID группы или пользователя
    const applicationUrl = `https://checkplatform.ru/admin/application/${applicationId}`;

    const message = `📝 *Новая заявка создана!*  
📌 *Компания:* ${companyName}  
🆔 *ИНН:* ${companyInn}  
👤 *Пользователь:* ${userName}  
🛒 *Количество чеков:* ${checksCount}  

🔗 [Перейти к заявке](${applicationUrl})`;

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
        await axios.post(url, {
            chat_id: CHAT_ID,
            text: message,
            parse_mode: 'Markdown',
            disable_web_page_preview: true
        });
    } catch (error) {
        console.error('Ошибка при отправке сообщения в Telegram:', error);
    }
}


class ApplicationService {
    async createApplication(data) {
        const { userId, companyName, companyInn, sellerId, shouldSaveCompany, checks } = data;
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            let company = await Company.findOne({ inn: companyInn });

            if (company) {
                if (company.name !== companyName) {
                    throw new Error('Компания с таким ИНН уже существует, но имя не совпадает');
                }
            } else {
                company = new Company({ name: companyName, inn: companyInn });
                await company.save({ session });
            }

            if (shouldSaveCompany) {
                const user = await User.findById(userId);
                if (!user) throw new Error('Пользователь не найден');
                if (!user.canSave) throw new Error('У вас нет прав на сохранение компаний');

                if (!user.savedCompanies.includes(company._id)) {
                    user.savedCompanies.push(company._id);
                    await user.save({ session });
                }
            }

            const application = new Application({
                user: userId,
                company: company._id,
                seller: sellerId,
                status: ['created']
            });

            await application.save({ session });

            if (checks && checks.length > 0) {
                const checksPromises = checks.map(check => {
                    const newCheck = new Check({
                        application: application._id,
                        date: check.date,
                        product: check.product,
                        quantity: check.quantity,
                        pricePerUnit: check.pricePerUnit,
                        unit: check.unit
                    });
                    return newCheck.save({ session });
                });

                await Promise.all(checksPromises);
            }

            await application.updateTotals();
            await session.commitTransaction();

            const populatedApplication = await Application.findById(application._id)
                .populate('company')
                .populate('seller')
                .populate('user'); // Добавляем user, чтобы получить name

            // 🔹 Отправка уведомления в Telegram  
            await sendTelegramMessage(
                populatedApplication.user.name, // Имя пользователя
                application._id,
                company.name,
                company.inn,
                checks?.length || 0
            );

            return populatedApplication;
        } catch (error) {
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    async getUserApplications(userId, filters, pagination) {
        try {
            const query = { user: new mongoose.Types.ObjectId(userId) };

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

                // Объединяем все условия поиска
                query.$or = [
                    { company: { $in: companyIds } },
                    { seller: { $in: sellerIds } }
                ];
            }

            // Фильтрация по дате создания заявки
            if (filters.dateStart || filters.dateEnd) {
                query.createdAt = {};
                if (filters.dateStart) {
                    query.createdAt.$gte = new Date(filters.dateStart);
                }
                if (filters.dateEnd) {
                    const endDate = new Date(filters.dateEnd);
                    endDate.setHours(23, 59, 59, 999);
                    query.createdAt.$lte = endDate;
                }
            }

            // Остальные фильтры
            if (filters.companies?.length && filters.companies.some(id => id)) {
                query['company'] = { $in: filters.companies.filter(id => id) };
            }

            if (filters.sellers?.length && filters.sellers.some(id => id)) {
                query['seller'] = { $in: filters.sellers.filter(id => id) };
            }

            if (filters.statuses?.length && filters.statuses.some(status => status)) {
                query.status = { $in: filters.statuses.filter(status => status) };
            }

            // Получаем заявки и чеки
            const [applications, total] = await Promise.all([
                Application.find(query)
                    .populate('company')
                    .populate('seller')
                    .sort({ createdAt: -1 }),
                Application.countDocuments(query)
            ]);

            const applicationIds = applications.map(app => app._id);
            const checks = await Check.find({
                application: { $in: applicationIds }
            }).select('date application quantity pricePerUnit');

            // Фильтруем заявки только по суммам
            const filteredApplications = applications.filter(app => {
                const appChecks = checks.filter(check =>
                    check.application.toString() === app._id.toString()
                );

                if (appChecks.length === 0) return false;

                // Вычисляем общую сумму для заявки
                const totalAmount = appChecks.reduce((sum, check) =>
                    sum + (check.quantity * check.pricePerUnit), 0
                );

                // Проверяем только диапазон сумм
                return (!filters.sumFrom || totalAmount >= Number(filters.sumFrom)) &&
                    (!filters.sumTo || totalAmount <= Number(filters.sumTo));
            });

            // Применяем пагинацию после фильтрации
            const paginatedApplications = filteredApplications.slice(
                (pagination.page - 1) * pagination.limit,
                pagination.page * pagination.limit
            );

            // Обогащаем отфильтрованные заявки данными
            const enrichedApplications = paginatedApplications.map(app => {
                const appChecks = checks.filter(check =>
                    check.application.toString() === app._id.toString()
                );

                const enrichedApp = app.toJSON();
                const checkDates = appChecks.map(check => new Date(check.date));

                enrichedApp.date = {
                    start: checkDates.length ?
                        checkDates.reduce((a, b) => a < b ? a : b).toISOString().split('T')[0] : null,
                    end: checkDates.length ?
                        checkDates.reduce((a, b) => a > b ? a : b).toISOString().split('T')[0] : null
                };

                enrichedApp.checksCount = appChecks.length;
                enrichedApp.totalAmount = appChecks.reduce((sum, check) =>
                    sum + (check.quantity * check.pricePerUnit), 0
                );

                // Добавляем отформатированную дату создания
                enrichedApp.createdAt = this.formatCreatedAt(app.createdAt);

                return enrichedApp;
            });

            return {
                applications: enrichedApplications,
                pagination: {
                    total: filteredApplications.length,
                    page: pagination.page,
                    limit: pagination.limit,
                    pages: Math.ceil(filteredApplications.length / pagination.limit)
                }
            };
        } catch (error) {
            console.error('Error in getUserApplications:', error);
            throw error;
        }
    }

    async getApplicationById(applicationId) {
        return Application.findById(applicationId)
            .populate('company')
            .populate('seller');
    }

    async updateApplication(applicationId, adminId, data) {
        try {
            const application = await Application.findById(applicationId);
            if (!application) {
                throw new Error('Заявка не найдена');
            }

            // Обрабатываем удаление чеков
            if (data.checksToDelete && data.checksToDelete.length > 0) {
                await Check.deleteMany({
                    _id: { $in: data.checksToDelete }
                });
            }

            // Обрабатываем добавление новых чеков
            if (data.checksToAdd && data.checksToAdd.length > 0) {
                const newChecks = await Promise.all(data.checksToAdd.map(async (check) => {
                    // Преобразуем дату из формата DD/MM/YY в YYYY-MM-DD
                    const [day, month, year] = check.date.split('/');
                    const fullYear = year.length === 2 ? `20${year}` : year;
                    const formattedDate = `${fullYear}-${month}-${day}`;
                    const currentCounter = await Counter.findOneAndUpdate(
                        { _id: 'checkNumber' },
                        { $inc: { seq: 1 } },
                        { new: true }
                    );
                    return {
                        ...check,
                        checkNumber: currentCounter.seq,
                        application: applicationId,
                        date: new Date(formattedDate), // теперь дата будет корректно преобразована
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                }));
                await Check.insertMany(newChecks); // Correctly call insertMany with an array of objects
            }

            // Обновляем данные компании
            if (data.buyer) {
                let company = await Company.findOne({ inn: data.buyer.inn });
                if (company) {
                    if (company.name !== data.buyer.name) {
                        throw new Error('Невозможно изменить название компании. Компания с таким ИНН уже зарегистрирована');
                    }
                } else {
                    company = await Company.create({
                        name: data.buyer.name,
                        inn: data.buyer.inn
                    });
                }
                application.company = company._id;
            }

            // Обновляем продавца
            if (data.seller && data.seller.id) {
                application.seller = data.seller.id;
            }

            // Обновляем комиссию
            if (data.commission) {
                application.commission = parseFloat(data.commission.percentage);
            }

            // Сохраняем изменения
            await application.save();

            // Добавляем запись в историю
            application.history.push({
                type: 'change',
                admin: adminId,
                message: 'Заявка изменена' +
                    (data.checksToDelete?.length ? `. Удалено чеков: ${data.checksToDelete.length}` : '') +
                    (data.checksToAdd?.length ? `. Добавлено чеков: ${data.checksToAdd.length}` : ''),
                createdAt: new Date()
            });

            await application.save();

            // Возвращаем обновленную заявку
            const updatedApplication = await Application.findById(applicationId)
                .populate('seller')
                .populate('company')
                .populate('user');

            return updatedApplication;
        } catch (error) {
            console.error('Error in updateApplication:', error);
            throw error;
        }
    }

    async getApplications(filters, pagination, activeOnly = false) {
        try {
            const query = {};

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
                query.$or = [
                    { company: { $in: companyIds } },
                    { seller: { $in: sellerIds } },
                    { user: { $in: userIds } }
                ];
            }

            // Изменяем логику фильтрации активных заявок
            if (activeOnly) {
                query.status = { $not: { $all: ['us_paid'] } };
            }

            // Добавляем фильтрацию по дате создания заявки
            if (filters.dateStart || filters.dateEnd) {
                query.createdAt = {};
                if (filters.dateStart) {
                    // Устанавливаем начало дня (00:00:00)
                    const startDate = new Date(filters.dateStart);
                    startDate.setHours(0, 0, 0, 0);
                    query.createdAt.$gte = startDate;
                }
                if (filters.dateEnd) {
                    // Устанавливаем конец дня (23:59:59.999)
                    const endDate = new Date(filters.dateEnd);
                    endDate.setHours(23, 59, 59, 999);
                    query.createdAt.$lte = endDate;
                }
            }

            // Если есть фильтр по статусам, он должен переопределить фильтр activeOnly
            if (filters.statuses?.length && filters.statuses.some(status => status)) {
                query.status = {
                    $in: filters.statuses.filter(status => status)
                };
            }

            // Фильтр по клиентам
            if (filters.clients?.length && filters.clients.some(id => id)) {
                query['user'] = { $in: filters.clients.filter(id => id) };
            }

            // Фильтр по компаниям
            if (filters.companies?.length && filters.companies.some(id => id)) {
                query['company'] = { $in: filters.companies.filter(id => id) };
            }

            // Фильтр по продавцам
            if (filters.sellers?.length && filters.sellers.some(id => id)) {
                query['seller'] = { $in: filters.sellers.filter(id => id) };
            }

            // Получаем заявки и чеки
            const [applications, total] = await Promise.all([
                Application.find(query)
                    .populate('user')
                    .populate('company')
                    .populate('seller')
                    .sort({ createdAt: -1 }),
                Application.countDocuments(query)
            ]);

            const applicationIds = applications.map(app => app._id);
            const checks = await Check.find({
                application: { $in: applicationIds }
            }).select('date application quantity pricePerUnit');

            // Фильтруем заявки только по суммам, убираем фильтрацию по датам чеков
            const filteredApplications = applications.filter(app => {
                const appChecks = checks.filter(check =>
                    check.application.toString() === app._id.toString()
                );

                if (appChecks.length === 0) return false;

                // Вычисляем общую сумму для заявки
                const totalAmount = appChecks.reduce((sum, check) =>
                    sum + (check.quantity * check.pricePerUnit), 0
                );

                // Проверяем диапазон сумм
                const isInSumRange = (
                    (!filters.sumFrom || totalAmount >= Number(filters.sumFrom)) &&
                    (!filters.sumTo || totalAmount <= Number(filters.sumTo))
                );

                return isInSumRange;
            });

            // Применяем пагинацию после фильтрации
            const paginatedApplications = filteredApplications.slice(
                (pagination.page - 1) * pagination.limit,
                pagination.page * pagination.limit
            );

            // Обогащаем отфильтрованные заявки данными
            const enrichedApplications = paginatedApplications.map(app => {
                const appChecks = checks.filter(check =>
                    check.application.toString() === app._id.toString()
                );

                const enrichedApp = app.toJSON();
                const checkDates = appChecks.map(check => new Date(check.date));

                enrichedApp.date = {
                    start: checkDates.length ?
                        checkDates.reduce((a, b) => a < b ? a : b).toISOString().split('T')[0] : null,
                    end: checkDates.length ?
                        checkDates.reduce((a, b) => a > b ? a : b).toISOString().split('T')[0] : null
                };

                enrichedApp.checksCount = appChecks.length;
                enrichedApp.totalAmount = appChecks.reduce((sum, check) =>
                    sum + (check.quantity * check.pricePerUnit), 0
                );

                // Добавляем отформатированную дату создания
                enrichedApp.createdAt = this.formatCreatedAt(app.createdAt);

                return enrichedApp;
            });

            return {
                applications: enrichedApplications,
                pagination: {
                    total: filteredApplications.length,
                    page: pagination.page,
                    limit: pagination.limit,
                    pages: Math.ceil(filteredApplications.length / pagination.limit)
                }
            };
        } catch (error) {
            console.error('Error in getApplications:', error);
            throw error;
        }
    }

    async getAllSelectors() {
        try {
            const [companies, sellers, users] = await Promise.all([
                Company.find().select('name inn'),
                Seller.find().select('name inn'),
                User.find().select('name inn')
            ]);

            return {
                companies: companies.map(c => ({ id: c._id, name: c.name, inn: c.inn })),
                sellers: sellers.map(s => ({ id: s._id, name: s.name, inn: s.inn })),
                users: users.map(u => ({ id: u._id, name: u.name, inn: u.inn }))
            };
        } catch (error) {
            console.error('Error in getAllSelectors:', error);
            throw error;
        }
    }

    async getCompanyApplications(companyId, filters, pagination) {
        try {
            // Базовый запрос
            console.log('filters', filters);
            const query = { company: new mongoose.Types.ObjectId(companyId) };

            // Получаем заявки и чеки
            const [applications, total] = await Promise.all([
                Application.find(query)
                    .populate('user')
                    .populate('company')
                    .populate('seller')
                    .sort({ createdAt: -1 }),
                Application.countDocuments(query)
            ]);

            const applicationIds = applications.map(app => app._id);
            const checks = await Check.find({
                application: { $in: applicationIds }
            }).select('date application quantity pricePerUnit');

            // Фильтруем заявки по датам чеков и суммам
            const filteredApplications = applications.filter(app => {
                const appChecks = checks.filter(check =>
                    check.application.toString() === app._id.toString()
                );

                if (appChecks.length === 0) return false;

                // Вычисляем общую сумму для заявки
                const totalAmount = appChecks.reduce((sum, check) =>
                    sum + (check.quantity * check.pricePerUnit), 0
                );

                // Проверяем диапазон сумм
                const isInSumRange = (
                    (!filters.sumFrom || totalAmount >= Number(filters.sumFrom)) &&
                    (!filters.sumTo || totalAmount <= Number(filters.sumTo))
                );

                // Проверяем диапазон дат
                let isInDateRange = true;
                if (filters.dateStart || filters.dateEnd) {
                    const checkDates = appChecks.map(check => new Date(check.date));
                    const appStartDate = new Date(Math.min(...checkDates));
                    const appEndDate = new Date(Math.max(...checkDates));

                    const filterStartDate = filters.dateStart ? new Date(filters.dateStart) : null;
                    const filterEndDate = filters.dateEnd ? new Date(filters.dateEnd) : null;

                    isInDateRange = (!filterStartDate || appEndDate >= filterStartDate) &&
                        (!filterEndDate || appStartDate <= filterEndDate);
                }

                // Проверяем остальные фильтры
                const isStatusMatch = !filters.statuses?.length ||
                    filters.statuses.some(status => app.status.includes(status));

                const isSellerMatch = !filters.sellers?.length ||
                    filters.sellers.includes(app.seller._id.toString());

                const isClientMatch = !filters.clients?.length ||
                    filters.clients.includes(app.user._id.toString());

                return isInSumRange && isInDateRange && isStatusMatch &&
                    isSellerMatch && isClientMatch;
            });

            // Применяем пагинацию после фильтрации
            const paginatedApplications = filteredApplications.slice(
                (pagination.page - 1) * pagination.limit,
                pagination.page * pagination.limit
            );

            // Обогащаем отфильтрованные заявки данными
            const enrichedApplications = paginatedApplications.map(app => {
                const appChecks = checks.filter(check =>
                    check.application.toString() === app._id.toString()
                );

                const checkDates = appChecks.map(check => new Date(check.date));

                return {
                    id: app._id,
                    status: app.status,
                    company: {
                        id: app.company._id,
                        name: app.company.name,
                        inn: app.company.inn
                    },
                    seller: {
                        id: app.seller._id,
                        name: app.seller.name,
                        inn: app.seller.inn
                    },
                    checksCount: appChecks.length,
                    totalAmount: appChecks.reduce((sum, check) =>
                        sum + (check.quantity * check.pricePerUnit), 0
                    ),
                    date: {
                        start: checkDates.length ?
                            checkDates.reduce((a, b) => a < b ? a : b).toISOString().split('T')[0] : null,
                        end: checkDates.length ?
                            checkDates.reduce((a, b) => a > b ? a : b).toISOString().split('T')[0] : null
                    },
                    user: {
                        _id: app.user._id,
                        name: app.user.name,
                        inn: app.user.inn
                    }
                };
            });

            return {
                applications: enrichedApplications,
                pagination: {
                    total: filteredApplications.length,
                    page: pagination.page,
                    limit: pagination.limit,
                    pages: Math.ceil(filteredApplications.length / pagination.limit)
                }
            };

        } catch (error) {
            console.error('Error in getCompanyApplications:', error);
            throw error;
        }
    }

    formatDate(date) {
        if (!date) return null;
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }

    async getApplicationDetails(applicationId) {
        try {
            const application = await Application.findById(applicationId)
                .select('applicationNumber status commission totalAmount checksCount createdAt history')
                .populate('user', 'name inn')
                .populate('company', 'name inn')
                .populate('seller', 'name inn type')
                .populate({
                    path: 'history',
                    populate: {
                        path: 'admin',
                        select: 'name'
                    }
                });

            if (!application) {
                throw new Error('Заявка не найдена');
            }

            const checks = await Check.find({ application: applicationId })
                .sort({ date: 1 });

            // Форматируем чеки
            const formattedChecks = checks.map(check => ({
                id: check._id,
                checkNumber: check.checkNumber,
                date: this.formatDate(check.date),
                product: check.product,
                quantity: check.quantity,
                pricePerUnit: check.pricePerUnit,
                unit: check.unit,
                totalPrice: check.quantity * check.pricePerUnit
            }));

            // Вычисляем даты из чеков
            const dates = {
                start: formattedChecks.length ? this.formatDate(checks[0].date) : null,
                end: formattedChecks.length ? this.formatDate(checks[checks.length - 1].date) : null
            };

            // Вычисляем VAT
            const vat = application.totalAmount * 0.2;

            return {
                id: application._id,
                applicationNumber: application.applicationNumber,
                status: application.status,
                seller: application.seller ? {
                    id: application.seller._id,
                    name: application.seller.name,
                    inn: application.seller.inn,
                    type: application.seller.type
                } : null,
                company: application.company ? {
                    id: application.company._id,
                    name: application.company.name,
                    inn: application.company.inn
                } : null,
                user: application.user ? {
                    id: application.user._id,
                    name: application.user.name,
                    inn: application.user.inn
                } : null,
                commission: application.formattedCommission,
                dates,
                createdAt: this.formatCreatedAt(application.createdAt),
                checksCount: application.checksCount,
                totalAmount: application.totalAmount.toFixed(2),
                vat: vat.toFixed(2),
                history: application.history,
                checks: formattedChecks
            };
        } catch (error) {
            console.error('Error in getApplicationDetails:', error);
            throw error;
        }
    }

    async updateApplicationStatus(applicationId, status, adminId) {
        try {
            const application = await Application.findById(applicationId);
            if (!application) {
                throw new Error('Заявка не найдена');
            }

            const oldStatuses = Array.isArray(application.status) ? application.status : [application.status];
            const newStatuses = Array.isArray(status) ? status : [status];

            // Находим добавленные и удаленные статусы
            const addedStatuses = newStatuses.filter(s => !oldStatuses.includes(s));
            const removedStatuses = oldStatuses.filter(s => !newStatuses.includes(s));

            application.status = status;

            // Добавляем записи в историю для каждого измененного статуса
            [...addedStatuses, ...removedStatuses].forEach(changedStatus => {
                const isAdded = addedStatuses.includes(changedStatus);
                application.history.push({
                    type: 'status',
                    admin: adminId,
                    message: isAdded ? 'Добавлен статус' : 'Удален статус',
                    status: changedStatus,
                    action: isAdded ? 'add' : 'remove',
                    createdAt: new Date()
                });
            });

            await application.save();
            return {
                id: application._id,
                status: application.status
            };
        } catch (error) {
            console.error('Error in updateApplicationStatus:', error);
            throw error;
        }
    }

    async updateApplicationInfo(applicationId, adminId, data) {
        const session = await mongoose.startSession();
        session.startTransaction();

        try {
            console.log('Received data:', data);

            const application = await Application.findById(applicationId);
            if (!application) {
                throw new Error('Заявка не найдена');
            }

            // Получаем данные админа
            const admin = await Admin.findById(adminId);
            if (!admin) {
                throw new Error('Администратор не найден');
            }

            const updateData = {};

            if (data && typeof data === 'object') {
                if (data.buyer) {
                    updateData.company = data.buyer.id;
                }

                if (data.seller) {
                    updateData.seller = data.seller.id;
                }

                if (data.commission) {
                    updateData.commission = {
                        percentage: data.commission.percentage || application.commission.percentage,
                        amount: data.commission.amount || application.commission.amount
                    };
                }
            }

            console.log('Update data:', updateData);

            if (Object.keys(updateData).length > 0) {
                // Добавляем запись в историю с именем админа
                application.history.push({
                    type: 'change',
                    admin: adminId,
                    message: 'Заявка изменена',
                    userName: admin.name, // Добавляем имя админа
                    createdAt: new Date()
                });

                // Обновляем данные заявки
                Object.assign(application, updateData);

                // Сохраняем заявку
                await application.save({ session });

                await session.commitTransaction();

                // Получаем обновленные данные через getApplicationDetails
                return await this.getApplicationDetails(applicationId);
            }

            await session.commitTransaction();
            return await this.getApplicationDetails(applicationId);

        } catch (error) {
            console.error('Error in updateApplicationInfo:', error);
            await session.abortTransaction();
            throw error;
        } finally {
            session.endSession();
        }
    }

    async updateStatus(applicationId, status, adminId) {
        const application = await Application.findById(applicationId);
        if (!application) {
            throw new Error('Заявка не найдена');
        }

        const oldStatus = application.status;
        application.status = status;

        // Добавляем запись в историю
        application.history.push({
            type: 'status',
            admin: adminId,
            message: `Статус изменен с "${oldStatus}" на "${status}"`,
            status: status,
            createdAt: new Date()
        });

        await application.save();
        return application;
    }

    async getApplicationHistory(applicationId) {
        try {
            const application = await Application.findById(applicationId)
                .populate({
                    path: 'history.admin',
                    model: 'Admin',
                    select: 'name'
                });

            if (!application) {
                throw new Error('Заявка не найдена');
            }

            return application.history.map(record => ({
                id: record._id,
                type: record.type,
                message: record.type === 'change' ? 'Заявка изменена пользователем' : record.message,
                status: record.status,
                action: record.action,
                userName: record.admin ? record.admin.name : undefined, // Получаем актуальное имя админа
                createdAt: record.createdAt
            }));
        } catch (error) {
            console.error('Error in getApplicationHistory:', error);
            throw error;
        }
    }

    async getActiveApplicationsCount() {
        try {
            const count = await Application.countDocuments({
                status: { $not: { $all: ['us_paid'] } }
            });
            return { success: true, count };
        } catch (error) {
            console.error('Error getting active applications count:', error);
            throw error;
        }
    }

    async getApplicationsForExport(filters) {
        try {
            const applications = await Application.find(this.buildFilterQuery(filters))
                .select('applicationNumber status company seller user createdAt')
                .populate('company', 'name')
                .populate('seller', 'name')
                .populate('user', 'name')
                .sort({ createdAt: -1 });

            // Получаем ID всех заявок
            const applicationIds = applications.map(app => app._id);

            // Получаем чеки для всех заявок
            const checks = await Check.find({
                application: { $in: applicationIds }
            }).select('application quantity pricePerUnit');

            // Группируем чеки по заявкам для быстрого доступа
            const checksMap = checks.reduce((acc, check) => {
                const appId = check.application.toString();
                if (!acc[appId]) {
                    acc[appId] = [];
                }
                acc[appId].push(check);
                return acc;
            }, {});

            // Объект для перевода статусов
            const STATUS_LABELS = {
                created: 'Создана',
                issued: 'В работе',
                client_paid: 'Оплачено клиентом',
                us_paid: 'Оплачено нами'
            };

            const formattedData = applications.map(app => {
                const applicationChecks = checksMap[app._id.toString()] || [];
                const totalSum = applicationChecks.reduce((sum, check) =>
                    sum + (check.quantity * check.pricePerUnit), 0
                );

                // Переводим статусы
                const translatedStatuses = Array.isArray(app.status)
                    ? app.status.map(status => STATUS_LABELS[status] || status).join(', ')
                    : STATUS_LABELS[app.status] || app.status;

                return {
                    applicationNumber: app.applicationNumber,
                    date: app.createdAt.toLocaleDateString('ru-RU'),
                    client: app.user?.name || 'Не указан',
                    company: app.company?.name || 'Не указана',
                    seller: app.seller?.name || 'Не указан',
                    sum: totalSum ? totalSum.toLocaleString('ru-RU') + ' ₽' : '0 ₽',
                    status: translatedStatuses
                };
            });

            return {
                success: true,
                data: formattedData,
                total: formattedData.length
            };
        } catch (error) {
            console.error('Error exporting applications:', error);
            throw error;
        }
    }

    // Добавим вспомогательную функцию для форматирования даты
    formatCreatedAt(date) {
        if (!date) return null;
        const d = new Date(date);
        const day = d.getDate().toString().padStart(2, '0');
        const month = (d.getMonth() + 1).toString().padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }

    buildFilterQuery(filters) {
        const query = {};

        if (filters.clients?.length) {
            query.user = { $in: filters.clients };
        }

        if (filters.companies?.length) {
            query.company = { $in: filters.companies };
        }

        if (filters.sellers?.length) {
            query.seller = { $in: filters.sellers };
        }

        if (filters.statuses?.length) {
            query.status = { $in: filters.statuses };
        }

        if (filters.dateStart || filters.dateEnd) {
            query.createdAt = {};
            if (filters.dateStart) {
                query.createdAt.$gte = new Date(filters.dateStart);
            }
            if (filters.dateEnd) {
                query.createdAt.$lte = new Date(filters.dateEnd);
            }
        }

        return query;
    }
}

module.exports = new ApplicationService();