// Yerel istatistikler (localStorage): bugünkü esneme sayısı, seri, son hareketler.
import { localParts } from './shared/schedule.js';

const KEY = 'pm.stats.v1';

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { days: s.days || {}, history: s.history || [] };
  } catch {
    return { days: {}, history: [] };
  }
}

function write(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* gizli mod vb. */
  }
}

function dayKey(date, tz) {
  return localParts(date, tz).dateKey;
}

export function recordStretch(id, tz) {
  const s = read();
  const k = dayKey(new Date(), tz);
  s.days[k] = (s.days[k] || 0) + 1;
  s.history = [...s.history, { id, at: Date.now() }].slice(-60);
  // 120 günden eskileri temizle
  const keys = Object.keys(s.days).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - 120))) delete s.days[old];
  write(s);
}

export function todayCount(tz) {
  return read().days[dayKey(new Date(), tz)] || 0;
}

/** Bugün (ya da bugün henüz yoksa dünden geriye) üst üste esneme yapılan gün sayısı. */
export function streak(tz) {
  const { days } = read();
  let n = 0;
  let t = Date.now();
  if (!days[dayKey(new Date(t), tz)]) t -= 86_400_000;
  while (days[dayKey(new Date(t), tz)]) {
    n += 1;
    t -= 86_400_000;
  }
  return n;
}

export function recentIds(n = 4) {
  return read().history.slice(-n).map((h) => h.id);
}
