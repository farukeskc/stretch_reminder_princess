// Gönderim mantığı (veritabanından bağımsız, test edilebilir).
import { evaluate } from '../../public/js/shared/schedule.js';
import { pushRecent } from '../../public/js/shared/pick.js';
import { composeSession } from '../../public/js/shared/plan.js';
import { buildSessionNotification } from '../../public/js/shared/message.js';
import { withDefaults } from '../../public/js/shared/defaults.js';

/**
 * @param {object} o
 * @param {{id:string, data:object, updatedAtMs:number}[]} o.users
 * @param {(sub:object, payload:string) => Promise<{statusCode:number}>} o.send
 * @param {(user, info:{session:object, recentStretchIds:string[], now:Date}) => Promise<void>} o.onSent
 * @param {(user) => Promise<void>} o.onGone  Abonelik geçersiz (404/410)
 */
export async function runReminders({
  users,
  send,
  onSent,
  onGone,
  stretches,
  templates,
  now = new Date(),
  dryRun = false,
  force = false,
  rng = Math.random,
  log = console.log,
}) {
  const summary = { checked: users.length, sent: 0, skipped: 0, removed: 0, failed: 0 };
  const byId = new Map(stretches.map((s) => [s.id, s]));

  // Aynı cihaz (endpoint) birden fazla dokümanda olabilir (ör. depolama silinip yeniden kurulduysa).
  // En son güncellenen kaydı kullan, diğerlerini atla.
  const latest = new Map();
  for (const u of users) {
    const ep = u.data.pushSubscription?.endpoint;
    if (!ep) continue;
    const prev = latest.get(ep);
    if (!prev || (u.updatedAtMs ?? 0) > (prev.updatedAtMs ?? 0)) latest.set(ep, u);
  }
  const active = new Set([...latest.values()].map((u) => u.id));

  for (const u of users) {
    const raw = u.data;
    const user = withDefaults(raw);
    const tag = `${u.id.slice(0, 6)}…`;

    if (!raw.pushSubscription?.endpoint) {
      log(`· ${tag} abonelik yok`);
      summary.skipped++;
      continue;
    }
    if (!active.has(u.id)) {
      log(`· ${tag} aynı cihazın daha yeni bir kaydı var, atlandı`);
      summary.skipped++;
      continue;
    }

    const verdict = force ? { due: true, reason: 'force' } : evaluate(user, now);
    const slotText = verdict.slotMs
      ? ` [seans ${new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit', timeZone: user.timezone }).format(new Date(verdict.slotMs))}, +${Math.round(verdict.lateMin)} dk]`
      : '';
    if (!verdict.due) {
      log(`· ${tag} gönderilmedi: ${verdict.reason}${slotText}`);
      summary.skipped++;
      continue;
    }

    const session = composeSession(user, stretches, { now, lastIds: raw.lastSession?.ids || [], rng });
    const note = buildSessionNotification(user, session, byId, templates, rng);
    const status = `${slotText.trim()} program ${session.doneCount}/${session.planTotal}, kalan seans ${session.sessionsLeft}, yük ${session.load}${session.behind ? ' (telafi)' : ''}${session.complete ? ' (bonus)' : ''}`.trim();

    if (dryRun) {
      log(`✉️  [dry-run] ${tag} → ${status} → "${note.title}" / "${note.body}"`);
      summary.sent++;
      continue;
    }

    try {
      const res = await send(raw.pushSubscription, JSON.stringify(note));
      let recent = raw.recentStretchIds || [];
      for (const id of session.ids) recent = pushRecent(recent, id);
      await onSent(u, { session, recentStretchIds: recent, now });
      log(`✉️  ${tag} gönderildi (${res?.statusCode}) → ${status} → ${session.ids.join(', ')}`);
      summary.sent++;
    } catch (err) {
      const code = err?.statusCode;
      if (code === 404 || code === 410) {
        await onGone(u);
        log(`🗑️  ${tag} geçersiz abonelik silindi (${code})`);
        summary.removed++;
      } else {
        log(`❌ ${tag} gönderilemedi (${code ?? 'ağ'}): ${err?.body || err?.message}`);
        summary.failed++;
      }
    }
  }
  return summary;
}
