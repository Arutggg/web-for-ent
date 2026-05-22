#!/usr/bin/env node
/**
 * fill-bank.js — наполняет банк вопросов до целевого значения
 *
 * Запуск:  node scripts/fill-bank.js
 *          node scripts/fill-bank.js --target 50 --topic equations
 *          node scripts/fill-bank.js --dry-run
 *
 * Распределение сложности: 70% hard / 20% medium / 10% easy
 */

require('dotenv').config();
const { replenishTopic, TOPIC_FILES, TOPIC_DESC } = require('../server/utils/generateQuestion');
const fs   = require('fs');
const path = require('path');

// ---------- CLI args ----------
const args     = process.argv.slice(2);
const get      = (flag, def) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : def; };
const TARGET   = parseInt(get('--target', '50'), 10);
const ONLY     = get('--topic', null);
const DRY_RUN  = args.includes('--dry-run');

const DATA_DIR = path.join(__dirname, '../data/questions');

function loadFile(file) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, `${file}.json`), 'utf8')); }
  catch { return []; }
}

// Все уникальные темы из TOPIC_FILES
const ALL_TOPICS = [...new Set(
  Object.entries(TOPIC_FILES).map(([id, file]) => ({ id, file }))
    .map(t => JSON.stringify(t))
)].map(s => JSON.parse(s));

async function main() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !DRY_RUN) {
    console.error('❌ ANTHROPIC_API_KEY не задан в .env');
    process.exit(1);
  }

  const topics = ONLY
    ? ALL_TOPICS.filter(t => t.id === ONLY)
    : ALL_TOPICS;

  if (topics.length === 0) {
    console.error(`❌ Тема "${ONLY}" не найдена`);
    process.exit(1);
  }

  console.log(`\n📚 ENT Math — наполнение банка вопросов`);
  console.log(`   Цель: ${TARGET} | Распределение: 70% hard / 20% medium / 10% easy`);
  console.log(`   Тем: ${topics.length}${DRY_RUN ? ' | DRY RUN' : ''}\n`);

  for (const topic of topics) {
    const qs    = loadFile(topic.file);
    const count = qs.filter(q => q.topic === topic.id).length;
    const bar   = '█'.repeat(Math.min(Math.round(count / TARGET * 20), 20)).padEnd(20, '░');
    const need  = Math.max(0, TARGET - count);
    console.log(`  ${(TOPIC_DESC[topic.id] || topic.id).slice(0, 25).padEnd(26)} ${bar} ${count}/${TARGET}${need > 0 ? ` → +${need}` : ' ✓'}`);
  }
  console.log('');

  if (DRY_RUN) { console.log('(dry-run — изменений нет)'); return; }

  for (const topic of topics) {
    const qs   = loadFile(topic.file);
    const have = qs.filter(q => q.topic === topic.id).length;
    const need = TARGET - have;

    if (need <= 0) {
      console.log(`  ✓ ${topic.id}: уже ${have}/${TARGET} — пропускаю`);
      continue;
    }

    console.log(`  → ${topic.id}: нужно +${need} вопросов`);

    // Генерируем порциями по 5 (replenishTopic всегда генерирует 5)
    let generated = 0;
    while (generated < need) {
      const batch = Math.min(5, need - generated);
      try {
        const { added } = await replenishTopic(topic.id, batch);
        generated += added;
        console.log(`    [${generated}/${need}] сгенерировано`);
      } catch (err) {
        console.log(`    ✗ ${err.message.slice(0, 80)}`);
        break;
      }
    }

    console.log(`  ✓ ${topic.id}: +${generated}/${need}`);
  }

  console.log('\n✅ Готово! Банк вопросов обновлён.\n');
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
