// ---- CONSTANTS ----
const QUESTIONS_PER_TOPIC   = 3;  // 17 тем × 3 = 51 вопрос
const CONSECUTIVE_FAIL_EXIT = 2;  // выход из темы после N подряд неверных

// ---- STATE ----
let state = {
  exam: null,
  topics: [],
  topicIndex: 0,
  currentTopic: null,
  questions: [],
  qIndex: 0,
  topicAnswers: [],
  allResults: {},
  totalAnswered: 0,
  totalCorrect: 0,
  askedPerTopic: {},
};

// ---- PREFETCH ----
let prefetch = { promise: null, data: null, topicId: null };

// Темы, для которых уже запущено фоновое пополнение
const replenishingTopics = new Set();

function buildGenerateParams(topic, answers, asked) {
  const history = (answers || []).map((correct, i) => ({
    correct,
    questionText: (asked || [])[i] || '',
  }));
  return {
    topicId:           topic.id,
    topicName:         topic.name,
    section:           topic.section,
    exam:              state.exam,
    history,
    previousQuestions: asked || [],
  };
}

// Триггерим фоновое пополнение банка если осталось мало новых вопросов
function maybeReplenish(topicId, bankSize, askedCount) {
  const remaining = bankSize - askedCount;
  if (remaining >= 4) return;
  if (replenishingTopics.has(topicId)) return;
  replenishingTopics.add(topicId);
  fetch('/api/diagnostic/replenish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topicId }),
  })
    .then(r => r.json())
    .catch(() => {})
    .finally(() => replenishingTopics.delete(topicId));
}

// Нормализует ответ банка в формат { topicId, topicName, section, question }
async function fetchFromBank(topic, asked) {
  const data = await API.diagnostic.getQuestions({
    exam:    state.exam,
    topicId: topic.id,
    count:   1,
    exclude: asked || [],
  });
  if (!data.questions || !data.questions.length) return null; // банк исчерпан
  // Проверяем нужно ли пополнить банк
  if (data.bankSize) {
    maybeReplenish(topic.id, data.bankSize, (asked || []).length + 1);
  }
  return {
    topicId:   data.topicId,
    topicName: data.topicName,
    section:   data.section,
    question:  data.questions[0],
  };
}

function startPrefetch(topic, answers, asked) {
  prefetch = { promise: null, data: null, topicId: topic.id };
  // Сначала пробуем банк (мгновенно), fallback — API
  prefetch.promise = fetchFromBank(topic, asked)
    .then(data => {
      if (data) {
        if (prefetch.topicId === topic.id) prefetch.data = data;
        return data;
      }
      // Банк исчерпан — используем generate API
      return API.generate.question(buildGenerateParams(topic, answers, asked))
        .then(genData => {
          if (prefetch.topicId === topic.id) prefetch.data = genData;
          return genData;
        });
    })
    .catch(() => null);
}

function clearPrefetch() {
  prefetch = { promise: null, data: null, topicId: null };
}

// ---- TIMER ----
let timerInterval = null;
let timerSeconds  = 0;

function startTimer() {
  if (timerInterval) return;
  timerInterval = setInterval(() => { timerSeconds++; updateTimerDisplay(); }, 1000);
}

function updateTimerDisplay() {
  const m = Math.floor(timerSeconds / 60);
  const s = timerSeconds % 60;
  const el = document.getElementById('timer-display');
  if (el) el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
}

// ---- MATH RENDER ----
function renderMath(el) {
  if (typeof renderMathInElement === 'function') {
    renderMathInElement(el, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$',  right: '$',  display: false },
      ],
      throwOnError: false,
    });
  }
}

// ---- HINTS ----
const HINTS = {
  equations:    'Перенеси все члены в одну сторону. Для квадратного — используй дискриминант $D = b^2-4ac$.',
  inequalities: 'При умножении на отрицательное число знак неравенства меняется.',
  functions:    'Вершина параболы: $x = -b/(2a)$. Область определения — где функция существует.',
  progressions: 'АП: $a_n = a_1+(n-1)d$. ГП: $b_n = b_1 \\cdot q^{n-1}$.',
  logarithms:   '$\\log(ab) = \\log a+\\log b$, $\\log(a/b) = \\log a - \\log b$, $\\log(a^n) = n\\log a$.',
  trigonometry: 'Основное тождество: $\\sin^2 x+\\cos^2 x=1$. $\\sin 30°=\\frac{1}{2}$, $\\cos 60°=\\frac{1}{2}$.',
  derivative:   'Степенная функция: $(x^n)\'=nx^{n-1}$. Экстремум там, где $f\'(x)=0$.',
  powers:       '$a^m \\cdot a^n = a^{m+n}$. $(a^m)^n = a^{mn}$. $a^{m/n} = \\sqrt[n]{a^m}$.',
  planimetry:   'Вспомни формулы площадей: треугольник $S=\\frac{1}{2}bh$, трапеция $S=\\frac{(a+b)}{2}h$.',
  stereometry:  'Объём: куб $V=a^3$, шар $V=\\frac{4}{3}\\pi r^3$, цилиндр $V=\\pi r^2 h$.',
  triangles:    'Теорема Пифагора: $a^2+b^2=c^2$. Сумма углов треугольника $= 180°$.',
  circles:      'Длина $C=2\\pi r$, площадь $S=\\pi r^2$. Вписанный угол $=\\frac{1}{2}$ центрального.',
  vectors:      'Скалярное произведение: $\\vec{a}\\cdot\\vec{b} = |a||b|\\cos\\alpha$. Длина: $|a| = \\sqrt{x^2+y^2}$.',
  probability:  '$P(A) = m/n$. Для независимых: $P(AB) = P(A)\\cdot P(B)$.',
  statistics:   'Среднее = сумма/количество. Медиана — средний элемент отсортированного ряда.',
  word_problems:'Составь уравнение из условия. Обозначь неизвестное через $x$.',
  combinatorics:'Перестановки: $P_n=n!$. Сочетания: $C_n^k=\\frac{n!}{k!(n-k)!}$.',
};

let hintUsed = false;

function showHint() {
  if (hintUsed) return;
  const btn  = document.getElementById('hint-btn');
  const text = document.getElementById('hint-text');
  const q    = state.questions[state.qIndex];
  const hint = q?.hint || HINTS[state.currentTopic?.id] || 'Внимательно прочитай условие и выдели ключевые данные.';
  text.textContent = hint;
  renderMath(text);
  text.classList.add('show');
  btn.textContent = '✓ Подсказка показана';
  btn.classList.add('used');
  hintUsed = true;
}

// ---- MOTIVATION ----
const MOTIVATION_CORRECT = [
  { icon: '🎯', text: 'Отлично! Так держать.' },
  { icon: '✓',  text: 'Верно! Эта тема идёт хорошо.' },
  { icon: '💪', text: 'Правильно! Продолжай в том же духе.' },
  { icon: '🔥', text: 'Верно! Ты в ударе.' },
];
const MOTIVATION_WRONG = [
  { icon: '→', text: 'Ошибка — это тоже прогресс. Запомни разбор.' },
  { icon: '📖', text: 'Неверно. Внимательно читай объяснение.' },
  { icon: '💡', text: 'Не страшно. Именно так и учатся.' },
];

