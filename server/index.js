require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { apiLimiter } = require('./middleware/rateLimit');

// Инициализируем БД при старте


const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

// Rate limiting на все API
app.use('/api', apiLimiter);

// Роуты
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/diagnostic', require('./routes/diagnostic'));
app.use('/api/exam',       require('./routes/exam'));
app.use('/api/generate',   require('./routes/generate'));
app.use('/api/admin',      require('./routes/admin'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, env: process.env.NODE_ENV, ts: new Date().toISOString() });
});

// Все остальные GET → index.html (SPA fallback)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/index.html'));
});

// Запуск
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n✓ ENT Math сервер запущен: http://localhost:${PORT}`);
  console.log(`  Режим: ${process.env.NODE_ENV || 'development'}\n`);
});
