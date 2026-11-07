import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate,
  nextReminderAt,
  localParts,
  parseHM,
  toMs,
  endOfLocalDay,
} from '../../public/js/shared/schedule.js';
import { pickStretch, pushRecent } from '../../public/js/shared/pick.js';
import { buildNotification, formatDuration, fill } from '../../public/js/shared/message.js';

// 2026-11-09 Pazartesi. İstanbul = UTC+3 (yaz saati yok).
const ist = (s) => new Date(`2026-11-${s}:00+03:00`);
const base = {
  enabled: true,
  timezone: 'Europe/Istanbul',
  intervalMin: 60,
  startTime: '09:00',
  endTime: '18:00',
  days: [1, 2, 3, 4, 5],
};

test('localParts: İstanbul saatini doğru çözer', () => {
  const p = localParts(ist('09T10:03'), 'Europe/Istanbul');
  assert.equal(p.dow, 1);
  assert.equal(p.minutes, 10 * 60 + 3);
  assert.equal(p.dateKey, '2026-11-09');
});

test('parseHM / toMs', () => {
  assert.equal(parseHM('09:30'), 570);
  assert.equal(parseHM('24:00'), null);
  assert.equal(parseHM('abc'), null);
  assert.equal(toMs(null), null);
  assert.equal(toMs({ toMillis: () => 42 }), 42);
  assert.equal(toMs({ seconds: 1, nanoseconds: 5e6 }), 1005);
});

test('mesai dışında gönderilmez', () => {
  assert.equal(evaluate(base, ist('09T08:55')).reason, 'outside-hours');
  assert.equal(evaluate(base, ist('09T18:00')).reason, 'outside-hours');
  assert.equal(evaluate(base, ist('09T23:30')).reason, 'outside-hours');
});

test('seçili olmayan günde gönderilmez', () => {
  assert.equal(evaluate(base, ist('07T11:03')).reason, 'day-off'); // Cumartesi
  assert.equal(evaluate(base, ist('08T11:03')).reason, 'day-off'); // Pazar
  assert.equal(evaluate({ ...base, days: [6, 7] }, ist('07T11:03')).due, true);
});

test('kapalıysa ya da duraklatıldıysa gönderilmez', () => {
  assert.equal(evaluate({ ...base, enabled: false }, ist('09T11:03')).reason, 'disabled');
  const paused = { ...base, pausedUntil: ist('09T12:00') };
  assert.equal(evaluate(paused, ist('09T11:03')).reason, 'paused');
  assert.equal(evaluate(paused, ist('09T12:03')).due, true);
});

test('günün ilk hatırlatması mesai başlangıcından bir aralık sonra', () => {
  const user = { ...base, lastSentAt: ist('06T17:03') }; // önceki iş günü
  assert.equal(evaluate(user, ist('09T09:03')).due, false);
  assert.equal(evaluate(user, ist('09T09:53')).due, false); // 53 dk < 55
  assert.equal(evaluate(user, ist('09T09:56')).due, true); // tolerans içinde
  assert.equal(evaluate(user, ist('09T10:03')).due, true);
});

test('son gönderimden sonra aralık beklenir, tolerans kaymayı önler', () => {
  const user = { ...base, lastSentAt: ist('09T10:03') };
  assert.equal(evaluate(user, ist('09T10:53')).due, false);
  assert.equal(evaluate(user, ist('09T11:03')).due, true);
  // Cron 2 dk erken çalışsa bile kaçırılmaz.
  assert.equal(evaluate(user, ist('09T11:01')).due, true);
});

test('kendi kendine esnerse sayaç sıfırlanır', () => {
  const user = { ...base, lastSentAt: ist('09T10:03'), lastStretchAt: ist('09T10:40') };
  assert.equal(evaluate(user, ist('09T11:03')).due, false);
  assert.equal(evaluate(user, ist('09T11:33')).due, false);
  assert.equal(evaluate(user, ist('09T11:43')).due, true);
});

