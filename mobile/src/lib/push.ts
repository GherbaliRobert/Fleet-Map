// Push nativ (FCM Android / APNs iOS). No-op în browser dev — rulează doar pe device.
import { Capacitor } from '@capacitor/core';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';

let registered = false;

// Înregistrează tokenul la backend cu retry exponențial (3 încercări). Eșecul nu mai e silențios.
async function registerToken(token: string, attempt = 0) {
  try {
    await Api.registerDevice(token, Capacitor.getPlatform());
  } catch {
    if (attempt < 3) { setTimeout(() => registerToken(token, attempt + 1), 2000 * Math.pow(2, attempt)); return; }
    showToast('Notificările push nu au putut fi activate. Reintră în cont pentru a reîncerca.', true);
  }
}

export async function initPush() {
  // Push-ul cere Firebase configurat (google-services.json). Fără el, PushNotifications.register()
  // crapă nativ pe Android ("Default FirebaseApp not initialized"). Activează DOAR după setarea Firebase,
  // build cu VITE_ENABLE_PUSH=1.
  if ((import.meta as any).env.VITE_ENABLE_PUSH !== '1') return;
  if (!Capacitor.isNativePlatform() || registered) return;
  registered = true;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') return;

    await PushNotifications.register();

    // Canal Android cu SUNET propriu (res/raw/notif.wav). Android BLOCHEAZĂ sunetul unui canal după creare, deci
    // folosim un canal NOU ('ra_alerts') ca sunetul să se aplice curat (canalul vechi 'alerts' rămâne, nefolosit).
    // sound = numele resursei din res/raw FĂRĂ extensie. No-op pe iOS.
    try { await PushNotifications.createChannel({ id: 'ra_alerts', name: 'Alerte RA Tracks', description: 'Alerte vehicule și evenimente', importance: 5, visibility: 1, sound: 'notif' }); } catch { /* iOS / nesuportat */ }

    PushNotifications.addListener('registration', (t) => { registerToken(t.value); });
    PushNotifications.addListener('registrationError', (err) => {
      registered = false; // permite reîncercarea la următoarea inițializare
      showToast('Eroare la activarea notificărilor push.', true);
      console.warn('[push] registrationError', err);
    });

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
