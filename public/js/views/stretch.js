// Hareket detayı: animasyon, rehberli oturum, adımlar, video, tamamlama.
import { store, updateUser } from '../store.js';
import { renderFigure } from '../figure.js';
import { Player } from '../player.js';
import { recordStretch } from '../stats.js';
import { formatDuration } from '../shared/message.js';
import { AREA_LABELS } from '../shared/defaults.js';
import { clearBadge } from '../push.js';
import { esc, hearts, toast, BACK_ICON } from '../ui.js';

const CIRC = 2 * Math.PI * 42;
const PRAISE = ['Harikasın! 💖', 'Vücudun sana teşekkür ediyor ✨', 'Prensesler böyle mola verir 👑', 'Süpersin, böyle devam 🌸', 'Bir adım daha iyi hissediyorsun 💕'];

function soundPref() {
  try {
    return localStorage.getItem('pm.sound') !== 'off';
  } catch {
    return true;
  }
}

function videoHtml(s) {
  if (!s.youtube?.id) {
    const q = encodeURIComponent(`${s.name} esneme hareketi`);
    return `<a class="btn ghost block" href="https://www.youtube.com/results?search_query=${q}" target="_blank" rel="noopener">YouTube'da ara ↗</a>`;
  }
  return `
    <div class="video" id="video">
      <img src="https://i.ytimg.com/vi/${esc(s.youtube.id)}/hqdefault.jpg" alt="" loading="lazy" referrerpolicy="no-referrer">
      <button type="button" aria-label="Videoyu oynat"><span></span></button>
    </div>
    <p class="tiny muted">${esc(s.youtube.channel)} · İngilizce anlatım</p>`;
}