test('farklı aralıklar', () => {
  const u30 = { ...base, intervalMin: 30, lastSentAt: ist('09T10:00') };
  assert.equal(evaluate(u30, ist('09T10:23')).due, false);
  assert.equal(evaluate(u30, ist('09T10:26')).due, true);
  const u120 = { ...base, intervalMin: 120, lastSentAt: ist('09T10:00') };
  assert.equal(evaluate(u120, ist('09T11:53')).due, false);
  assert.equal(evaluate(u120, ist('09T11:56')).due, true);
});

test('hatalı saat aralığı gönderim yapmaz', () => {
  assert.equal(evaluate({ ...base, startTime: '18:00', endTime: '09:00' }, ist('09T12:00')).reason, 'bad-hours');
});

test('nextReminderAt: mesai içinde, ertesi gün ve hafta sonu', () => {
  const u = { ...base, lastSentAt: ist('09T10:03') };
  assert.equal(nextReminderAt(u, ist('09T10:20')).getTime(), ist('09T11:03').getTime());
  // Akşam → ertesi gün 10:00
  assert.equal(nextReminderAt(u, ist('09T19:00')).getTime(), ist('10T10:00').getTime());
  // Cuma akşamı → Pazartesi 10:00
  const fri = { ...base, lastSentAt: ist('13T17:30') };
  assert.equal(nextReminderAt(fri, ist('13T18:30')).getTime(), ist('16T10:00').getTime());
  assert.equal(nextReminderAt({ ...base, enabled: false }, ist('09T10:20')), null);
  assert.equal(nextReminderAt({ ...base, days: [] }, ist('09T10:20')), null);
});

test('endOfLocalDay', () => {
  const e = endOfLocalDay(ist('09T14:25'), 'Europe/Istanbul');
  assert.equal(e.getTime(), ist('09T23:59').getTime() + 59_000);
});

// --- pick ---
const S = [
  { id: 'a', areas: ['boyun'] },
  { id: 'b', areas: ['omuz'] },
  { id: 'c', areas: ['bel'] },
  { id: 'd', areas: ['bilek'] },
  { id: 'e', areas: ['goz'] },
  { id: 'f', areas: ['bacak'] },
];

test('pickStretch son 4 hareketi tekrarlamaz', () => {
  for (let i = 0; i < 200; i++) {
    const s = pickStretch(S, { recentIds: ['x', 'a', 'b', 'c', 'd'] });
    assert.ok(['e', 'f'].includes(s.id));
  }
});

test('pickStretch ağrıyan bölgeye ağırlık verir', () => {
  let seeded = 1;
  const rng = () => ((seeded = (seeded * 16807) % 2147483647) / 2147483647);
  const counts = {};
  for (let i = 0; i < 6000; i++) {
    const s = pickStretch(S, { focusAreas: ['boyun'], rng });
    counts[s.id] = (counts[s.id] || 0) + 1;
  }
  // Ağırlık 3 / toplam 8 ≈ %37,5
  assert.ok(counts.a > 1900 && counts.a < 2600, `boyun sayısı: ${counts.a}`);
});

test('pushRecent sona ekler, tekrarı kaldırır, 6 ile sınırlar', () => {
  assert.deepEqual(pushRecent(['a', 'b'], 'a'), ['b', 'a']);
  assert.deepEqual(pushRecent(['1', '2', '3', '4', '5', '6'], '7'), ['2', '3', '4', '5', '6', '7']);
});

// --- message ---
test('buildNotification ve yardımcılar', () => {
  assert.equal(formatDuration(45), '45 sn');
  assert.equal(formatDuration(60), '1 dk');
  assert.equal(formatDuration(95), '1 dk 35 sn');
  assert.equal(fill('{nick} {x}', { nick: 'P' }), 'P {x}');
  const n = buildNotification(
    { nickname: 'Prensesim' },
    { id: 'a', name: 'Boyun Yana Eğme', areas: ['boyun'], durationSec: 45 },
    { titles: ['Mola vakti {nick}'], generic: ['{stretch} ({dur})'], byArea: {} },
    () => 0,
  );
  assert.equal(n.title, 'Mola vakti Prensesim');
  assert.equal(n.body, 'Boyun Yana Eğme (45 sn)');
  assert.equal(n.url, '/#/stretch/a');
});
