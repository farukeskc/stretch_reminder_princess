// "Bugün" ekranı: selamlama, sıradaki hatırlatma, istatistikler, öneri, duraklatma.
import { store, updateUser } from '../store.js';
import { nextReminderAt, endOfLocalDay, toMs, parseHM } from '../shared/schedule.js';
import { pickStretch } from '../shared/pick.js';
import { formatDuration } from '../shared/message.js';
import { AREA_LABELS } from '../shared/defaults.js';
import { renderFigure } from '../figure.js';
import { todayCount, streak, recentIds } from '../stats.js';
import { permission, hasSubscription } from '../push.js';
import { pushSupported } from '../install.js';
import { esc, fmtTime, fmtDayLabel, fmtToday, toast } from '../ui.js';

function greeting(tz) {
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: tz }).format(new Date()));
  if (h < 5) return 'İyi geceler';
  if (h < 12) return 'Günaydın';
  if (h < 18) return 'Merhaba';
  return 'İyi akşamlar';
}

function statusBlock(u) {
  const tz = u.timezone;
  const now = Date.now();
  const paused = toMs(u.pausedUntil);
  if (!u.enabled) {
    return `<div class="card-title">Hatırlatmalar</div><div class="next-time">Kapalı</div><p class="next-sub">Ayarlar'dan tekrar açabilirsin.</p>`;
  }
  if (paused && paused > now) {
    const eod = endOfLocalDay(new Date(now), tz).getTime();
    const forDay = Math.abs(paused - eod) < 60_000;
    // Saatten sonra ek kullanmıyoruz ('a/'e ünlü uyumu saate göre değişir).
    const label = forDay ? 'Bugünlük sessizde 🌙' : 'Sessizdeyim 🤫';
    const sub = forDay ? 'Yarın kaldığımız yerden devam ederiz.' : `Hatırlatmalar saat ${fmtTime(new Date(paused), tz)} sonrası devam edecek.`;
    return `<div class="card-title">Mola modu</div><div class="next-time" style="font-size:1.6rem">${label}</div><p class="next-sub">${sub} İstersen yine de bir hareket yapabilirsin.</p>`;
  }
  const next = nextReminderAt(u);
  if (!next) {
    return `<div class="card-title">Sıradaki hatırlatma</div><div class="next-time" style="font-size:1.6rem">Planlanmadı</div><p class="next-sub">Ayarlar'dan gün ve saat seç.</p>`;
  }
  const day = fmtDayLabel(next, tz);
  return `<div class="card-title">Sıradaki hatırlatma</div>
    <div class="next-time">${fmtTime(next, tz)}</div>
    <p class="next-sub">${day === 'Bugün' ? 'Bugün' : esc(day)} · yaklaşık, birkaç dakika sapabilir</p>`;
}

export function homeView(root, _params, { rerender }) {
  const u = store.user;
  const tz = u.timezone;
  const count = todayCount(tz);
  const st = streak(tz);
  const s = parseHM(u.startTime);
  const e = parseHM(u.endTime);
  const goal = s != null && e != null && e > s ? Math.max(1, Math.floor((e - s) / u.intervalMin)) : 6;
  const suggestion = pickStretch(store.stretches, { focusAreas: u.focusAreas, recentIds: recentIds(4) });
  const paused = (toMs(u.pausedUntil) ?? 0) > Date.now();

  root.innerHTML = `
    <header class="hello">
      <div>
        <p class="date">${esc(fmtToday(tz))}</p>
        <h1>${greeting(tz)}, ${esc(u.nickname)} <span class="crown">👑</span></h1>
      </div>
    </header>

    <div id="push-warn"></div>

    <section class="card hero">${statusBlock(u)}</section>

    <section class="stats">
      <div class="stat">
        <b>${count}</b><span>bugünkü esneme</span>
        <div class="dots">${Array.from({ length: Math.min(goal, 16) }, (_, i) => `<i class="${i < count ? 'on' : ''}"></i>`).join('')}</div>
      </div>
      <div class="stat">
        <b>${st} ${st > 0 ? '🔥' : ''}</b><span>günlük seri</span>
        <p class="tiny muted" style="margin-top:8px">${st > 2 ? 'Harikasın, böyle devam!' : st > 0 ? 'Güzel başlangıç 💕' : 'İlk esnemeyle başlasın'}</p>
      </div>
    </section>

    <section class="card">
      <div class="card-title">Şimdi sana iyi gelebilir</div>
      <a class="suggest" href="#/stretch/${suggestion.id}" style="text-decoration:none;color:inherit">
        <div class="fig-wrap">${renderFigure(suggestion)}</div>
        <div>
          <h2>${esc(suggestion.name)}</h2>
          <div class="chips">
            <span class="chip pink">${formatDuration(suggestion.durationSec)}</span>
            ${suggestion.areas.map((a) => `<span class="chip">${AREA_LABELS[a]}</span>`).join('')}
          </div>
        </div>
      </a>
      <a class="btn primary block" style="margin-top:14px" href="#/stretch/${suggestion.id}">Şimdi esne ✨</a>
    </section>

    <section class="btn-row">
      ${
        paused
          ? `<button class="btn ghost" id="resume" style="grid-column:1/-1">Hatırlatmalara devam et ▶️</button>`
          : `<button class="btn ghost" id="pause1">1 saat sessiz 🤫</button><button class="btn ghost" id="pauseDay">Bugünlük yeter 🌙</button>`
      }
    </section>

    <p class="foot-note">Ağrın sürekli ya da şiddetliyse bir doktora danışmayı unutma 💗</p>
  `;

  const act = async (partial, msg) => {
    try {
      await updateUser(partial);
      toast(msg);
    } catch {
      toast('Kaydedilemedi, internetini kontrol et');
    }
    rerender();
  };
  root.querySelector('#pause1')?.addEventListener('click', () => act({ pausedUntil: new Date(Date.now() + 3_600_000) }, '1 saat sessiz 🤫'));
  root.querySelector('#pauseDay')?.addEventListener('click', () => act({ pausedUntil: endOfLocalDay(new Date(), tz) }, 'Yarın görüşürüz 🌙'));
  root.querySelector('#resume')?.addEventListener('click', () => act({ pausedUntil: null }, 'Hatırlatmalar devam ediyor ✨'));

  // Bildirim durumu uyarısı (asenkron)
  (async () => {
    const warn = root.querySelector('#push-warn');
    if (!warn || !pushSupported()) return;
    const perm = permission();
    const sub = perm === 'granted' ? await hasSubscription() : false;
    if (perm !== 'granted' || !sub) {
      warn.innerHTML = `<div class="notice">🔕 Bildirimler kapalı, sana hatırlatma gönderemiyorum. <a href="#/ayarlar">Ayarlar'dan aç</a></div>`;
    }
  })();
}
