// Hatırlatma zamanlama mantığı. Saf fonksiyonlar: tarayıcı ve Node aynı dosyayı kullanır.
import { withDefaults } from './defaults.js';


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

// ---------------------------------------------------------------------------
// Sabit seans saatleri
// Seanslar mesai başlangıcından itibaren aralığın katlarındadır:
//   09:00–18:00, 2 saat → 11:00, 13:00, 15:00, 17:00
// Atlanan seans, kendi isteğiyle yapılan esneme ya da geç gelen bildirim bu saatleri
// KAYDIRMAZ. Zamanlayıcı her birkaç dakikada çalışır ve saati gelmiş, henüz
// gönderilmemiş seansı gönderir.
// ---------------------------------------------------------------------------

/** Bugünün seans saatleri, gece yarısından itibaren dakika: [660, 780, 900, 1020] */
export function slotMinutes(rawUser) {
  const u = withDefaults(rawUser);
  const s = parseHM(u.startTime);
  const e = parseHM(u.endTime);
  const i = Number(u.intervalMin) || 60;
  if (s == null || e == null || e <= s) return [];
  const out = [];
  for (let t = s + i; t < e; t += i) out.push(t);
  return out;
}

/** "11:00" biçiminde seans saatleri. */
export function slotLabels(rawUser) {
  return slotMinutes(rawUser).map((m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
}

/**
 * Bir seans saatinden sonra en fazla kaç dakika içinde bildirim gönderilebilir.
 * (Zamanlayıcı gecikse bile; daha geç kalınırsa o seans kaçırılmış sayılır.)
 */
export function lateMaxMin(rawUser) {
  const i = Number(withDefaults(rawUser).intervalMin) || 60;
  return Math.min(i - 5, 45);
}

/** Verilen andaki yerel günün, verilen dakikasının gerçek anı (ms). */
function instantOfLocalMinute(refMs, timeZone, minuteOfDay) {
  const { minutes, seconds } = localParts(new Date(refMs), timeZone);
  return refMs - ((minutes - minuteOfDay) * 60 + seconds) * 1000 - (refMs % 1000);
}

/**
 * Şu an bildirim gönderilmeli mi? (O anki sabit seans saati gelmiş ve henüz gönderilmemişse.)
 * @returns {{ due: boolean, reason: string, slotMs?: number, lateMin?: number }}
 */
export function evaluate(rawUser, now = new Date()) {
  const user = withDefaults(rawUser);
  const nowMs = toMs(now);

  if (!user.enabled) return { due: false, reason: 'disabled' };

  const pausedUntil = toMs(user.pausedUntil);
  if (pausedUntil && pausedUntil > nowMs) return { due: false, reason: 'paused' };

  const start = parseHM(user.startTime);
  const end = parseHM(user.endTime);
  if (start == null || end == null || end <= start) return { due: false, reason: 'bad-hours' };

  const { dow, minutes } = localParts(new Date(nowMs), user.timezone);
  if (!user.days.includes(dow)) return { due: false, reason: 'day-off' };
  if (minutes < start || minutes >= end) return { due: false, reason: 'outside-hours' };

  const slots = slotMinutes(user).filter((m) => m <= minutes);
  if (!slots.length) return { due: false, reason: 'waiting' }; // ilk seans saatinden önce
  const slotMs = instantOfLocalMinute(nowMs, user.timezone, slots.at(-1));
  const lateMin = (nowMs - slotMs) / MIN;

  if ((toMs(user.lastSentAt) ?? 0) >= slotMs) return { due: false, reason: 'sent', slotMs, lateMin };
  if (pausedUntil && pausedUntil > slotMs) return { due: false, reason: 'paused-slot', slotMs, lateMin };
  if (lateMin > lateMaxMin(user)) return { due: false, reason: 'missed', slotMs, lateMin };
  return { due: true, reason: 'due', slotMs, lateMin };
}

/**
 * Sıradaki seansın sabit saati (arayüzde göstermek için). Saati gelmiş ama henüz
 * gönderilmemiş bir seans varsa onun saati döner.
 * @returns {Date|null}
 */
export function nextReminderAt(rawUser, now = new Date()) {
  const user = withDefaults(rawUser);
  if (!user.enabled) return null;
  const nowMs = toMs(now);
  const slots = slotMinutes(user);
  if (!slots.length || !user.days.length) return null;
  const paused = toMs(user.pausedUntil) ?? 0;

  const pending = evaluate(user, new Date(nowMs));
  if (pending.due) return new Date(pending.slotMs);

  for (let d = 0; d <= 8; d++) {
    const ref = nowMs + d * 24 * 60 * MIN;
    if (!user.days.includes(localParts(new Date(ref), user.timezone).dow)) continue;
    for (const m of slots) {
      const slotMs = instantOfLocalMinute(ref, user.timezone, m);
      if (slotMs <= nowMs) continue;
      if (paused > slotMs) continue; // sessiz modda kalan seanslar atlanır
      return new Date(slotMs);
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
