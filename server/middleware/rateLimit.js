const rateLimit = require('express-rate-limit');

const emailLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 минут
  max: 3,
  message: { error: 'Слишком много попыток. Подожди 10 минут.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 60,
  message: { error: 'Слишком много запросов.' },
});

module.exports = { emailLimiter, apiLimiter };
