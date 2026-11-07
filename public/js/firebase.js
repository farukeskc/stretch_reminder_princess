// Firebase: anonim giriş + kullanıcı dokümanı (users/{uid}).
import { firebaseConfig, isFirebaseConfigured, FIREBASE_SDK_VERSION } from './config.js';

const CDN = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;

let api = null; // { auth, db, fs, uid }

/** Firebase'i başlatır ve anonim oturum açar. Yapılandırılmamışsa null döner. */
export async function initFirebase() {
  if (api) return api;
  if (!isFirebaseConfigured()) return null;
  const [{ initializeApp }, authMod, fs] = await Promise.all([
    import(`${CDN}/firebase-app.js`),
    import(`${CDN}/firebase-auth.js`),
    import(`${CDN}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = authMod.getAuth(app);
  const db = fs.getFirestore(app);

  const user = await new Promise((resolve) => {
    const off = authMod.onAuthStateChanged(auth, (u) => {
      off();
      resolve(u);
    });
  });
  const uid = user ? user.uid : (await authMod.signInAnonymously(auth)).user.uid;
  api = { auth, db, fs, uid };
  return api;
}

export function getUid() {
  return api?.uid ?? null;
}

function ref() {
  return api.fs.doc(api.db, 'users', api.uid);
}

/** Kullanıcı dokümanını okur (yoksa null). */
export async function loadUserDoc() {
  if (!api) return null;
  const snap = await api.fs.getDoc(ref());
  return snap.exists() ? snap.data() : null;
}

/**
 * Kısmi güncelleme (merge). Değer olarak Date verilirse Timestamp'e çevrilir,
 * 'now' sunucu zamanı olur, null alanı temizler.
 */
export async function saveUserDoc(partial, { create = false } = {}) {
  if (!api) return false;
  const { serverTimestamp, Timestamp, setDoc } = api.fs;
  const data = {};
  for (const [k, v] of Object.entries(partial)) {
    if (v === 'now') data[k] = serverTimestamp();
    else if (v instanceof Date) data[k] = Timestamp.fromDate(v);
    else data[k] = v;
  }
  data.updatedAt = serverTimestamp();
  if (create) data.createdAt = serverTimestamp();
  await setDoc(ref(), data, { merge: true });
  return true;
}
