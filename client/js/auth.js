let currentEmail = '';

function showStep(id) {
  document.querySelectorAll('.auth-step').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

async function sendCode() {
  const emailInput = document.getElementById('email-input');
  const email = emailInput.value.trim();
  const errEl = document.getElementById('email-error');
  errEl.textContent = '';

  if (!email || !email.includes('@')) {
    errEl.textContent = 'Введи корректный email';
    return;
  }

  showStep('step-loading');
  document.getElementById('auth-loading-text').textContent = 'Отправляю код...';

  try {
    const data = await API.auth.sendCode(email);
    currentEmail = email;
    document.getElementById('email-display').textContent = email;
    showStep('step-code');

    // DEV: показать код
    if (data.devCode) {
      document.getElementById('code-sub').innerHTML =
        `<strong>DEV-режим:</strong> твой код — <strong style="font-size:20px;letter-spacing:2px">${data.devCode}</strong>`;
      // Автозаполнение в dev
      const digits = document.querySelectorAll('.code-digit');
      data.devCode.split('').forEach((d, i) => {
        if (digits[i]) digits[i].value = d;
      });
    }

    initCodeInputs();
  } catch (e) {
    showStep('step-email');
    document.getElementById('email-error').textContent = e.message;
  }
}

function initCodeInputs() {
  const digits = document.querySelectorAll('.code-digit');
  digits.forEach((input, idx) => {
    input.addEventListener('input', () => {
      if (input.value && idx < digits.length - 1) {
        digits[idx + 1].focus();
      }
      if (getCode().length === 6) verifyCode();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && idx > 0) {
        digits[idx - 1].focus();
      }
    });
  });
  digits[0].focus();
}

function getCode() {
  return [...document.querySelectorAll('.code-digit')].map(d => d.value).join('');
}

async function verifyCode() {
  const code = getCode();
  const errEl = document.getElementById('code-error');
  errEl.textContent = '';

  if (code.length !== 6) {
    errEl.textContent = 'Введи все 6 цифр';
    return;
  }

  showStep('step-loading');
  document.getElementById('auth-loading-text').textContent = 'Проверяю код...';

  try {
    const data = await API.auth.verifyCode(currentEmail, code);
    UserStore.set(data.user);

    // Редирект
    const params = new URLSearchParams(window.location.search);
    const next = params.get('next') || '/exam.html';
    window.location.href = next;
  } catch (e) {
    showStep('step-code');
    errEl.textContent = e.message;
    document.querySelectorAll('.code-digit').forEach(d => d.value = '');
    document.querySelector('.code-digit').focus();
  }
}

function goBackToEmail() {
  document.querySelectorAll('.code-digit').forEach(d => d.value = '');
  showStep('step-email');
}
