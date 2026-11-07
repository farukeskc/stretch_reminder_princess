// Platform tespiti: iOS mu, Ana Ekrandan mı açıldı, push destekleniyor mu?

export function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function iosVersion() {
  const m = /OS (\d+)_(\d+)/.exec(navigator.userAgent || '');
  return m ? Number(m[1]) + Number(m[2]) / 100 : null;
}

export function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** iPhone'da Safari sekmesinde açıldıysa önce Ana Ekrana eklenmeli. */
export function needsInstall() {
  return isIOS() && !isStandalone();
}

export function iosTooOld() {
  const v = iosVersion();
  return isIOS() && v != null && v < 16.04;
}

export const SHARE_ICON =
  '<svg class="ios-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
export const ADD_ICON =
  '<svg class="ios-icon" viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
