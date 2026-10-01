// Push nativ (FCM Android / APNs iOS). No-op în browser dev — rulează doar pe device.
// Tot aici: unde duce un anunț de-al nostru (lista Notificări, detaliul și push-ul folosesc aceeași adresă).
import { Capacitor } from '@capacitor/core';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { rutaFactura } from './factura';
import { rutaCalendarMontaj } from './calendarMontaj';
import { RUTA_NEASIGNATE } from './contracte';

let registered = false;

// ── începe „unde duce un anunț" ──
// Anunțurile noastre de lucru (30.09, doar la noi) duc drept la treaba de făcut, ca pe web (notifAparateNoi /
// notifMontajDeFacturat) — nu în „Detaliu eveniment", care pentru ele era gol („Fără poziție GPS…", fără buton):
//   • „aparate noi transmit" → Dispozitive, grupul Neasignate, cu aparatele din anunț bifate și firma propusă aleasă
//     în bară: /admin/devices?filtru=neasignate&bifate=<imei,imei>&firma=<id>. Dispozitive citește adresa
//     (anuntDinAdresa), bifează și aparatele propuse aceleiași firme din alte anunțuri, apoi o curăță.
//   • „Montaj de facturat" → Facturare, „Generează factură" unică, cu lucrările puse (rutaFactura, lib/factura.ts).
// Bucata e fără JSX și fără stare: proba o rulează lângă pagina web și lângă serverul pornit.
//   • „Cerere demo" → Cereri demo (web: goSistem('demoreq')); n-are poziție GPS, detaliul ei era gol pe telefon.
//   • termenul de montaj („Montaj, mai sunt N zile" / „Termenul de montaj a trecut") → calendarul, pe contractul din
//     anunț (`contractId`), unde se programează restul. Pe web încă deschide modalul gol — trecut la Alin (01.10).
export const TIPURI_CU_LOC = ['aparate_noi', 'montaj_de_facturat', 'demo_request', 'montaj_termen'];
// `data` vine ca obiect (JSONB) sau, pe unele baze, ca text JSON — ca pe web (loadNotifications).
export function dateAnunt(d: any): any {
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch (e) { d = null; } }
  return d && typeof d === 'object' ? d : {};
}
function idFirma(v: any): number | null {
  const s = v == null ? '' : String(v).trim();
  return /^\d+$/.test(s) && Number(s) > 0 ? Number(s) : null;
}
// Adresa anunțului, sau null: anunțul n-are un loc al lui și se deschide detaliul, ca până acum.
export function adresaAnunt(tip: any, date: any): string | null {
  const d = dateAnunt(date);
  if (tip === 'aparate_noi') {
    const imeis = (Array.isArray(d.imeis) ? d.imeis : []).map((x: any) => String(x == null ? '' : x).trim()).filter(Boolean);
    const firma = idFirma(d.company_id);
    let u = RUTA_NEASIGNATE;
    const pune = (k: string, v: string) => { u += (u.indexOf('?') >= 0 ? '&' : '?') + k + '=' + v; };
    if (imeis.length) pune('bifate', imeis.map((x: string) => encodeURIComponent(x)).join(','));
    if (firma != null) pune('firma', String(firma));
    return u;
  }
  if (tip === 'montaj_de_facturat') {
    const firma = idFirma(d.company_id);
    return firma != null ? rutaFactura(firma, 'unica', { lucrari: Array.isArray(d.lucrari) ? d.lucrari : [] }) : '/billing';
  }
  if (tip === 'demo_request') return '/admin/demo-requests';
  if (tip === 'montaj_termen') {
    const ctr = idFirma(d.contractId);   // același fel de id: un număr întreg pozitiv
    return ctr != null ? rutaCalendarMontaj(ctr) : '/admin/montaj?fila=calendar';
  }
  return null;
}
// Adresa de mai sus, citită înapoi de Dispozitive: { imeis, firma }, sau null când n-are nimic de pus
// (ca raxDevDeschideNeasignate pe web: fără aparate și fără firmă, doar filtrul).
export function anuntDinAdresa(q: any): { imeis: string[]; firma: number | null } | null {
  const o = q || {};
  const imeis = String(o.bifate == null ? '' : o.bifate).split(',').map((s) => s.trim()).filter(Boolean);
  const firma = idFirma(o.firma);
  return imeis.length || firma != null ? { imeis, firma } : null;
}
// …și adresa curățată după ce Dispozitive a citit anunțul: fără `bifate` și `firma`, cu restul (filtrul), ca o
// întoarcere pe ecran să nu-l mai pună o dată.
export function adresaFaraAnunt(cale: string, q: any): string {
  const o = q || {};
  const rest = Object.keys(o).filter((k) => k !== 'bifate' && k !== 'firma').map((k) => encodeURIComponent(k) + '=' + encodeURIComponent(String(o[k])));
  return (cale || RUTA_NEASIGNATE.split('?')[0]) + (rest.length ? '?' + rest.join('&') : '');
}
// Tap pe push → unde duce. Push-ul anunțurilor noastre poartă doar felul și id-ul notificării (serverul,
// `_anuntaSuperadmini`: { type, notifId }), nu și aparatele sau lucrările: deschidem detaliul, care citește anunțul
// întreg, îl marchează citit și te duce mai departe. Restul, ca până acum: fișa mașinii, altfel lista Notificări.
export function adresaPush(data: any): string {
  const d = data || {};
  const id = d.notifId == null ? '' : String(d.notifId);
  if (TIPURI_CU_LOC.indexOf(String(d.type)) >= 0 && /^\d+$/.test(id)) return '/notif/' + id;
  if (d.imei) return '/vehicles/' + encodeURIComponent(d.imei);
  return '/notifications';
}
// ── sfârșit „unde duce un anunț" ──

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

    // Tap pe notificare → adresaPush (mai sus): anunțurile noastre de lucru → detaliul lor, care te duce la treaba de
    // făcut; o alertă cu mașină → fișa mașinii; restul → Notificări. Reîncărcare simplă (sesiunea e persistată în storage).
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      window.location.href = adresaPush(action.notification?.data || {});
    });
  } catch {
    registered = false;
  }
}

export async function unregisterPush() {
  if (!Capacitor.isNativePlatform()) return;
  // Token-ul curent e curățat server-side la următoarea încercare eșuată; v1 nu păstrăm tokenul local.
}
