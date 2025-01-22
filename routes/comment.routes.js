const express = require('express');
const router = express.Router();
const multer = require('multer');
const commentService = require('../services/comment.service');
const path = require('path');
const fs = require('fs');
const { adminAuth } = require('../middleware/auth.middleware');

// Создаем директорию для загрузок, если она не существует
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Используем созданную директорию для загрузок
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        // Генерируем уникальное имя файла
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    },
});

// Убираем fileFilter и оставляем только ограничение по размеру
const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
    },
});

// Обработка ошибок multer
const handleMulterError = (err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ message: 'Файл слишком большой. Максимальный размер 5MB' });
        }
        return res.status(400).json({ message: 'Ошибка при загрузке файла' });
    } else if (err) {
        return res.status(400).json({ message: err.message });
    }
    next();
};

// Получение комментариев заявки (только админ)
router.get('/application/:applicationId', adminAuth, async (req, res, next) => {
    try {
        const comments = await commentService.getApplicationComments(req.params.applicationId);
        res.json(comments);
    } catch (error) {
        next(error);
    }
});

// Добавление комментария (только админ)
router.post('/', adminAuth, upload.single('file'), handleMulterError, async (req, res, next) => {
    try {
        const { applicationId, text } = req.body;
        const comment = await commentService.addComment(
            applicationId,
            req.user.userId,
            'Admin',
            text,
            req.file
        );
        res.status(201).json(comment);
    } catch (error) {
        // Если произошла ошибка, удаляем загруженный файл
        if (req.file) {
            fs.unlink(req.file.path, (err) => {
                if (err) console.error('Ошибка при удалении файла:', err);
            });
        }
        next(error);
    }
});

// Удаление комментария (только админ)
router.delete('/:commentId', adminAuth, async (req, res, next) => {
    try {
        await commentService.deleteComment(
            req.params.commentId,
            req.user.userId,
            'Admin' // Всегда Admin, так как роут защищен adminAuth
        );
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

// Очистка всех комментариев заявки
router.delete('/application/:applicationId/clear', adminAuth, async (req, res, next) => {
    try {
        await commentService.clearApplicationComments(req.params.applicationId);
        res.json({ success: true });
    } catch (error) {
        next(error);
    }
});

module.exports = router; 