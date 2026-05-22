const router = require('express').Router();

const TOPIC_CONTEXT = {
  equations:     'алгебраические уравнения (линейные, квадратные, дробно-рациональные, иррациональные)',
  inequalities:  'неравенства (линейные, квадратные, системы неравенств)',
  functions:     'функции и графики (квадратичная, показательная, логарифмическая, область определения)',
  progressions:  'арифметические и геометрические прогрессии (сумма, n-й член)',
  logarithms:    'логарифмы (свойства, логарифмические уравнения и неравенства)',
  trigonometry:  'тригонометрия (значения, тождества, уравнения)',
  derivative:    'производная (правила дифференцирования, нахождение экстремумов)',
  powers:        'степени и корни (свойства, упрощение выражений)',
  planimetry:    'планиметрия — задачи ТОЛЬКО с числами (стороны, углы, площади, периметры) БЕЗ рисунков. Все данные давай в тексте задачи.',
  stereometry:   'стереометрия — задачи ТОЛЬКО с числами (объёмы, площади поверхностей) БЕЗ рисунков. Все данные давай в тексте задачи.',
  triangles:     'треугольники — задачи ТОЛЬКО с числами (теоремы Пифагора, синусов, косинусов) БЕЗ рисунков.',
  circles:       'окружность — задачи ТОЛЬКО с числами (длина, площадь, вписанный угол) БЕЗ рисунков.',
  vectors:       'векторы (координаты, длина, скалярное произведение, угол)',
  probability:   'теория вероятностей (классическая, умножение, сложение вероятностей)',
  statistics:    'статистика (среднее арифметическое, медиана, мода, размах)',
  word_problems: 'текстовые задачи (движение, работа, смеси, проценты, прибыль)',
  combinatorics: 'комбинаторика (перестановки, сочетания, размещения, правила умножения и сложения)',
};

function getDifficulty(history) {
  if (!history || history.length === 0) return 'средний';
  const ratio = history.filter(h => h.correct).length / history.length;
  if (ratio >= 0.75) return 'сложный';
  return 'средний';
}

// Единый построитель промпта для обоих эндпоинтов
function buildPrompt({ topicId, topicName, history = [], previousQuestions = [] }) {
  const topicDesc  = TOPIC_CONTEXT[topicId] || topicName;
  const difficulty = getDifficulty(history);

  const prevList = previousQuestions.length > 0
    ? `\nУже заданные вопросы (не повторяй):\n${previousQuestions.slice(-5).map((q, i) => `${i + 1}. ${q}`).join('\n')}`
    : '';

  const wrongCtx  = history.filter(h => !h.correct).slice(-2).map(h => h.questionText).filter(Boolean).join('; ');
  const wrongNote = wrongCtx
    ? `\nУченик ошибся в: ${wrongCtx}. Создай похожую задачу для закрепления.`
    : '';

  return `Создай задачу ЕНТ по теме: ${topicDesc}. Сложность: ${difficulty}.${prevList}${wrongNote}

Требования:
- Конкретные числа, правильный ответ на позиции Б (индекс 1)
- 3 неверных варианта — типичные ошибки
- Формулы в $...$ (пример: $x^2-3x+2=0$, $\\sqrt{x+1}$, $\\log_2 8$)
- hint: 1 предложение о методе решения
- explanation: 2-3 шага, не более 60 слов

Ответь ТОЛЬКО JSON (без markdown, без пояснений):
{"question":"...","options":["А) ...","Б) ...","В) ...","Г) ..."],"correct":1,"hint":"...","explanation":"..."}`;
}

// Серверный shuffle: перемешиваем варианты, сохраняя correct
function shuffleOptions(q) {
  const letters = ['А', 'Б', 'В', 'Г'];
  // Сохранить текст правильного ответа (без буквенного префикса)
  const correctText = q.options[q.correct].replace(/^[А-ГA-D]\)\s*/, '');

  // Перемешать варианты
  const items = q.options.map(opt => opt.replace(/^[А-ГA-D]\)\s*/, ''));
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }

  // Найти новую позицию правильного ответа
  const newCorrect = items.indexOf(correctText);

  // Расставить буквенные префиксы
  const newOptions = items.map((text, i) => `${letters[i]}) ${text}`);

  return { ...q, options: newOptions, correct: newCorrect >= 0 ? newCorrect : q.correct };
}