function setMotivation(isCorrect) {
  const pool = isCorrect ? MOTIVATION_CORRECT : MOTIVATION_WRONG;
  const m    = pool[Math.floor(Math.random() * pool.length)];
  const icon = document.getElementById('motivation-icon');
  const text = document.getElementById('motivation-text');
  const wrap = document.getElementById('sb-motivation');
  if (!icon || !text) return;
  icon.textContent = m.icon;
  text.textContent = m.text;
  if (wrap) {
    wrap.style.borderColor = isCorrect ? 'rgba(74,222,128,.25)' : 'rgba(248,113,113,.2)';
    wrap.style.background  = isCorrect ? 'rgba(74,222,128,.06)' : 'rgba(248,113,113,.05)';
  }
}

function updateSidebarStats() {
  const correct = document.getElementById('stat-correct');
  const wrong   = document.getElementById('stat-wrong');
  const topics  = document.getElementById('stat-topics');
  if (correct) correct.textContent = state.totalCorrect;
  if (wrong)   wrong.textContent   = state.totalAnswered - state.totalCorrect;
  if (topics)  topics.textContent  = `${state.topicIndex}/${state.topics.length}`;

  const dots = document.getElementById('sb-dots');
  if (!dots) return;
  dots.innerHTML = state.topics.map((t, i) => {
    const r   = state.allResults[t.id];
    let cls   = 'sb-dot';
    if (i === state.topicIndex) cls += ' active';
    else if (r) cls += r.pct >= 70 ? ' good' : r.pct >= 40 ? ' mid' : ' weak';
    return `<div class="${cls}" title="${t.name}"></div>`;
  }).join('');
}

// ---- SCREENS ----
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const el = document.getElementById(id);
  if (el) { el.classList.add('active'); window.scrollTo(0, 0); }
}

// ---- START ----
function selectExam(type) {
  state.exam = type;
  document.querySelectorAll('.exam-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('card-' + type)?.classList.add('selected');
  document.getElementById('btn-continue').disabled = false;
}

async function startDiagnostic() {
  showScreen('screen-loading');
  startLoadingTips('');
  document.getElementById('loading-text').textContent = 'Загружаю темы...';
  try {
    const data   = await API.diagnostic.getTopics(state.exam);
    stopLoadingTips();
    state.topics = data.topics;
    renderTopicsOverview();
    showScreen('screen-topics');

    // Предзагрузка первого вопроса первой темы
    const first = state.topics[0];
    startPrefetch(first, [], []);
  } catch (e) {
    alert('Ошибка: ' + e.message);
    showScreen('screen-start');
  }
}

// ---- TOPICS OVERVIEW ----
function renderTopicsOverview() {
  document.getElementById('topics-exam-label').textContent =
    `${state.exam.toUpperCase()} · ${state.topics.length} тем`;

  const container = document.getElementById('topics-container');
  const sections  = [...new Set(state.topics.map(t => t.section))];

  container.innerHTML = sections.map(sec => {
    const st = state.topics.filter(t => t.section === sec);
    return `
      <div class="tov-section">
        <div class="tov-section-label">${sec}</div>
        <div class="tov-chips">
          ${st.map(t => `
            <div class="tov-chip" id="pill-${t.id}">
              <span class="tov-chip-dot" id="badge-${t.id}"></span>
              <span>${t.name}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }).join('');
}

// ---- TEST FLOW ----
function beginTest() {
  state.topicIndex   = 0;
  state.allResults   = {};
  state.totalAnswered = 0;
  state.totalCorrect  = 0;
  state.askedPerTopic = {};
  loadTopic();
}

async function loadTopic() {
  if (state.topicIndex >= state.topics.length) {
    showResults();
    return;
  }
  state.currentTopic = state.topics[state.topicIndex];
  state.qIndex       = 0;
  state.topicAnswers = [];
  state.askedPerTopic[state.currentTopic.id] =
    state.askedPerTopic[state.currentTopic.id] || [];
  await fetchNextQuestion();
}

// ---- FETCH WITH PREFETCH ----
async function fetchNextQuestion() {
  const topic = state.currentTopic;
  const asked = state.askedPerTopic[topic.id] || [];

  // 1. Предзагруженный вопрос готов (банк или API)
  if (prefetch.data && prefetch.topicId === topic.id) {
    const data = prefetch.data;
    clearPrefetch();
    applyQuestion(data);
    return;
  }

  // 2. Предзагрузка в процессе — ждём (банк: < 50ms, API: несколько сек)
  if (prefetch.promise && prefetch.topicId === topic.id) {
    const data = await prefetch.promise;
    clearPrefetch();
    if (data) { applyQuestion(data); return; }
  }

  // 3. Холодный запрос — сначала из банка (мгновенно)
  try {
    const data = await fetchFromBank(topic, asked);
    if (data) {
      clearPrefetch();
      applyQuestion(data);
      return;
    }
  } catch (bankErr) {
    console.warn('Bank fetch failed:', bankErr.message);
  }

  // 4. Банк исчерпан (или ошибка) — fallback на генерацию через AI
  console.info('Bank exhausted for', topic.id, '— falling back to AI generation');
  const params = buildGenerateParams(topic, state.topicAnswers, asked);

  try {
    const data = await fetchWithStreaming(params);
    clearPrefetch();
    applyQuestion(data, true);
    return;
  } catch (streamErr) {
    console.warn('Streaming failed:', streamErr.message);
  }

  try {
    showScreen('screen-loading');
    startLoadingTips(topic.name);
    document.getElementById('loading-text').textContent = topic.name + '...';
    const data = await API.generate.question(params);
    stopLoadingTips();
    clearPrefetch();
    applyQuestion(data);
  } catch (e) {
    stopLoadingTips();
    console.error('Generation failed completely:', e);
    showGenerationError();
  }
}

async function fetchWithStreaming(params) {
  // Show question screen immediately with skeleton state
  showScreen('screen-question');
  startTimer();
  updateSidebarStats();

  document.getElementById('q-topic-label').textContent = state.currentTopic.name;
  document.getElementById('q-section').textContent     = state.currentTopic.section;
  document.getElementById('q-count-label').textContent =
    `Тема ${state.topicIndex + 1} / ${state.topics.length}`;

  const progress = ((state.topicIndex + state.topicAnswers.length / QUESTIONS_PER_TOPIC) / state.topics.length) * 100;
  document.getElementById('progress-fill').style.width = progress + '%';

  // Streaming cursor in q-text
  const qTextEl = document.getElementById('q-text');
  qTextEl.innerHTML = '<span class="stream-cursor"></span>';

  // Skeleton options
  const list = document.getElementById('options-list');
  list.innerHTML = ['А', 'Б', 'В', 'Г'].map(l => `
    <div class="option option-skeleton">
      <span class="option-key">${l}</span>
      <span class="skeleton-line"></span>
    </div>
  `).join('');

  document.getElementById('btn-next').style.display  = 'none';
  document.getElementById('explanation').className   = 'explanation';

  hintUsed = false;
  const hintBtn  = document.getElementById('hint-btn');
  const hintText = document.getElementById('hint-text');
  if (hintBtn)  { hintBtn.textContent = 'Нужна подсказка?'; hintBtn.classList.remove('used'); }
  if (hintText) { hintText.textContent = ''; hintText.classList.remove('show'); }

  return new Promise((resolve, reject) => {
    let accumulated = '';

    API.generate.questionStream(
      params,
      (text) => {
        accumulated = text;
        // Progressively show question text as it streams in
        const m = accumulated.match(/"question"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        if (m) {
          const q = m[1].replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
          qTextEl.textContent = q;
          renderMath(qTextEl);
        }
      },
      (fullText, shuffled) => {
        // Сервер прислал уже перемешанный вопрос — используем его
        if (shuffled && shuffled.question && shuffled.options && shuffled.correct !== undefined) {
          resolve({ question: shuffled });
          return;
        }
        // Fallback: парсим накопленный текст
        try {
          let text = fullText.replace(/```json|```/g, '').trim();
          const first = text.indexOf('{');
          const last  = text.lastIndexOf('}');
          if (first === -1) throw new Error('No JSON found');
          text = text.slice(first, last + 1);
          const open  = (text.match(/\{/g) || []).length;
          const close = (text.match(/\}/g) || []).length;
          if (open > close) text += '}'.repeat(open - close);
          let q;
          try { q = JSON.parse(text); }
          catch { text = text.replace(/,\s*$/, '').replace(/,\s*\}/g, '}'); q = JSON.parse(text); }
          if (!q.question || !q.options || q.correct === undefined) throw new Error('Incomplete JSON');
          resolve({ question: q });
        } catch (e) {
          reject(e);
        }
      },
      reject
    );
  });
}

function applyQuestion(data, alreadyShown = false) {
  state.questions = [data.question];
  state.qIndex    = 0;
  if (!state.askedPerTopic[state.currentTopic.id]) {
    state.askedPerTopic[state.currentTopic.id] = [];
  }
  state.askedPerTopic[state.currentTopic.id].push(data.question.question);
  if (!alreadyShown) {
    renderQuestion();
  } else {
    renderOptions(data.question);
    updateSidebarStats();
  }
}

function renderOptions(q) {
  const letters = ['А', 'Б', 'В', 'Г'];
  const list    = document.getElementById('options-list');
  list.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn     = document.createElement('button');
    btn.className = 'option';
    const keySpan = document.createElement('span');
    keySpan.className   = 'option-key';
    keySpan.textContent = letters[i];
    const optSpan = document.createElement('span');
    optSpan.textContent = opt;
    btn.appendChild(keySpan);
    btn.appendChild(optSpan);
    renderMath(optSpan);
    btn.onclick = () => pickAnswer(i);
    list.appendChild(btn);
  });
  // Re-render question with full text and math
  const qTextEl = document.getElementById('q-text');
  qTextEl.textContent = q.question;
  renderMath(qTextEl);
}

