import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runReminders } from '../lib/sender.mjs';

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
  const h = harness([{ id: 'u1', data: { ...base, pushSubscription: sub('a'), recentStretchIds: ['goz-molasi'] }, updatedAtMs: 1 }]);
  const s = await h.run();
  assert.deepEqual(s, { checked: 1, sent: 1, skipped: 0, removed: 0, failed: 0 });
  assert.equal(h.sent.length, 1);
  const p = h.sent[0].payload;
  assert.match(p.url, /^\/#\/stretch\/[a-z0-9-]+$/);
  assert.ok(p.title && p.body && !p.body.includes('{'));
  assert.equal(h.updates[0].stretchId, p.stretchId);
  assert.deepEqual(h.updates[0].recentStretchIds, ['goz-molasi', p.stretchId]);
  assert.notEqual(p.stretchId, 'goz-molasi');
});

test('zamanı gelmeyen, aboneliği olmayan ve kapalı kullanıcıları atlar', async () => {
  const h = harness([
    { id: 'early', data: { ...base, lastSentAt: new Date('2026-11-09T10:40:00+03:00'), pushSubscription: sub('b') } },
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
