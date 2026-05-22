// Простая JSON-база данных — работает на любой версии Node.js без компиляции
const fs   = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../../data/db.json');

// Начальная структура БД
const DEFAULT = {
  users: [],
  email_codes: [],
  diagnostic_results: [],
  exam_results: [],
  email_leads: [],
};

function readDb() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch {
    writeDb(DEFAULT);
    return { ...DEFAULT };
  }
}

function writeDb(data) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

const db = {
  // USERS
  findUserByEmail(email) {
    return readDb().users.find(u => u.email === email) || null;
  },
  createUser(email) {
    const data = readDb();
    const user = { id: Date.now(), email, created_at: new Date().toISOString() };
    data.users.push(user);
    writeDb(data);
    return user;
  },

  // EMAIL CODES
  saveCode(email, code, expiresAt) {
    const data = readDb();
    // Удалить старые коды этого email
    data.email_codes = data.email_codes.filter(c => c.email !== email);
    data.email_codes.push({ id: Date.now(), email, code, expires_at: expiresAt, used: false });
    writeDb(data);
  },
  findCode(email, code) {
    return readDb().email_codes.find(
      c => c.email === email && c.code === code && !c.used
    ) || null;
  },
  markCodeUsed(id) {
    const data = readDb();
    const c = data.email_codes.find(c => c.id === id);
    if (c) c.used = true;
    writeDb(data);
  },

  // DIAGNOSTIC RESULTS
  saveDiagnosticResult(payload) {
    const data = readDb();
    data.diagnostic_results.push({ id: Date.now(), ...payload, created_at: new Date().toISOString() });
    writeDb(data);
  },

  // EXAM RESULTS
  saveExamResult(payload) {
    const data = readDb();
    data.exam_results.push({ id: Date.now(), ...payload, created_at: new Date().toISOString() });
    writeDb(data);
  },

  saveEmailLead(email, sessionId) {
    const data = readDb();
    if (!data.email_leads) data.email_leads = [];
    data.email_leads.push({ id: Date.now(), email, sessionId, created_at: new Date().toISOString() });
    writeDb(data);
  },

  getAllResults() {
    return readDb();
  },
};

module.exports = db;
