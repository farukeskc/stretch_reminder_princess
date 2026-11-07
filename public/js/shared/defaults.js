// Hem tarayıcıda hem de Node (GitHub Actions) tarafında kullanılan ortak sabitler.
// DOM ya da Firebase'e bağımlı olmamalı.

export const DEFAULT_SETTINGS = Object.freeze({
  nickname: 'Prensesim',
  timezone: 'Europe/Istanbul',
  intervalMin: 120,
  startTime: '09:00',
  endTime: '18:00',
  days: [1, 2, 3, 4, 5], // ISO: 1 = Pazartesi … 7 = Pazar
  focusAreas: [],
  enabled: true,
});

export const INTERVAL_OPTIONS = [30, 45, 60, 90, 120];

export const AREAS = [
  { id: 'boyun', label: 'Boyun' },
  { id: 'omuz', label: 'Omuz' },
  { id: 'sirt', label: 'Sırt' },
  { id: 'bel', label: 'Bel' },
  { id: 'bilek', label: 'Bilek & El' },
  { id: 'kalca', label: 'Kalça' },
  { id: 'bacak', label: 'Bacak' },
  { id: 'goz', label: 'Göz' },
];

export const AREA_LABELS = Object.fromEntries(AREAS.map((a) => [a.id, a.label]));

export const DAY_LABELS = [
  { id: 1, short: 'Pzt', long: 'Pazartesi' },
  { id: 2, short: 'Sal', long: 'Salı' },
  { id: 3, short: 'Çar', long: 'Çarşamba' },
  { id: 4, short: 'Per', long: 'Perşembe' },
  { id: 5, short: 'Cum', long: 'Cuma' },
  { id: 6, short: 'Cmt', long: 'Cumartesi' },
  { id: 7, short: 'Paz', long: 'Pazar' },
];

/** Kullanıcı dokümanını varsayılanlarla birleştirir. */
export function withDefaults(user = {}) {
  const out = { ...DEFAULT_SETTINGS, ...user };
  if (!Array.isArray(out.days)) out.days = [...DEFAULT_SETTINGS.days];
  if (!Array.isArray(out.focusAreas)) out.focusAreas = [];
  if (!out.nickname || !String(out.nickname).trim()) out.nickname = DEFAULT_SETTINGS.nickname;
  return out;
}
