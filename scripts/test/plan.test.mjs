import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  sessionsPerDay,
  sessionsLeft,
  dailyPlan,
  remainingOf,
  composeSession,
  doneToday,
  focusIds,
  BASE_LOAD,
  MAX_LOAD,
  MIN_LOAD,
  FOCUS_REPS,
  AREA_ORDER,
} from '../../public/js/shared/plan.js';
import { buildSessionNotification, listNames, approxDuration } from '../../public/js/shared/message.js';

const stretches = JSON.parse(await readFile(new URL('../../public/data/stretches.json', import.meta.url), 'utf8'));
const templates = JSON.parse(await readFile(new URL('../../public/data/messages.json', import.meta.url), 'utf8'));
const byId = new Map(stretches.map((s) => [s.id, s]));

// 2026-11-09 Pazartesi, İstanbul (UTC+3)
const ist = (hm, day = '09') => new Date(`2026-11-${day}T${hm}:00+03:00`);
const DATE = '2026-11-09';
const user = {
  timezone: 'Europe/Istanbul',
  intervalMin: 60,
  startTime: '09:00',
  endTime: '18:00',
  days: [1, 2, 3, 4, 5],
  focusAreas: ['boyun', 'omuz'],
};
const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

test('seans sayıları', () => {
  assert.equal(sessionsPerDay(user), 8); // 10:00 … 17:00
  assert.equal(sessionsPerDay({ ...user, intervalMin: 30 }), 17);
  assert.equal(sessionsPerDay({ ...user, intervalMin: 45 }), 11);
  assert.equal(sessionsLeft(user, ist('08:30')), 8);
  assert.equal(sessionsLeft(user, ist('10:03')), 8);
  assert.equal(sessionsLeft(user, ist('11:03')), 7);
  assert.equal(sessionsLeft(user, ist('17:00')), 1);
  assert.equal(sessionsLeft(user, ist('17:03')), 1);
  assert.equal(sessionsLeft(user, ist('18:00')), 0);
  assert.equal(sessionsLeft(user, ist('11:00', '07')), 0); // Cumartesi
});

test('günlük program: hedef boyutu, ağrı hareketleri 2 kez, gün bazlı sabit', () => {
  const plan = dailyPlan(user, stretches, DATE);
  assert.equal(plan.length, 8 * BASE_LOAD);
  const focus = focusIds(user, stretches);
  assert.ok(focus.length > 0);
  for (const id of focus) assert.equal(plan.filter((x) => x === id).length, FOCUS_REPS, id);
  // Aynı gün aynı program, farklı gün farklı sıralama
  assert.deepEqual(dailyPlan(user, stretches, DATE), plan);
  assert.notDeepEqual(dailyPlan(user, stretches, '2026-11-10'), plan);
  // Bölge seçilmemişse tüm hareketlerden dengeli program
  const general = dailyPlan({ ...user, focusAreas: [] }, stretches, DATE);
  assert.equal(general.length, 24);
  assert.equal(new Set(general).size, stretches.length);
});

test('kurulum günü: yalnızca kurulumdan sonraki seanslar planlanır, geride başlamaz', () => {
  // 14:20'de kuruldu → seanslar ~14:23, 15:23, 16:23, 17:23 (4 seans)
  const fresh = { ...user, createdAt: ist('14:20') };
  assert.equal(dailyPlan(fresh, stretches, DATE).length, 4 * BASE_LOAD);
  const first = composeSession(fresh, stretches, { now: ist('14:23'), done: [], rng: seeded() });
  assert.equal(first.behind, false, 'ilk gün geride başlamaz');
  assert.equal(first.load, 3);
  const second = composeSession(fresh, stretches, { now: ist('15:23'), done: first.ids, rng: seeded() });
  assert.equal(second.behind, false);
  assert.equal(second.load, 3);
  // Ertesi gün tam program
  assert.equal(dailyPlan(fresh, stretches, '2026-11-10').length, 8 * BASE_LOAD);
  // Firestore Timestamp biçimi de çalışır
  const ts = { ...user, createdAt: { seconds: ist('14:20').getTime() / 1000, nanoseconds: 0 } };
  assert.equal(dailyPlan(ts, stretches, DATE).length, 4 * BASE_LOAD);
});

test('remainingOf çoklu küme farkı', () => {
  assert.deepEqual(remainingOf(['a', 'b', 'a', 'c'], ['a', 'c']), ['b', 'a']);
  assert.deepEqual(remainingOf(['a'], ['a', 'a', 'x']), []);
});

test('doneToday yalnızca bugünün ilerlemesini döner', () => {
  assert.deepEqual(doneToday({ ...user, progress: { date: DATE, done: ['a'] } }, ist('12:00')), ['a']);
  assert.deepEqual(doneToday({ ...user, progress: { date: '2026-11-08', done: ['a'] } }, ist('12:00')), []);
});

