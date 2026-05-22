const router = require('express').Router();
const path = require('path');
const { shuffle } = require('../utils/shuffle');

// GET /api/exam/variant/2026
// Получить полный вариант ЕНТ
router.get('/variant/:year', (req, res) => {
  const { year } = req.params;
  try {
    const variant = require(path.join(__dirname, `../../data/questions/ent${year}.json`));
    // Перемешиваем варианты ответов
    const questions = variant.questions.map((q, idx) => {
      const opts = q.options.map((text, i) => ({ text, correct: i === q.correct }));
      const shuffled = shuffle(opts);
      return {
        id: idx + 1,
        question: q.question,
        topic: q.topic,
        section: q.section,
        options: shuffled.map(o => o.text),
        correct: shuffled.findIndex(o => o.correct),
        difficulty: q.difficulty || 'medium',
      };
    });
    res.json({ year, total: questions.length, timeLimit: 80, questions });
  } catch {
    res.status(404).json({ error: `Вариант ЕНТ ${year} не найден` });
  }
});

// POST /api/exam/submit
// Сохранить результат полного ЕНТ
router.post('/submit', (req, res) => {
  const { userId, variant, answers, timeSpent } = req.body;
  const { getDb } = require('../utils/db');
  const db = getDb();

  try {
    const variantData = require(
      path.join(__dirname, `../../data/questions/ent${variant}.json`)
    );
    const questions = variantData.questions;

    let score = 0;
    const results = answers.map((userAnswer, idx) => {
      const q = questions[idx];
      const isCorrect = userAnswer === q.correct;
      if (isCorrect) score++;
      return { idx, correct: isCorrect, userAnswer, rightAnswer: q.correct };
    });

    const maxScore = questions.length;

    db.prepare(`
      INSERT INTO exam_results (user_id, variant, score, max_score, answers, time_spent)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId || null, variant, score, maxScore, JSON.stringify(results), timeSpent || 0);

    res.json({ ok: true, score, maxScore, pct: Math.round(score / maxScore * 100), results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
