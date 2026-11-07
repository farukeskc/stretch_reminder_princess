// Karşılama ve Ayarlar ekranlarının paylaştığı form parçaları.
import { AREAS, DAY_LABELS, INTERVAL_OPTIONS } from '../shared/defaults.js';
import { parseHM } from '../shared/schedule.js';
import { esc, bindChoices } from '../ui.js';

const pressed = (on) => `aria-pressed="${on ? 'true' : 'false'}"`;

export function nicknameHtml(user) {
  return `
    <div class="field">
      <label for="nick">Sana nasıl hitap edelim?</label>
      <input id="nick" class="input" maxlength="30" autocomplete="off" value="${esc(user.nickname)}" placeholder="Prensesim">
    </div>`;
}

export function scheduleHtml(user) {
  return `
    <div class="stack">
      <div class="field">
        <span class="label">Ne sıklıkla hatırlatalım?</span>
        <div class="choices" id="interval">
          ${INTERVAL_OPTIONS.map((m) => `<button type="button" class="choice" data-value="${m}" ${pressed(user.intervalMin === m)}>${m < 60 ? `${m} dk` : m % 60 ? `${Math.floor(m / 60)},5 saat` : `${m / 60} saat`}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <span class="label">Hangi saatler arasında?</span>
        <div class="time-row">
          <input type="time" id="start" class="input" value="${esc(user.startTime)}" step="900" aria-label="Başlangıç saati">
          <input type="time" id="end" class="input" value="${esc(user.endTime)}" step="900" aria-label="Bitiş saati">
        </div>
        <p class="tiny muted" id="hours-hint"></p>
      </div>
      <div class="field">
        <span class="label">Hangi günler?</span>
        <div class="choices days" id="days">
          ${DAY_LABELS.map((d) => `<button type="button" class="choice day" data-value="${d.id}" ${pressed(user.days.includes(d.id))} aria-label="${d.long}">${d.short}</button>`).join('')}
        </div>
      </div>
    </div>`;
}

export function areasHtml(user) {
  return `
    <div class="field">
      <span class="label">Nerelerin ağrıyor ya da yoruluyor?</span>
      <p class="tiny muted">Seçtiğin bölgelerin hareketleri günlük programına her gün 2 kez girer ve öncelikli tamamlanır.</p>
      <div class="choices" id="areas">
        ${AREAS.map((a) => `<button type="button" class="choice" data-value="${a.id}" ${pressed(user.focusAreas.includes(a.id))}>${a.label}</button>`).join('')}
      </div>
    </div>`;
}

/** Form olaylarını bağlar; her değişiklikte onChange(partial) çağrılır. */
export function bindControls(root, onChange) {
  const nick = root.querySelector('#nick');
  if (nick) {
    nick.addEventListener('input', () => {
      const v = nick.value.trim();
      if (v) onChange({ nickname: v.slice(0, 30) });
    });
  }
  const interval = root.querySelector('#interval');
  if (interval) bindChoices(interval, { onChange: (v) => onChange({ intervalMin: Number(v) }) });

  const start = root.querySelector('#start');
  const end = root.querySelector('#end');
  const hint = root.querySelector('#hours-hint');
  const onTime = () => {
    const s = parseHM(start.value);
    const e = parseHM(end.value);
    if (s == null || e == null || e <= s) {
      hint.textContent = 'Bitiş saati başlangıçtan sonra olmalı.';
      return;
    }
    hint.textContent = '';
    onChange({ startTime: start.value, endTime: end.value });
  };
  start?.addEventListener('change', onTime);
  end?.addEventListener('change', onTime);

  const days = root.querySelector('#days');
  if (days) bindChoices(days, { multi: true, onChange: (v) => onChange({ days: v.map(Number).sort() }) });

  const areas = root.querySelector('#areas');
  if (areas) bindChoices(areas, { multi: true, onChange: (v) => onChange({ focusAreas: v }) });
}
