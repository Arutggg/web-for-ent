const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (!transporter) {
    const port = parseInt(process.env.MAIL_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port,
      secure: port === 465,
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });
  }
  return transporter;
}

async function sendCode(email, code) {
  const t = getTransporter();
  await t.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: `Твой код: ${code} — ENT Math`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:40px 24px;">
        <h2 style="font-size:28px;font-weight:800;color:#111;margin:0 0 8px;">ENT Math</h2>
        <p style="color:#888;margin:0 0 32px;">Платформа подготовки к ЕНТ по математике</p>
        <div style="background:#f9f9f7;border-radius:12px;padding:28px;text-align:center;margin-bottom:24px;">
          <p style="color:#555;font-size:14px;margin:0 0 12px;">Твой код подтверждения</p>
          <div style="font-size:42px;font-weight:800;color:#111;letter-spacing:8px;">${code}</div>
          <p style="color:#aaa;font-size:12px;margin:12px 0 0;">Действует 10 минут</p>
        </div>
        <p style="color:#bbb;font-size:12px;">Если ты не запрашивал этот код — просто проигнорируй письмо.</p>
      </div>
    `,
  });
}

async function sendReport(email, { report, totalPct, exam, topics }) {
  const t = getTransporter();
  const examName = exam === 'ege' ? 'ЕГЭ' : 'ЕНТ';
  const totalPoss = exam === 'ege' ? 30 : 50;

  const strongRows = (report.strongTopics || []).map(t =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #f0f0ee;font-size:14px;">${t.name}</td>
     <td style="padding:8px 12px;border-bottom:1px solid #f0f0ee;text-align:right;font-weight:700;color:#16a34a;">${t.pct}%</td>
     <td style="padding:8px 12px;border-bottom:1px solid #f0f0ee;font-size:13px;color:#888;">${t.comment || ''}</td></tr>`
  ).join('');

  const weakRows = (report.weakTopics || []).map(t =>
    `<tr><td style="padding:8px 12px;border-bottom:1px solid #f0f0ee;font-size:14px;">${t.name}</td>
     <td style="padding:8px 12px;border-bottom:1px solid #f0f0ee;text-align:right;font-weight:700;color:#dc2626;">${t.pct}%</td>
     <td style="padding:8px 12px;border-bottom:1px solid #f0f0ee;font-size:13px;color:#888;">${t.action || t.comment || ''}</td></tr>`
  ).join('');

  const planRows = (report.studyPlan || []).map(w =>
    `<tr>
      <td style="padding:12px;border-bottom:1px solid #f0f0ee;text-align:center;font-weight:700;font-size:22px;color:#111;width:48px;">${w.week}</td>
      <td style="padding:12px;border-bottom:1px solid #f0f0ee;font-size:14px;font-weight:600;">${w.theme}</td>
      <td style="padding:12px;border-bottom:1px solid #f0f0ee;font-size:13px;color:#888;">${w.tip}</td>
    </tr>`
  ).join('');

  const levelColor = report.levelEn === 'excellent' ? '#16a34a'
    : report.levelEn === 'good' ? '#2563eb'
    : report.levelEn === 'medium' ? '#ca8a04'
    : '#dc2626';

  await t.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: `Твой AI-отчёт по ${examName} — ${totalPct}% · ENT Math`,
    html: `
<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f5f5f3;font-family:Inter,Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px 16px;">

  <!-- Header -->
  <div style="background:#111;border-radius:16px;padding:36px 32px;margin-bottom:16px;">
    <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,.35);letter-spacing:.15em;text-transform:uppercase;margin-bottom:16px;">ENT Math · Персональный анализ</div>
    <div style="display:flex;align-items:flex-start;gap:24px;flex-wrap:wrap;">
      <div>
        <div style="font-size:72px;font-weight:800;color:#fff;line-height:1;letter-spacing:-3px;">${totalPct}<span style="font-size:32px;">%</span></div>
        <div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:4px;">общий результат</div>
      </div>
      <div style="flex:1;min-width:180px;padding-top:8px;">
        <div style="font-size:13px;font-weight:700;color:${levelColor};letter-spacing:.05em;text-transform:uppercase;margin-bottom:8px;">${report.level || ''}</div>
        <div style="font-size:14px;color:rgba(255,255,255,.6);line-height:1.6;">${report.personalMessage || ''}</div>
      </div>
    </div>
  </div>

  <!-- Predicted score -->
  <div style="background:#fff;border-radius:12px;padding:20px 24px;margin-bottom:16px;border:1px solid #e8e8e4;">
    <div style="font-size:11px;font-weight:700;color:#888;letter-spacing:.1em;text-transform:uppercase;margin-bottom:12px;">Прогноз баллов ${examName}</div>
    <div style="font-size:28px;font-weight:800;color:#111;letter-spacing:-1px;">${report.predictedScore} <span style="font-size:16px;color:#aaa;font-weight:500;">/ ${totalPoss}</span></div>
  </div>

  ${strongRows ? `
  <!-- Strong topics -->
  <div style="background:#fff;border-radius:12px;margin-bottom:16px;border:1px solid #e8e8e4;overflow:hidden;">
    <div style="padding:16px 20px;border-bottom:3px solid #16a34a;">
      <div style="font-size:11px;font-weight:700;color:#888;letter-spacing:.1em;text-transform:uppercase;">Сильные темы</div>
    </div>
    <table style="width:100%;border-collapse:collapse;">${strongRows}</table>
  </div>` : ''}

  ${weakRows ? `
  <!-- Weak topics -->
  <div style="background:#fff;border-radius:12px;margin-bottom:16px;border:1px solid #e8e8e4;overflow:hidden;">
    <div style="padding:16px 20px;border-bottom:3px solid #dc2626;">
      <div style="font-size:11px;font-weight:700;color:#888;letter-spacing:.1em;text-transform:uppercase;">Требуют внимания</div>
    </div>
    <table style="width:100%;border-collapse:collapse;">${weakRows}</table>
  </div>` : ''}

  ${planRows ? `
  <!-- Study plan -->
  <div style="background:#fff;border-radius:12px;margin-bottom:16px;border:1px solid #e8e8e4;overflow:hidden;">
    <div style="padding:16px 20px;border-bottom:1px solid #e8e8e4;">
      <div style="font-size:11px;font-weight:700;color:#888;letter-spacing:.1em;text-transform:uppercase;">План подготовки — 3 недели</div>
    </div>
    <table style="width:100%;border-collapse:collapse;">${planRows}</table>
  </div>` : ''}

  <!-- Final -->
  <div style="text-align:center;padding:28px 24px;">
    <div style="font-size:11px;color:#bbb;letter-spacing:.2em;text-transform:uppercase;margin-bottom:16px;">ENT Math · AI</div>
    <div style="font-size:17px;font-style:italic;color:#333;line-height:1.6;max-width:400px;margin:0 auto;">"${report.finalMotivation || ''}"</div>
    <div style="font-size:12px;color:#bbb;margin-top:12px;">— персональный анализ на основе твоих результатов</div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;padding-top:16px;border-top:1px solid #e8e8e4;">
    <div style="font-size:11px;color:#bbb;">ENT Math · Тренажёр по математике · entmath.kz</div>
  </div>

</div>
</body></html>`,
  });
}

module.exports = { sendCode, sendReport };