// ---- RENDER QUESTION ----
function renderQuestion() {
  showScreen('screen-question');

  hintUsed = false;
  const hintBtn  = document.getElementById('hint-btn');
  const hintText = document.getElementById('hint-text');
  if (hintBtn)  { hintBtn.textContent = 'Нужна подсказка?'; hintBtn.classList.remove('used'); }
  if (hintText) { hintText.textContent = ''; hintText.classList.remove('show'); }

  updateSidebarStats();
  startTimer();

  const q        = state.questions[state.qIndex];
  const progress = ((state.topicIndex + state.topicAnswers.length / QUESTIONS_PER_TOPIC) / state.topics.length) * 100;

  document.getElementById('progress-fill').style.width = progress + '%';
  document.getElementById('q-topic-label').textContent = state.currentTopic.name;
  document.getElementById('q-count-label').textContent =
    `Тема ${state.topicIndex + 1} / ${state.topics.length}`;
  document.getElementById('q-section').textContent = state.currentTopic.section;

  const qTextEl = document.getElementById('q-text');
  qTextEl.textContent = q.question;
  renderMath(qTextEl);

  document.getElementById('explanation').className = 'explanation';
  document.getElementById('btn-next').style.display = 'none';

  const letters = ['А', 'Б', 'В', 'Г'];
  const list    = document.getElementById('options-list');
  list.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn     = document.createElement('button');
    btn.className = 'option';
    const keySpan = document.createElement('span');
    keySpan.className   = 'option-key';
    keySpan.textContent = letters[i];
    const optSpan = document.createElement('span');
    optSpan.textContent = opt;
    btn.appendChild(keySpan);
    btn.appendChild(optSpan);
    renderMath(optSpan);
    btn.onclick = () => pickAnswer(i);
    list.appendChild(btn);
  });
}

// ---- ANSWER ----
function pickAnswer(idx) {
  const q    = state.questions[state.qIndex];
  const opts = document.querySelectorAll('.option');
  opts.forEach(o => o.classList.add('disabled'));

  const isCorrect = idx === q.correct;
  opts[idx].classList.add(isCorrect ? 'correct' : 'wrong');
  if (!isCorrect) opts[q.correct].classList.add('correct');

  const exp = document.getElementById('explanation');
  exp.innerHTML = '';
  const strong  = document.createElement('strong');
  strong.textContent = isCorrect ? 'Верно!' : 'Неверно.';
  const expText = document.createElement('span');
  expText.textContent = q.explanation;
  exp.appendChild(strong);
  exp.appendChild(expText);
  renderMath(exp);
  exp.classList.add('show');

  state.topicAnswers.push(isCorrect);
  state.totalAnswered++;
  if (isCorrect) state.totalCorrect++;

  setMotivation(isCorrect);
  updateSidebarStats();

  // Определяем — будет ли ещё вопрос по теме
  const total          = state.topicAnswers.length;
  const lastN          = state.topicAnswers.slice(-CONSECUTIVE_FAIL_EXIT);
  const consecutiveFail = lastN.length >= CONSECUTIVE_FAIL_EXIT && lastN.every(a => !a);
  const topicDone      = consecutiveFail || total >= QUESTIONS_PER_TOPIC;

  const btn = document.getElementById('btn-next');
  btn.style.display = 'flex';

  if (topicDone) {
    btn.innerHTML = 'Следующая тема <span class="arrow">→</span>';
    // Предзагрузка первого вопроса СЛЕДУЮЩЕЙ темы пока читают объяснение
    const nextIdx = state.topicIndex + 1;
    if (nextIdx < state.topics.length) {
      const nextTopic = state.topics[nextIdx];
      startPrefetch(nextTopic, [], state.askedPerTopic[nextTopic.id] || []);
    }
  } else {
    btn.innerHTML = 'Следующий вопрос <span class="arrow">→</span>';
    // Предзагрузка следующего вопроса ЭТОЙ темы пока читают объяснение
    startPrefetch(
      state.currentTopic,
      state.topicAnswers,
      state.askedPerTopic[state.currentTopic.id] || []
    );
  }
}

