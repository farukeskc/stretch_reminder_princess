// Günlük program ve seans oluşturma. Saf fonksiyonlar: tarayıcı ve Node aynı dosyayı kullanır.
//
// Model:
//  • Seans boyutu hatırlatma aralığına bağlıdır: saatte ~MOVES_PER_HOUR hareket
//    (2 saat → 6, 1,5 saat → 5, 1 saat → 3, 30–45 dk → 2). Böylece aralık değişse de
//    günlük toplam yaklaşık aynı kalır.
//  • Günlük hedef = (bugünkü seans sayısı) × seans boyutu.
//  • Ağrıyan bölgelerin her hareketi programa FOCUS_REPS kez girer; kalan yer diğer
//    bölgelerden çeşitli hareketlerle dolar. Program gün + ayarlara göre sabittir
//    (aynı gün içinde sunucu ve uygulama aynı programı hesaplar).
//  • Her seansın yükü = kalan hareket ÷ kalan seans (seans boyutu −3 … +3 arası).
//    Seans atlanırsa yapılmayan hareketler kalan seanslara dağılır, yük artar.
//  • Program her gün sıfırlanır.
import { withDefaults } from './defaults.js';
import { localParts, parseHM, toMs, TOLERANCE_MIN } from './schedule.js';
import { pickStretch } from './pick.js';

export const MOVES_PER_HOUR = 3;
export const FOCUS_REPS = 2;
const BASE_MIN = 2;
const BASE_MAX = 6;
const CATCHUP_EXTRA = 3; // telafide seans boyutunun en fazla bu kadar üstüne çıkılır

/**
 * Seans boyutu sınırları.
 * @returns {{ base:number, min:number, max:number }}  base: normal seans, min/max: telafi aralığı
 */
export function loadLimits(rawUser) {
  const u = withDefaults(rawUser);
  const base = Math.min(BASE_MAX, Math.max(BASE_MIN, Math.round((u.intervalMin * MOVES_PER_HOUR) / 60)));
  return { base, min: Math.max(BASE_MIN, base - CATCHUP_EXTRA), max: base + CATCHUP_EXTRA };
}

/** Seans içi sıralama: baştan aşağı. */
export const AREA_ORDER = ['boyun', 'omuz', 'sirt', 'bel', 'bilek', 'kalca', 'bacak', 'goz'];

// --- deterministik rastgelelik (gün bazlı) ---
function hashStr(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
export function seededRng(seed) {
  let a = hashStr(String(seed));
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const k = Math.floor(rng() * (i + 1));
    [a[i], a[k]] = [a[k], a[i]];
  }
  return a;
}

/** Bir iş gününde planlanan seans sayısı (ilk seans mesai başı + aralıkta). */
export function sessionsPerDay(rawUser) {
  const u = withDefaults(rawUser);
  const s = parseHM(u.startTime);
  const e = parseHM(u.endTime);
  if (s == null || e == null || e <= s) return 1;
  return Math.max(1, Math.ceil((e - s) / u.intervalMin) - 1);
}

/** Bu andan gün sonuna kadar (bu an dahil) kalan seans sayısı. Mesai dışında 0. */
export function sessionsLeft(rawUser, now = new Date()) {
  const u = withDefaults(rawUser);
  const s = parseHM(u.startTime);
  const e = parseHM(u.endTime);
  if (s == null || e == null || e <= s) return 0;
  const { dow, minutes } = localParts(now, u.timezone);
  if (!u.days.includes(dow) || minutes >= e) return 0;
  if (minutes < s + u.intervalMin - TOLERANCE_MIN) return sessionsPerDay(u);
  return Math.min(sessionsPerDay(u), Math.floor((e - minutes - 1) / u.intervalMin) + 1);
}

export function focusIds(rawUser, stretches) {
  const focus = new Set(withDefaults(rawUser).focusAreas);
  return stretches.filter((s) => s.areas.some((a) => focus.has(a))).map((s) => s.id);
}

/**
 * Bugün kaç seans planlanır? Normalde sessionsPerDay; ama uygulama bugün kurulduysa
 * yalnızca kurulumdan sonraki seanslar sayılır (ilk gün "geride kalmış" başlamasın).
 */
