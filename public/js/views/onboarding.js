// İlk açılış: hitap → program → bölgeler → bildirim izni.
import { store, updateUser, saveAllSettings } from '../store.js';
import { renderFigure } from '../figure.js';
import { enablePush, permission } from '../push.js';
import { pushSupported, isIOS, isStandalone } from '../install.js';
import { isVapidConfigured } from '../config.js';
import { nicknameHtml, scheduleHtml, areasHtml, bindControls } from './controls.js';
import { esc, toast, hearts } from '../ui.js';

const STEPS = 4;

export function onboardingView(root, _params, { navigate }) {
  let step = 0;
  root.classList.add('no-tabbar');

  const progress = () => `<div class="ob-progress">${Array.from({ length: STEPS }, (_, i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`;

  function finish() {
    updateUser({ onboarded: true }).catch(() => {});
    hearts();
    navigate('#/');
  }

  function render() {
    const u = store.user;
    let body = '';
    if (step === 0) {
      const demo = store.byId.get('omuz-silkme');
      body = `
        <div class="ob-hero">${demo ? renderFigure(demo) : ''}</div>
        <h1>Hoş geldin 👑</h1>
        <p class="muted">Gün içinde sana masa başında yapabileceğin minik esneme hareketlerini hatırlatacağım. Her hareketin animasyonu ve videosu var.</p>
        <section class="card stack">${nicknameHtml(u)}</section>`;
    } else if (step === 1) {
      body = `
        <h1>Programın 🗓️</h1>
        <p class="muted">Sadece çalıştığın saatlerde hatırlatırım. Sonradan Ayarlar'dan değiştirebilirsin.</p>
        <section class="card">${scheduleHtml(u)}</section>`;
    } else if (step === 2) {
      body = `
        <h1>Neren yoruluyor? 💆‍♀️</h1>
        <section class="card">${areasHtml(u)}</section>`;
    } else {
      const supported = pushSupported();
      const iosBrowser = isIOS() && !isStandalone();
      const granted = permission() === 'granted';
      body = `
        <h1>Son adım 💌</h1>
        <p class="muted">Zamanı gelince sana minik bir bildirim göndereceğim. Bunun için izin vermen gerekiyor.</p>
        ${!supported || iosBrowser ? `<div class="notice">Bu tarayıcı bildirimleri desteklemiyor. iPhone'da uygulamayı ana ekrana ekleyip oradan açman gerekiyor.</div>` : ''}
        ${!isVapidConfigured() ? `<div class="notice">Bildirim anahtarı (VAPID) henüz ayarlanmamış. İzin verebilirsin ama bildirimler kurulum tamamlanınca gelmeye başlar.</div>` : ''}
        ${!store.remote ? `<div class="notice">Sunucu bağlantısı (Firebase) henüz ayarlanmamış. Ayarlar şimdilik sadece bu cihazda saklanıyor.</div>` : ''}
        <button class="btn primary block" id="allow" ${!supported || iosBrowser || granted ? 'hidden' : ''}>Bildirimlere izin ver 💌</button>
        ${granted ? `<div class="notice ok">Bildirimler açık ✓</div>` : ''}
        <p class="tiny muted" id="perm-msg"></p>`;
    }

    root.innerHTML = `
      ${progress()}
      ${body}
      <div class="btn-row">
        ${step > 0 ? `<button class="btn ghost" id="prev">Geri</button>` : '<span></span>'}
        <button class="btn ${step === STEPS - 1 ? 'ghost' : 'primary'}" id="next">${step === STEPS - 1 ? (permission() === 'granted' ? 'Başlayalım ✨' : 'Şimdilik geç') : 'Devam'}</button>
      </div>`;

    bindControls(root, (partial) => updateUser(partial).catch(() => {}));

    root.querySelector('#prev')?.addEventListener('click', () => {
      step -= 1;
      render();
    });
    root.querySelector('#next').addEventListener('click', async () => {
      if (step === 1 && !store.user.days.length) {
        toast('En az bir gün seçmelisin');
        return;
      }
      if (step === 2) {
        try {
          await saveAllSettings();
        } catch {
          toast('Kaydedilemedi, internetini kontrol et');
          return;
        }
      }
      if (step < STEPS - 1) {
        step += 1;
        render();
        root.scrollIntoView?.({ block: 'start' });
      } else {
        finish();
      }
    });

    const allow = root.querySelector('#allow');
    allow?.addEventListener('click', () => {
      // enablePush ilk await olarak requestPermission'ı çağırır (iOS kuralı).
      allow.disabled = true;
      enablePush().then((res) => {
        const msg = root.querySelector('#perm-msg');
        if (res.ok) {
          toast('Bildirimler açıldı 💖');
          finish();
        } else if (res.reason === 'denied') {
          msg.textContent = 'İzin verilmedi. iPhone Ayarlar → Bildirimler → Prenses 👑 bölümünden açabilirsin.';
          allow.disabled = false;
        } else if (res.reason === 'no-vapid') {
          msg.textContent = 'İzin alındı. Bildirim anahtarı ayarlanınca bildirimler başlayacak.';
          setTimeout(finish, 1500);
        } else {
          msg.textContent = `Bir sorun oldu (${esc(res.reason)}). Ayarlar'dan tekrar deneyebilirsin.`;
          allow.disabled = false;
        }
      });
    });
  }

  render();
}