// ---- NEXT ----
async function handleNext() {
  const total          = state.topicAnswers.length;
  const correct        = state.topicAnswers.filter(Boolean).length;
  const pct            = total > 0 ? Math.round(correct / total * 100) : 100;
  const lastN          = state.topicAnswers.slice(-CONSECUTIVE_FAIL_EXIT);
  const consecutiveFail = lastN.length >= CONSECUTIVE_FAIL_EXIT && lastN.every(a => !a);
  const topicDone      = consecutiveFail || total >= QUESTIONS_PER_TOPIC;

  if (!topicDone) {
    await fetchNextQuestion();
    return;
  }

  // Сохранить результат темы
  state.allResults[state.currentTopic.id] = {
    name:     state.currentTopic.name,
    section:  state.currentTopic.section,
    correct,
    total,
    pct,
    earlyExit: consecutiveFail,
  };

  const chip = document.getElementById('pill-' + state.currentTopic.id);
  if (chip) {
    chip.classList.remove('done', 'weak', 'mid');
    chip.classList.add(pct >= 70 ? 'done' : pct >= 40 ? 'mid' : 'weak');
  }

  updateSidebarStats();
  showTopicDone(pct, consecutiveFail);
}

// ---- TOPIC DONE ----
function showTopicDone(pct, earlyExit) {
  showScreen('screen-topic-done');
  document.getElementById('td-name').textContent = state.currentTopic.name;
  const el = document.getElementById('td-pct');

  let color, text;
  if (earlyExit) {
    color = 'var(--err)';
    text  = 'Тема сильно западает — обязательно проработай перед ЕНТ';
    el.textContent = pct + '%';
  } else if (pct >= 70) {
    color = 'var(--ok)';
    text  = 'Хорошее знание темы';
    el.textContent = pct + '%';
  } else if (pct >= 40) {
    color = 'var(--mid)';
    text  = 'Есть пробелы — стоит повторить';
    el.textContent = pct + '%';
  } else {
    color = 'var(--err)';
    text  = 'Тема западает — нужна серьёзная проработка';
    el.textContent = pct + '%';
  }

  el.style.color = color;
  document.getElementById('td-descr').textContent = text;
}

function nextTopic() {
  state.topicIndex++;
  loadTopic();
}

// ---- RESULTS ----
function showResults() {
  showScreen('screen-results');
  const results = Object.values(state.allResults);
  const pct = state.totalAnswered > 0
    ? Math.round(state.totalCorrect / state.totalAnswered * 100) : 0;

  setTimeout(() => {
    const circ = 2 * Math.PI * 58;
    const arc  = document.getElementById('score-arc');
    if (arc) {
      arc.style.transition    = 'stroke-dashoffset 1.3s cubic-bezier(.4,0,.2,1)';
      arc.style.strokeDashoffset = circ * (1 - pct / 100);
    }
    const numEl = document.getElementById('score-num');
    if (numEl) numEl.textContent = pct + '%';
  }, 100);

  const titles = [[80,'Отличный результат'],[60,'Хороший уровень'],[40,'Средний уровень'],[0,'Нужна серьёзная работа']];
  const subs   = [[80,'Крепкая база для высокого балла'],[60,'Несколько тем нужно доработать'],[40,'Значительная часть тем требует проработки'],[0,'Начни с основ — это нормально']];

  document.getElementById('results-title').textContent = (titles.find(([t]) => pct >= t) || titles[3])[1];
  document.getElementById('results-sub').textContent   = (subs.find(([t]) => pct >= t) || subs[3])[1];

  const weak    = results.filter(r => r.pct < 40 || r.earlyExit);
  const mid     = results.filter(r => r.pct >= 40 && r.pct < 70 && !r.earlyExit);
  const strong  = results.filter(r => r.pct >= 70);

  const list = document.getElementById('results-list');
  list.innerHTML = '';

  // Сначала слабые (важнее)
  [...weak, ...mid, ...strong].forEach(r => {
    const col     = r.pct >= 70 ? 'var(--ok)' : r.pct >= 40 ? 'var(--mid)' : 'var(--err)';
    const exitTag = r.earlyExit
      ? '<span style="font-size:10px;font-weight:700;color:#b94040;text-transform:uppercase;letter-spacing:.05em;margin-left:6px;">Критично</span>'
      : '';
    list.innerHTML += `<div class="result-row">
      <div class="result-info">
        <div class="result-name">${r.name}${exitTag}</div>
        <div class="result-sec">${r.section}</div>
      </div>
      <div class="result-bar-wrap">
        <div class="result-bar" style="width:${r.pct}%;background:${col}"></div>
      </div>
      <div class="result-pct" style="color:${col}">${r.pct}%</div>
      <div class="result-qs">${r.correct}/${r.total}</div>
    </div>`;
  });

  // Анализ ИИ в сайдбар
  const sbTopics = document.getElementById('sidebar-results-topics');
  if (sbTopics) {
    sbTopics.innerHTML = '';
    if (weak.length) {
      const weakEl = document.createElement('div');
      weakEl.innerHTML = `<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.3);letter-spacing:.15em;text-transform:uppercase;margin-bottom:8px;">Надо проработать</div>`;
      weak.forEach(r => {
        weakEl.innerHTML += `<div style="font-size:13px;color:#f87171;margin-bottom:4px;">● ${r.name}</div>`;
      });
      sbTopics.appendChild(weakEl);
    }
    if (mid.length) {
      const midEl = document.createElement('div');
      midEl.innerHTML = `<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.3);letter-spacing:.15em;text-transform:uppercase;margin:12px 0 8px;">Есть пробелы</div>`;
      mid.forEach(r => {
        midEl.innerHTML += `<div style="font-size:13px;color:#facc15;margin-bottom:4px;">● ${r.name}</div>`;
      });
      sbTopics.appendChild(midEl);
    }
    if (strong.length) {
      const okEl = document.createElement('div');
      okEl.innerHTML = `<div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.3);letter-spacing:.15em;text-transform:uppercase;margin:12px 0 8px;">Знаешь хорошо</div>`;
      strong.forEach(r => {
        okEl.innerHTML += `<div style="font-size:13px;color:#4ade80;margin-bottom:4px;">✓ ${r.name}</div>`;
      });
      sbTopics.appendChild(okEl);
    }
  }

  API.diagnostic.save({
    sessionId: getSessionId(),
    examType:  state.exam,
    totalPct:  pct,
    topicData: state.allResults,
  }).catch(() => {});
}

function showGenerationError() {
  // Показываем ошибку прямо на экране загрузки — без потери прогресса
  showScreen('screen-loading');
  stopLoadingTips();
  const label = document.getElementById('loading-topic-label');
  const text  = document.getElementById('loading-text');
  const sub   = document.querySelector('.loading-sub');
  if (label) label.textContent = 'Ошибка генерации';
  if (text)  text.textContent  = 'Не удалось создать вопрос';
  if (sub)   sub.textContent   = 'Нажми "Попробовать снова" — прогресс сохранён';

  // Убираем tip-карточку, вставляем кнопку retry
  const tipCard = document.querySelector('.loading-tip-card');
  if (tipCard) {
    tipCard.innerHTML = `
      <div style="text-align:center;width:100%;">
        <button
          onclick="retryCurrentQuestion()"
          style="width:100%;padding:14px;border-radius:12px;border:none;
                 background:rgba(255,255,255,.15);color:#fff;font-size:14px;
                 font-weight:600;cursor:pointer;font-family:var(--sans);">
          ↻ Попробовать снова
        </button>
        <div style="font-size:12px;color:rgba(255,255,255,.3);margin-top:10px;">
          или <a href="/" style="color:rgba(255,255,255,.5);">вернуться на главную</a>
        </div>
      </div>`;
  }
}

