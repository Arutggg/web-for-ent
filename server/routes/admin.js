const router = require('express').Router();
const path   = require('path');
const fs     = require('fs');
const db     = require('../utils/db');

const questionsDir = path.join(__dirname, '../../data/questions');

const TOPICS = [
  { id: 'equations',     name: 'Уравнения',         section: 'Алгебра',    file: 'algebra' },
  { id: 'inequalities',  name: 'Неравенства',        section: 'Алгебра',    file: 'algebra' },
  { id: 'functions',     name: 'Функции и графики',  section: 'Алгебра',    file: 'algebra' },
  { id: 'progressions',  name: 'Прогрессии',         section: 'Алгебра',    file: 'algebra' },
  { id: 'logarithms',    name: 'Логарифмы',          section: 'Алгебра',    file: 'algebra' },
  { id: 'trigonometry',  name: 'Тригонометрия',      section: 'Алгебра',    file: 'algebra' },
  { id: 'derivative',    name: 'Производная',        section: 'Алгебра',    file: 'algebra' },
  { id: 'powers',        name: 'Степени и корни',    section: 'Алгебра',    file: 'algebra' },
  { id: 'planimetry',    name: 'Планиметрия',        section: 'Геометрия',  file: 'geometry' },
  { id: 'stereometry',   name: 'Стереометрия',       section: 'Геометрия',  file: 'geometry' },
  { id: 'triangles',     name: 'Треугольники',       section: 'Геометрия',  file: 'geometry' },
  { id: 'circles',       name: 'Окружность',         section: 'Геометрия',  file: 'geometry' },
  { id: 'vectors',       name: 'Векторы',            section: 'Геометрия',  file: 'geometry' },
  { id: 'probability',   name: 'Вероятность',        section: 'Прикладные', file: 'probability' },
  { id: 'statistics',    name: 'Статистика',         section: 'Прикладные', file: 'probability' },
  { id: 'word_problems', name: 'Текстовые задачи',   section: 'Прикладные', file: 'probability' },
  { id: 'combinatorics', name: 'Комбинаторика',      section: 'Прикладные', file: 'probability' },
];

function auth(req, res, next) {
  const secret = req.headers['x-admin-secret'] || req.query.secret;
  if (!secret || secret !== (process.env.ADMIN_SECRET || 'entmath2026')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

router.get('/data', auth, (req, res) => {
  res.json(db.getAllResults());
});

router.get('/bank', auth, (req, res) => {
  const topics = TOPICS.map(t => {
    const p = path.join(questionsDir, `${t.file}.json`);
    let count = 0;
    try { count = JSON.parse(fs.readFileSync(p, 'utf8')).filter(q => q.topic === t.id).length; } catch {}
    return { id: t.id, name: t.name, section: t.section, count };
  });
  const files = ['algebra', 'geometry', 'probability'];
  const totalQuestions = files.reduce((sum, f) => {
    try { return sum + JSON.parse(fs.readFileSync(path.join(questionsDir, `${f}.json`), 'utf8')).length; }
    catch { return sum; }
  }, 0);
  res.json({ topics, totalQuestions });
});

module.exports = router;
