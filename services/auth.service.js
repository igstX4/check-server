const jwt = require('jsonwebtoken');

class AuthService {
    generateClientToken(userId) {
        return jwt.sign(
            { userId },
            process.env.JWT_CLIENT_SECRET,
            { expiresIn: '24h' }
        );
    }

    generateAdminToken(userId) {
        return jwt.sign(
            { userId },
            process.env.JWT_ADMIN_SECRET,
            { expiresIn: '24h' }
        );
    }
}

module.exports = new AuthService(); 