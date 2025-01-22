const express = require('express');
const router = express.Router();
const multer = require('multer');
const commentService = require('../services/comment.service');
const { adminAuth } = require('../middleware/auth.middleware');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      // Указываем директорию для сохранения
      cb(null, path.join(__dirname, 'uploads')); 
    },
    filename: (req, file, cb) => {
      // Генерируем уникальное имя файла
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      cb(null, uniqueSuffix + path.extname(file.originalname));
    },
  });
  
  // Инициализация multer с лимитом на размер файла
  const upload = multer({
    storage, // Используем diskStorage вместо memoryStorage
    limits: {
      fileSize: 5 * 1024 * 1024, // 5MB
    },
  });

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
router.post('/', adminAuth, upload.single('file'), async (req, res, next) => {
    try {
        const { applicationId, text } = req.body;
        const comment = await commentService.addComment(
            applicationId,
            req.user.userId,
            'Admin', // Всегда Admin, так как роут защищен adminAuth
            text,
            req.file
        );
        res.status(201).json(comment);
    } catch (error) {
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