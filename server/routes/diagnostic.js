const router  = require('express').Router();
const path    = require('path');
const fs      = require('fs');
const { pickQuestions, shuffleOptions } = require('../utils/shuffle');
const db = require('../utils/db');
const { replenishTopic } = require('../utils/generateQuestion');
const { sendReport } = require('../utils/mailer');

const questionsDir = path.join(__dirname, '../../data/questions');

const TOPICS = {
  ent: [
    { id: 'equations',     name: 'Уравнения',        section: 'Алгебра',    file: 'algebra' },
    { id: 'inequalities',  name: 'Неравенства',       section: 'Алгебра',    file: 'algebra' },
    { id: 'functions',     name: 'Функции и графики', section: 'Алгебра',    file: 'algebra' },
    { id: 'progressions',  name: 'Прогрессии',        section: 'Алгебра',    file: 'algebra' },
    { id: 'logarithms',    name: 'Логарифмы',         section: 'Алгебра',    file: 'algebra' },
    { id: 'trigonometry',  name: 'Тригонометрия',     section: 'Алгебра',    file: 'algebra' },
    { id: 'derivative',    name: 'Производная',       section: 'Алгебра',    file: 'algebra' },
    { id: 'powers',        name: 'Степени и корни',   section: 'Алгебра',    file: 'algebra' },
    { id: 'planimetry',    name: 'Планиметрия',       section: 'Геометрия',  file: 'geometry' },
    { id: 'stereometry',   name: 'Стереометрия',      section: 'Геометрия',  file: 'geometry' },
    { id: 'triangles',     name: 'Треугольники',      section: 'Геометрия',  file: 'geometry' },
    { id: 'circles',       name: 'Окружность',        section: 'Геометрия',  file: 'geometry' },
    { id: 'vectors',       name: 'Векторы',           section: 'Геометрия',  file: 'geometry' },
    { id: 'probability',   name: 'Вероятность',       section: 'Прикладные', file: 'probability' },
    { id: 'statistics',    name: 'Статистика',        section: 'Прикладные', file: 'probability' },
    { id: 'word_problems', name: 'Текстовые задачи',  section: 'Прикладные', file: 'probability' },
    { id: 'combinatorics', name: 'Комбинаторика',     section: 'Прикладные', file: 'probability' },
  ],
  ege: [
    { id: 'equations',     name: 'Уравнения',        section: 'Алгебра',    file: 'algebra' },
    { id: 'inequalities',  name: 'Неравенства',       section: 'Алгебра',    file: 'algebra' },
    { id: 'functions',     name: 'Функции и графики', section: 'Алгебра',    file: 'algebra' },
    { id: 'progressions',  name: 'Прогрессии',        section: 'Алгебра',    file: 'algebra' },
    { id: 'logarithms',    name: 'Логарифмы',         section: 'Алгебра',    file: 'algebra' },
    { id: 'trigonometry',  name: 'Тригонометрия',     section: 'Алгебра',    file: 'algebra' },
    { id: 'derivative',    name: 'Производная',       section: 'Алгебра',    file: 'algebra' },
    { id: 'powers',        name: 'Степени и корни',   section: 'Алгебра',    file: 'algebra' },
    { id: 'planimetry',    name: 'Планиметрия',       section: 'Геометрия',  file: 'geometry' },
    { id: 'stereometry',   name: 'Стереометрия',      section: 'Геометрия',  file: 'geometry' },
    { id: 'triangles',     name: 'Треугольники',      section: 'Геометрия',  file: 'geometry' },
    { id: 'circles',       name: 'Окружность',        section: 'Геометрия',  file: 'geometry' },
    { id: 'vectors',       name: 'Векторы',           section: 'Геометрия',  file: 'geometry' },
    { id: 'probability',   name: 'Вероятность',       section: 'Прикладные', file: 'probability' },
    { id: 'statistics',    name: 'Статистика',        section: 'Прикладные', file: 'probability' },
    { id: 'word_problems', name: 'Текстовые задачи',  section: 'Прикладные', file: 'probability' },
    { id: 'combinatorics', name: 'Комбинаторика',     section: 'Прикладные', file: 'probability' },
    { id: 'integral',      name: 'Интеграл',          section: 'Алгебра',    file: 'algebra' },
    { id: 'parameters',    name: 'Задачи с параметром',section:'Прикладные', file: 'probability' },
    { id: 'coordinates',   name: 'Координаты',        section: 'Геометрия',  file: 'geometry' },
    { id: 'areas',         name: 'Площади и объёмы',  section: 'Геометрия',  file: 'geometry' },
  ],
};

// Используем fs.readFileSync вместо require() — чтобы видеть свежепополненные вопросы
function loadQuestions(file) {
  const p = path.join(questionsDir, `${file}.json`);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return []; }
}

