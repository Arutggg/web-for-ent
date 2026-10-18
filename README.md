# ENT Math — диагностика знаний по математике для ЕНТ и ЕГЭ

Ученик проходит адаптивный тест по 17 темам (ЕГЭ — 21 тема) и получает отчёт: карту знаний по темам, сильные и слабые места и рекомендации, что подтянуть в первую очередь.

**[Живое демо](https://web-for-ent.onrender.com)** · ![API tests](https://github.com/Arutggg/web-for-ent/actions/workflows/ci.yml/badge.svg)

> Демо развёрнуто на бесплатном тарифе Render: после простоя первый запуск может занять до минуты.

## Стек

- **Frontend:** HTML + CSS + Vanilla JS, без фреймворков
- **Backend:** Node.js + Express
- **Хранилище:** JSON-файл (`data/db.json`) и банк вопросов в `data/questions/*.json`
- **AI:** генерация новых вопросов и персональный анализ результатов через Claude API (необязательно)
- **Почта:** Nodemailer — коды входа и отчёты на email (необязательно)
- **Тесты:** Python + pytest + requests, запускаются в GitHub Actions на каждый push

## Как устроено

1. **Диагностика.** Вопросы берутся из банка, варианты ответов перемешиваются, уже заданные не повторяются. Если банк по теме закончился, новый вопрос генерирует LLM с учётом уровня ученика и его ошибок.
2. **Отчёт.** Результаты по темам уходят в LLM, она находит паттерн ошибок и даёт рекомендации. Без ключа API или при ошибке сети отчёт строится локально, поэтому ученик всегда получает результат.
3. **Защита.** Helmet, CORS только для своего домена, ограничение тела запроса 20 КБ, rate limiting: на весь API, отдельно на отправку кода, проверку кода (от перебора) и дорогую AI-генерацию. Админ-эндпоинты закрыты секретом.

## Тесты

`tests/test_api.py` — 21 API-тест:

- **smoke:** health-check, отдача лендинга, заголовки безопасности;
- **диагностика:** список тем, структура вопроса, исключение уже заданных вопросов, неизвестная тема → 404;
- **валидация и граничные значения:** обязательные поля, неверный код, тело больше 20 КБ → 413;
- **доступ:** админка без секрета и с неверным секретом → 401, закрытый список отзывов → 403;
- **rate limiting:** 4-й запрос кода за 10 минут → 429.

```bash
npm start                              # в одном терминале
pip install -r requirements-dev.txt    # в другом
ADMIN_SECRET=test-secret pytest -v     # сервер запускать с тем же ADMIN_SECRET
```

## Запуск локально

```bash
npm install
npm run dev        # http://localhost:3000
```

Переменные окружения (`.env`, все необязательные):

| Переменная | Зачем |
|---|---|
| `ANTHROPIC_API_KEY` | генерация вопросов и AI-анализ отчёта |
| `MAIL_HOST`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM` | отправка кодов и отчётов |
| `ADMIN_SECRET` | доступ к `/api/admin/*` и `admin.html` |
| `ALLOWED_ORIGIN` | домен для CORS в продакшене |

В режиме разработки, если почта не настроена, код подтверждения приходит прямо в ответе API.

## Деплой

Сервис развёрнут на Render (free web service): Build `npm ci`, Start `npm start`, Health check `/api/health`, переменные `NODE_ENV=production` и `ADMIN_SECRET`. Для повторного развёртывания есть `render.yaml`: Render → New → Blueprint.

## Структура

```
server/
  index.js              Express, helmet, CORS, роуты
  routes/               auth, diagnostic, exam, generate, admin, feedback
  middleware/rateLimit.js
  utils/                db, mailer, shuffle, generateQuestion
client/                 лендинг, диагностика, вход, админка (HTML/CSS/JS)
data/questions/         банк вопросов по разделам
tests/test_api.py       API-тесты
```

---

Автор: Арутюн Газарян · [Telegram](https://t.me/aruuuttt05) · [GitHub](https://github.com/Arutggg)
