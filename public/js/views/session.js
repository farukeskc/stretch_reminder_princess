// Seans: birkaç hareket art arda, rehberli geri sayımla. Her biten hareket programa işlenir.
import { store, markDone } from '../store.js';
import { renderFigure } from '../figure.js';
import { Player } from '../player.js';
import { dailyPlan, doneToday, remainingOf } from '../shared/plan.js';
import { formatDuration, approxDuration } from '../shared/message.js';
import { localParts } from '../shared/schedule.js';
import { AREA_LABELS } from '../shared/defaults.js';
import { clearBadge } from '../push.js';
import { esc, hearts, toast, BACK_ICON } from '../ui.js';

const CIRC = 2 * Math.PI * 42;
const TRANSITION_SEC = 4;
const PRAISE = ['Harikasın! 💖', 'Seans tamam, prensesim 👑', 'Vücudun sana teşekkür ediyor ✨', 'Süpersin, böyle devam 🌸'];

function soundPref() {
  try {
    return localStorage.getItem('pm.sound') !== 'off';
  } catch {
    return true;
  }
}

export function sessionView(root, params, { navigate }) {
  const moves = (params[0] || '')
    .split(',')
    .map((id) => store.byId.get(id))
    .filter(Boolean);
  if (!moves.length) {
    root.innerHTML = `<div class="topbar"><a class="back" href="#/">${BACK_ICON}</a></div><p>Bu seansı bulamadım 🙈</p><a class="btn primary block" href="#/">Ana sayfa</a>`;
    return;
  }
  clearBadge();

  const total = moves.reduce((a, m) => a + m.durationSec, 0);
  const status = moves.map(() => 'todo'); // todo | active | done | skipped
  let idx = 0;
  let player = null;
  let audio = null;
  let wakeLock = null;
  let sound = soundPref();
  let finished = false;

  root.innerHTML = `
    <div class="topbar">
      <button class="back" id="back" aria-label="Geri">${BACK_ICON}</button>
      <div class="grow">
        <p class="tiny muted" style="font-weight:800">SEANS · ${moves.length} HAREKET · ${approxDuration(total)}</p>
      </div>
      <span class="chip pink" id="counter">1 / ${moves.length}</span>
    </div>

    <section class="stack" id="media" style="gap:6px"></section>

    <header class="stack" style="gap:8px">
      <p class="tiny muted" id="next-label" hidden></p>
      <h1 id="name"></h1>
      <div class="chips" id="chips"></div>
    </header>

    <section class="card" id="player-card">
      <div id="idle">
        <ol class="move-list" id="plan-list"></ol>
        <button class="btn primary block" id="start" style="margin-top:14px">Seansa başla ▶️</button>
        <p class="tiny muted" style="text-align:center;margin-top:8px">Hareketler sırayla, zil sesi ve geri sayımla akacak.</p>
      </div>
      <div id="live" hidden>
        <div class="player">
          <div class="ring">
            <svg viewBox="0 0 96 96"><circle class="track" cx="48" cy="48" r="42"/><circle class="bar" id="ring" cx="48" cy="48" r="42" stroke-dasharray="${CIRC}" stroke-dashoffset="0"/></svg>
            <b id="remain">0</b>
          </div>
          <div>
            <p class="tiny muted" id="step-no"></p>
            <p class="now" id="now"></p>
          </div>
        </div>
        <div class="progress"><i id="total"></i></div>
        <div class="row between" style="margin-top:12px;gap:8px">
          <button class="icon-btn" id="sound" aria-label="Sesi aç/kapat">${sound ? '🔔' : '🔕'}</button>
          <button class="btn sm ghost grow" id="toggle">Duraklat ⏸</button>
          <button class="btn sm ghost grow" id="skip-step">İleri ⏭</button>
        </div>
        <button class="btn sm ghost block" id="skip-move" style="margin-top:8px">Bu hareketi atla</button>
      </div>
      <div id="done" class="celebrate" hidden>
        <div class="big">🎉</div>
        <h2 id="praise"></h2>
        <p class="muted small" id="done-sub"></p>
        <div class="progress" style="margin:14px 0 4px"><i id="plan-bar"></i></div>
        <p class="tiny muted" id="plan-text"></p>
        <a class="btn primary block" href="#/" style="margin-top:14px">Ana sayfa</a>
      </div>
    </section>

    <section class="stack" id="howto">
      <h2>Nasıl yapılır?</h2>
      <ol class="steps" id="steps"></ol>
      <div id="extra" class="stack"></div>
      <div class="stack" id="anim-wrap">
        <h2>Animasyonlu gösterim</h2>
        <section class="stage" id="stage"></section>
      </div>
    </section>
  `;

  const $ = (id) => root.querySelector(`#${id}`);

  function listHtml() {
    const icon = { todo: '', active: '▶', done: '✓', skipped: '–' };
    return moves
      .map(
        (m, i) => `
        <li class="move ${status[i]}">
          <span class="move-no">${icon[status[i]] || i + 1}</span>
          <div class="mini-fig">${renderFigure(m, { still: true })}</div>
          <div class="grow"><b>${esc(m.name)}</b><span class="tiny muted">${formatDuration(m.durationSec)} · ${m.areas.map((a) => AREA_LABELS[a]).join(', ')}</span></div>
        </li>`,
      )
      .join('');
  }

  const stageInner = (m) =>
    `<span class="sparkle" style="top:14px;left:18px">✨</span><span class="sparkle" style="top:40px;right:22px;animation-delay:1s">💗</span>${renderFigure(m)}`;

  function showMove(i, { upcoming = false } = {}) {
    const m = moves[i];
    // Üstte hareketin YouTube videosu; videosu yoksa animasyon üstte kalır.
    if (m.youtube?.id) {
      $('media').innerHTML = `
        <div class="video" id="video" data-yt="${esc(m.youtube.id)}" data-start="${Number(m.youtube.start) || 0}">
          <img src="https://i.ytimg.com/vi/${esc(m.youtube.id)}/hqdefault.jpg" alt="" referrerpolicy="no-referrer">
          <button type="button" aria-label="${esc(m.name)} videosunu oynat"><span></span></button>
        </div>
        <p class="tiny muted">${esc(m.youtube.channel)} · İngilizce anlatım</p>`;
      $('stage').innerHTML = stageInner(m);
      $('anim-wrap').hidden = false;
    } else {
      $('media').innerHTML = `<section class="stage">${stageInner(m)}</section>`;
      $('anim-wrap').hidden = true;
    }
    $('name').textContent = m.name;
    $('next-label').hidden = !upcoming;
    $('next-label').textContent = 'SIRADAKİ HAREKET';
    $('chips').innerHTML = `<span class="chip pink">⏱ ${formatDuration(m.durationSec)}</span>${m.areas.map((a) => `<span class="chip">${AREA_LABELS[a]}</span>`).join('')}`;
    $('counter').textContent = `${i + 1} / ${moves.length}`;
    $('steps').innerHTML = m.steps.map((st) => `<li><span>${esc(st.text)}</span><span class="sec">${st.sec} sn</span></li>`).join('');
    $('extra').innerHTML =
      (m.tips?.length ? `<div class="card soft"><h3>💡 İpucu</h3><p class="small">${esc(m.tips[0])}</p></div>` : '') +
      (m.caution ? `<div class="notice">⚠️ ${esc(m.caution)}</div>` : '');
  }

  function elapsedBefore(i) {
    return moves.slice(0, i).reduce((a, m) => a + m.durationSec, 0);
  }

  function tickUi({ remaining, stepProgress }, base, playerRef) {
    $('remain').textContent = remaining;
    $('ring').style.strokeDashoffset = String(CIRC * stepProgress);
    const el = base + (playerRef?.elapsed ?? 0);
    $('total').style.width = `${Math.min(100, (el / total) * 100)}%`;
  }

  function playMove(i) {
    idx = i;
    status[i] = 'active';
    showMove(i);
    const m = moves[i];
    const steps = [...root.querySelectorAll('#steps li')];
    player?.destroy();
    const p = new Player(m.steps, {
      sound,
      audio,
      manageWakeLock: false,
      startChime: true,
      onStep: (k) => {
        steps.forEach((li, j) => {
          li.classList.toggle('active', j === k);
          li.classList.toggle('done', j < k);
        });
        $('step-no').textContent = `Adım ${k + 1} / ${m.steps.length}`;
        $('now').textContent = m.steps[k].text;
      },
      onTick: (t) => tickUi(t, elapsedBefore(i), p),
      onDone: () => finishMove(i, 'done'),
    });
    player = p;
    $('toggle').textContent = 'Duraklat ⏸';
    $('skip-step').disabled = false;
    p.start();
    p.emit();
  }

  function finishMove(i, result) {
    if (status[i] === 'done' || status[i] === 'skipped') return;
    status[i] = result;
    if (result === 'done') markDone([moves[i].id]).catch(() => {});
    player?.destroy();
    const next = i + 1;
    if (next >= moves.length) return finishSession();
    transition(next);
  }

  function transition(next) {
    showMove(next, { upcoming: true });
    $('step-no').textContent = 'Kısa nefes';
    $('now').textContent = `Sıradaki: ${moves[next].name}`;
    $('skip-step').disabled = false;
    const p = new Player([{ text: 'hazırlan', sec: TRANSITION_SEC }], {
      sound,
      audio,
      manageWakeLock: false,
      startChime: false,
      onTick: (t) => tickUi(t, elapsedBefore(next), null),
      onDone: () => playMove(next),
    });
    player = p;
    p.start();
    p.emit();
    idx = next;
  }

  function finishSession() {
    finished = true;
    releaseLock();
    const doneCount = status.filter((s) => s === 'done').length;
    $('live').hidden = true;
    $('done').hidden = false;
    $('howto').hidden = true;
    $('next-label').hidden = true;
    $('name').textContent = 'Seans tamam';
    $('chips').innerHTML = '';
    // Seans bitti: üstteki videoyu (oynuyorsa durdurarak) kutlama görseliyle değiştir.
    $('media').innerHTML = `<section class="stage">${stageInner(moves[moves.length - 1])}</section>`;
    $('praise').textContent = doneCount ? PRAISE[Math.floor(Math.random() * PRAISE.length)] : 'Bir dahaki sefere 💕';
    $('done-sub').textContent = `${moves.length} hareketin ${doneCount} tanesini yaptın.`;
    // Günlük program durumu (markDone yerel kopyayı hemen güncelledi)
    const u = store.user;
    const now = new Date();
    const plan = dailyPlan(u, store.stretches, localParts(now, u.timezone).dateKey);
    const rem = remainingOf(plan, doneToday(u, now)).length;
    const pct = plan.length ? Math.round(((plan.length - rem) / plan.length) * 100) : 100;
    $('plan-bar').style.width = `${pct}%`;
    $('plan-text').textContent = rem ? `Bugünkü program: ${plan.length - rem} / ${plan.length} hareket` : 'Bugünkü programı tamamladın 👑';
    if (doneCount) hearts();
  }

  async function lock() {
    try {
      if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen');
    } catch {
      /* desteklenmiyor */
    }
  }
  function releaseLock() {
    wakeLock?.release?.().catch?.(() => {});
    wakeLock = null;
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible' && !finished && player?.running) {
      wakeLock = null;
      lock();
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  // --- başlangıç durumu ---
  showMove(0);
  $('plan-list').innerHTML = listHtml();

  $('start').addEventListener('click', () => {
    // Ses ve ekran kilidi dokunuşun içinde açılmalı (iOS).
    try {
      audio = sound ? new (window.AudioContext || window.webkitAudioContext)() : null;
      audio?.resume?.();
    } catch {
      audio = null;
    }
    lock();
    $('idle').hidden = true;
    $('live').hidden = false;
    playMove(0);
  });
  // Üstteki videoya dokununca: sayfa içinde oynat, seans akıyorsa duraklat.
  $('media').addEventListener('click', (e) => {
    const box = e.target.closest('#video');
    if (!box || !e.target.closest('button')) return;
    box.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(box.dataset.yt)}?autoplay=1&playsinline=1&rel=0&modestbranding=1&start=${Number(box.dataset.start) || 0}" title="Video" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
    if (player?.running) {
      player.pause();
      $('toggle').textContent = 'Devam ▶️';
      toast('Seans duraklatıldı. Video bitince "Devam"a dokun 💕', 2600);
    }
  });

  $('toggle').addEventListener('click', () => {
    if (!player) return;
    const running = player.toggle();
    $('toggle').textContent = running ? 'Duraklat ⏸' : 'Devam ▶️';
  });
  $('skip-step').addEventListener('click', () => player?.next());
  $('skip-move').addEventListener('click', () => {
    if (status[idx] === 'active') finishMove(idx, 'skipped');
    else if (player) {
      // geçiş sırasında: sıradaki hareketi de atla
      player.destroy();
      status[idx] = 'skipped';
      if (idx + 1 >= moves.length) finishSession();
      else transition(idx + 1);
    }
    toast('Atlandı, sorun değil 💕', 1400);
  });
  $('sound').addEventListener('click', () => {
    sound = !sound;
    if (player) player.sound = sound;
    if (sound && !audio) {
      try {
        audio = new (window.AudioContext || window.webkitAudioContext)();
      } catch {
        audio = null;
      }
    }
    $('sound').textContent = sound ? '🔔' : '🔕';
    try {
      localStorage.setItem('pm.sound', sound ? 'on' : 'off');
    } catch {
      /* yoksay */
    }
  });
  $('back').addEventListener('click', () => (history.length > 1 ? history.back() : navigate('#/')));

  return () => {
    player?.destroy();
    releaseLock();
    audio?.close?.();
    document.removeEventListener('visibilitychange', onVisible);
  };
}
