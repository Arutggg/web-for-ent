# ENT Math — Платформа диагностики по математике ЕНТ

## Стек
- **Frontend**: HTML + CSS + Vanilla JS (без фреймворков)
- **Backend**: Node.js + Express
- **База данных**: SQLite (better-sqlite3)
- **Email**: Nodemailer

## Структура проекта
```
entmath/
├── server/
│   ├── index.js              # Запуск Express
│   ├── routes/
│   │   ├── auth.js           # Email регистрация
│   │   ├── diagnostic.js     # Диагностический тест
│   │   └── exam.js           # Полный ЕНТ
│   ├── middleware/
│   │   └── rateLimit.js
│   └── utils/
│       ├── db.js             # SQLite
│       ├── mailer.js         # Email
│       └── shuffle.js        # Алгоритм вопросов
├── client/
│   ├── index.html            # Лендинг
│   ├── diagnostic.html       # Диагностика
│   ├── auth.html             # Вход по email
│   ├── exam.html             # Полный ЕНТ
│   ├── css/
│   └── js/
└── data/
    └── questions/
        ├── algebra.json      # Алгебра
        ├── geometry.json     # Геометрия
        └── probability.json  # Вероятность, статистика
```

## Установка и запуск

```bash
# 1. Клонировать
git clone https://github.com/твой-юзер/entmath.git
cd entmath

# 2. Установить зависимости
npm install

# 3. Создать .env файл
cp .env .env.local
# Заполнить MAIL_USER, MAIL_PASS и SESSION_SECRET

# 4. Запустить
npm run dev
```

Открыть: http://localhost:3000

## Воронка пользователя

1. **Лендинг** → узнать о платформе
2. **Диагностика** → 17 тем, адаптивные вопросы
3. **Результат** → карта знаний по темам
4. **Регистрация** → email + код подтверждения
5. **Полный ЕНТ 2026** → реальный экзамен 80 минут

## Email в dev-режиме

В режиме разработки код подтверждения возвращается прямо в ответе API — проверяй консоль браузера.