test('normal seans: 3 farklı hareket, ağrı ağırlıklı, baştan aşağı sıralı', () => {
  const s = composeSession(user, stretches, { now: ist('10:03'), done: [], rng: seeded() });
  assert.equal(s.load, 3);
  assert.equal(s.ids.length, 3);
  assert.equal(new Set(s.ids).size, 3);
  assert.equal(s.behind, false);
  const focus = new Set(focusIds(user, stretches));
  assert.ok(s.ids.filter((id) => focus.has(id)).length >= 2, 'en az 2 ağrı hareketi');
  const order = s.ids.map((id) => AREA_ORDER.indexOf(byId.get(id).areas[0]));
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});

/** Bir günü simüle eder: skip listesindeki seanslar atlanır. */
function simulateDay(skip = new Set(), u = user) {
  const done = [];
  const loads = [];
  const rng = seeded(7);
  let lastIds = [];
  for (let i = 0; i < sessionsPerDay(u); i++) {
    const t = new Date(ist('10:03').getTime() + i * u.intervalMin * 60_000);
    const s = composeSession(u, stretches, { now: t, done, lastIds, rng });
    loads.push(s.load);
    if (!skip.has(i)) done.push(...s.ids);
    lastIds = s.ids;
  }
  const plan = dailyPlan(u, stretches, DATE);
  return { loads, done, remaining: remainingOf(plan, done), plan };
}

test('hiç atlamazsa: her seans 3 hareket, gün sonunda program tamam', () => {
  const { loads, remaining } = simulateDay();
  assert.deepEqual(loads, [3, 3, 3, 3, 3, 3, 3, 3]);
  assert.equal(remaining.length, 0);
});

test('seans atlanınca kalan seansların yükü artar ve program yine tamamlanır', () => {
  const { loads, remaining } = simulateDay(new Set([1]));
  assert.equal(loads[0], 3);
  assert.ok(loads[2] > 3, `atlamadan sonraki seans daha yüklü olmalı: ${loads}`);
  assert.ok(loads.every((l) => l <= MAX_LOAD));
  assert.equal(remaining.length, 0, 'program yine de gün içinde biter');
});

test('çok seans atlanırsa yük en fazla 6 olur', () => {
  const { loads, remaining } = simulateDay(new Set([0, 1, 2, 3, 4]));
  assert.ok(loads.some((l) => l === MAX_LOAD), `${loads}`);
  assert.ok(loads.every((l) => l <= MAX_LOAD));
  assert.ok(remaining.length > 0, 'üst sınır nedeniyle bir kısmı yetişmez');
});

test('ağrı hareketleri öncelikli: atlansa da önce onlar biter', () => {
  const { remaining } = simulateDay(new Set([0, 1, 2, 3, 4]));
  const focus = new Set(focusIds(user, stretches));
  const all = dailyPlan(user, stretches, DATE).filter((id) => focus.has(id)).length;
  const left = remaining.filter((id) => focus.has(id)).length;
  assert.ok(left < all / 3, `kalan ağrı hareketi ${left}/${all}`);
});

test('program bittiyse 2 hareketlik bonus seans', () => {
  const plan = dailyPlan(user, stretches, DATE);
  const s = composeSession(user, stretches, { now: ist('15:03'), done: plan, rng: seeded() });
  assert.equal(s.complete, true);
  assert.equal(s.ids.length, MIN_LOAD);
});

test('mesai dışında "Şimdi esne" normal boyutta seans verir', () => {
  const s = composeSession(user, stretches, { now: ist('20:00'), done: [], rng: seeded() });
  assert.equal(s.sessionsLeft, 0);
  assert.equal(s.load, BASE_LOAD);
});

test('aynı hareketler art arda seanslarda mümkünse tekrar etmez', () => {
  const a = composeSession(user, stretches, { now: ist('10:03'), done: [], rng: seeded(3) });
  const b = composeSession(user, stretches, { now: ist('11:03'), done: a.ids, lastIds: a.ids, rng: seeded(3) });
  assert.equal(b.ids.filter((id) => a.ids.includes(id)).length, 0, `${a.ids} / ${b.ids}`);
});

test('seans bildirimi: liste, süre, url, telafi ve bonus metni', () => {
  assert.equal(listNames(['A']), 'A');
  assert.equal(listNames(['A', 'B']), 'A ve B');
  assert.equal(listNames(['A', 'B', 'C', 'D']), 'A, B +2');
  assert.equal(approxDuration(45), '45 sn');
  assert.equal(approxDuration(140), '~2 dk');
  const s = composeSession(user, stretches, { now: ist('10:03'), done: [], rng: seeded() });
  const n = buildSessionNotification({ nickname: 'Prensesim' }, s, byId, templates, seeded());
  assert.equal(n.url, `/#/seans/${s.ids.join(',')}`);
  assert.ok(!/\{\w+\}/.test(n.title + n.body), n.body);
  const catchup = buildSessionNotification({}, { ...s, behind: true }, byId, templates, () => 0);
  assert.equal(catchup.body.split(' ')[0], 'Biraz');
  const bonus = buildSessionNotification({}, { ...s, complete: true }, byId, templates, () => 0);
  assert.match(bonus.body, /bitirdin/);
});