async function retryCurrentQuestion() {
  // Восстановить tip-карточку
  const tipCard = document.querySelector('.loading-tip-card');
  if (tipCard) {
    tipCard.innerHTML = `
      <div class="loading-tip-icon" id="tip-icon">💡</div>
      <div class="loading-tip-text" id="tip-text">Загружаю...</div>`;
  }
  clearPrefetch();
  startLoadingTips(state.currentTopic?.name || '');
  // Не сбрасываем topicAnswers — прогресс внутри темы сохраняется
  await fetchNextQuestion();
}

function goToExam() {
  window.location.href = '/diagnostic.html';
}

function resetAll() {
  state = {
    exam: null, topics: [], topicIndex: 0, currentTopic: null,
    questions: [], qIndex: 0, topicAnswers: [], allResults: {},
    totalAnswered: 0, totalCorrect: 0, askedPerTopic: {},
  };
  clearPrefetch();
  document.querySelectorAll('.exam-card').forEach(c => c.classList.remove('selected'));
  document.getElementById('btn-continue').disabled = true;
  showScreen('screen-start');
}

// ---- LOADING TIPS ----
const LOADING_TIPS = [
  { icon: '🧮', text: 'Квадратное уравнение $ax^2+bx+c=0$ имеет корни, если $D=b^2-4ac \\geq 0$' },
  { icon: '📐', text: 'Сумма углов любого треугольника равна $180°$' },
  { icon: '🔢', text: 'Логарифм: $\\log_a b = c$ означает $a^c = b$' },
  { icon: '📊', text: 'Вероятность: $P(A) = \\frac{\\text{число благоприятных}}{\\text{число всех исходов}}$' },
  { icon: '📈', text: 'Производная показывает скорость изменения функции в точке' },
  { icon: '∑',  text: 'Сумма первых $n$ членов АП: $S_n = \\frac{(a_1+a_n) \\cdot n}{2}$' },
  { icon: '🔵', text: 'Длина окружности: $C = 2\\pi r$, площадь круга: $S = \\pi r^2$' },
  { icon: '📉', text: 'Формула дискриминанта: $D = b^2 - 4ac$. Если $D > 0$ — два корня' },
];

const MATH_FACTS = [
  'Число π (пи) иррационально — его нельзя представить дробью. Первые 10 знаков: 3.1415926535',
  'В ЕНТ по математике 50 заданий. На каждое — в среднем 3 минуты.',
  'Слово «алгебра» происходит от арабского «аль-джабр» — «восстановление».',
  'Евклид написал «Начала» в 300 г. до н.э. — это основа школьной геометрии.',
  'Нулевой факториал: $0! = 1$. Это математическое соглашение, очень удобное в формулах.',
  'Золотое сечение φ ≈ 1.618 встречается в природе, архитектуре и искусстве.',
];

let tipInterval = null;
let tipIndex    = 0;

function startLoadingTips(topicName) {
  clearInterval(tipInterval);
  tipIndex = Math.floor(Math.random() * LOADING_TIPS.length);

  const topicLabel = document.getElementById('loading-topic-label');
  const factText   = document.getElementById('fact-text');
  if (topicLabel) topicLabel.textContent = topicName ? `Генерирую: ${topicName}` : 'Генерирую задачу';
  if (factText)   factText.textContent   = MATH_FACTS[Math.floor(Math.random() * MATH_FACTS.length)];

  function updateTip() {
    const tip  = LOADING_TIPS[tipIndex % LOADING_TIPS.length];
    const icon = document.getElementById('tip-icon');
    const text = document.getElementById('tip-text');
    if (icon) icon.textContent = tip.icon;
    if (text) {
      text.style.opacity = '0';
      setTimeout(() => {
        text.textContent = tip.text;
        renderMath(text);
        text.style.opacity = '1';
      }, 300);
    }
    tipIndex++;
  }
  updateTip();
  tipInterval = setInterval(updateTip, 3000);
}

function stopLoadingTips() {
  clearInterval(tipInterval);
  tipInterval = null;
}

// ---- AI REPORT ----
function submitEmailGate() {
  const input  = document.getElementById('gate-email-input');
  const errEl  = document.getElementById('gate-email-err');
  const btn    = document.getElementById('gate-email-btn');
  const email  = input.value.trim();

  if (!email) { errEl.textContent = 'Введи email'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errEl.textContent = 'Некорректный email'; return; }

  errEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Генерируем...';

  getAIReport(email).finally(() => {
    btn.disabled = false;
    btn.textContent = 'Получить AI-отчёт ✦';
  });
}

// ── LOADING ANIMATION ──
let _loadPhaseTimer = null;
const LOAD_PHASES = [
  { text: 'Читаю твои ответы',      sub: 'Собираю результаты по всем темам',                 pct: 10, step: 1 },
  { text: 'Ищу паттерны ошибок',    sub: 'Сравниваю с профилем успешных ЕНТ 2026',           pct: 28, step: 2 },
  { text: 'Нахожу root cause',       sub: 'Анализирую причины слабости по каждой теме',       pct: 48, step: 3 },
  { text: 'Строю прогноз баллов',    sub: 'Рассчитываю твой потенциал на ЕНТ',               pct: 65, step: 3 },
  { text: 'Составляю план',          sub: 'Адаптирую 3-недельную программу под тебя',         pct: 80, step: 4 },
  { text: 'Финализирую отчёт',       sub: 'Последние штрихи персонального анализа...',        pct: 93, step: 5 },
];

function _setLoadPhase(p) {
  const phase = document.getElementById('rpt-load-phase');
  const sub   = document.getElementById('rpt-load-sub');
  const bar   = document.getElementById('rpt-load-bar');
  if (bar) bar.style.width = p.pct + '%';
  if (phase) { phase.style.opacity = '0'; setTimeout(() => { phase.textContent = p.text; phase.style.opacity = '1'; }, 250); }
  if (sub)   { sub.style.opacity = '0';   setTimeout(() => { sub.textContent   = p.sub;  sub.style.opacity   = '1'; }, 350); }
  for (let i = 1; i <= 5; i++) {
    const el = document.getElementById('rls' + i);
    if (!el) continue;
    el.classList.remove('active', 'done');
    if (i < p.step) el.classList.add('done');
    else if (i === p.step) el.classList.add('active');
  }
}

const ENT_FACTS = [
  'ЕНТ по математике: 50 вопросов за 90 минут — это ~1 мин 48 сек на каждый вопрос.',
  'Тригонометрия — одна из самых частых тем ЕНТ. sin 30° = ½ нужно знать мгновенно.',
  'Самая частая ошибка на ЕНТ: умножение неравенства на отрицательное число без смены знака.',
  'Логарифм: log₂ 8 = 3, потому что 2³ = 8. Всегда проверяй через степень.',
  'Студенты, разбирающие ошибки после каждого теста, прогрессируют в 2× быстрее.',
  'Прогрессии, вероятность и статистика суммарно дают ~18 баллов из 50 — не игнорируй их.',
  'Производная f\'(x) = 0 — это условие экстремума. Проверь знак f\' рядом, чтобы определить max/min.',
  'В задачах планиметрии ЕНТ все данные всегда в тексте — рисунки не нужны.',
  'Золотое сечение φ ≈ 1.618 присутствует в архитектуре пирамид Гизы и раковинах моллюсков.',
  'Слово «алгебра» — от арабского «аль-джабр» (восстановление). Аль-Хорезми, IX век.',
];

