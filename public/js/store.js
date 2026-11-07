// Uygulama durumu: kullanıcı ayarları (Firestore + yerel yedek), hareket verisi.
import { withDefaults } from './shared/defaults.js';
import { localParts } from './shared/schedule.js';
import { doneToday } from './shared/plan.js';
import { initFirebase, loadUserDoc, saveUserDoc, getUid } from './firebase.js';
import { recordStretch } from './stats.js';

const LOCAL_KEY = 'pm.user.v1';

function localLoad() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}');
  } catch {
    return {};
  }
}

function localSave(user) {
  try {
    const { pushSubscription, ...rest } = user;
    localStorage.setItem(LOCAL_KEY, JSON.stringify(rest));
  } catch {
    /* depolama yok */
  }
}

/** Firestore Timestamp → ms (yerel kopyada sayı tutarız). */
function plain(doc) {
  const out = {};
  for (const [k, v] of Object.entries(doc || {})) {
    out[k] = v && typeof v.toMillis === 'function' ? v.toMillis() : v;
  }
  return out;
}

export const store = {
  user: withDefaults(localLoad()),
  remote: false, // Firestore bağlantısı var mı
  remoteError: null,
  uid: null,
  stretches: [],
  byId: new Map(),
  messages: null,
};

export async function loadData() {
  const [stretches, messages] = await Promise.all([
    fetch('/data/stretches.json').then((r) => r.json()),
    fetch('/data/messages.json').then((r) => r.json()),
  ]);
  store.stretches = stretches;
  store.byId = new Map(stretches.map((s) => [s.id, s]));
  store.messages = messages;
}

export async function initStore() {
  try {
    const fb = await initFirebase();
    if (!fb) return;
    store.uid = getUid();
    const doc = await loadUserDoc();
    store.remote = true;
    if (doc) {
      store.user = withDefaults({ ...localLoad(), ...plain(doc) });
      localSave(store.user);
    }
  } catch (err) {
    console.error('Firebase başlatılamadı', err);
    store.remoteError = err?.code || err?.message || String(err);
  }
}

/**
 * Ayarları günceller. 'now' → şimdiki zaman, Date → zaman damgası.
 * Yerelde hemen uygulanır, Firestore'a arka planda yazılır.
 */
export async function updateUser(partial, opts = {}) {
  const local = {};
  for (const [k, v] of Object.entries(partial)) {
    if (v === 'now') local[k] = Date.now();
    else if (v instanceof Date) local[k] = v.getTime();
    else local[k] = v;
  }
  store.user = withDefaults({ ...store.user, ...local });
  localSave(store.user);
  if (store.remote) {
    try {
      await saveUserDoc(partial, opts);
    } catch (err) {
      console.error('Kaydedilemedi', err);
      throw err;
    }
  }
}

/**
 * Tamamlanan hareketleri bugünün programına işler (Firestore'a da yazılır; sunucu
 * kalan seans yükünü buradan hesaplar). Yerel seri istatistiğini de günceller.
 */
export async function markDone(ids) {
  if (!ids.length) return;
  const tz = store.user.timezone;
  const now = new Date();
  const date = localParts(now, tz).dateKey;
  const done = [...doneToday(store.user, now), ...ids].slice(-200);
  for (const id of ids) recordStretch(id, tz);
  await updateUser({ progress: { date, done }, lastStretchAt: 'now' });
}

/** Karşılama tamamlandığında tüm ayarları tek seferde yazar. */
export async function saveAllSettings(extra = {}) {
  const u = store.user;
  const create = !u.createdAt;
  await updateUser(
    {
      nickname: u.nickname,
      timezone: u.timezone,
      intervalMin: u.intervalMin,
      startTime: u.startTime,
      endTime: u.endTime,
      days: u.days,
      focusAreas: u.focusAreas,
      enabled: u.enabled,
      ...extra,
    },
    { create },
  );
  if (create) {
    store.user.createdAt = Date.now();
    localSave(store.user);
  }
}
