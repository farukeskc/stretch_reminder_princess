// "Bugün" ekranı: selamlama, sıradaki hatırlatma, günlük program, sana özel seans, duraklatma.
import { store, updateUser } from '../store.js';
import { nextReminderAt, endOfLocalDay, toMs, localParts } from '../shared/schedule.js';
import { composeSession, doneToday, sessionDuration } from '../shared/plan.js';
import { formatDuration, approxDuration } from '../shared/message.js';
import { AREA_LABELS } from '../shared/defaults.js';
import { renderFigure } from '../figure.js';
import { streak } from '../stats.js';
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
    return `<div class="card-title">Mola modu</div><div class="next-time" style="font-size:1.6rem">${label}</div><p class="next-sub">${sub}</p>`;
  }
  const next = nextReminderAt(u);
  if (!next) {
    return `<div class="card-title">Sıradaki seans</div><div class="next-time" style="font-size:1.6rem">Planlanmadı</div><p class="next-sub">Ayarlar'dan gün ve saat seç.</p>`;
  }
  const est = composeSession(u, store.stretches, { now: next, rng: () => 0.5 });
  const day = fmtDayLabel(next, tz);
  return `<div class="card-title">Sıradaki seans</div>
    <div class="next-time">${fmtTime(next, tz)}</div>
    <p class="next-sub">${day === 'Bugün' ? 'Bugün' : esc(day)} · ${est.load} hareket · ${approxDuration(sessionDuration(est.ids, store.stretches))}</p>`;
}

function programBlock(u, s) {
  const now = new Date();
  const workday = u.days.includes(localParts(now, u.timezone).dow);
  const pct = s.planTotal ? Math.round((s.doneCount / s.planTotal) * 100) : 0;
  let line;
  if (s.complete) line = 'Bugünkü programı tamamladın 👑 Harikasın!';
  else if (!workday) line = 'Bugün izin günün. İstersen yine de minik bir seans yapabilirsin 💕';
  else if (s.sessionsLeft === 0) line = 'Bugünkü mesai bitti. Kalanlar yarına devretmez, dert etme 💕';
  else if (s.behind) line = `Biraz geride kaldık 💪 Kalan ${s.sessionsLeft} seans biraz daha uzun olacak.`;
  else line = `Bugün ${s.sessionsLeft} seans kaldı, her biri yaklaşık ${Math.max(2, Math.ceil(s.remainingCount / s.sessionsLeft))} hareket.`;
  const focus = u.focusAreas.map((a) => AREA_LABELS[a]).filter(Boolean);
  return `
    <div class="row between">
      <div class="card-title" style="margin:0">Bugünkü program</div>
      <span class="tiny muted" style="font-weight:800">${st(u)}</span>
    </div>
    <div class="row" style="align-items:baseline;gap:6px;margin-top:6px">
      <span class="next-time" style="font-size:2rem">${s.doneCount}</span>
      <span class="muted" style="font-weight:800">/ ${s.planTotal} hareket</span>
    </div>
    <div class="progress"><i style="width:${pct}%"></i></div>
    <p class="small muted" style="margin-top:10px">${line}</p>
    ${focus.length ? `<div class="chips" style="margin-top:10px"><span class="chip plain">Odak</span>${focus.map((f) => `<span class="chip">${f}</span>`).join('')}</div>` : ''}`;
}

function st(u) {
  const n = streak(u.timezone);
  return n > 0 ? `🔥 ${n} günlük seri` : '';
}

export function homeView(root, _params, { rerender }) {
  const u = store.user;
  const tz = u.timezone;
  const session = composeSession(u, store.stretches, { done: doneToday(u), lastIds: u.lastSession?.ids || [] });
  const moves = session.ids.map((id) => store.byId.get(id));
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

    <section class="card">${programBlock(u, session)}</section>

    <section class="card">
      <div class="card-title">${session.complete ? 'Bonus seans' : 'Şimdi sana özel seans'}</div>
      <ol class="move-list">
        ${moves
          .map(
            (m, i) => `
          <li class="move">
            <span class="move-no">${i + 1}</span>
            <div class="mini-fig">${renderFigure(m, { still: true })}</div>
            <div class="grow"><b>${esc(m.name)}</b><span class="tiny muted">${formatDuration(m.durationSec)} · ${m.areas.map((a) => AREA_LABELS[a]).join(', ')}</span></div>
          </li>`,
          )
          .join('')}
      </ol>
      <a class="btn primary block" style="margin-top:14px" href="#/seans/${session.ids.join(',')}">Seansa başla ✨ <span style="opacity:.8;font-weight:700">${approxDuration(sessionDuration(session.ids, store.stretches))}</span></a>
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
