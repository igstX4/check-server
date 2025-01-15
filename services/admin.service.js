const jwt = require('jsonwebtoken');
const Admin = require('../models/admin.model');

class AdminService {
  static async register(name, login, password, isSuperAdmin = false) {
    const existingAdmin = await Admin.findOne({ login });
    if (existingAdmin) {
      throw new Error('Администратор с таким логином уже существует');
    }

    const admin = new Admin({
      name,
      login,
      password,
      isSuperAdmin
    });

    await admin.save();
    return {
      id: admin._id,
      name: admin.name,
      login: admin.login,
      password: admin.password,
      isSuperAdmin: admin.isSuperAdmin,
      createdAt: admin.createdAt
    };
  }

  static async login(login, password) {
    const admin = await Admin.findOne({ login, password });
    if (!admin) {
      throw new Error('Неверный логин или пароль');
    }

    const token = AdminService.generateToken(admin._id);
    
    return {
      admin: {
        id: admin._id,
        name: admin.name,
        login: admin.login,
        password: admin.password,
        isSuperAdmin: admin.isSuperAdmin,
        createdAt: admin.createdAt
      },
      token
    };
  }

  static generateToken(adminId) {
    if (!adminId) {
      throw new Error('ID администратора не определен');
    }
    
    return jwt.sign(
      { userId : adminId },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
  }

  static async updateAdmin(adminId, adminData, requestingAdmin) {
    const requestingAdminDoc = await Admin.findById(requestingAdmin.adminId);
    if (!requestingAdminDoc) {
      throw new Error('Запрашивающий администратор не найден');
    }

    if (!requestingAdminDoc.isSuperAdmin && requestingAdminDoc._id.toString() !== adminId) {
      throw new Error('Нет прав на редактирование другого администратора');
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      throw new Error('Администратор не найден');
    }

    if (adminData.login) {
      const existingAdmin = await Admin.findOne({ 
        login: adminData.login,
        _id: { $ne: adminId }
      });
      if (existingAdmin) {
        throw new Error('Администратор с таким логином уже существует');
      }
      admin.login = adminData.login;
    }

    if (adminData.name) admin.name = adminData.name;
    if (adminData.password) admin.password = adminData.password;
    if (requestingAdminDoc.isSuperAdmin && adminData.isSuperAdmin !== undefined) {
      admin.isSuperAdmin = adminData.isSuperAdmin;
    }

    await admin.save();
    return {
      id: admin._id,
      name: admin.name,
      login: admin.login,
      password: admin.password,
      isSuperAdmin: admin.isSuperAdmin,
      createdAt: admin.createdAt
    };
  }

  static async deleteAdmin(adminId, requestingAdmin) {
    console.log(requestingAdmin)
    try {
      const requestingAdminDoc = await Admin.findById(requestingAdmin);
      if (!requestingAdminDoc) {
        throw new Error('Запрашивающий администратор не найден');
      }

      if (!requestingAdminDoc.isSuperAdmin) {
        throw new Error('Только суперадмин может удалять администраторов');
      }

      const adminsCount = await Admin.countDocuments();
      if (adminsCount <= 1) {
        throw new Error('Нельзя удалить последнего администратора');
      }

      const admin = await Admin.findById(adminId);
      if (!admin) {
        throw new Error('Администратор не найден');
      }

      if (admin._id.toString() === requestingAdminDoc._id.toString()) {
        throw new Error('Нельзя удалить свой аккаунт');
      }

      await Admin.findByIdAndDelete(adminId);
      
      return { id: adminId };
    } catch (error) {
      throw new Error(error.message);
    }
  }

  static async getAllAdmins() {
    const admins = await Admin.find({});
    return admins.map(admin => ({
      id: admin._id,
      name: admin.name,
      login: admin.login,
      password: admin.password,
      isSuperAdmin: admin.isSuperAdmin,
      createdAt: admin.createdAt
    }));
  }

  static async getProfile(adminId) {
    const admin = await Admin.findById(adminId);
    if (!admin) {
      throw new Error('Администратор не найден');
    }

    return {
      id: admin._id,
      name: admin.name,
      login: admin.login,
      password: admin.password,
      isSuperAdmin: admin.isSuperAdmin,
      createdAt: admin.createdAt
    };
  }
}

module.exports = AdminService;
