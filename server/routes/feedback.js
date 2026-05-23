const router  = require('express').Router();
const fs      = require('fs');
const path    = require('path');
const { feedbackLimiter } = require('../middleware/rateLimit');

const DB_PATH = path.join(__dirname, '../../data/db.json');

function readDb() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { users:[], email_codes:[], diagnostic_results:[], exam_results:[], email_leads:[], feedback:[] }; }
}
function writeDb(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

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

  const db = readDb();
  if (!db.feedback) db.feedback = [];
  db.feedback.push({
    id:         Date.now(),
    rating:     Math.min(5, Math.max(0, Number(rating) || 0)),
    text:       stripHtml(text.trim()),
    email:      email ? stripHtml(email.trim()).slice(0, 320) : '',
    created_at: new Date().toISOString(),
  });
  writeDb(db);
  res.json({ ok: true });
});

router.get('/', (req, res) => {
  const secret = req.headers['x-admin-secret'];
  if (secret !== process.env.ADMIN_SECRET) return res.status(403).json({ error: 'Forbidden' });
  const db = readDb();
  res.json({ feedback: (db.feedback || []).slice().reverse() });
});

module.exports = router;
