// Все запросы к серверу в одном месте
const API = {
  async get(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
    return res.json();
  },

  async post(url, data) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
    return res.json();
  },

  // Генерация через ИИ
  generate: {
    question: (payload) => API.post('/api/generate/question', payload),

    questionStream: (payload, onChunk, onComplete, onError) => {
      const controller = new AbortController();
      let accumulated = '';
      let done = false;

      fetch('/api/generate/question/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      }).then(res => {
        if (!res.ok) {
          res.json().then(d => onError(new Error(d.error || `HTTP ${res.status}`))).catch(() => onError(new Error(`HTTP ${res.status}`)));
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        function pump() {
          reader.read().then(({ done: streamDone, value }) => {
            if (streamDone) {
              if (!done) onComplete(accumulated, null);
              return;
            }
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              let event;
              try { event = JSON.parse(line.slice(6).trim()); } catch { continue; }

              if (event.error) { onError(new Error(event.error)); return; }
              if (event.t !== undefined) {
                accumulated += event.t;
                onChunk(accumulated);
              }
              if (event.done) {
                done = true;
                onComplete(accumulated, event.shuffled || null);
                return;
              }
            }
            pump();
          }).catch(err => { if (err.name !== 'AbortError') onError(err); });
        }
        pump();
      }).catch(err => { if (err.name !== 'AbortError') onError(err); });

      return () => controller.abort();
    },
  },

  // Диагностика
  diagnostic: {
    getTopics: (exam)       => API.get(`/api/diagnostic/topics/${exam}`),
    getQuestions: (payload) => API.post('/api/diagnostic/questions', payload),
    save: (payload)         => API.post('/api/diagnostic/save', payload),
  },

  // Полный ЕНТ
  exam: {
    getVariant: (year)    => API.get(`/api/exam/variant/${year}`),
    submit: (payload)     => API.post('/api/exam/submit', payload),
  },

  // Авторизация
  auth: {
    sendCode:   (email)        => API.post('/api/auth/send-code',   { email }),
    verifyCode: (email, code)  => API.post('/api/auth/verify-code', { email, code }),
  },
};

// Хранилище пользователя в sessionStorage
const UserStore = {
  get()        { try { return JSON.parse(sessionStorage.getItem('entmath_user')); } catch { return null; } },
  set(user)    { sessionStorage.setItem('entmath_user', JSON.stringify(user)); },
  clear()      { sessionStorage.removeItem('entmath_user'); },
  isLoggedIn() { return !!this.get(); },
};

// Уникальная сессия (для анонимных пользователей)
function getSessionId() {
  let id = localStorage.getItem('entmath_sid');
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    localStorage.setItem('entmath_sid', id);
  }
  return id;
}