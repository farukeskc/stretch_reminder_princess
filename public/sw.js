// Servis çalışanı: çevrimdışı önbellek + Web Push bildirimleri.
// Uygulama dosyalarını değiştirdiğinde CACHE sürümünü artır.
const CACHE = 'prenses-v3';

const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/css/app.css',
  '/css/figure.css',
  '/js/app.js',
  '/js/config.js',
  '/js/firebase.js',
  '/js/figure.js',
  '/js/install.js',
  '/js/player.js',
  '/js/push.js',
  '/js/stats.js',
  '/js/store.js',
  '/js/ui.js',
  '/js/shared/defaults.js',
  '/js/shared/message.js',
  '/js/shared/pick.js',
  '/js/shared/plan.js',
  '/js/shared/schedule.js',
  '/js/views/controls.js',
  '/js/views/home.js',
  '/js/views/install.js',
  '/js/views/library.js',
  '/js/views/onboarding.js',
  '/js/views/session.js',
  '/js/views/settings.js',
  '/js/views/stretch.js',
  '/data/stretches.json',
  '/data/messages.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

const CACHEABLE_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'www.gstatic.com', 'i.ytimg.com'];

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // Sayfa gezintisi: önce ağ, olmazsa önbellekteki index.html
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copy));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  // Firebase/Firestore API çağrılarına dokunma.
  if (!sameOrigin && !CACHEABLE_HOSTS.includes(url.hostname)) return;

  // Diğerleri: önbellekten hemen ver, arkada güncelle.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(req);
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});

// --- Push ---
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  // iOS: her push mutlaka görünür bir bildirim göstermeli, yoksa abonelik iptal edilir.
  const title = data.title || 'Esneme zamanı 💕';
  const options = {
    body: data.body || 'Minik bir mola ver, vücudun sana teşekkür edecek ✨',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: data.tag || 'stretch-reminder',
    renotify: true,
    data: { url: data.url || '/#/' },
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.navigator.setAppBadge ? self.navigator.setAppBadge(1).catch(() => {}) : Promise.resolve(),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/#/', self.location.origin).href;
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of all) {
        if (new URL(client.url).origin === self.location.origin) {
          await client.focus();
          client.postMessage({ type: 'navigate', url: target });
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});

// Tarayıcı aboneliği kendiliğinden yenilerse (nadiren) uygulama açılışta yeniden eşitler.
self.addEventListener('pushsubscriptionchange', () => {});
