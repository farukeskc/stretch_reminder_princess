// Küçük arayüz yardımcıları.

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

let toastTimer;
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

export function hearts(n = 18) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const wrap = document.createElement('div');
  wrap.className = 'hearts';
  const icons = ['💖', '💕', '🌸', '✨', '👑', '💗'];
  for (let i = 0; i < n; i++) {
    const s = document.createElement('span');
    s.textContent = icons[i % icons.length];
    s.style.left = `${Math.random() * 100}%`;
    s.style.animationDelay = `${Math.random() * 0.8}s`;
    s.style.fontSize = `${1.1 + Math.random() * 1.2}rem`;
    wrap.appendChild(s);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 3800);
}

export function fmtTime(date, timeZone) {
  return new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone }).format(date);
}

export function fmtDayLabel(date, timeZone, now = new Date()) {
  const key = (d) => new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  if (key(date) === key(now)) return 'Bugün';
  if (key(date) === key(new Date(now.getTime() + 86_400_000))) return 'Yarın';
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'long', timeZone }).format(date);
}

export function fmtToday(timeZone) {
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'long', day: 'numeric', month: 'long', timeZone }).format(new Date());
}

export const BACK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

/** aria-pressed tabanlı tekli/çoklu seçim grubunu bağlar. */
export function bindChoices(container, { multi = false, onChange }) {
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-value]');
    if (!btn || !container.contains(btn)) return;
    if (multi) {
      btn.setAttribute('aria-pressed', btn.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
    } else {
      for (const b of container.querySelectorAll('[data-value]')) b.setAttribute('aria-pressed', String(b === btn));
    }
    const values = [...container.querySelectorAll('[aria-pressed="true"]')].map((b) => b.dataset.value);
    onChange(multi ? values : values[0]);
  });
}
