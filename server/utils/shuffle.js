// Перемешивание массива (Fisher-Yates)
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Выбрать N случайных вопросов из темы
// исключая уже показанные (по тексту вопроса)
function pickQuestions(pool, count, exclude = []) {
  const available = pool.filter(q => !exclude.includes(q.question));
  const shuffled = shuffle(available);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// Перемешать варианты ответа, сохранив индекс правильного
function shuffleOptions(question) {
  const opts = question.options.map((text, i) => ({ text, correct: i === question.correct }));
  const shuffled = shuffle(opts);
  return {
    ...question,
    options: shuffled.map(o => o.text),
    correct: shuffled.findIndex(o => o.correct),
  };
}

module.exports = { shuffle, pickQuestions, shuffleOptions };
