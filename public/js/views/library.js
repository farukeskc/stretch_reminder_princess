// Hareket kütüphanesi: bölgeye göre filtre + kart ızgarası.
import { store } from '../store.js';
import { renderFigure } from '../figure.js';
import { AREAS, AREA_LABELS } from '../shared/defaults.js';
import { formatDuration } from '../shared/message.js';
import { esc, bindChoices } from '../ui.js';

const KEY = 'pm.filter';

export function libraryView(root) {
  let filter = 'all';
  try {
    filter = sessionStorage.getItem(KEY) || 'all';
  } catch {
    /* yoksay */
  }

  root.innerHTML = `
    <header class="stack" style="gap:4px">
      <h1>Hareketler 🌸</h1>
      <p class="muted">${store.stretches.length} masa başı esneme, hepsi oturduğun yerden.</p>
    </header>
    <div class="filter" id="filter">
      <button class="choice" data-value="all" aria-pressed="${filter === 'all'}">Tümü</button>
      ${AREAS.map((a) => `<button class="choice" data-value="${a.id}" aria-pressed="${filter === a.id}">${a.label}</button>`).join('')}
    </div>
    <div class="grid" id="grid"></div>
  `;

  const grid = root.querySelector('#grid');
  const draw = () => {
    const list = store.stretches.filter((s) => filter === 'all' || s.areas.includes(filter));
    grid.innerHTML = list
      .map(
        (s) => `
        <a class="tile" href="#/stretch/${s.id}">
          <div class="fig-wrap">${renderFigure(s, { still: true })}</div>
          <h3>${esc(s.name)}</h3>
          <span class="meta">${formatDuration(s.durationSec)} · ${s.areas.map((a) => AREA_LABELS[a]).join(', ')}</span>
        </a>`,
      )
      .join('');
  };
  draw();

  bindChoices(root.querySelector('#filter'), {
    onChange: (v) => {
      filter = v;
      try {
        sessionStorage.setItem(KEY, v);
      } catch {
        /* yoksay */
      }
      draw();
    },
  });
}