let _factTimer = null;
let _factIdx = 0;

function _startFactRotation() {
  _factIdx = Math.floor(Math.random() * ENT_FACTS.length);
  const el = document.getElementById('rpt-fact-text');
  if (!el) return;
  el.textContent = ENT_FACTS[_factIdx];

  _factTimer = setInterval(() => {
    if (!el) return;
    el.classList.add('fade');
    setTimeout(() => {
      _factIdx = (_factIdx + 1) % ENT_FACTS.length;
      el.textContent = ENT_FACTS[_factIdx];
      el.classList.remove('fade');
    }, 350);
  }, 4500);
}

function _renderPreviewRows() {
  const container = document.getElementById('rpt-preview-rows');
  if (!container) return;
  container.innerHTML = '';
  const results = Object.values(state.allResults);
  if (!results.length) return;

  const sorted = [...results].sort((a, b) => a.pct - b.pct);
  sorted.forEach((r, i) => {
    const cls = r.pct >= 70 ? 'good' : r.pct >= 40 ? 'mid' : 'bad';
    const row = document.createElement('div');
    row.className = 'rpt-preview-row';
    row.innerHTML = `
      <div class="rpt-preview-name">${r.name}</div>
      <div class="rpt-preview-bar"><div class="rpt-preview-fill ${cls}" id="rpf-${i}"></div></div>
      <div class="rpt-preview-pct">${r.pct}%</div>`;
    container.appendChild(row);

    setTimeout(() => {
      row.classList.add('vis');
      setTimeout(() => {
        const fill = document.getElementById('rpf-' + i);
        if (fill) fill.style.width = r.pct + '%';
      }, 80);
    }, i * 90);
  });
}

function startReportLoading() {
  let idx = 0;
  _setLoadPhase(LOAD_PHASES[0]);
  _loadPhaseTimer = setInterval(() => {
    idx = Math.min(idx + 1, LOAD_PHASES.length - 1);
    _setLoadPhase(LOAD_PHASES[idx]);
  }, 2400);
  _renderPreviewRows();
  _startFactRotation();
}

function stopReportLoading() {
  if (_loadPhaseTimer) { clearInterval(_loadPhaseTimer); _loadPhaseTimer = null; }
  if (_factTimer)      { clearInterval(_factTimer);      _factTimer = null; }
  const bar = document.getElementById('rpt-load-bar');
  if (bar) bar.style.width = '100%';
  setTimeout(() => {
    document.getElementById('report-loading').style.display = 'none';
  }, 300);
}

function animateCount(el, target, suffix, duration) {
  if (!el) return;
  let start = null;
  const run = ts => {
    if (!start) start = ts;
    const p = Math.min((ts - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(eased * target) + (suffix || '');
    if (p < 1) requestAnimationFrame(run);
  };
  requestAnimationFrame(run);
}

async function getAIReport(userEmail) {
  showScreen('screen-report');
  document.getElementById('report-loading').style.display = 'flex';
  document.getElementById('report-content').style.display = 'none';
  startReportLoading();

  const topics = Object.entries(state.allResults).map(([id, r]) => ({
    id, name: r.name, section: r.section,
    correct: r.correct, total: r.total, pct: r.pct,
    earlyExit: r.earlyExit || false,
  }));

  const totalPct = state.totalAnswered > 0
    ? Math.round(state.totalCorrect / state.totalAnswered * 100) : 0;

  try {
    const resp = await fetch('/api/diagnostic/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exam: state.exam, totalPct, timeSeconds: timerSeconds, topics }),
    });
    const data = await resp.json();
    if (!resp.ok || !data.report) throw new Error(data.error || 'Ошибка генерации');
    stopReportLoading();
    setTimeout(() => renderReport_wrap(data.report, totalPct, topics), 350);

    if (userEmail) {
      fetch('/api/diagnostic/send-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userEmail, report: data.report, totalPct, exam: state.exam, topics, sessionId: getSessionId() }),
      }).catch(() => {});
    }
  } catch (err) {
    stopReportLoading();
    setTimeout(() => renderReportFallback(totalPct, topics), 350);
  }
}

