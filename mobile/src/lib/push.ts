// Push nativ (FCM Android / APNs iOS). No-op în browser dev — rulează doar pe device.
import { Capacitor } from '@capacitor/core';
import { Api } from '../api/endpoints';

let registered = false;

export async function initPush() {
  if (!Capacitor.isNativePlatform() || registered) return;
  registered = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;

    await PushNotifications.register();

    PushNotifications.addListener('registration', (t) => {
      Api.registerDevice(t.value, Capacitor.getPlatform()).catch(() => {});
    });
    PushNotifications.addListener('registrationError', () => { /* silent */ });

    // Tap pe notificare → deep-link la vehicul (reload simplu; sesiunea e persistată în storage).
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const data: any = action.notification?.data || {};
      if (data.imei) window.location.href = '/vehicles/' + encodeURIComponent(data.imei);
      else window.location.href = '/notifications';
    });
  } catch {
    registered = false;
  }
}

export async function unregisterPush() {
  if (!Capacitor.isNativePlatform()) return;
  // Token-ul curent e curățat server-side la următoarea încercare eșuată; v1 nu păstrăm tokenul local.
}