// Извлечение JSON-объекта из текста с reasoning/markdown вокруг
function extractJsonObject(raw) {
  // 1. Markdown code block (```json ... ```)
  const mdMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (mdMatch) {
    const candidate = mdMatch[1].trim();
    if (candidate.startsWith('{')) return candidate;
  }

  // 2. Ищем {"question": и выбираем сбалансированный {} блок
  // (корректно считаем скобки внутри строк, игнорируя экранирование)
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
      else if (c === '}') {
        depth--;
        if (depth === 0) return raw.slice(startIdx, i + 1);
      }
    }
  }

  // 3. Fallback — strip markdown, берём от первой { до последней }
  const stripped = raw.replace(/```json|```/g, '').trim();
  const first = stripped.indexOf('{');
  const last  = stripped.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) return stripped.slice(first, last + 1);

  return null;
}

function parseQuestion(raw) {
  const extracted = extractJsonObject(raw);
  if (!extracted) throw new Error('JSON не найден в ответе: ' + raw.slice(0, 120));

  let q;
  try {
    q = JSON.parse(extracted);
  } catch {
    const fixed = extracted.replace(/,\s*$/, '').replace(/,\s*\}/g, '}');
    q = JSON.parse(fixed);
  }

  if (!q.question || !q.options || q.correct === undefined) throw new Error('Неполный JSON от API');
  if (q.correct < 0 || q.correct > 3) throw new Error(`Некорректный correct: ${q.correct}`);
  return q;
}

async function callClaude(prompt) {
  const apiKey  = process.env.ANTHROPIC_API_KEY;
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

  const response = await fetch(`${baseUrl}/v1/messages`, {
    method:  'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system:     'Отвечай ТОЛЬКО JSON. Никаких пояснений, рассуждений или текста до или после JSON.',
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || JSON.stringify(data));

  const text = data.content?.find(c => c.type === 'text')?.text || data.content?.[0]?.text || '';

  const q = parseQuestion(text);
  return shuffleOptions(q);   // перемешать варианты на сервере
}

// ---- POST /question (обычный) ----
router.post('/question', async (req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY не задан в .env' });

  const prompt = buildPrompt(req.body);
  let lastErr;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const q = await callClaude(prompt);
      const { topicId, topicName, section } = req.body;
      return res.json({ topicId, topicName, section, question: q });
    } catch (err) {
      lastErr = err;
      console.error(`Generate attempt ${attempt + 1} error:`, err.message);
    }
  }

  res.status(500).json({ error: 'Ошибка генерации: ' + lastErr.message });
});

// ---- POST /question/stream (стриминг) ----
router.post('/question/stream', async (req, res) => {
  const apiKey  = process.env.ANTHROPIC_API_KEY;
  const baseUrl = process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com';

  res.writeHead(200, {
    'Content-Type':      'text/event-stream',
    'Cache-Control':     'no-cache',
    'X-Accel-Buffering': 'no',
    'Connection':        'keep-alive',
  });

  if (!apiKey) {
    res.write(`data: ${JSON.stringify({ error: 'ANTHROPIC_API_KEY не задан в .env' })}\n\n`);
    res.end();
    return;
  }

  const prompt = buildPrompt(req.body);

  try {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        stream:     true,
        system:     'Отвечай ТОЛЬКО JSON. Никаких пояснений, рассуждений или текста до или после JSON.',
        messages:   [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      res.write(`data: ${JSON.stringify({ error: errData.error?.message || `HTTP ${response.status}` })}\n\n`);
      res.end();
      return;
    }

    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (raw === '[DONE]') continue;
        let event;
        try { event = JSON.parse(raw); } catch { continue; }

        if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
          fullText += event.delta.text;
          res.write(`data: ${JSON.stringify({ t: event.delta.text })}\n\n`);
        } else if (event.type === 'message_stop') {
          // После завершения стрима — парсим и отправляем финальный shuffled вопрос
          try {
            const q = parseQuestion(fullText);
            const shuffled = shuffleOptions(q);
            res.write(`data: ${JSON.stringify({ done: true, shuffled })}\n\n`);
          } catch {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          }
        }
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error('Stream error:', err.message);
    try {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    } catch {}
  }
});

module.exports = router;