function renderReport(report, totalPct, topics) {
  document.getElementById('report-loading').style.display = 'none';
  document.getElementById('report-content').style.display = 'block';

  // Score count-up
  animateCount(document.getElementById('rpt-pct'), totalPct, '%', 1200);

  // Level badge — нейтральные слова вместо "Слабый"
  const levelEn  = report.levelEn || 'medium';
  const BADGE_LABELS = { weak: 'СТАРТ', medium: 'ПРОГРЕСС', good: 'УВЕРЕН', excellent: 'ТОПОВЫЙ' };
  const badge    = document.getElementById('rpt-level-badge');
  const badgeName = document.getElementById('rpt-level-name');
  if (badge)    badge.className = 'rpt-level-badge ' + levelEn;
  if (badgeName) badgeName.textContent = BADGE_LABELS[levelEn] || report.level || '—';

  const headings = { weak: 'Есть куда расти', medium: 'Хорошая база — добьём', good: 'Сильный уровень', excellent: 'Готов к максимуму' };
  const subs     = { weak: 'Большинство тем требуют серьёзной проработки', medium: 'Несколько слабых тем тянут результат вниз', good: 'Финальный рывок до отличного результата', excellent: 'Держи темп — ты на правильном пути' };
  const headingEl = document.getElementById('rpt-level-heading');
  const subEl     = document.getElementById('rpt-level-sub');
  if (headingEl) headingEl.textContent = headings[levelEn] || '—';
  if (subEl)     subEl.textContent     = subs[levelEn]     || '';

  document.getElementById('rpt-personal-msg').textContent = report.personalMessage || '';

  // Exam tag
  const examTag = document.getElementById('rpt-exam-tag');
  if (examTag) examTag.textContent = (state.exam === 'ege' ? 'ЕГЭ' : 'ЕНТ') + ' · Математика';

  // Diagnosis
  document.getElementById('rpt-diagnosis-text').textContent = report.diagnosis || report.level || '—';

  // Shared counts used in hero mini-stats + stats strip
  const pred      = report.predictedScore || Math.round(totalPct / 100 * 50);
  const goodCount = topics.filter(t => t.pct >= 70).length;
  const badCount  = topics.filter(t => t.pct < 60).length;

  // Mini stats inside hero (animated)
  setTimeout(() => {
    animateCount(document.getElementById('rpt-mini-score'),        pred,      '', 1200);
    animateCount(document.getElementById('rpt-mini-strong-count'), goodCount, '', 900);
    animateCount(document.getElementById('rpt-mini-weak-count'),   badCount,  '', 900);
  }, 300);

  // Stats strip
  setTimeout(() => {
    animateCount(document.getElementById('rqs-pred'), pred,      '', 1400);
    animateCount(document.getElementById('rqs-good'), goodCount, '', 1000);
    animateCount(document.getElementById('rqs-bad'),  badCount,  '', 1000);
  }, 200);

  // Critical insights
  const insEl = document.getElementById('rpt-insights-grid');
  insEl.innerHTML = '';
  const insights = report.criticalInsights || [];
  if (insights.length) {
    insights.forEach((ins, i) => {
      insEl.insertAdjacentHTML('beforeend', `
        <div class="rpt-insight-item" style="animation-delay:${i * 0.12}s">
          <div class="rpt-insight-num">0${i + 1}</div>
          <div>
            <div class="rpt-insight-title">${ins.title}</div>
            <div class="rpt-insight-body">${ins.body}</div>
          </div>
        </div>`);
    });
  } else if (report.pattern) {
    insEl.insertAdjacentHTML('beforeend', `
      <div class="rpt-insight-item">
        <div class="rpt-insight-num">01</div>
        <div><div class="rpt-insight-title">Паттерн</div><div class="rpt-insight-body">${report.pattern}</div></div>
      </div>`);
  }

  // Heatmap (sorted weak first)
  const heatEl = document.getElementById('rpt-heatmap');
  heatEl.innerHTML = '';
  [...topics].sort((a, b) => a.pct - b.pct).forEach((t, i) => {
    const cls = t.pct >= 70 ? 'good' : t.pct >= 40 ? 'mid' : 'weak';
    heatEl.insertAdjacentHTML('beforeend', `
      <div class="rpt-heat-cell ${cls}" style="animation-delay:${i * 0.04}s">
        <div class="rpt-heat-name">${t.name}</div>
        <div class="rpt-heat-pct">${t.pct}%</div>
      </div>`);
  });

  // Strong topics
  const strongEl = document.getElementById('rpt-strong-list');
  strongEl.innerHTML = '';
  if (report.strongTopics && report.strongTopics.length) {
    report.strongTopics.forEach(t => {
      strongEl.insertAdjacentHTML('beforeend', `
        <div class="rpt-col-item">
          <div class="rpt-col-item-row">
            <span class="rpt-col-item-name">${t.name}</span>
            <span class="rpt-col-item-pct">${t.pct}%</span>
          </div>
          <div class="rpt-col-item-comment">${t.comment || ''}</div>
        </div>`);
    });
  } else {
    strongEl.innerHTML = '<div style="font-size:13px;color:var(--muted)">Нет тем выше 70%</div>';
  }

  // Weak topics with root cause
  const weakEl = document.getElementById('rpt-weak-list');
  weakEl.innerHTML = '';
  if (report.weakTopics && report.weakTopics.length) {
    report.weakTopics.forEach(t => {
      weakEl.insertAdjacentHTML('beforeend', `
        <div class="rpt-col-item">
          <div class="rpt-col-item-row">
            <span class="rpt-col-item-name">
              <span class="rpt-priority-num">${t.priority || '—'}</span>${t.name}
            </span>
            <span class="rpt-col-item-pct">${t.pct}%</span>
          </div>
          ${t.rootCause ? `<div class="rpt-root-cause">${t.rootCause}</div>` : (t.comment ? `<div class="rpt-col-item-comment">${t.comment}</div>` : '')}
          ${t.action ? `<div class="rpt-col-item-action" style="margin-top:6px">→ ${t.action}</div>` : ''}
        </div>`);
    });
  } else {
    weakEl.innerHTML = '<div style="font-size:13px;color:var(--muted)">Все темы в порядке</div>';
  }

  // Study plan
  const planEl = document.getElementById('rpt-plan-grid');
  planEl.innerHTML = '';
  (report.studyPlan || []).forEach(w => {
    planEl.insertAdjacentHTML('beforeend', `
      <div class="rpt-plan-item">
        <div class="rpt-plan-week-col">
          <div class="rpt-plan-week-num">${w.week}</div>
          <div class="rpt-plan-week-sub">нед.</div>
        </div>
        <div>
          <div class="rpt-plan-theme">${w.theme}</div>
          ${w.focus ? `<div class="rpt-plan-focus">${w.focus}</div>` : ''}
          <div class="rpt-plan-tip">${w.tip}</div>
          ${w.goal ? `<div class="rpt-plan-goal">Цель: ${w.goal}</div>` : ''}
        </div>
      </div>`);
  });

  // Final
  document.getElementById('rpt-final-text').textContent =
    report.finalMotivation || 'Знай где слабое место — бей туда. Ты можешь.';
}

let _lastReport = null;
let _lastReportMeta = null;

function renderReport_wrap(report, totalPct, topics) {
  _lastReport = report;
  _lastReportMeta = { totalPct, topics };
  renderReport(report, totalPct, topics);
}

async function submitReportEmail() {
  const input  = document.getElementById('rpt-email-input');
  const btn    = document.getElementById('rpt-email-btn');
  const status = document.getElementById('rpt-email-status');
  const email  = input.value.trim();

  if (!email) { status.textContent = 'Введи email'; status.className = 'rpt-email-status err'; return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    status.textContent = 'Некорректный email'; status.className = 'rpt-email-status err'; return;
  }
  if (!_lastReport) {
    status.textContent = 'Сначала получи отчёт'; status.className = 'rpt-email-status err'; return;
  }

  btn.disabled = true; btn.textContent = 'Отправляем...';
  status.textContent = ''; status.className = 'rpt-email-status';

  try {
    const r = await fetch('/api/diagnostic/send-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        report: _lastReport,
        totalPct: _lastReportMeta?.totalPct ?? 0,
        exam: state.exam,
        topics: _lastReportMeta?.topics ?? [],
      }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || 'Ошибка');
    status.textContent = 'Отправлено! Проверь почту.';
    status.className = 'rpt-email-status ok';
    btn.textContent = 'Отправлено';
  } catch (e) {
    status.textContent = e.message;
    status.className = 'rpt-email-status err';
    btn.disabled = false; btn.textContent = 'Отправить';
  }
}

