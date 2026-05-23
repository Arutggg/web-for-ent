const router = require('express').Router();
const { getDb } = require('../utils/db');
const { feedbackLimiter } = require('../middleware/rateLimit');

function stripHtml(str) {
  return String(str).replace(/[<>&"']/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;' }[c]));
}

router.post('/', feedbackLimiter, (req, res) => {
  const { rating, text, email } = req.body;
  if (!text || typeof text !== 'string' || text.trim().length < 3) {
    return res.status(400).json({ error: 'Напиши хотя бы пару слов' });
  }
  if (text.trim().length > 2000) {
    return res.status(400).json({ error: 'Слишком длинный текст' });
  }

  const db = getDb();
  const entry = {
    id:         Date.now(),
    rating:     Math.min(5, Math.max(0, Number(rating) || 0)),
    text:       stripHtml(text.trim()),
    email:      email ? stripHtml(email.trim()).slice(0, 320) : '',
    created_at: new Date().toISOString(),
  };
  db.feedback.push(entry);

  const fs   = require('fs');
  const path = require('path');
  const DB_PATH = path.join(__dirname, '../../data/db.json');
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

  res.json({ ok: true });
});

router.get('/', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });
  const db = getDb();
  res.json({ feedback: (db.feedback || []).slice().reverse() });
});

module.exports = router;
