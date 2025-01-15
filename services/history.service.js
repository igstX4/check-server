const History = require('../models/history.model');
const Admin = require('../models/admin.model');
const User = require('../models/user.model');

class HistoryService {
    async getApplicationHistory(applicationId) {
        const history = await History.find({ application: applicationId })
            .populate({
                path: 'author',
                select: 'name',
                refPath: 'authorType'
            })
            .sort({ createdAt: -1 });

        return history.map(record => ({
            id: record._id,
            action: record.action,
            changes: record.changes,
            author: record.author?.name || (record.authorType === 'Admin' ? 'Администратор' : 'Пользователь'),
            createdAt: record.createdAt
        }));
    }

    async addHistoryRecord(applicationId, authorId, authorType, action, changes) {
        const record = new History({
            application: applicationId,
            author: authorId,
            authorType,
            action,
            changes
        });

        await record.save();

        const author = authorType === 'Admin' 
            ? await Admin.findById(authorId)
            : await User.findById(authorId);

        return {
            id: record._id,
            action,
            changes,
            author: author?.name || (authorType === 'Admin' ? 'Администратор' : 'Пользователь'),
            createdAt: record.createdAt
        };
    }
}

module.exports = new HistoryService(); 