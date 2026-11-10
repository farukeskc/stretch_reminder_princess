import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runReminders } from '../lib/sender.mjs';
import { dailyPlan } from '../../public/js/shared/plan.js';

const stretches = JSON.parse(await readFile(new URL('../../public/data/stretches.json', import.meta.url), 'utf8'));
const templates = JSON.parse(await readFile(new URL('../../public/data/messages.json', import.meta.url), 'utf8'));

const NOW = new Date('2026-11-09T11:03:00+03:00'); // Pazartesi 11:03 İstanbul
const base = {
  enabled: true,
  nickname: 'Prensesim',
  timezone: 'Europe/Istanbul',
  intervalMin: 60,
  startTime: '09:00',
  endTime: '18:00',
  days: [1, 2, 3, 4, 5],
  focusAreas: ['boyun'],
  lastSentAt: new Date('2026-11-09T10:03:00+03:00'),
};
const sub = (ep) => ({ endpoint: `https://push.example/${ep}`, keys: { p256dh: 'x', auth: 'y' } });

function harness(users, sendImpl) {
  const sent = [];
  const updates = [];
  const gone = [];
  return {
    sent,
    updates,
    gone,
    run: (opts = {}) =>
      runReminders({
        users,
        stretches,
        templates,
        now: NOW,
        log: () => {},
        send: async (s, payload) => {
          sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload) });
          return sendImpl ? sendImpl(s) : { statusCode: 201 };
        },
        onSent: async (u, info) => updates.push({ id: u.id, ...info }),
        onGone: async (u) => gone.push(u.id),
        ...opts,
      }),
  };
}

test('zamanı gelen kullanıcıya gönderir ve kaydı günceller', async () => {
  // 10:03 seansını yapmış (planın ilk 3 hareketi) → 11:03'te normal 3 hareket
  const progress = { date: '2026-11-09', done: dailyPlan(base, stretches, '2026-11-09').slice(0, 3) };
  const h = harness([{ id: 'u1', data: { ...base, pushSubscription: sub('a'), recentStretchIds: ['goz-molasi'], progress }, updatedAtMs: 1 }]);
  const s = await h.run();
  assert.deepEqual(s, { checked: 1, sent: 1, skipped: 0, removed: 0, failed: 0 });
  assert.equal(h.sent.length, 1);
  const p = h.sent[0].payload;
  assert.match(p.url, /^\/#\/seans\/[a-z0-9-]+(,[a-z0-9-]+)+$/);
  assert.ok(p.title && p.body && !p.body.includes('{'));
  const { session, recentStretchIds } = h.updates[0];
  assert.deepEqual(session.ids, p.ids);
  assert.equal(session.ids.length, 3, '11:03, hiç yapılmamış: normal 3 hareket');
  assert.deepEqual(recentStretchIds.slice(-3), session.ids);
});

test('bugün seans atlanmışsa daha yüklü seans gönderir', async () => {
  // 11:03: program 24, hiç yapılmamış, kalan 7 seans → 24/7 → 4 hareket (telafi)
  const h = harness([{ id: 'u1', data: { ...base, pushSubscription: sub('a') } }]);
  await h.run();
  assert.equal(h.updates[0].session.load, 4);
  assert.equal(h.updates[0].session.behind, true);
  assert.match(h.sent[0].payload.body, /4 hareket|telafi|geride|yetiştirelim|uzun/);
});

test('dünkü ilerleme bugünü etkilemez', async () => {
  const h = harness([
    { id: 'u1', data: { ...base, pushSubscription: sub('a'), progress: { date: '2026-11-08', done: Array(30).fill('boyun-yana-egme') } } },
  ]);
  await h.run();
  assert.equal(h.updates[0].session.doneCount, 0);
});

test('zamanı gelmeyen, aboneliği olmayan ve kapalı kullanıcıları atlar', async () => {
  const h = harness([
    { id: 'early', data: { ...base, lastSentAt: new Date('2026-11-09T11:01:00+03:00'), pushSubscription: sub('b') } },
    { id: 'nosub', data: { ...base } },
    { id: 'paused', data: { ...base, pausedUntil: new Date('2026-11-09T12:00:00+03:00'), pushSubscription: sub('c') } },
  ]);
  const s = await h.run();
  assert.equal(s.sent, 0);
  assert.equal(s.skipped, 3);
  assert.equal(h.sent.length, 0);
});

test('404/410 dönen aboneliği temizler, diğer hataları sayar', async () => {
  const h = harness(
    [
      { id: 'gone', data: { ...base, pushSubscription: sub('gone') } },
      { id: 'err', data: { ...base, pushSubscription: sub('err') } },
    ],
    (s) => {
      const e = new Error('push hatası');
      e.statusCode = s.endpoint.endsWith('gone') ? 410 : 500;
      throw e;
    },
  );
  const s = await h.run();
  assert.equal(s.removed, 1);
  assert.equal(s.failed, 1);
  assert.deepEqual(h.gone, ['gone']);
  assert.equal(h.updates.length, 0);
});

test('aynı cihaz iki kayıtta varsa yalnızca en yenisine gönderir', async () => {
  const h = harness([
    { id: 'old', data: { ...base, pushSubscription: sub('same') }, updatedAtMs: 100 },
    { id: 'new', data: { ...base, pushSubscription: sub('same') }, updatedAtMs: 200 },
  ]);
  const s = await h.run();
  assert.equal(s.sent, 1);
  assert.equal(h.updates[0].id, 'new');
});

test('dry-run hiçbir şey göndermez; force zamanlamayı yok sayar', async () => {
  const early = { id: 'x', data: { ...base, lastSentAt: new Date('2026-11-09T11:00:00+03:00'), pushSubscription: sub('x') } };
  const h1 = harness([{ id: 'u', data: { ...base, pushSubscription: sub('u') } }]);
  const s1 = await h1.run({ dryRun: true });
  assert.equal(s1.sent, 1);
  assert.equal(h1.sent.length, 0);
  assert.equal(h1.updates.length, 0);

  const h2 = harness([early]);
  assert.equal((await h2.run()).sent, 0);
  const h3 = harness([early]);
  assert.equal((await h3.run({ force: true })).sent, 1);
});
