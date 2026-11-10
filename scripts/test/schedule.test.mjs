import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluate,
  nextReminderAt,
  localParts,
  parseHM,
  toMs,
  endOfLocalDay,
  slotMinutes,
  slotLabels,
  lateMaxMin,
} from '../../public/js/shared/schedule.js';
import { pickStretch, pushRecent } from '../../public/js/shared/pick.js';
import { formatDuration, fill } from '../../public/js/shared/message.js';

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
  // 12:00 seansı sessizliğin bittiği anda → gönderilir
  assert.equal(evaluate(paused, ist('09T12:03')).due, true);
  // Sessizlik 11:30'a kadar sürdüyse 11:00 seansı sonradan gönderilmez
  const p2 = { ...base, pausedUntil: ist('09T11:30') };
  assert.equal(evaluate(p2, ist('09T11:32')).reason, 'paused-slot');
});

test('sabit seans saatleri: mesai başı + aralığın katları', () => {
  assert.deepEqual(slotLabels(base), ['10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']);
  assert.deepEqual(slotLabels({ ...base, intervalMin: 120 }), ['11:00', '13:00', '15:00', '17:00']);
  assert.deepEqual(slotLabels({ ...base, intervalMin: 90 }), ['10:30', '12:00', '13:30', '15:00', '16:30']);
  assert.equal(slotLabels({ ...base, intervalMin: 45 })[0], '09:45');
  assert.equal(slotMinutes({ ...base, intervalMin: 30 }).length, 17);
  assert.deepEqual(slotLabels({ ...base, startTime: '09:30', endTime: '17:30', intervalMin: 120 }), ['11:30', '13:30', '15:30']);
});

test('seans saati gelince gönderilir, saat gelmeden gönderilmez', () => {
  const u = { ...base, intervalMin: 120, lastSentAt: ist('06T17:02') }; // geçen cuma
  assert.equal(evaluate(u, ist('09T09:30')).reason, 'waiting'); // ilk seanstan önce
  assert.equal(evaluate(u, ist('09T10:57')).due, false); // 11:00'dan önce asla
  const r = evaluate(u, ist('09T11:02'));
  assert.equal(r.due, true);
  assert.equal(r.slotMs, ist('09T11:00').getTime());
});

test('aynı seans iki kez gönderilmez', () => {
  const u = { ...base, intervalMin: 120, lastSentAt: ist('09T11:02') };
  assert.equal(evaluate(u, ist('09T11:07')).reason, 'sent');
  assert.equal(evaluate(u, ist('09T12:55')).reason, 'sent');
  assert.equal(evaluate(u, ist('09T13:02')).due, true);
});

test('seans atlanınca saatler kaymaz ve sıradaki seans bir sonraki sabit saattir', () => {
  // 11:00 bildirimi gitti, yapılmadı (atlandı). Saat 12:30.
  const u = { ...base, intervalMin: 120, lastSentAt: ist('09T11:02') };
  assert.equal(nextReminderAt(u, ist('09T12:30')).getTime(), ist('09T13:00').getTime());
  // 13:00 de gönderildi ve atlandı; 14:59'da bile sıradaki 15:00 (1 dk sonrası değil, sabit saat)
  const u2 = { ...base, intervalMin: 120, lastSentAt: ist('09T13:02') };
  assert.equal(nextReminderAt(u2, ist('09T14:20')).getTime(), ist('09T15:00').getTime());
  assert.equal(nextReminderAt(u2, ist('09T13:40')).getTime(), ist('09T15:00').getTime());
});

test('kendi isteğiyle esneme seans saatlerini kaydırmaz', () => {
  const u = { ...base, intervalMin: 120, lastSentAt: ist('09T11:02'), lastStretchAt: ist('09T12:40') };
  assert.equal(evaluate(u, ist('09T13:02')).due, true);
  assert.equal(nextReminderAt(u, ist('09T12:45')).getTime(), ist('09T13:00').getTime());
});

test('zamanlayıcı çok gecikirse seans kaçırılmış sayılır (geç saatte bildirim yok)', () => {
  const u = { ...base, intervalMin: 120, lastSentAt: ist('06T17:02') };
  assert.equal(evaluate(u, ist('09T11:44')).due, true); // 44 dk gecikme: hâlâ gönder
  assert.equal(evaluate(u, ist('09T11:50')).reason, 'missed'); // 45 dk'dan fazla
  assert.equal(lateMaxMin({ intervalMin: 30 }), 25);
  assert.equal(lateMaxMin({ intervalMin: 120 }), 45);
});

test('saati gelmiş ama henüz gönderilmemiş seans "sıradaki" olarak görünür', () => {
  const u = { ...base, intervalMin: 120, lastSentAt: ist('06T17:02') };
  assert.equal(nextReminderAt(u, ist('09T11:01')).getTime(), ist('09T11:00').getTime());
});

test('hatalı saat aralığı gönderim yapmaz', () => {
  assert.equal(evaluate({ ...base, startTime: '18:00', endTime: '09:00' }, ist('09T12:00')).reason, 'bad-hours');
  assert.equal(nextReminderAt({ ...base, startTime: '18:00', endTime: '09:00' }, ist('09T12:00')), null);
});

test('nextReminderAt: ertesi gün, hafta sonu, sessiz mod', () => {
  const u = { ...base, lastSentAt: ist('09T17:02') };
  assert.equal(nextReminderAt(u, ist('09T19:00')).getTime(), ist('10T10:00').getTime());
  // Cuma akşamı → Pazartesi 10:00
  assert.equal(nextReminderAt({ ...base, lastSentAt: ist('13T17:02') }, ist('13T18:30')).getTime(), ist('16T10:00').getTime());
  // "Bugünlük yeter" → yarının ilk seansı
  const eod = { ...base, intervalMin: 120, lastSentAt: ist('09T11:02'), pausedUntil: endOfLocalDay(ist('09T12:00'), 'Europe/Istanbul') };
  assert.equal(nextReminderAt(eod, ist('09T12:00')).getTime(), ist('10T11:00').getTime());
  // 1 saat sessiz 12:30–13:30 → 13:00 atlanır, sıradaki 15:00
  const hush = { ...base, intervalMin: 120, lastSentAt: ist('09T11:02'), pausedUntil: ist('09T13:30') };
  assert.equal(nextReminderAt(hush, ist('09T12:30')).getTime(), ist('09T15:00').getTime());
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
test('formatDuration ve fill', () => {
  assert.equal(formatDuration(45), '45 sn');
  assert.equal(formatDuration(60), '1 dk');
  assert.equal(formatDuration(95), '1 dk 35 sn');
  assert.equal(fill('{nick} {x}', { nick: 'P' }), 'P {x}');
});
