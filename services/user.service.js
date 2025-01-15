const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const User = require('../models/user.model');
const Application = require('../models/application.model');
const Check = require('../models/check.model');
const mongoose = require('mongoose');

class UserService {
  async register(name, canSave = false) {
    const existingUser = await User.findOne({ name });
    if (existingUser) {
      throw new Error('Пользователь с таким именем уже существует');
    }

    const key = uuidv4();
    const user = new User({
      name,
      key,
      canSave
    });
    await user.save();
    
    return {
      user,
      key: user.key
    };
  }

  async login(key) {
    const user = await User.findOne({ key });
    if (!user) {
      throw new Error('Пользователь не найден');
    }
    
    const token = this.generateToken(user._id);
    return {
      user,
      token
    };
  }

  generateToken(userId) {
    return jwt.sign(
      { userId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
  }

  async getAllUsers() {
    const users = await User.find({}, { 
      name: 1, 
      createdAt: 1,
      key: 1,
      canSave: 1,
      isBlocked: 1,
      _id: 1
    });

    // Получаем статистику для каждого пользователя
    const usersWithStats = await Promise.all(users.map(async (user) => {
        const applications = await Application.find({ user: user._id });
        
        return {
            ...user.toObject(),
            activeApplications: applications.filter(app => !app.status.includes('us_paid')).length,
            totalApplications: applications.length,
            registrationDate: user.createdAt.toISOString().split('T')[0]
        };
    }));

    return usersWithStats;
  }

  async updateUser(userId, userData) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('Пользователь не найден');
    }

    if (userData.name) {
      const existingUser = await User.findOne({ 
        name: userData.name,
        _id: { $ne: userId }
      });
      if (existingUser) {
        throw new Error('Пользователь с таким именем уже существует');
      }
      user.name = userData.name;
    }

    if (typeof userData.canSave === 'boolean') {
      user.canSave = userData.canSave;
    }

    if (typeof userData.isBlocked === 'boolean') {
      user.isBlocked = userData.isBlocked;
    }

    await user.save();
    return user;
  }

  async deleteUser(userId) {
    const user = await User.findByIdAndDelete(userId);
    if (!user) {
      throw new Error('Пользователь не найден');
    }
    return user;
  }

  async getSavedCompanies(userId) {
    const user = await User.findById(userId).populate('savedCompanies');
    if (!user) {
      throw new Error('Пользователь не найден');
    }
    return user.savedCompanies;
  }

  async addSavedCompany(userId, companyId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('Пользователь не найден');
    }

    if (!user.canSave) {
      throw new Error('У вас нет прав на сохранение компаний');
    }

    if (!user.savedCompanies.includes(companyId)) {
      user.savedCompanies.push(companyId);
      await user.save();
    }

    return user.savedCompanies;
  }

  async removeSavedCompany(userId, companyId) {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('Пользователь не найден');
    }

    user.savedCompanies = user.savedCompanies.filter(id => id.toString() !== companyId);
    await user.save();

    return user.savedCompanies;
  }

  async getUserDetails(userId) {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('Пользователь не найден');
        }

        // Получаем заявки пользователя
        const applications = await Application.find({ user: userId })
            .populate('user')
            .populate('company')
            .populate('seller')
            .sort({ createdAt: -1 });

        const applicationIds = applications.map(app => app._id);
        const checks = await Check.find({
            application: { $in: applicationIds }
        }).select('date application quantity pricePerUnit');

        // Обогащаем заявки данными о чеках
        const enrichedApplications = applications.map(app => {
            const appChecks = checks.filter(check => 
                check.application.toString() === app._id.toString()
            );
            
            const enrichedApp = app.toJSON();
            const checkDates = appChecks.map(check => new Date(check.date));
            
            return {
                id: app._id,
                status: app.status,
                company: app.company,
                seller: app.seller,
                date: {
                    start: checkDates.length ? 
                        checkDates.reduce((a, b) => a < b ? a : b).toISOString().split('T')[0] : null,
                    end: checkDates.length ? 
                        checkDates.reduce((a, b) => a > b ? a : b).toISOString().split('T')[0] : null
                },
                checksCount: appChecks.length,
                totalAmount: appChecks.reduce((sum, check) => 
                    sum + (check.quantity * check.pricePerUnit), 0
                ),
                user: {
                    _id: user._id,
                    name: user.name,
                    inn: user.inn
                }
            };
        });

        return {
            user: {
                _id: user._id,
                name: user.name,
                inn: user.inn,
                isBlocked: user.isBlocked,
                createdAt: user.createdAt
            },
            statistics: {
                activeApplications: enrichedApplications.filter(app => !app.status.includes('us_paid')).length,
                totalApplications: enrichedApplications.length,
                totalChecks: enrichedApplications.reduce((sum, app) => sum + app.checksCount, 0)
            },
            applications: enrichedApplications
        };
    } catch (error) {
        console.error('Error in getUserDetails:', error);
        throw error;
    }
  }

  async getUserInfo(userId) {
    try {
        const user = await User.findById(userId);
        if (!user) {
            throw new Error('Пользователь не найден');
        }

        // Получаем базовую статистику
        const applications = await Application.find({ user: userId });
        const totalChecks = await Check.countDocuments({
            'application.user._id': userId
        });

        return {
            user: {
                _id: user._id,
                name: user.name,
                inn: user.inn,
                canSave: user.canSave,
                isBlocked: user.isBlocked,
                createdAt: user.createdAt
            },
            statistics: {
                activeApplications: applications.filter(app => !app.status.includes('us_paid')).length,
                totalApplications: applications.length,
                totalChecks
            }
        };
    } catch (error) {
        console.error('Error in getUserInfo:', error);
        throw error;
    }
  }
}

module.exports = new UserService(); 