export function plannedSessions(rawUser, dateKey) {
  const u = withDefaults(rawUser);
  const isoDow = ((new Date(`${dateKey}T12:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = Pazartesi
  if (!u.days.includes(isoDow)) return 0; // izin günü: program yok
  const created = toMs(u.createdAt);
  if (created) {
    const at = new Date(created);
    if (localParts(at, u.timezone).dateKey === dateKey) return sessionsLeft(u, at);
  }
  return sessionsPerDay(u);
}

/** Günün programı: hareket kimliklerinden oluşan çoklu küme (tekrarlar olabilir). */
export function dailyPlan(rawUser, stretches, dateKey) {
  const u = withDefaults(rawUser);
  const target = plannedSessions(u, dateKey) * loadLimits(u).base;
  const rng = seededRng(`${dateKey}|${[...u.focusAreas].sort().join(',')}`);
  const F = shuffle(focusIds(u, stretches), rng);
  const fset = new Set(F);
  const O = shuffle(stretches.map((s) => s.id).filter((id) => !fset.has(id)), rng);
  const plan = [];
  for (let r = 0; r < FOCUS_REPS; r++) for (const id of F) if (plan.length < target) plan.push(id);
  const fill = O.length ? O : F;
  for (let i = 0; plan.length < target && fill.length; i++) plan.push(fill[i % fill.length]);
  return plan;
}

/** Bugün tamamlanan hareketler (progress başka güne aitse boş). */
export function doneToday(rawUser, now = new Date()) {
  const u = withDefaults(rawUser);
  const { dateKey } = localParts(now, u.timezone);
  return u.progress?.date === dateKey && Array.isArray(u.progress.done) ? u.progress.done : [];
}

/** plan − yapılanlar (çoklu küme farkı). */
export function remainingOf(plan, done) {
  const counts = new Map();
  for (const id of done) counts.set(id, (counts.get(id) || 0) + 1);
  const out = [];
  for (const id of plan) {
    const c = counts.get(id) || 0;
    if (c > 0) counts.set(id, c - 1);
    else out.push(id);
  }
  return out;
}

/**
 * Bir seans oluşturur.
 * @returns {{ ids:string[], load:number, behind:boolean, complete:boolean, planTotal:number,
 *             doneCount:number, remainingCount:number, sessionsLeft:number, dateKey:string }}
 */
export function composeSession(rawUser, stretches, { now = new Date(), done, lastIds = [], rng = Math.random } = {}) {
  const user = withDefaults(rawUser);
  const { dateKey } = localParts(now, user.timezone);
  const doneList = done ?? doneToday(user, now);
  const plan = dailyPlan(user, stretches, dateKey);
  const remaining = remainingOf(plan, doneList);
  const left = sessionsLeft(user, now);
  const lim = loadLimits(user);
  const need = left > 0 ? Math.ceil(remaining.length / left) : lim.base;
  const noPlan = plan.length === 0; // izin günü ya da kurulum günü mesai bitmiş
  const complete = !noPlan && remaining.length === 0;
  const load = noPlan ? lim.base : complete ? lim.min : Math.min(lim.max, Math.max(lim.min, need));

  const byId = new Map(stretches.map((s) => [s.id, s]));
  const fset = new Set(focusIds(user, stretches));
  const counts = new Map();
  for (const id of remaining) counts.set(id, (counts.get(id) || 0) + 1);
  const last = new Set(lastIds);
  // Öncelik her zaman kalan tekrar sayısı (yoksa aynı hareketin 2 kopyası son seansa kalır ve
  // bir seansa aynı hareket iki kez konamayacağı için program bitemez). Eşitlikte: önceki
  // seansta olan geriye düşer (arka arkaya tekrar etmesin), sonra rastgele.
  const score = new Map([...counts.keys()].map((id) => [id, counts.get(id) * 100 - (last.has(id) ? 25 : 0) + rng()]));

  const chosen = [];
  const usedAreas = new Set();
  const take = (pool, want) => {
    const n = Math.min(want, load - chosen.length); // seans kapasitesini asla aşma
    const ranked = pool.filter((id) => !chosen.includes(id)).sort((a, b) => score.get(b) - score.get(a));
    let added = 0;
    for (const strictArea of [true, false]) {
      for (const id of ranked) {
        if (added >= n) return;
        if (chosen.includes(id)) continue;
        const area = byId.get(id)?.areas[0];
        if (strictArea && usedAreas.has(area)) continue;
        chosen.push(id);
        usedAreas.add(area);
        added++;
      }
    }
  };

  const ids = [...counts.keys()];

  // 1) Zorunlu hareketler: kalan tekrar sayısı ≥ kalan seans sayısı olanlar bu seansa
  //    girmek ZORUNDA (her seansta en fazla bir kez yapılabildikleri için). Bu kural,
  //    kapasite yettiği sürece programın gün içinde bitmesini garanti eder.
  if (left > 0) {
    const must = ids.filter((id) => counts.get(id) >= left).sort((a, b) => score.get(b) - score.get(a));
    for (const id of must) {
      if (chosen.length >= load) break;
      chosen.push(id);
      usedAreas.add(byId.get(id)?.areas[0]);
    }
  }

  // 2) Kalan yer: ağrı hareketlerine oranına göre (yukarı yuvarlanmış) kota, farklı bölgeler.
  const fPool = ids.filter((id) => fset.has(id));
  const oPool = ids.filter((id) => !fset.has(id));
  const fRem = remaining.filter((id) => fset.has(id)).length;
  const fQuota = remaining.length ? Math.min(fPool.length, Math.ceil((load * fRem) / remaining.length)) : 0;
  take(fPool, fQuota - chosen.filter((id) => fset.has(id)).length);
  take(oPool, load - chosen.length);
  take(fPool, load - chosen.length);

  // Program bittiyse ya da yetmiyorsa: bonus/dolgu hareketleri.
  while (chosen.length < load && chosen.length < stretches.length) {
    const pool = stretches.filter((s) => !chosen.includes(s.id));
    chosen.push(pickStretch(pool, { focusAreas: user.focusAreas, recentIds: lastIds, rng }).id);
  }

  const orderOf = (id) => AREA_ORDER.indexOf(byId.get(id)?.areas[0] ?? 'goz');
  chosen.sort((a, b) => orderOf(a) - orderOf(b));

  return {
    ids: chosen,
    load,
    behind: !complete && !noPlan && left > 0 && need > lim.base,
    complete,
    noPlan,
    planTotal: plan.length,
    doneCount: plan.length - remaining.length,
    remainingCount: remaining.length,
    sessionsLeft: left,
    dateKey,
  };
}

/** Seansın toplam süresi (sn). */
export function sessionDuration(ids, stretches) {
  const byId = new Map(stretches.map((s) => [s.id, s]));
  return ids.reduce((a, id) => a + (byId.get(id)?.durationSec || 0), 0);
}
