// Bildirim metni üretimi. Saf fonksiyonlar.
import { withDefaults } from './defaults.js';

export function formatDuration(sec) {
  const s = Math.round(Number(sec) || 0);
  if (s < 60) return `${s} sn`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} dk ${r} sn` : `${m} dk`;
}

/** Bildirim için kısa süre: "45 sn", "~2 dk". */
export function approxDuration(sec) {
  const s = Math.round(Number(sec) || 0);
  if (s < 60) return `${s} sn`;
  return `~${Math.max(1, Math.round(s / 60))} dk`;
}

export function fill(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? `{${k}}`));
}

function choose(list, rng) {
  return list[Math.floor(rng() * list.length) % list.length];
}

/** "A ve B" / "A, B +2" */
export function listNames(names) {
  if (names.length <= 2) return names.join(' ve ');
  return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
}

/**
 * Seans bildirimi.
 * @param {object} user  Firestore kullanıcı dokümanı
 * @param {{ids:string[], behind:boolean, complete:boolean}} session  composeSession() çıktısı
 * @param {Map<string, {name:string, durationSec:number}>} byId
 * @param {{titles:string[], session:string[], catchup:string[], bonus:string[]}} templates
 */
export function buildSessionNotification(user, session, byId, templates, rng = Math.random) {
  const { nickname } = withDefaults(user);
  const moves = session.ids.map((id) => byId.get(id)).filter(Boolean);
  const total = moves.reduce((a, m) => a + m.durationSec, 0);
  const vars = {
    nick: nickname,
    count: moves.length,
    list: listNames(moves.map((m) => m.name)),
    dur: approxDuration(total),
  };
  const pool = session.complete ? templates.bonus : session.behind ? templates.catchup : templates.session;
  return {
    title: fill(choose(templates.titles, rng), vars),
    body: fill(choose(pool, rng), vars),
    url: `/#/seans/${session.ids.join(',')}`,
    tag: 'stretch-reminder',
    ids: session.ids,
  };
}
