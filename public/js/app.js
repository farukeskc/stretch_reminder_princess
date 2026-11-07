// Uygulama girişi: veri yükleme, Firebase, servis çalışanı, hash yönlendirici.
import { store, loadData, initStore } from './store.js';
import { registerServiceWorker, syncSubscription, clearBadge } from './push.js';
import { needsInstall } from './install.js';
import { homeView } from './views/home.js';
import { libraryView } from './views/library.js';
import { stretchView } from './views/stretch.js';
import { settingsView } from './views/settings.js';
import { onboardingView } from './views/onboarding.js';
import { installView } from './views/install.js';

const ROUTES = [
  { re: /^#?\/?$/, view: homeView, tab: 'home' },
  { re: /^#\/hareketler$/, view: libraryView, tab: 'library' },
  { re: /^#\/stretch\/([\w-]+)$/, view: stretchView, tab: null },
  { re: /^#\/ayarlar$/, view: settingsView, tab: 'settings' },
  { re: /^#\/hosgeldin$/, view: onboardingView, tab: null, bare: true },
  { re: /^#\/kurulum$/, view: installView, tab: null, bare: true },
];

const viewEl = document.getElementById('view');
const tabbar = document.getElementById('tabbar');
let cleanup = null;

function peeking() {
  try {
    return sessionStorage.getItem('pm.peek') === '1';
  } catch {
    return false;
  }
}

function navigate(hash) {
  // Hash değişirse hashchange olayı render eder; aynıysa elle render et.
  if (location.hash !== hash && !(hash === '#/' && location.hash === '')) location.hash = hash;
  else render();
}

function resolve(hash) {
  // iPhone'da Safari sekmesindeyse önce kurulum rehberi (göz atmaya izin var).
  if (needsInstall()) {
    const browsing = /^#\/(hareketler|stretch\/)/.test(hash);
    if (!(browsing && peeking())) return { route: ROUTES[5], params: [] };
  } else if (!store.user.onboarded && !/^#\/(stretch\/|hareketler)/.test(hash)) {
    return { route: ROUTES[4], params: [] };
  }
  for (const route of ROUTES) {
    const m = route.re.exec(hash || '#/');
    if (m) return { route, params: m.slice(1) };
  }
  return { route: ROUTES[0], params: [] };
}

function render() {
  const { route, params } = resolve(location.hash);
  if (typeof cleanup === 'function') cleanup();
  cleanup = null;
  viewEl.className = 'view';
  void viewEl.offsetWidth; // giriş animasyonunu yeniden tetikle
  tabbar.hidden = !!route.bare;
  for (const a of tabbar.querySelectorAll('a')) {
    if (a.dataset.tab === route.tab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  cleanup = route.view(viewEl, params, { navigate, rerender: render });
  window.scrollTo(0, 0);
}

async function boot() {
  registerServiceWorker();
  try {
    await loadData();
  } catch (err) {
    viewEl.innerHTML = `<div class="boot"><div class="boot-crown">😿</div><p>Veriler yüklenemedi. İnternet bağlantını kontrol edip yeniden aç.</p></div>`;
    console.error(err);
    return;
  }
  await initStore();
  window.addEventListener('hashchange', render);
  render();

  if (!needsInstall()) syncSubscription(store.user);
  clearBadge();

  // Bildirime dokunulduğunda servis çalışanından gelen yönlendirme.
  navigator.serviceWorker?.addEventListener('message', (e) => {
    if (e.data?.type === 'navigate' && e.data.url) {
      const hash = new URL(e.data.url, location.origin).hash || '#/';
      navigate(hash);
    }
  });

  // Uygulamaya geri dönülünce "sıradaki hatırlatma" bilgisini tazele.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    clearBadge();
    if (/^#?\/?$/.test(location.hash)) render();
  });
}

boot();
