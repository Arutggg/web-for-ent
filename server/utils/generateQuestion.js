require('dotenv').config();
const fs   = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '../../data/questions');

const TOPIC_FILES = {
  equations:    'algebra',     inequalities: 'algebra',    functions:    'algebra',
  progressions: 'algebra',     logarithms:   'algebra',    trigonometry: 'algebra',
  derivative:   'algebra',     powers:       'algebra',    integral:     'algebra',
  planimetry:   'geometry',    stereometry:  'geometry',   triangles:    'geometry',
  circles:      'geometry',    vectors:      'geometry',   coordinates:  'geometry',
  areas:        'geometry',    probability:  'probability', statistics:   'probability',
  word_problems:'probability', combinatorics:'probability', parameters:  'probability',
};

const TOPIC_DESC = {
  equations:     'алгебраические уравнения (линейные, квадратные, дробно-рациональные, иррациональные)',
  inequalities:  'неравенства (линейные, квадратные, системы неравенств)',
  functions:     'функции и графики (квадратичная, показательная, логарифмическая, область определения)',
  progressions:  'арифметические и геометрические прогрессии (сумма, n-й член)',
  logarithms:    'логарифмы (свойства, логарифмические уравнения и неравенства)',
  trigonometry:  'тригонометрия (значения, тождества, уравнения)',
  derivative:    'производная (правила дифференцирования, нахождение экстремумов)',
  powers:        'степени и корни (свойства, упрощение выражений)',
  integral:      'интеграл (нахождение первообразной, определённый интеграл)',
  planimetry:    'планиметрия — задачи с числами (стороны, углы, площади, периметры), без рисунков',
  stereometry:   'стереометрия — задачи с числами (объёмы, площади поверхностей), без рисунков',
  triangles:     'треугольники — теоремы Пифагора, синусов, косинусов — задачи с числами',
  circles:       'окружность — задачи с числами (длина, площадь, вписанный угол), без рисунков',
  vectors:       'векторы (координаты, длина, скалярное произведение, угол между векторами)',
  coordinates:   'координатная геометрия (расстояние между точками, уравнение прямой)',
  areas:         'площади и объёмы комбинированных фигур',
  probability:   'теория вероятностей (классическая вероятность, умножение, сложение)',
  statistics:    'статистика (среднее арифметическое, медиана, мода, размах)',
  word_problems: 'текстовые задачи (движение, работа, смеси, проценты, прибыль)',
  combinatorics: 'комбинаторика (перестановки, сочетания, размещения)',
  parameters:    'задачи с параметром (уравнения и неравенства с параметром)',
};

function extractJsonObject(raw) {
  const mdMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (mdMatch) {
    const c = mdMatch[1].trim();
    if (c.startsWith('{')) return c;
  }
  const startIdx = raw.search(/\{\s*"question"\s*:/);
  if (startIdx !== -1) {
    let depth = 0, inString = false, escape = false;
    for (let i = startIdx; i < raw.length; i++) {
      const c = raw[i];
      if (escape)               { escape = false; continue; }
      if (c === '\\' && inString) { escape = true; continue; }
      if (c === '"')            { inString = !inString; continue; }
      if (inString)             continue;
      if (c === '{')            depth++;
      else if (c === '}') { depth--; if (depth === 0) return raw.slice(startIdx, i + 1); }
    }
  }
  const stripped = raw.replace(/```json|```/g, '').trim();
  const first = stripped.indexOf('{'), last = stripped.lastIndexOf('}');
  if (first !== -1 && last > first) return stripped.slice(first, last + 1);
  return null;
}

function parseQuestion(raw) {
  const extracted = extractJsonObject(raw);
  if (!extracted) throw new Error('JSON не найден: ' + raw.slice(0, 120));
  let q;
  try { q = JSON.parse(extracted); }
  catch {
    const fixed = extracted.replace(/,\s*$/, '').replace(/,\s*\}/g, '}');
    q = JSON.parse(fixed);
  }
  if (!q.question || !q.options || q.correct === undefined) throw new Error('Неполный JSON');
  if (q.correct < 0 || q.correct > 3) throw new Error('Некорректный correct: ' + q.correct);
  return q;
}