const TOPIC_STUDY_TIPS = {
  equations:    { focus: 'Квадратные уравнения через D = b²−4ac', tip: 'Реши 15 уравнений: 5 линейных, 5 квадратных, 5 дробно-рациональных. Выучи формулу дискриминанта наизусть.', action: 'Открой учебник на разделе дискриминанта и прорешай задачи 1–15' },
  inequalities: { focus: 'Знак при умножении на отрицательное', tip: 'Реши 12 задач на системы неравенств. Главная ловушка ЕНТ — смена знака ≤ на ≥ при делении на отрицательное.', action: 'Составь шпаргалку: 4 правила преобразования неравенств' },
  functions:    { focus: 'Вершина параболы и область определения', tip: 'Формула x = −b/(2a) — наизусть. Реши 10 задач на область определения логарифмических и дробных функций.', action: 'Для каждого типа функции (квадратичная, √, log) реши по 3 задачи' },
  progressions: { focus: '4 формулы: aₙ, Sₙ для АП и ГП', tip: 'Запиши 4 формулы на карточку: aₙ=a₁+(n−1)d, Sₙ=n(a₁+aₙ)/2, bₙ=b₁·qⁿ⁻¹, Sₙ=b₁(qⁿ−1)/(q−1). Реши 12 задач.', action: 'По 3 задачи на каждую из 4 формул — итого 12 задач за день' },
  logarithms:   { focus: 'log_a(xy)=log_a x+log_a y и друзья', tip: 'Выучи 5 свойств логарифма. В ЕНТ чаще всего log₂, log₃, log₅. Реши 10 логарифмических уравнений.', action: 'Составь таблицу: log₂ 1=0, log₂ 2=1, log₂ 4=2, log₂ 8=3, log₂ 16=4' },
  trigonometry: { focus: 'sin/cos/tg для 30°, 45°, 60° — наизусть', tip: 'Выучи таблицу значений за 1 час. Затем реши 10 тригонометрических уравнений вида sin x = a. Это ~15% баллов ЕНТ.', action: 'Таблица: sin 30=½, cos 30=√3/2, tg 30=1/√3 — повторяй пока не отскочит' },
  derivative:   { focus: 'f\'(x)=0 — условие экстремума', tip: 'Выучи 6 правил дифференцирования. Реши 15 задач на нахождение max/min функции — это самый частый тип в ЕНТ.', action: 'Схема: берёшь производную → ставишь =0 → проверяешь знак f\' слева и справа' },
  powers:       { focus: 'aᵐ·aⁿ = aᵐ⁺ⁿ и дробные показатели', tip: 'Самые частые ошибки: a⁻ⁿ = 1/aⁿ и a^(m/n) = ⁿ√(aᵐ). Реши 12 задач на упрощение выражений со степенями.', action: 'Напиши 6 свойств степени и по 2 примера на каждое — итого 12 конкретных задач' },
  planimetry:   { focus: 'S треугольника, трапеции, формула Герона', tip: 'Выучи: S = ½bh, S = (a+b)/2·h, формулу Герона. Реши 10 задач. В ЕНТ нет рисунков — рисуй схему сам по условию.', action: 'Для каждой задачи сначала нарисуй схему от руки, потом вставляй формулу' },
  stereometry:  { focus: 'Объёмы: V = a³, V = πr²h, V = ⅓πr²h', tip: 'Куб, цилиндр, конус, шар — 4 формулы объёма наизусть. Реши 8 задач с числами. Площадь поверхности = отдельная тема.', action: 'Составь таблицу: фигура → формула V → формула S. Реши 2 задачи на каждую фигуру' },
  triangles:    { focus: 'Пифагор + теоремы синусов и косинусов', tip: 'a²=b²+c²−2bc·cosA — теорема косинусов. a/sinA = b/sinB — теорема синусов. Реши 10 задач: 5 на каждую теорему.', action: 'Разбери 5 задач на теорему Пифагора, 5 на теорему косинусов — разные типы' },
  circles:      { focus: 'C = 2πr, S = πr², вписанный угол = ½ центрального', tip: 'Реши 8 задач. Вписанный угол — одна из любимых тем ЕНТ. Теорема: вписанный угол = ½ центрального угла.', action: 'Нарисуй окружность, обозначь радиус, впиши углы — решай задачи так каждый раз' },
  vectors:      { focus: 'Скалярное произведение a·b = |a||b|cosα', tip: 'Это основная формула темы. Реши 10 задач на угол между векторами и скалярное произведение. Координатный метод — самый надёжный.', action: 'Переводи каждый вектор в координаты → считай a·b = x₁x₂+y₁y₂ → находи угол' },
  probability:  { focus: 'P = m/n, умножение и сложение вероятностей', tip: 'P(A∪B) = P(A)+P(B) для несовместных. P(A∩B) = P(A)·P(B) для независимых. Реши 10 задач — по 5 на каждый тип.', action: 'Для каждой задачи сначала определи: события совместны или нет? Независимы или нет?' },
  statistics:   { focus: 'Среднее, медиана, мода, размах — 4 понятия', tip: 'Среднее = сумма/количество. Медиана — середина отсортированного ряда. Реши 10 задач с реальными числовыми рядами.', action: 'Возьми любой набор из 7 чисел и найди все 4 показателя — повтори 5 раз с разными числами' },
  word_problems:{ focus: 'Составить уравнение из условия: s=vt, A=P·t', tip: 'Задачи на движение и работу — самые частые. Реши 12 задач: 6 на движение, 6 на проценты/прибыль. Главное — правильно обозначить x.', action: 'Схема: прочитал задачу → обозначил x → составил уравнение → решил → проверил подстановкой' },
  combinatorics:{ focus: 'C(n,k) = n!/(k!(n−k)!) — это основное', tip: 'Сочетания C(n,k) — основная формула ЕНТ. Реши 10 задач: 5 на выбор без порядка, 5 на перестановки P=n!', action: 'Запомни: порядок важен → перестановки/размещения; порядок не важен → сочетания' },
};

function renderReportFallback(totalPct, topics) {
  const sorted      = [...topics].sort((a, b) => b.pct - a.pct);
  const strongTopics = sorted.filter(t => t.pct >= 70).slice(0, 3);
  const weakTopics   = sorted.filter(t => t.pct < 60).reverse().slice(0, 4)
    .map((t, i) => ({ ...t, priority: i + 1 }));
  const pred    = Math.round(totalPct / 100 * 50);
  const levelEn = totalPct >= 80 ? 'excellent' : totalPct >= 60 ? 'good' : totalPct >= 40 ? 'medium' : 'weak';
  const level   = totalPct >= 80 ? 'Топовый' : totalPct >= 60 ? 'Уверенный' : totalPct >= 40 ? 'Прогресс' : 'Старт';

  const plan = weakTopics.slice(0, 3).map((t, i) => {
    const meta = TOPIC_STUDY_TIPS[t.id] || {};
    return {
      week: i + 1,
      theme: t.name,
      focus: meta.focus || t.name,
      tip: meta.tip   || `Реши 15 задач по теме "${t.name}" с разбором каждой ошибки`,
      goal: `Довести "${t.name}" с ${t.pct}% до 65%+`,
    };
  });

  const fallbackReport = {
    level, levelEn,
    personalMessage: `Ты набрал ${totalPct}% по всем темам. Прогноз баллов ЕНТ — ${pred} из 50. Сосредоточься на слабых темах по плану ниже.`,
    predictedScore: pred, totalPossible: 50,
    strongTopics: strongTopics.map(t => ({ name: t.name, pct: t.pct, comment: 'Знаешь уверенно — не трать много времени' })),
    weakTopics: weakTopics.map(t => ({
      ...t,
      rootCause: (TOPIC_STUDY_TIPS[t.id] || {}).focus || 'Пробелы в базовых формулах',
      action: (TOPIC_STUDY_TIPS[t.id] || {}).action || 'Реши 15 задач по теме с разбором каждой ошибки',
    })),
    studyPlan: plan.length ? plan : [{ week: 1, theme: 'Все темы', focus: 'Базовые формулы', tip: 'Повтори все ключевые формулы и реши по 5 задач на каждую тему', goal: 'Поднять общий уровень до 50%' }],
    finalMotivation: 'Знай где слабое место — бей туда каждый день. Результат придёт.',
  };
  renderReport_wrap(fallbackReport, totalPct, topics);
}
