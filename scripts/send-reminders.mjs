// Zamanı gelen kullanıcılara esneme hatırlatması gönderir.
// GitHub Actions cron'u ile 10 dakikada bir çalışır.
//
// Ortam değişkenleri:
//   FIREBASE_SERVICE_ACCOUNT  Service account JSON'un tamamı
//   VAPID_PUBLIC_KEY          `npx web-push generate-vapid-keys` çıktısı
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT             mailto:adresin@ornek.com  ya da  https://proje.web.app
//
// Bayraklar:
//   --dry-run        Hiçbir şey göndermez/yazmaz, sadece ne yapılacağını yazar
//   --uid <id>       Sadece bu kullanıcıyı işle
//   --force          Zamanlamayı yok say, hemen gönder (test için, --uid ile kullan)

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import webpush from 'web-push';
import { runReminders } from './lib/sender.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const args = { dryRun: false, force: false, uid: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
    else if (a === '--uid') args.uid = argv[++i] || null;
  }
  // GitHub Actions workflow_dispatch girdileri ortam değişkeniyle de gelebilir.
  if (process.env.INPUT_DRY_RUN === 'true') args.dryRun = true;
  if (process.env.INPUT_FORCE === 'true') args.force = true;
  if (process.env.INPUT_UID?.trim()) args.uid = process.env.INPUT_UID.trim();
  return args;
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !v.trim()) {
    console.error(`❌ Eksik ortam değişkeni: ${name} (GitHub → Settings → Secrets and variables → Actions)`);
    process.exit(1);
  }
  return v.trim();
}

async function readJson(rel) {
  return JSON.parse(await readFile(path.join(root, rel), 'utf8'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.force && !args.uid) {
    console.error('❌ --force yalnızca --uid ile birlikte kullanılabilir.');
    process.exit(1);
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(requireEnv('FIREBASE_SERVICE_ACCOUNT'));
  } catch {
    console.error('❌ FIREBASE_SERVICE_ACCOUNT geçerli bir JSON değil. İndirdiğin dosyanın tüm içeriğini yapıştır.');
    process.exit(1);
  }
  initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
  const db = getFirestore();

  const subject = requireEnv('VAPID_SUBJECT');
  if (!/^(mailto:|https:\/\/)/.test(subject)) {
    console.error('❌ VAPID_SUBJECT "mailto:" ya da "https://" ile başlamalı (Apple bunu zorunlu tutar).');
    process.exit(1);
  }
  webpush.setVapidDetails(subject, requireEnv('VAPID_PUBLIC_KEY'), requireEnv('VAPID_PRIVATE_KEY'));

  const [stretches, templates] = await Promise.all([readJson('public/data/stretches.json'), readJson('public/data/messages.json')]);

  let snaps;
  if (args.uid) {
    const snap = await db.collection('users').doc(args.uid).get();
    snaps = snap.exists ? [snap] : [];
    if (!snaps.length) console.warn(`⚠️ Kullanıcı bulunamadı: ${args.uid}`);
  } else {
    snaps = (await db.collection('users').where('enabled', '==', true).get()).docs;
  }
  const refs = new Map(snaps.map((s) => [s.id, s.ref]));
  const users = snaps.map((s) => ({ id: s.id, data: s.data(), updatedAtMs: s.get('updatedAt')?.toMillis?.() ?? 0 }));

  const summary = await runReminders({
    users,
    stretches,
    templates,
    dryRun: args.dryRun,
    force: args.force,
    send: (sub, payload) => webpush.sendNotification(sub, payload, { TTL: 900, urgency: 'high', topic: 'stretch' }),
    onSent: (u, { stretchId, recentStretchIds, now }) =>
      refs.get(u.id).update({
        lastSentAt: Timestamp.fromDate(now),
        lastStretchId: stretchId,
        recentStretchIds,
        sentCount: FieldValue.increment(1),
      }),
    onGone: (u) => refs.get(u.id).update({ pushSubscription: FieldValue.delete(), needsResubscribe: true }),
  });

  console.log(`\nÖzet: ${JSON.stringify(summary)}`);
  if (summary.failed > 0 && summary.sent === 0) process.exitCode = 1;
  await db.terminate();
}

// Firestore istemcisi açık bağlantı bırakabilir; CI'da asılı kalmamak için açıkça çık.
main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
