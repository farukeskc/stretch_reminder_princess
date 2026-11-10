// Ayarlar: hitap, bildirimler, program, bölgeler, bilgi.
import { store, updateUser } from '../store.js';
import { enablePush, permission, hasSubscription, showTestNotification, syncSubscription } from '../push.js';
import { pushSupported, isIOS, isStandalone } from '../install.js';
import { isFirebaseConfigured, isVapidConfigured, APP_VERSION } from '../config.js';
import { composeSession, sessionsPerDay, loadLimits, FOCUS_REPS } from '../shared/plan.js';
import { buildSessionNotification } from '../shared/message.js';
import { toMs } from '../shared/schedule.js';
import { nicknameHtml, scheduleHtml, areasHtml, bindControls } from './controls.js';
import { esc, toast } from '../ui.js';

export function settingsView(root, _params, { rerender }) {
  const u = store.user;
  const paused = (toMs(u.pausedUntil) ?? 0) > Date.now();

  root.innerHTML = `
    <header><h1>Ayarlar ⚙️</h1></header>

    <section class="card stack">
      <div class="row between">
        <div class="grow">
          <h2>Hatırlatmalar</h2>
          <p class="small muted">Gün içinde esneme bildirimleri</p>
        </div>
        <label class="switch"><input type="checkbox" id="enabled" ${u.enabled ? 'checked' : ''} aria-label="Hatırlatmalar"><span></span></label>
      </div>
      ${paused ? `<div class="notice">Şu an sessizde. <a href="#" id="unpause">Devam ettir</a></div>` : ''}
      <div id="push-status" class="stack"></div>
    </section>

    <section class="card stack">
      <h2>Program</h2>
      ${scheduleHtml(u)}
      <div class="card soft small stack" style="gap:6px">
        <p id="plan-info"></p>
        <p class="muted">Seans boyutu aralığa göre ayarlanır (saatte ~3 hareket). Ağrıyan bölgelerinin hareketleri programa günde ${FOCUS_REPS} kez girer. Seans atlarsan kalan seanslar biraz uzar. Program her gün sıfırlanır.</p>
      </div>
    </section>

    <section class="card stack">${areasHtml(u)}</section>

    <section class="card stack">${nicknameHtml(u)}</section>

    <section class="card soft stack small">
      <h3>Bilgi</h3>
      <p class="muted">Seanslar sabit saatlerdedir; bildirim seans saatinden sonraki birkaç dakika içinde gelir (zamanlayıcı 5 dakikada bir çalışır).</p>
      <p class="muted">Bu uygulama tıbbi tavsiye yerine geçmez. Ağrın sürüyorsa bir doktora ya da fizyoterapiste danış.</p>
      ${store.uid ? `<div><p class="tiny muted">Kullanıcı kimliği (test bildirimi için):</p><div class="kbd-id" id="uid">${esc(store.uid)}</div></div>` : ''}
      <p class="tiny muted">Sürüm ${APP_VERSION} · Sevgiyle yapıldı 💕</p>
    </section>
  `;

  // Otomatik kaydetme (gecikmeli toplu yazma)
  let pending = {};
  let timer;
  const planInfo = (u2) => {
    const n = sessionsPerDay(u2);
    const { base, max } = loadLimits(u2);
    root.querySelector('#plan-info').innerHTML =
      `<b>Günlük program otomatik hazırlanır.</b> Bu ayarlarla günde <b>${n}</b> seans × <b>${base}</b> hareket = toplam <b>${n * base}</b> hareket. Telafide bir seans en fazla ${max} hareket olur.`;
  };
  planInfo(u);

  const save = (partial) => {
    Object.assign(pending, partial);
    planInfo({ ...store.user, ...pending });
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const data = pending;
      pending = {};
      try {
        await updateUser(data);
        toast('Kaydedildi ✓', 1200);
      } catch {
        toast('Kaydedilemedi, internetini kontrol et');
      }
    }, 600);
  };
  bindControls(root, save, u);

  root.querySelector('#enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
  root.querySelector('#unpause')?.addEventListener('click', async (e) => {
    e.preventDefault();
    await updateUser({ pausedUntil: null }).catch(() => {});
    toast('Hatırlatmalar devam ediyor ✨');
    rerender();
  });
  root.querySelector('#uid')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(store.uid);
      toast('Kopyalandı');
    } catch {
      /* yoksay */
    }
  });

  renderPushStatus(root.querySelector('#push-status'), rerender);

  return () => {
    // Ekrandan çıkarken bekleyen değişiklikleri hemen yaz.
    clearTimeout(timer);
    if (Object.keys(pending).length) updateUser(pending).catch(() => {});
  };
}

async function renderPushStatus(el, rerender) {
  const lines = [];
  if (!isFirebaseConfigured()) lines.push(`<div class="notice">Firebase yapılandırması eksik (public/js/config.js). Ayarlar sadece bu cihazda saklanıyor.</div>`);
  else if (store.remoteError) lines.push(`<div class="notice">Sunucuya bağlanılamadı: ${esc(store.remoteError)}</div>`);
  if (!isVapidConfigured()) lines.push(`<div class="notice">VAPID anahtarı eksik (public/js/config.js). Bildirim aboneliği yapılamaz.</div>`);

  if (!pushSupported() || (isIOS() && !isStandalone())) {
    lines.push(`<div class="notice">Bu tarayıcıda bildirim yok. iPhone'da uygulamayı ana ekrana ekleyip oradan açmalısın.</div>`);
    el.innerHTML = lines.join('');
    return;
  }

  const perm = permission();
  const sub = perm === 'granted' ? await hasSubscription() : false;
  if (perm === 'granted' && sub) {
    lines.push(`<div class="notice ok">Bildirimler açık ✓</div>`);
    lines.push(`<div class="btn-row"><button class="btn sm ghost" id="test">Test bildirimi 🔔</button><button class="btn sm ghost" id="resync">Aboneliği yenile</button></div>`);
  } else if (perm === 'denied') {
    lines.push(`<div class="notice">Bildirim izni kapalı. iPhone <b>Ayarlar → Bildirimler → Prenses 👑</b> bölümünden "Bildirimlere İzin Ver"i aç, sonra uygulamaya geri dön.</div>`);
  } else {
    lines.push(`<button class="btn primary block" id="allow">Bildirimlere izin ver 💌</button>`);
  }
  el.innerHTML = lines.join('');

  el.querySelector('#allow')?.addEventListener('click', (e) => {
    e.currentTarget.disabled = true;
    enablePush().then((res) => {
      if (res.ok) toast('Bildirimler açıldı 💖');
      else if (res.reason === 'denied') toast('İzin verilmedi');
      else toast(`Olmadı: ${res.reason}`);
      rerender();
    });
  });
  el.querySelector('#test')?.addEventListener('click', async () => {
    const s = composeSession(store.user, store.stretches);
    const n = buildSessionNotification(store.user, s, store.byId, store.messages);
    try {
      await showTestNotification(n.title, n.body, n.url);
      toast('Gönderildi, bildirim merkezine bak 🔔');
    } catch (err) {
      toast(`Gösterilemedi: ${err.message || err}`);
    }
  });
  el.querySelector('#resync')?.addEventListener('click', async () => {
    const ok = await syncSubscription({ needsResubscribe: true });
    toast(ok ? 'Abonelik yenilendi ✓' : 'Yenilenemedi');
  });
}
