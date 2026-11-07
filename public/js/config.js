// ⚙️ Firebase ve Web Push ayarları. Kurulum için README.md dosyasına bak.
//
// 1) Firebase Console → Proje ayarları → "Uygulamaların" → Web uygulaması → yapılandırmayı
//    aşağıdaki firebaseConfig nesnesine yapıştır. (Bu değerler gizli değildir; güvenliği
//    Firestore kuralları sağlar.)
// 2) `npx web-push generate-vapid-keys` komutunun verdiği PUBLIC key'i VAPID_PUBLIC_KEY'e yaz.
//    PRIVATE key'i ASLA buraya yazma; o yalnızca GitHub Secrets'ta durur.

export const firebaseConfig = {
  apiKey: 'BURAYA_API_KEY',
  authDomain: 'PROJE_ID.firebaseapp.com',
  projectId: 'PROJE_ID',
  storageBucket: 'PROJE_ID.firebasestorage.app',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000',
};

export const VAPID_PUBLIC_KEY = 'BURAYA_VAPID_PUBLIC_KEY';

export const FIREBASE_SDK_VERSION = '12.19.0';

export const APP_VERSION = '1.0.0';

export function isFirebaseConfigured() {
  return !firebaseConfig.apiKey.startsWith('BURAYA') && !firebaseConfig.projectId.startsWith('PROJE_ID');
}

export function isVapidConfigured() {
  return !VAPID_PUBLIC_KEY.startsWith('BURAYA') && VAPID_PUBLIC_KEY.length > 40;
}
