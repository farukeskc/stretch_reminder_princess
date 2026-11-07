// Hatırlatma için esneme hareketi seçimi. Saf fonksiyon.

export const AVOID_LAST = 4;
export const RECENT_KEEP = 6;
const FOCUS_WEIGHT = 3;

/**
 * Ağrıyan bölgelere ağırlık vererek, son birkaç hareketi tekrarlamadan bir hareket seçer.
 * @param {Array<{id:string, areas:string[]}>} stretches
 * @param {{ focusAreas?: string[], recentIds?: string[], rng?: () => number }} opts
 */
export function pickStretch(stretches, { focusAreas = [], recentIds = [], rng = Math.random } = {}) {
  if (!stretches?.length) throw new Error('Hareket listesi boş');
  const recent = new Set(recentIds.slice(-AVOID_LAST));
  let pool = stretches.filter((s) => !recent.has(s.id));
  if (!pool.length) pool = stretches;

  const focus = new Set(focusAreas);
  const weights = pool.map((s) => (s.areas.some((a) => focus.has(a)) ? FOCUS_WEIGHT : 1));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** Son gönderilen hareket listesine yenisini ekler (en yeni sonda). */
export function pushRecent(recentIds = [], id) {
  return [...recentIds.filter((x) => x !== id), id].slice(-RECENT_KEEP);
}
