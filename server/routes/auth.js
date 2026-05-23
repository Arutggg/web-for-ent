const router = require('express').Router();
const { emailLimiter, codeVerifyLimiter } = require('../middleware/rateLimit');
const db = require('../utils/db');
const { sendCode } = require('../utils/mailer');

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,}$/;

function genCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /api/auth/send-code
router.post('/send-code', emailLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email || typeof email !== 'string' || !EMAIL_RE.test(email.trim()) || email.length > 320) {
    return res.status(400).json({ error: 'Некорректный email' });
  }

  const code = genCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  db.saveCode(email, code, expiresAt);

  try {
    await sendCode(email, code);
    res.json({ ok: true, message: 'Код отправлен' });
  } catch (err) {
    console.error('Mail error:', err.message);
    if (process.env.NODE_ENV !== 'production') {
      return res.json({ ok: true, devCode: code, message: 'DEV: код в ответе' });
    }
    res.status(500).json({ error: 'Ошибка отправки письма' });
  }
});

// POST /api/auth/verify-code
router.post('/verify-code', codeVerifyLimiter, async (req, res) => {
  const { email, code } = req.body;
  if (!email || !code) {
    return res.status(400).json({ error: 'Нужны email и код' });
  }

  const record = db.findCode(email, code);
  if (!record) {
    return res.status(400).json({ error: 'Неверный код' });
  }
  if (new Date(record.expires_at) < new Date()) {
    return res.status(400).json({ error: 'Код истёк. Запроси новый.' });
  }

  db.markCodeUsed(record.id);

  let user = db.findUserByEmail(email);
  if (!user) user = db.createUser(email);

  res.json({ ok: true, user: { id: user.id, email: user.email } });
});

module.exports = router;