export function stretchView(root, params, { navigate }) {
  const s = store.byId.get(params[0]);
  if (!s) {
    root.innerHTML = `<div class="topbar"><a class="back" href="#/">${BACK_ICON}</a></div><p>Bu hareketi bulamadım 🙈</p>`;
    return;
  }
  clearBadge();
  let player = null;
  let done = false;
  let sound = soundPref();

  root.innerHTML = `
    <div class="topbar">
      <button class="back" id="back" aria-label="Geri">${BACK_ICON}</button>
    </div>

    <section class="stage">
      <span class="sparkle" style="top:14px;left:18px">✨</span>
      <span class="sparkle" style="top:40px;right:22px;animation-delay:1s">💗</span>
      <span class="sparkle" style="bottom:30px;left:26px;animation-delay:2s">🌸</span>
      ${renderFigure(s)}
    </section>

    <header class="stack" style="gap:8px">
      <h1>${esc(s.name)}</h1>
      <div class="chips">
        <span class="chip pink">⏱ ${formatDuration(s.durationSec)}</span>
        ${s.areas.map((a) => `<span class="chip">${AREA_LABELS[a]}</span>`).join('')}
      </div>
      <p class="muted">${esc(s.summary)}</p>
    </header>

    <section class="card" id="player-card">
      <div id="player-idle">
        <button class="btn primary block" id="start">Başla ▶️</button>
        <p class="tiny muted" style="text-align:center;margin-top:8px">Adımları sesli zil ve geri sayımla takip edebilirsin.</p>
      </div>
      <div id="player-live" hidden>
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
        <div class="row between" style="margin-top:12px">
          <button class="icon-btn" id="sound" aria-label="Sesi aç/kapat">${sound ? '🔔' : '🔕'}</button>
          <button class="btn sm ghost" id="toggle">Duraklat ⏸</button>
          <button class="btn sm ghost" id="skip">Sonraki ⏭</button>
        </div>
      </div>
      <div id="player-done" class="celebrate" hidden>
        <div class="big">🎉</div>
        <h2 id="praise"></h2>
        <p class="muted small">Bir sonraki hatırlatmaya kadar keyfine bak.</p>
        <div class="btn-row" style="margin-top:14px">
          <button class="btn ghost" id="again">Tekrar 🔁</button>
          <a class="btn primary" href="#/">Ana sayfa</a>
        </div>
      </div>
    </section>

    <section class="stack">
      <h2>Nasıl yapılır?</h2>
      <ol class="steps" id="steps">
        ${s.steps.map((st) => `<li><span>${esc(st.text)}</span><span class="sec">${st.sec} sn</span></li>`).join('')}
      </ol>
    </section>

    ${s.tips?.length ? `<section class="card soft stack"><h3>💡 İpuçları</h3><ul class="list-plain">${s.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
    ${s.caution ? `<div class="notice">⚠️ ${esc(s.caution)}</div>` : ''}

    <section class="stack">
      <h2>Videolu anlatım</h2>
      ${videoHtml(s)}
    </section>

    <button class="btn ghost block" id="mark">Kendi başıma yaptım, tamamlandı 💖</button>
  `;

  const $ = (id) => root.querySelector(`#${id}`);
  const items = [...root.querySelectorAll('#steps li')];

  async function complete() {
    if (done) return;
    done = true;
    recordStretch(s.id, store.user.timezone);
    hearts();
    $('mark').hidden = true;
    try {
      await updateUser({ lastStretchAt: 'now' });
    } catch {
      /* çevrimdışı olabilir */
    }
  }

  function showDone() {
    $('player-idle').hidden = true;
    $('player-live').hidden = true;
    $('player-done').hidden = false;
    $('praise').textContent = PRAISE[Math.floor(Math.random() * PRAISE.length)];
    items.forEach((li) => {
      li.classList.remove('active');
      li.classList.add('done');
    });
    complete();
  }

  function startPlayer() {
    player?.destroy();
    items.forEach((li) => li.classList.remove('active', 'done'));
    player = new Player(s.steps, {
      sound,
      onStep: (i) => {
        items.forEach((li, k) => {
          li.classList.toggle('active', k === i);
          li.classList.toggle('done', k < i);
        });
        $('step-no').textContent = `Adım ${i + 1} / ${s.steps.length}`;
        $('now').textContent = s.steps[i].text;
      },
      onTick: ({ remaining, stepProgress, totalProgress }) => {
        $('remain').textContent = remaining;
        $('ring').style.strokeDashoffset = String(CIRC * stepProgress);
        $('total').style.width = `${totalProgress * 100}%`;
      },
      onDone: showDone,
    });
    $('player-idle').hidden = true;
    $('player-done').hidden = true;
    $('player-live').hidden = false;
    $('toggle').textContent = 'Duraklat ⏸';
    player.start();
    player.emit();
  }

  $('back').addEventListener('click', () => (history.length > 1 ? history.back() : navigate('#/')));
  $('start').addEventListener('click', startPlayer);
  $('again').addEventListener('click', () => {
    done = true; // ikinci tekrar sayılmasın
    startPlayer();
  });
  $('toggle').addEventListener('click', () => {
    const running = player.toggle();
    $('toggle').textContent = running ? 'Duraklat ⏸' : 'Devam ▶️';
  });
  $('skip').addEventListener('click', () => player.next());
  $('sound').addEventListener('click', () => {
    sound = !sound;
    if (player) player.sound = sound;
    $('sound').textContent = sound ? '🔔' : '🔕';
    try {
      localStorage.setItem('pm.sound', sound ? 'on' : 'off');
    } catch {
      /* yoksay */
    }
  });
  $('mark').addEventListener('click', () => {
    complete();
    toast('Tamamlandı, aferin sana 💖');
  });

  const video = $('video');
  video?.querySelector('button').addEventListener('click', () => {
    const { id, start = 0 } = s.youtube;
    video.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(id)}?autoplay=1&playsinline=1&rel=0&modestbranding=1&start=${Number(start) || 0}" title="${esc(s.name)} videosu" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  });

  return () => player?.destroy();
}
