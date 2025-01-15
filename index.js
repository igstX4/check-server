const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const userRoutes = require('./routes/user.routes');
const adminRoutes = require('./routes/admin.routes');
const sellerRoutes = require('./routes/seller.routes');
const applicationRoutes = require('./routes/application.routes');
const checkRoutes = require('./routes/check.routes');
const companyRoutes = require('./routes/company.routes');
const commentRoutes = require('./routes/comment.routes');

const app = express();
const PORT = process.env.PORT || 4000;

// Basic middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sellers', sellerRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/checks', checkRoutes);
app.use('/api/companies', companyRoutes);
app.use('/api/comments', commentRoutes);

// Также добавим обработку статических файлов для загруженных файлов
app.use('/uploads', express.static('uploads'));

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        message: 'Маршрут не найден'
    });
});

// Error handler - должен быть последним
// app.use(errorMiddleware);

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    })
    .catch((err) => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// process.on('unhandledRejection', (err) => {
//     console.error('Unhandled rejection:', err);
//     process.exit(1);
// }); 