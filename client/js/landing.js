// Анимированные счётчики
function animateCounter(el, target, suffix = '') {
  if (!el) return;
  let current = 0;
  const duration = 1400;
  const steps = 60;
  const increment = target / steps;
  const timer = setInterval(() => {
    current = Math.min(current + increment, target);
    el.textContent = Math.round(current) + suffix;
    if (current >= target) clearInterval(timer);
  }, duration / steps);
}

// Запустить счётчики когда strip попадает в viewport
function initCounters() {
  const strip = document.querySelector('.strip');
  if (!strip) return;

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        animateCounter(document.getElementById('c-topics'), 17);
        animateCounter(document.getElementById('c-questions'), 5, '+');
        animateCounter(document.getElementById('c-time'), 40);
        obs.disconnect();
      }
    });
  }, { threshold: 0.3 });

  obs.observe(strip);
}

// Fade-up при скролле
function initScrollReveal() {
  const targets = document.querySelectorAll('.feat-card, .step, .scroll-tag');
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((e, i) => {
      if (e.isIntersecting) {
        setTimeout(() => {
          e.target.style.animation = 'fadeUp .5s ease both';
          e.target.style.opacity = '1';
        }, i * 60);
        obs.unobserve(e.target);
      }
    });
  }, { threshold: 0.1 });

  targets.forEach(t => {
    t.style.opacity = '0';
    obs.observe(t);
  });
}

// Навигация
function initNav() {
  const btn = document.getElementById('nav-start-btn');
  if (btn) btn.addEventListener('click', () => { window.location.href = '/diagnostic.html'; });

  const heroBtn = document.getElementById('hero-start-btn');
  if (heroBtn) heroBtn.addEventListener('click', () => { window.location.href = '/diagnostic.html'; });

  const ctaBtn = document.getElementById('cta-start-btn');
  if (ctaBtn) ctaBtn.addEventListener('click', () => { window.location.href = '/diagnostic.html'; });
}

document.addEventListener('DOMContentLoaded', () => {
  initCounters();
  initScrollReveal();
  initNav();
});

// Линия между шагами
function drawStepsLine() {
  const nums = document.querySelectorAll('.step-num');
  const list = document.querySelector('.steps-list');
  if (!nums.length || !list) return;
  const old = list.querySelector('.steps-line');
  if (old) old.remove();
  const first = nums[0].getBoundingClientRect();
  const last  = nums[nums.length - 1].getBoundingClientRect();
  const parent = list.getBoundingClientRect();
  const line = document.createElement('div');
  line.className = 'steps-line';
  line.style.cssText = `
    position:absolute;
    top:${nums[0].offsetTop + nums[0].offsetHeight/2}px;
    left:${first.left - parent.left + first.width/2}px;
    width:${last.left - first.left}px;
    height:1px;
    background:#ccc;
    z-index:0;
  `;
  list.style.position = 'relative';
  list.appendChild(line);
}
window.addEventListener('load', drawStepsLine);
window.addEventListener('resize', drawStepsLine);
