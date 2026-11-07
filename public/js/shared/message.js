// Bildirim metni üretimi. Saf fonksiyonlar.
import { withDefaults } from './defaults.js';

export function formatDuration(sec) {
  const s = Math.round(Number(sec) || 0);
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} dk ${r} sn` : `${m} dk`;
}

export function fill(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

function choose(list, rng) {
  return list[Math.floor(rng() * list.length) % list.length];
}

/**
 * @param {object} user  Firestore kullanıcı dokümanı
 * @param {{id:string, name:string, areas:string[], durationSec:number}} stretch
 * @param {{titles:string[], generic:string[], byArea:Record<string,string[]>}} templates
 */
export function buildNotification(user, stretch, templates, rng = Math.random) {
  const { nickname } = withDefaults(user);
  const vars = {
    nick: nickname,
    stretch: stretch.name,
    dur: formatDuration(stretch.durationSec),
  };
  const areaPool = stretch.areas.flatMap((a) => templates.byArea?.[a] ?? []);
  // Bölgeye özel mesajlar biraz daha sık çıksın.
  const pool = [...areaPool, ...areaPool, ...templates.generic];
  return {
    title: fill(choose(templates.titles, rng), vars),
    body: fill(choose(pool, rng), vars),
    url: `/#/stretch/${stretch.id}`,
    tag: 'stretch-reminder',
    stretchId: stretch.id,
  };
}