function buildBankPrompt(topicDesc, difficulty, existing) {
  const diffLabel = difficulty === 'hard'
    ? 'сложный — реальный уровень ЕНТ, 2-3 шага, нетривиальное применение формул'
    : 'средний — требует уверенного знания формул и одного нестандартного хода';

  const prevList = existing.length > 0
    ? '\nУже есть задачи (не повторяй числа и ситуации):\n' + existing.slice(-8).map((q, i) => `${i + 1}. ${q}`).join('\n')
    : '';

  return `Создай задачу реального уровня ЕНТ по теме: ${topicDesc}. Сложность: ${diffLabel}.${prevList}

ЗАПРЕЩЕНО: тривиальные вычисления (корень из 144, 2+2, периметр квадрата), задачи в одно действие, задачи из учебника 5-7 класса.
ОБЯЗАТЕЛЬНО: задача требует знания конкретных формул ЕНТ и умения их применить в нестандартном контексте.

Требования к формату:
- Конкретные числа, правильный ответ на позиции Б (индекс 1)
- 3 неверных варианта — типичные ошибки учеников ЕНТ (не случайные числа)
- Формулы в $...$ (пример: $x^2-3x+2=0$, $\\sqrt{x+1}$, $\\log_2 8$)
- hint: 1 предложение — намёк на метод (не ответ)
- explanation: пошаговое решение, 2-3 шага, не более 70 слов

Ответь ТОЛЬКО JSON (без markdown, без текста до/после):
{"question":"...","options":["А) ...","Б) ...","В) ...","Г) ..."],"correct":1,"hint":"...","explanation":"..."}`;
}

async function generateOneQuestion(topicDesc, difficulty, existing) {
  const apiKey  = process.env.ANTHROPIC_API_KEY;
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';
  const model   = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

  const res = await fetch(`${baseUrl}/v1/messages`, {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 1500,
      system: 'Отвечай ТОЛЬКО JSON. Никаких пояснений, рассуждений или текста до или после JSON.',
      messages: [{ role: 'user', content: buildBankPrompt(topicDesc, difficulty, existing) }],
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || JSON.stringify(data));

  const text = data.content?.find(c => c.type === 'text')?.text || data.content?.[0]?.text || '';
  return parseQuestion(text);
}

function loadBankFile(filename) {
  const p = path.join(DATA_DIR, `${filename}.json`);
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch { return []; }
}

function saveBankFile(filename, data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR, `${filename}.json`), JSON.stringify(data, null, 2));
}

// difficulty distribution: 75% hard, 25% medium — no easy
function diffForIndex(i, total) {
  return (i / total) < 0.75 ? 'hard' : 'medium';
}

async function replenishTopic(topicId, count = 5) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY не задан');

  const file = TOPIC_FILES[topicId];
  if (!file) throw new Error('Неизвестная тема: ' + topicId);

  const desc      = TOPIC_DESC[topicId] || topicId;
  const questions = loadBankFile(file);
  const existing  = questions.filter(q => q.topic === topicId).map(q => q.question);

  let added = 0;
  for (let i = 0; i < count; i++) {
    const difficulty = diffForIndex(i, count);
    let q = null;
    for (let attempt = 0; attempt < 2 && !q; attempt++) {
      try {
        q = await generateOneQuestion(desc, difficulty, existing);
      } catch (err) {
        console.error(`  replenish ${topicId} attempt ${attempt + 1}:`, err.message.slice(0, 80));
        if (attempt < 1) await new Promise(r => setTimeout(r, 1000));
      }
    }
    if (!q) continue;

    const current = loadBankFile(file);
    current.push({
      topic:       topicId,
      difficulty,
      question:    q.question,
      options:     q.options,
      correct:     q.correct,
      hint:        q.hint        || '',
      explanation: q.explanation || '',
    });
    saveBankFile(file, current);
    existing.push(q.question);
    added++;

    if (i < count - 1) await new Promise(r => setTimeout(r, 300));
  }

  const bankSize = loadBankFile(file).filter(q => q.topic === topicId).length;
  return { added, bankSize };
}

module.exports = { replenishTopic, TOPIC_FILES, TOPIC_DESC, parseQuestion, extractJsonObject };
