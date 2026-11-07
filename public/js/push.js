// Web Push: servis çalışanı kaydı, izin, abonelik.
import { VAPID_PUBLIC_KEY, isVapidConfigured } from './config.js';
import { pushSupported } from './install.js';
import { saveUserDoc } from './firebase.js';

let registration = null;

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    return registration;
  } catch (err) {
    console.warn('Servis çalışanı kaydedilemedi', err);
    return null;
  }
}

async function ready() {
  return registration ?? (await navigator.serviceWorker.ready);
}

export function permission() {
  return 'Notification' in window ? Notification.permission : 'unsupported';
}

function urlBase64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function subscribe() {
  const reg = await ready();
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
  });
}

function platformLabel() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/**
 * Bildirim iznini ister ve aboneliği kaydeder.
 * ÖNEMLİ: iOS'ta bir dokunma olayının içinden, başka bir await'ten ÖNCE çağrılmalı.
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
export async function enablePush() {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' };
  // İlk await requestPermission olmalı (kullanıcı etkileşimi korunur).
  const result = await Notification.requestPermission();
  if (result !== 'granted') return { ok: false, reason: result };
  if (!isVapidConfigured()) return { ok: false, reason: 'no-vapid' };
  try {
    const sub = await subscribe();
    await saveUserDoc({ pushSubscription: sub.toJSON(), needsResubscribe: false, platform: platformLabel(), enabled: true });
    return { ok: true };
  } catch (err) {
    console.error('Abonelik başarısız', err);
    return { ok: false, reason: 'subscribe-failed' };
  }
}

/** Uygulama açılışında: izin varsa aboneliğin Firestore'daki kayıtla aynı olduğundan emin ol. */
export async function syncSubscription(userDoc) {
  if (!pushSupported() || permission() !== 'granted' || !isVapidConfigured()) return false;
  try {
    const sub = await subscribe();
    const json = sub.toJSON();
    if (userDoc?.needsResubscribe || userDoc?.pushSubscription?.endpoint !== json.endpoint) {
      await saveUserDoc({ pushSubscription: json, needsResubscribe: false, platform: platformLabel() });
    }
    return true;
  } catch (err) {
    console.warn('Abonelik eşitlenemedi', err);
    return false;
  }
}

export async function hasSubscription() {
  if (!pushSupported()) return false;
  try {
    const reg = await ready();
    return !!(await reg.pushManager.getSubscription());
  } catch {
    return false;
  }
}

/** Yerel test bildirimi (sunucu olmadan, izin verilmiş olmalı). */
export async function showTestNotification(title, body, url = '/#/') {
  const reg = await ready();
  await reg.showNotification(title, {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    tag: 'stretch-test',
    data: { url },
  });
}

export async function clearBadge() {
  try {
    await navigator.clearAppBadge?.();
  } catch {
    /* desteklenmiyor */
  }
}
