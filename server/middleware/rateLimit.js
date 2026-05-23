const rateLimit = require('express-rate-limit');

const emailLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  message: { error: 'Слишком много попыток. Подожди 10 минут.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Брутфорс-защита для verify-code: 10 попыток за 15 минут с одного IP
const codeVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Слишком много попыток. Подожди 15 минут.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Слишком много запросов.' },
});

// Защита replenish — дорогой AI endpoint, максимум 5 раз в 5 минут с одного IP
const replenishLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  message: { error: 'Слишком много запросов на генерацию.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const feedbackLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Слишком много отзывов с одного адреса.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { emailLimiter, codeVerifyLimiter, apiLimiter, replenishLimiter, feedbackLimiter };
