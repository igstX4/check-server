const express = require('express');
const path = require('path');
const companyRoutes = require('./routes/company.routes');
// ...
const app = express();

// Добавляем раздачу статических файлов из папки uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/companies', companyRoutes); 