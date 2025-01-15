const Comment = require('../models/comment.model');
const Admin = require('../models/admin.model');
const User = require('../models/user.model');
const fs = require('fs').promises;
const path = require('path');

class CommentService {
    async getApplicationComments(applicationId) {
        const comments = await Comment.find({ application: applicationId })
            .populate({
                path: 'author',
                select: 'name',
                refPath: 'authorType'
            })
            .sort({ createdAt: 1 });

        return comments.map(comment => {
            let authorName;
            if (comment.author && comment.author.name) {
                authorName = comment.author.name;
            } else {
                authorName = comment.authorType === 'Admin' ? 'Администратор' : 'Пользователь';
            }

            return {
                id: comment._id,
                text: comment.text,
                author: authorName,
                createdAt: comment.createdAt,
                file: comment.file
            };
        });
    }

    async addComment(applicationId, authorId, authorType, text, file) {
        let fileData = null;

        if (file) {
            const uploadDir = path.join(__dirname, '../uploads');
            await fs.mkdir(uploadDir, { recursive: true });

            const filename = `${Date.now()}-${file.originalname}`;
            const filepath = path.join(uploadDir, filename);
            
            await fs.writeFile(filepath, file.buffer);

            fileData = {
                originalName: file.originalname,
                filename: filename,
                path: `/uploads/${filename}`,
                mimetype: file.mimetype
            };
        }

        const comment = new Comment({
            application: applicationId,
            author: authorId,
            authorType,
            text,
            file: fileData
        });

        await comment.save();

        let authorName;
        if (authorType === 'Admin') {
            const admin = await Admin.findById(authorId);
            authorName = admin ? admin.name : 'Администратор';
        } else {
            const user = await User.findById(authorId);
            authorName = user ? user.name : 'Пользователь';
        }

        return {
            id: comment._id,
            text: comment.text,
            author: authorName,
            createdAt: comment.createdAt,
            file: fileData
        };
    }

    async deleteComment(commentId, userId, userType) {
        const comment = await Comment.findById(commentId);
        if (!comment) {
            throw new Error('Комментарий не найден');
        }

        // Проверяем права на удаление
        if (userType !== 'Admin' && comment.author.toString() !== userId) {
            throw new Error('Нет прав на удаление комментария');
        }

        // Удаляем файл, если он есть
        if (comment.file && comment.file.filename) {
            const filepath = path.join(__dirname, '../uploads', comment.file.filename);
            try {
                await fs.unlink(filepath);
            } catch (error) {
                console.error('Error deleting file:', error);
            }
        }

        await comment.deleteOne();
        return { success: true };
    }

    async clearApplicationComments(applicationId) {
        // Получаем все комментарии приложения
        const comments = await Comment.find({ application: applicationId });
        
        // Удаляем все прикрепленные файлы
        for (const comment of comments) {
            if (comment.file && comment.file.filename) {
                const filepath = path.join(__dirname, '../uploads', comment.file.filename);
                try {
                    await fs.unlink(filepath);
                } catch (error) {
                    console.error('Error deleting file:', error);
                }
            }
        }

        // Удаляем все комментарии
        await Comment.deleteMany({ application: applicationId });
        
        return { success: true };
    }
}

module.exports = new CommentService(); 