// Темы, для которых сейчас идёт пополнение (не запускаем дважды)
const replenishing = new Set();

router.get('/topics/:exam', (req, res) => {
  const topics = TOPICS[req.params.exam] || TOPICS.ent;
  res.json({ topics: topics.map(t => ({ id: t.id, name: t.name, section: t.section })) });
});

router.post('/questions', (req, res) => {
  const { exam = 'ent', topicId, count = 2, exclude = [] } = req.body;
  const topics = TOPICS[exam] || TOPICS.ent;
  const topic  = topics.find(t => t.id === topicId);
  if (!topic) return res.status(404).json({ error: 'Тема не найдена' });

  const all = loadQuestions(topic.file).filter(q => q.topic === topicId);
  if (!all.length) return res.status(404).json({ error: `Нет вопросов для темы ${topicId}` });

  const picked = pickQuestions(all, count, exclude).map(q => shuffleOptions(q));
  res.json({
    topicId,
    topicName: topic.name,
    section:   topic.section,
    bankSize:  all.length,
    questions: picked.map(q => ({
      question:    q.question,
      options:     q.options,
      correct:     q.correct,
      hint:        q.hint        || '',
      explanation: q.explanation || '',
      difficulty:  q.difficulty  || 'medium',
    })),
  });
});

// Фоновое пополнение банка — отвечает сразу, генерирует асинхронно
router.post('/replenish', (req, res) => {
  const { topicId } = req.body;
  if (!topicId) return res.status(400).json({ error: 'topicId обязателен' });

  if (replenishing.has(topicId)) {
    return res.json({ ok: true, message: 'Пополнение уже идёт' });
  }

  res.json({ ok: true, message: 'Пополнение запущено в фоне' });

  replenishing.add(topicId);
  replenishTopic(topicId, 5)
    .then(({ added, bankSize }) => {
      console.log(`  ✓ Replenish [${topicId}]: +${added} вопросов, итого ${bankSize}`);
    })
    .catch(err => {
      console.error(`  ✗ Replenish [${topicId}]:`, err.message);
    })
    .finally(() => {
      replenishing.delete(topicId);
    });
});

router.post('/save', (req, res) => {
  db.saveDiagnosticResult(req.body);
  res.json({ ok: true });
});

