require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const helmet  = require('helmet');
const path    = require('path');
const { apiLimiter } = require('./middleware/rateLimit');

const isProd = process.env.NODE_ENV === 'production';

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      styleSrc:    ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdn.jsdelivr.net'],
      fontSrc:     ["'self'", 'fonts.gstatic.com', 'cdn.jsdelivr.net'],
      imgSrc:      ["'self'", 'data:'],
      connectSrc:  ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

// CORS — в продакшне принимаем только свой домен
const allowedOrigins = isProd
  ? [process.env.ALLOWED_ORIGIN || 'https://yourdomain.com']
  : true;
app.use(cors({ origin: allowedOrigins }));

// Body limit — защита от огромных payload
app.use(express.json({ limit: '20kb' }));
app.use(express.static(path.join(__dirname, '../client')));

// Rate limiting на все API
app.use('/api', apiLimiter);

// Роуты
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/diagnostic', require('./routes/diagnostic'));
app.use('/api/exam',       require('./routes/exam'));
app.use('/api/generate',   require('./routes/generate'));
app.use('/api/admin',      require('./routes/admin'));
app.use('/api/feedback',   require('./routes/feedback'));

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
