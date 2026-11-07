// Hatırlatma zamanlama mantığı. Saf fonksiyonlar: tarayıcı ve Node aynı dosyayı kullanır.
import { withDefaults } from './defaults.js';

/** Cron gecikmesinin birikmemesi için tanınan pay (dakika). */
export const TOLERANCE_MIN = 5;

const MIN = 60_000;
const formatters = new Map();

function formatterFor(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Firestore Timestamp, Date, sayı ya da ISO string → epoch ms (yoksa null). */
export function toMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  if (typeof v.seconds === 'number') return v.seconds * 1000 + Math.floor((v.nanoseconds || 0) / 1e6);
  return null;
}

/** "09:30" → 570 */
export function parseHM(s) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Verilen anın, verilen saat dilimindeki yerel gün/dakika bilgisi. */
export function localParts(date, timeZone) {
  const parts = {};
  for (const p of formatterFor(timeZone).formatToParts(date)) parts[p.type] = p.value;
  const hour = Number(parts.hour) % 24;
  return {
    dow: WEEKDAYS[parts.weekday],
    minutes: hour * 60 + Number(parts.minute),
    seconds: Number(parts.second),
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

/**
 * Şu an hatırlatma gönderilmeli mi?
 * @returns {{ due: boolean, reason: string, elapsedMin?: number }}
 */
export function evaluate(rawUser, now = new Date(), { tolerance = TOLERANCE_MIN } = {}) {
  const user = withDefaults(rawUser);
  const nowMs = toMs(now);

  if (!user.enabled) return { due: false, reason: 'disabled' };

  const pausedUntil = toMs(user.pausedUntil);
  if (pausedUntil && pausedUntil > nowMs) return { due: false, reason: 'paused' };

  const start = parseHM(user.startTime);
  const end = parseHM(user.endTime);
  if (start == null || end == null || end <= start) return { due: false, reason: 'bad-hours' };

  const { dow, minutes, seconds } = localParts(new Date(nowMs), user.timezone);
  if (!user.days.includes(dow)) return { due: false, reason: 'day-off' };
  if (minutes < start || minutes >= end) return { due: false, reason: 'outside-hours' };

  // Bugünkü mesai başlangıcının gerçek anı (saat dilimi ofsetinden bağımsız).
  const windowStartMs = nowMs - ((minutes - start) * 60 + seconds) * 1000 - (nowMs % 1000);
  const anchor = Math.max(windowStartMs, toMs(user.lastSentAt) ?? 0, toMs(user.lastStretchAt) ?? 0);
  const elapsedMin = (nowMs - anchor) / MIN;
  const interval = Number(user.intervalMin) || 60;

  if (elapsedMin >= interval - tolerance) return { due: true, reason: 'due', elapsedMin };
  return { due: false, reason: 'waiting', elapsedMin };
}

/**
 * Bir sonraki hatırlatmanın yaklaşık zamanı (arayüzde göstermek için).
 * Cron 10 dakikada bir çalıştığı için gerçek bildirim birkaç dakika sapabilir.
 * @returns {Date|null}
 */
export function nextReminderAt(rawUser, now = new Date()) {
  const user = withDefaults(rawUser);
  if (!user.enabled) return null;
  const startMs = Math.ceil(toMs(now) / MIN) * MIN;
  const coarse = 5 * MIN;
  const limit = startMs + 8 * 24 * 60 * MIN;

  const isDue = (t) => evaluate(user, new Date(t), { tolerance: 0 }).due;
  if (isDue(startMs)) return new Date(startMs);

  for (let t = startMs + coarse; t <= limit; t += coarse) {
    if (isDue(t)) {
      // Dakika hassasiyetinde geri doğru ince ayar.
      let exact = t;
      for (let k = t - MIN; k > t - coarse; k -= MIN) {
        if (isDue(k)) exact = k;
        else break;
      }
      return new Date(exact);
    }
  }
  return null;
}

/** Kullanıcının saat diliminde bugünün bitişi (pausedUntil = "bugünlük yeter"). */
export function endOfLocalDay(now, timeZone) {
  const nowMs = toMs(now);
  const { minutes, seconds } = localParts(new Date(nowMs), timeZone);
  const elapsedToday = (minutes * 60 + seconds) * 1000 + (nowMs % 1000);
  return new Date(nowMs - elapsedToday + 24 * 60 * MIN - 1000);
}