// ---- AI REPORT ----
function extractJsonBlock(raw) {
  const md = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (md) { const c = md[1].trim(); if (c.startsWith('{')) return c; }
  const si = raw.search(/\{\s*"level"\s*:/);
  if (si !== -1) {
    let depth = 0, inStr = false, esc = false;
    for (let i = si; i < raw.length; i++) {
      const c = raw[i];
      if (esc)             { esc = false; continue; }
      if (c === '\\' && inStr) { esc = true; continue; }
      if (c === '"')       { inStr = !inStr; continue; }
      if (inStr)           continue;
      if (c === '{')       depth++;
      else if (c === '}') { depth--; if (depth === 0) return raw.slice(si, i + 1); }
    }
  }
  const s = raw.replace(/```json|```/g, '').trim();
  const f = s.indexOf('{'), l = s.lastIndexOf('}');
  return (f !== -1 && l > f) ? s.slice(f, l + 1) : null;
}

router.post('/report', async (req, res) => {
  const { exam = 'ent', totalPct = 0, timeSeconds = 0, topics = [] } = req.body;
  if (!topics.length) return res.status(400).json({ error: 'topics обязателен' });

  const apiKey  = process.env.ANTHROPIC_API_KEY;
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const model   = process.env.ANTHROPIC_MODEL   || 'claude-haiku-4-5-20251001';
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY не задан' });

  const examName  = exam === 'ege' ? 'ЕГЭ (Россия)' : 'ЕНТ (Казахстан)';
  const totalPoss = exam === 'ege' ? 30 : 50;
  const mins      = Math.round(timeSeconds / 60);
  const topicRows = topics
    .map(t => `  - ${t.name} (${t.section}): ${t.correct}/${t.total} = ${t.pct}%${t.earlyExit ? ' [ранний выход]' : ''}`)
    .join('\n');

  const prompt = `Ты — эксперт по подготовке к ЕНТ и когнитивной психологии обучения. Перед тобой реальные результаты ученика. Сделай ГЛУБОКИЙ, честный, нешаблонный анализ.

Экзамен: ${examName}. Время: ${mins} мин. Итог: ${totalPct}%.

Темы (результат по каждой):
${topicRows}

ТВОЯ ЗАДАЧА — не просто перечислить слабые темы, а найти ПАТТЕРН: почему именно эти темы просели? Что это говорит об ученике? Что он делает не так системно?

Отвечай ТОЛЬКО JSON (без пояснений до или после):

{
  "level": "Слабый | Средний | Хороший | Отличный",
  "levelEn": "weak | medium | good | excellent",
  "diagnosis": "Одна острая фраза-диагноз — не банальная, зацепи читателя (пример: 'Алгебра держится — геометрия рушит всё')",
  "personalMessage": "2-3 предложения лично ученику — честно, без сахара, но с верой в него. Назови конкретные темы.",
  "pattern": "1-2 предложения: какой системный паттерн ошибок виден из результатов? Не 'учи больше', а конкретный когнитивный паттерн.",
  "predictedScore": ${Math.round(totalPct / 100 * totalPoss)},
  "totalPossible": ${totalPoss},
  "strongTopics": [
    { "name": "Тема", "pct": 90, "comment": "почему это сила — конкретно" }
  ],
  "weakTopics": [
    {
      "name": "Тема", "pct": 30, "priority": 1,
      "rootCause": "КОНКРЕТНАЯ причина слабости — не 'надо повторить', а что именно ломается (пример: 'путаешь направление неравенства при умножении на отрицательное')",
      "action": "Конкретное действие на эту неделю — одно, чёткое"
    }
  ],
  "criticalInsights": [
    { "title": "Заголовок наблюдения", "body": "2-3 предложения — неочевидное наблюдение которое удивит ученика. Не общие советы — конкретный вывод из его результатов." },
    { "title": "Заголовок", "body": "..." },
    { "title": "Заголовок", "body": "..." }
  ],
  "studyPlan": [
    {
      "week": 1,
      "theme": "Конкретные темы из weakTopics (пример: Тригонометрия, Логарифмы)",
      "focus": "Конкретно что делать: например 'Выучить формулы синуса суммы, разности и двойного угла. Решить 20 уравнений sin/cos типа ЕНТ'",
      "tip": "Конкретная техника запоминания или разбора — например 'Для каждой формулы напиши 3 примера с подстановкой чисел'",
      "goal": "Конкретная цель — например 'Довести тригонометрию с 40% до 65%'"
    },
    {
      "week": 2,
      "theme": "Следующие слабые темы",
      "focus": "Конкретные формулы и тип задач для отработки",
      "tip": "Конкретная техника — метод, ловушка которую нужно избежать",
      "goal": "Конкретная цель в %"
    },
    {
      "week": 3,
      "theme": "Комплексное повторение + сильные темы",
      "focus": "Смешанные задачи ЕНТ, 50 задач за сессию, разбор ошибок",
      "tip": "Конкретная финальная стратегия на экзамен",
      "goal": "Прогноз итогового балла"
    }
  ],
  "finalMotivation": "Одна сильная финальная фраза — не банальная, запоминающаяся"
}

Правила:
- strongTopics: pct >= 70. Пиши конкретно ПОЧЕМУ это сила.
- weakTopics: pct < 60, отсортируй по priority (1 = критически важно для ЕНТ). rootCause — КОНКРЕТНАЯ когнитивная ошибка, НЕ "надо повторить".
- criticalInsights: ОБЯЗАТЕЛЬНО ровно 3 объекта {title, body}. Каждый — неочевидное наблюдение из данных. НЕ общие советы.
- studyPlan: конкретные формулы, конкретное количество задач, конкретные методы. НЕ абстракции.
- criticalInsights и studyPlan ОБЯЗАТЕЛЬНЫ в JSON — не пропускай их.`;

  try {
    const resp = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: 3500,
        system: 'Отвечай ТОЛЬКО JSON. Никаких пояснений, рассуждений или текста до или после JSON.',
        messages: [{ role: 'user', content: prompt }],
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error?.message || `HTTP ${resp.status}`);
    const text = data.content?.find(c => c.type === 'text')?.text || data.content?.[0]?.text || '';
    const raw  = extractJsonBlock(text);
    if (!raw) throw new Error('JSON не найден в ответе AI');
    const report = JSON.parse(raw);
    res.json({ report });
  } catch (err) {
    console.error('Report generation error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.post('/send-report', async (req, res) => {
  const { email, report, totalPct, exam = 'ent', topics = [], sessionId } = req.body;
  if (!email || !report) return res.status(400).json({ error: 'email и report обязательны' });

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRe.test(email)) return res.status(400).json({ error: 'Некорректный email' });

  db.saveEmailLead(email, sessionId || null);

  try {
    await sendReport(email, { report, totalPct, exam, topics });
    res.json({ ok: true });
  } catch (err) {
    console.error('Send report error:', err.message);
    res.status(500).json({ error: 'Не удалось отправить письмо. Попробуй позже.' });
  }
});

module.exports = router;
