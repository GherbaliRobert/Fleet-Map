import { signal, computed } from '@preact/signals';
import { Api } from '../api/endpoints';
import type { Me, Position } from '../api/endpoints';
import { setAuthToken, onUnauthorized, API_BASE } from '../api/client';
import { saveToken, loadToken, clearToken, saveUser, loadUser, getTheme, setTheme } from '../lib/storage';
import { Capacitor } from '@capacitor/core';
import { StatusBar, Style } from '@capacitor/status-bar';
import { localMapLayerChoice, setMapLayerFromAccount } from '../lib/mapLayer';
import { trimitePrefs, asteaptaPrefs, reperPrefs, schimbateDupa, uitaPrefs } from '../lib/uiPrefsCoada';

export const theme = signal<'dark' | 'light'>('dark');
// Tema ALEASĂ, cu numele de pe cont (ca pe web): închisă / deschisă / „ca pe dispozitiv". `theme` e culoarea
// rezultată, pe care o pictează ecranul. Vezi blocul „Preferințele de pe cont", la finalul fișierului.
export type TemaCont = 'inchisa' | 'deschisa' | 'sistem';
export const temaCont = signal<TemaCont>('inchisa');

// Full-screen: bara de stare suprapusă peste webview (edge-to-edge), cu iconițele
// adaptate la temă — temă închisă → iconițe deschise (Style.Dark), temă deschisă →
// iconițe închise (Style.Light). No-op în browser (doar pe nativ).
async function applyStatusBar(t: 'dark' | 'light') {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: true });
    await StatusBar.setStyle({ style: t === 'dark' ? Style.Dark : Style.Light });
  } catch { /* web / nesuportat */ }
}

export async function initTheme() {
  try { const t = await getTheme(); theme.value = (t === 'light' ? 'light' : 'dark'); } catch { /* dark */ }
  // „Ca pe dispozitiv": culoarea ținută minte e cea de data trecută (ca să nu pâlpâie ecranul la pornire);
  // o recalculăm după cum e telefonul ACUM.
  const mod = _temaMod();
  temaCont.value = mod || (theme.value === 'light' ? 'deschisa' : 'inchisa');
  if (mod === 'sistem') { theme.value = _temaEfectiva('sistem'); _ascultaSistemul(); }
  document.documentElement.setAttribute('data-theme', theme.value);
  applyStatusBar(theme.value);
}
// Rândul „Temă" din meniu: comută închisă ↔ deschisă și urcă alegerea pe cont, exact ca butonul cu
// lună/soare de pe web. Nu așteptăm serverul: tema se schimbă pe loc oricum.
export async function toggleTheme() {
  const next: TemaCont = theme.value === 'dark' ? 'deschisa' : 'inchisa';
  await aplicaTema(next);
  urcaUiPrefs({ tema: next });
}

export const token = signal<string | null>(null);
export const me = signal<Me | null>(null);
export const authReady = signal(false);
// Mesajul pe care ecranul de autentificare îl arată o dată, după ce pornirea a scos un cont oprit (vezi accesOprit).
export const mesajLaIntrare = signal<string | null>(null);
export const livePos = signal<Position[]>([]);  // feed live (din /api/live + WS) — doar vehiculele care transmit
export const roster = signal<Position[]>([]);   // TOATE vehiculele înregistrate (din /api/devices) → apar și cele fără transmisie
// Flota afișată = pozițiile live + vehiculele înregistrate care NU sunt în live (marcate „fără transmisie")
export const vehicles = computed<Position[]>(() => {
  const live = livePos.value, r = roster.value;
  if (!r.length) return live;
  const liveSet = new Set(live.map((v) => v.imei));
  const offline = r.filter((d) => !liveSet.has(d.imei));
  return offline.length ? live.concat(offline) : live;
});
export const vehiclesLoading = signal(false);
export const unread = signal(0);
export const lastNotif = signal<any | null>(null); // ultima notificare primită pe WS (ex. report_ready) — ecranele o pot urmări
export const toastMsg = signal<{ text: string; err?: boolean } | null>(null);

// ── Ecranele tăiate de firmă din rolul omului ──
// Vin din /api/me (`ecraneAscunse`). Cheile sunt EXACT cele din lista ECRANE din server.js — nu inventa
// altele: o cheie greșită aici ar ascunde sau ar lăsa la vedere alt ecran decât cel tăiat. Serverul refuză
// oricum rutele ecranului tăiat (pazaEcrane); telefonul doar nu mai arată butoane care ar răspunde „acces interzis".
export type EcranCheie =
  | 'localizare' | 'traseu' | 'statistici' | 'rapoarte' | 'programari' | 'hotspot'
  | 'vehicule' | 'soferi' | 'grupe' | 'alerte' | 'mentenanta' | 'documente'
  | 'tahograf' | 'etransport' | 'tollro' | 'insight';
const ecraneAscunse = computed<Set<string>>(() => new Set((me.value && me.value.ecraneAscunse) || []));
export function ecranAscuns(cheie: EcranCheie): boolean { return ecraneAscunse.value.has(cheie); }

// ── Accesul firmei (câmpul `access` din GET /api/me, făcut de stareAcces pe server) ──
// Interfața Me nu-l declară (endpoints.ts), dar răspunsul întreg ajunge în `me`, deci câmpul e acolo; îl citim cu
// tipul de aici. `mesaj` vine doar la restanță: textul pentru client, scris o singură dată pe server
// (neplata.mesajClient) — telefonul nu socotește nicio zi, nicio sumă. `nota` (motivul unei opriri de mână) e a
// noastră și nu se arată nicăieri. Banda de sus (components/BandaAcces.tsx) se hotărăște din el.
export interface AccesFirma {
  status?: string;                 // 'active' | 'grace' (restanță, în cele 15 zile) | 'expired' (suspendat)
  motiv?: string | null;           // 'neplata' | 'manual'
  mesaj?: string | null;
}
// Ca pe web (`currentUser.access`): orice valoare venită în câmp contează; lipsa lui = firmă fără stare (sau cont de platformă).
export function accesFirma(m: unknown): AccesFirma | null {
  const a = m ? (m as { access?: unknown }).access : null;
  return a ? (a as AccesFirma) : null;
}
// Textul pentru un acces oprit — același ca pe web (applyAccessBanner, public/index.html), legat printr-o probă.
// Îl folosesc banda roșie și anunțul venit pe fluxul live. (Până la 1.0.5 anunțul spunea „verifică
// factura/abonamentul", de dinainte de 28.09.)
export const MESAJ_ACCES_SUSPENDAT = 'Accesul este suspendat. Contactați furnizorul pentru reactivare.';
// La PORNIREA aplicației, contul unei firme oprite (neplată sau de noi) nu mai intră — ca pe web (checkAuth,
// public/index.html; hotărât pe 30.09: „la fel ca și pe web"). Sesiunea de pe telefon se închide, iar ecranul de
// autentificare arată mesajul pe care îl dă și serverul când refuză intrarea (MESAJ_SUSPENDAT, server.js) — legat
// printr-o probă de amândouă. Cu aplicația DEJA deschisă rămâne banda roșie, tot ca pe web, până la următoarea pornire.
export const MESAJ_SUSPENDAT_LA_INTRARE = 'Abonament suspendat pentru neplată. Contactați furnizorul.';
// Aceeași condiție ca pe web: accesul „expired", iar contul nu e de platformă.
export function accesOprit(m: unknown): boolean {
  const a = accesFirma(m);
  return !!a && a.status === 'expired' && !(m as { isSuper?: boolean }).isSuper;
}

export const offlineMinutes = computed(() =>
  (me.value && ((me.value as any).sys?.offline_minutes ?? (me.value as any).offline_minutes)) || 65
);

export function showToast(text: string, err = false) {
  toastMsg.value = { text, err };
  setTimeout(() => { if (toastMsg.value && toastMsg.value.text === text) toastMsg.value = null; }, 2600);
}

export function vehicleByImei(imei: string): Position | undefined {
  return vehicles.value.find((v) => v.imei === imei);
}

let pollTimer: any = null;
let polling = false;

export async function bootstrap() {
  await initTheme();
  const t = await loadToken();
  if (t) {
    token.value = t; setAuthToken(t);
    me.value = await loadUser<Me>();
    // Salvăm și copia locală: la o pornire fără rețea, ecranele tăiate rămân ascunse (nu doar până la /api/me).
    let proaspat: Me | null = null;
    try { proaspat = await Api.me(); me.value = proaspat; await saveUser(proaspat); } catch { /* token invalid → onUnauthorized curăță */ }
    // Firma e oprită: contul nu intră (ca pe web). Doar pe profilul PROASPĂT — copia veche de pe telefon, de la o
    // pornire fără rețea, nu scoate pe nimeni afară.
    if (proaspat && accesOprit(proaspat)) {
      await logout();
      mesajLaIntrare.value = MESAJ_SUSPENDAT_LA_INTRARE;
      authReady.value = true;
      return;
    }
    // Preferințele de pe cont (temă, hartă, ecranul de pornire) înainte de primul ecran — ascuns sub animația
    // de pornire. Plafon de 2,5 s: pe rețea proastă nu ținem omul pe ecranul de încărcare; se aplică la sosire.
    await Promise.race([syncUiPrefs(true), new Promise((r) => setTimeout(r, 2500))]);
  }
  authReady.value = true;
}

// Reîmprospătează profilul (drepturi, ecrane tăiate, funcții) — la revenirea în aplicație. Altfel, un ecran
// tăiat de firmă cât timp aplicația stă deschisă ar rămâne în meniu până la următoarea autentificare.
export async function refreshMe() {
  const t = token.value;
  if (!t) return;
  try {
    const m = await Api.me();
    // Între timp s-a delogat SAU a intrat pe alt cont (fondatorii schimbă conturile pe același telefon):
    // răspunsul vechi ar pune profilul — meniul, ecranele tăiate — contului celălalt.
    if (token.value !== t) return;
    me.value = m; await saveUser(m);
    syncUiPrefs(); // tema/harta schimbate între timp pe web se văd și aici (ecranul de pornire NU se reaplică)
  } catch { /* păstrează ce e; 401 e tratat de onUnauthorized */ }
}

export async function login(username: string, password: string) {
  _wsAccessMsgShown = false; // sesiune nouă → permite din nou avertismentul de acces suspendat
  const res = await Api.mobileLogin(username, password, 'android');
  token.value = res.token; setAuthToken(res.token);
  await saveToken(res.token);
  // `access` vine și la autentificare (aceeași stareAcces ca /api/me): banda de restanță apare din prima, chiar dacă
  // cererea /api/me de mai jos nu ajunge.
  const m = { username: res.username, role: res.role, permissions: res.permissions, companyId: res.companyId, isSuper: res.isSuper, company: res.company, features: res.features, access: accesFirma(res) } as Me;
  me.value = m; await saveUser(m);
  try { me.value = await Api.me(); await saveUser(me.value); } catch { /* ignore */ }
  syncUiPrefs(true); // tema, harta și ecranul de pornire ale contului în care tocmai a intrat
}

export async function logout() {
  stopLive();
  token.value = null; me.value = null; livePos.value = []; roster.value = []; unread.value = 0;
  uiPrefs.value = null; uiPrefsSursa.value = {}; ecranPornireCerut.value = null; // nu trec la contul următor
  uitaPrefs(); // nici scrierile de preferințe rămase în coadă
  setAuthToken(null);
  await clearToken();
}

export async function refreshVehicles() {
  try { livePos.value = await Api.live(); } catch { /* păstrează ultimele */ }
}
// Roster complet (toate vehiculele înregistrate) — ca să apară și cele care nu transmit (super: toate companiile)
export async function refreshRoster() {
  try {
    const devs = await Api.devices();
    roster.value = (Array.isArray(devs) ? devs : [])
      .filter((d: any) => d && d.imei && d.status !== 'archived')
      .map((d: any) => ({
        // company_id, nu doar numele: ecranul de alerte filtrează vehiculele după compania aleasă.
        imei: d.imei, name: d.name, plate: d.plate, vehicle_type: d.vehicle_type,
        company_name: d.company_name, company_id: d.company_id,
        latitude: d.latitude, longitude: d.longitude, speed: d.speed, angle: d.angle, satellites: d.satellites,
        timestamp: d.last_position_time || null, io: d.io_data || {},
      } as Position));
  } catch { /* păstrează ce e */ }
}
export async function refreshUnread() {
  try { const r = await Api.unreadCount(); unread.value = (r && (r as any).count) || 0; } catch { /* ignore */ }
}

let curPollMs = 7000;
let pollTick = 0;
function _pollOnce() {
  refreshVehicles();
  // Împrospătează rosterul periodic: timestamp-uri corecte pentru „fără transmisie" + vehiculele care revin online.
  if ((pollTick++ % 4) === 0) refreshRoster();
}
function _arm(ms: number) { if (pollTimer) clearInterval(pollTimer); curPollMs = ms; pollTimer = setInterval(_pollOnce, ms); }

// startPolling poate fi reapelat ca să SCHIMBE intervalul (ex. WS sănătos → backstop lent, nu oprire).
export function startPolling(ms = 7000) {
  if (polling) { if (ms !== curPollMs) _arm(ms); return; }
  polling = true;
  vehiclesLoading.value = vehicles.value.length === 0;
  refreshVehicles().finally(() => { vehiclesLoading.value = false; });
  _arm(ms);
}
export function stopPolling() {
  polling = false;
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}
const WS_BACKSTOP_MS = 25000; // poll de siguranță cât timp WS-ul e „conectat" (anti-stall silențios pe mobil)

// ─── Live updates: WebSocket (latență mică + sarcină redusă la scară) cu fallback la polling ───
// Pe device: wss://ratrack.ro/?token=… (webview-ul nu trimite cookie → auth pe token). Pe web dev: ws://localhost:3000.
const WS_BASE = (API_BASE || 'http://localhost:3000').replace(/^http/i, 'ws');
let ws: WebSocket | null = null;
let wsWanted = false;
let wsReconnect: any = null;
let wsBackoff = 1500;
let livePollMs = 7000;
let _wsAccessMsgShown = false; // anti-spam: „acces suspendat" o singură dată per sesiune (WS reconectează des)

function upsertVehicle(pos: Position) {
  if (!pos || !pos.imei) return;
  const arr = livePos.value;
  const i = arr.findIndex((v) => v.imei === pos.imei);
  if (i >= 0) { const next = arr.slice(); next[i] = { ...arr[i], ...pos }; livePos.value = next; }
  else { livePos.value = [...arr, pos]; }
}
function applyWs(msg: any) {
  if (!msg || !msg.type) return;
  if (msg.type === 'init' && Array.isArray(msg.data)) {
    livePos.value = msg.data; vehiclesLoading.value = false;
    // Serverul trimite fluxul doar unei firme cu acces. Dacă profilul încă spune „suspendat", firma a fost
    // reactivată între timp (a plătit): îl reîmprospătăm, ca banda roșie să nu rămână agățată până la
    // revenirea în aplicație. Iar o nouă suspendare se anunță din nou.
    if (accesFirma(me.value)?.status === 'expired') { _wsAccessMsgShown = false; refreshMe(); }
    return;
  }
  if (msg.type === 'position') { upsertVehicle(msg.data); return; }
  if (msg.type === 'positions' && Array.isArray(msg.data)) {
    const map = new Map(livePos.value.map((v) => [v.imei, v] as [string, Position]));
    for (const p of msg.data) if (p && p.imei) map.set(p.imei, { ...(map.get(p.imei) || {}), ...p } as Position);
    livePos.value = Array.from(map.values());
    return;
  }
  if (msg.type === 'stale' && msg.data && msg.data.imei) { upsertVehicle({ imei: msg.data.imei, speed: 0, stale: true } as any); return; }
  if (msg.type === 'disconnect' && msg.data && msg.data.imei) {
    // Purge (24h fără semnal) → scoate din listă. Deconectare normală (close socket) → zeroează DOAR viteza
    // (serverul face la fel la închiderea socketului). NU mai falsificăm timestamp-ul: înainte îl „îmbătrâneam"
    // la acum−6 min, ceea ce făcea un vehicul fără fix de ore să pară iar online/proaspăt — exact bug-ul reparat
    // pe web. Rămâne ultimul fix REAL → prospețimea (online / „în mișcare") e onestă.
    if (msg.data.reason === 'purged') { livePos.value = livePos.value.filter((v) => v.imei !== msg.data.imei); return; }
    upsertVehicle({ imei: msg.data.imei, speed: 0 } as any);
    return;
  }
  if (msg.type === 'removed' && msg.data && msg.data.imei) {
    // Vehicul arhivat/șters → scoate-l imediat din hartă/listă (ca web-ul), fără să aștepte poll-ul.
    livePos.value = livePos.value.filter((v) => v.imei !== msg.data.imei);
    roster.value = roster.value.filter((v) => v.imei !== msg.data.imei);
    return;
  }
  if (msg.type === 'notification') {
    // Notificare nouă pe WS-ul live → badge-ul de „necitite" crește instant (ca web-ul), nu doar la poll-ul de 30s.
    unread.value = unread.value + 1;
    if (msg.data) lastNotif.value = msg.data; // expune notificarea (ex. report_ready) ecranelor care o urmăresc
    return;
  }
  if (msg.type === 'error' && msg.data && msg.data.error === 'access_expired') {
    // Serverul a refuzat fluxul live: accesul firmei e oprit (neplată sau de noi). NU e eroare de autentificare →
    // nu delogăm. Profilul se reîmprospătează, ca banda roșie de sus să se aprindă pe loc, nu abia la revenirea
    // în aplicație — o singură dată: cât profilul spune deja „suspendat", reconectările nu mai cer nimic.
    if (accesFirma(me.value)?.status !== 'expired') refreshMe();
    if (!_wsAccessMsgShown) { _wsAccessMsgShown = true; showToast(MESAJ_ACCES_SUSPENDAT, true); }
    return;
  }
}
function connectWs() {
  if (!wsWanted || !token.value) return;
  try {
    const sock = new WebSocket(WS_BASE + '/?token=' + encodeURIComponent(token.value));
    ws = sock;
    sock.onopen = () => { wsBackoff = 1500; startPolling(WS_BACKSTOP_MS); }; // WS sănătos → poll de siguranță lent (nu oprire) → imun la WS blocat silențios
    sock.onmessage = (ev) => { try { applyWs(JSON.parse(ev.data)); } catch { /* ignore frame invalid */ } };
    sock.onerror = () => { try { sock.close(); } catch { /* ignore */ } };
    sock.onclose = () => {
      if (ws === sock) ws = null;
      if (!wsWanted) return;
      startPolling(livePollMs); // fallback imediat la polling
      if (wsReconnect) clearTimeout(wsReconnect);
      wsReconnect = setTimeout(connectWs, wsBackoff);
      wsBackoff = Math.min(wsBackoff * 2, 30000); // backoff exponențial, plafon 30s
    };
  } catch { startPolling(livePollMs); } // WebSocket indisponibil → doar polling
}

// Pornește fluxul live: polling imediat (date instant + fallback) + încearcă WS (preia când e gata).
export function startLive(ms = 7000) {
  livePollMs = ms;
  refreshRoster(); // încarcă rosterul (toate vehiculele înregistrate) la pornire/foreground
  startPolling(ms);
  if (!wsWanted) { wsWanted = true; connectWs(); }
}
export function stopLive() {
  wsWanted = false;
  if (wsReconnect) { clearTimeout(wsReconnect); wsReconnect = null; }
  if (ws) { try { ws.close(); } catch { /* ignore */ } ws = null; }
  stopPolling();
}

// 401 = cheia/sesiunea a expirat (cheile mobile durează 90 zile) sau e invalidă. Logout-ul e corect, dar acum
// SPUNEM utilizatorului de ce (nu mai dispare ecranul fără explicație). Guard: o singură dată (mai multe cereri
// pot da 401 simultan; după logout, token.value e null → nu re-declanșăm).
onUnauthorized(() => { if (!token.value) return; showToast('Sesiune expirată — autentifică-te din nou', true); logout(); });

// ── Preferințele de pe CONT (GET/PUT /api/me/ui-prefs), aceleași ca pe web ──
// Tema, harta cu care pornești și ecranul de pornire stăteau doar în telefon: le schimbai pe web, pe telefon
// rămâneau cum erau (deși webul promite „le regăsești și pe telefon"). Acum adevărul e pe cont. Telefonul ține
// doar o copie, ca prima pictare la pornire să fie deja în culorile bune.
export const uiPrefs = signal<Record<string, any> | null>(null);      // valorile efective; null până sosesc
export const uiPrefsSursa = signal<Record<string, string>>({});       // 'user' / 'company' / 'app', pe cheie
// Ecranul de pornire de deschis O SINGURĂ DATĂ, după pornirea la rece sau după autentificare (App.tsx îl
// consumă doar dacă omul e încă pe „/"). La revenirea din fundal nu se mai pune nimic aici.
export const ecranPornireCerut = signal<string | null>(null);

const TEMA_MOD = 'pref_tema';           // alegerea: inchisa / deschisa / sistem (pref_theme ține culoarea rezultată)
const CONT_SINCRONIZAT = 'pref_cont_sync'; // '1' după prima sincronizare cu un cont pe telefonul ăsta

function _temaMod(): TemaCont | null {
  try { const v = localStorage.getItem(TEMA_MOD); return v === 'inchisa' || v === 'deschisa' || v === 'sistem' ? v : null; } catch { return null; }
}
function _mq(): MediaQueryList | null {
  try { return window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null; } catch { return null; }
}
// Ca pe web: „sistem" = întunecat doar dacă dispozitivul spune că e întunecat.
function _temaEfectiva(t: TemaCont): 'dark' | 'light' {
  if (t === 'deschisa') return 'light';
  if (t === 'sistem') { const mq = _mq(); return mq && mq.matches ? 'dark' : 'light'; }
  return 'dark';
}
let _ascultaSistem = false;
function _ascultaSistemul() {
  if (_ascultaSistem) return;
  const mq = _mq(); if (!mq) return;
  _ascultaSistem = true;
  const h = () => { if (temaCont.value === 'sistem') aplicaTema('sistem'); };
  try { mq.addEventListener('change', h); } catch { try { (mq as any).addListener(h); } catch { /* */ } }
}

export async function aplicaTema(t: TemaCont) {
  const eff = _temaEfectiva(t);
  temaCont.value = t; theme.value = eff;
  document.documentElement.setAttribute('data-theme', eff);
  applyStatusBar(eff);
  if (t === 'sistem') _ascultaSistemul();
  try { localStorage.setItem(TEMA_MOD, t); } catch { /* */ }
  try { await setTheme(eff); } catch { /* */ }
}

// Urcă una sau mai multe alegeri pe cont, fără să aștepte (ca prefUrca de pe web). Prin coadă (uiPrefsCoada):
// o citire care pleacă între timp nu mai aduce înapoi valoarea veche.
export function urcaUiPrefs(patch: Record<string, any>) {
  if (!token.value) return;
  if (uiPrefs.value) uiPrefs.value = { ...uiPrefs.value, ...patch };
  uiPrefsSursa.value = { ...uiPrefsSursa.value, ...Object.fromEntries(Object.keys(patch).map((k) => [k, 'user'])) };
  trimitePrefs(patch).catch(() => { /* rămâne aplicată aici */ });
}

// Aduce preferințele de pe cont și le aplică. `laPornire` = pornire la rece sau autentificare: numai atunci
// se hotărăște ecranul de pornire.
export async function syncUiPrefs(laPornire = false) {
  const t = token.value;
  if (!t) return;
  try {
    // Întâi să ajungă pe cont ce s-a ales deja pe telefon (tema din meniu, harta din butonul ei) — altfel citirea
    // de acum ar aduce valoarea veche și ar întoarce tema pe ecran.
    await asteaptaPrefs();
    if (token.value !== t) return;
    const reper = reperPrefs();
    const d = await Api.uiPrefs();
    if (token.value !== t) return; // între timp s-a schimbat contul
    const eff: Record<string, any> = Object.assign({}, d && d.effective);
    const src: Record<string, string> = Object.assign({}, d && d.source);
    // Prima dată pe telefonul ăsta: alegerile făcute DOAR aici (înainte ca tema și harta să stea pe cont) urcă pe
    // cont, în loc să fie călcate de valoarea din fabrică. Altfel, cine avea tema deschisă pe telefon s-ar fi
    // trezit, după actualizare, pe cea închisă. Numai unde omul nu și-a ales nimic pe cont ('app').
    // Un SINGUR PUT: serverul citește-modifică-scrie, două PUT-uri în paralel s-ar putea călca.
    if (_citeste(CONT_SINCRONIZAT) !== '1') {
      const urca: Record<string, any> = {};
      let veche: string | null = null;
      try { veche = await getTheme(); } catch { /* */ }
      const temaVeche = veche === 'light' ? 'deschisa' : veche === 'dark' ? 'inchisa' : null;
      if (src.tema === 'app' && temaVeche && temaVeche !== eff.tema) urca.tema = temaVeche;
      const hartaVeche = localMapLayerChoice();
      if (src.harta === 'app' && hartaVeche && hartaVeche !== eff.harta) urca.harta = hartaVeche;
      let urcat = true;
      if (Object.keys(urca).length) { try { await trimitePrefs(urca); } catch { urcat = false; } }
      if (token.value !== t) return;
      Object.assign(eff, urca); // și dacă n-a mers acum: rămâne alegerea locală, reîncercăm data viitoare
      if (urcat) { for (const k of Object.keys(urca)) src[k] = 'user'; _scrie(CONT_SINCRONIZAT, '1'); }
    }
    // Ce s-a ales pe telefon cât timp citirea era pe drum e mai nou decât ce a adus ea: rămâne alegerea de aici.
    const locale = schimbateDupa(reper);
    for (const k of Object.keys(locale)) { eff[k] = locale[k]; src[k] = 'user'; }
    uiPrefsSursa.value = src;
    uiPrefs.value = eff;
    if ((eff.tema === 'inchisa' || eff.tema === 'deschisa' || eff.tema === 'sistem')
      && (eff.tema !== temaCont.value || _temaEfectiva(eff.tema) !== theme.value)) aplicaTema(eff.tema);
    setMapLayerFromAccount(eff.harta);
    if (laPornire) ecranPornireCerut.value = rutaEcranPornire(eff.ecran_pornire);
  } catch { /* fără rețea: rămâne ce era pe telefon */ }
}

// Ecranul ales → adresa de pe telefon. Ca pe web: dacă rolul omului nu ajunge la ecran, rămâne pe pornire.
// Localizare = lista de Vehicule; Traseul pe flotă nu există pe telefon (se deschide din fișa mașinii).
// La contul de platformă nu se aplică: pe web, verticala fondatorului ignoră preferința și deschide „Acasă".
export function rutaEcranPornire(k: unknown): string | null {
  if (!me.value || me.value.isSuper) return null;
  if (k === 'statistici' && !ecranAscuns('statistici')) return '/stats';
  if (k === 'rapoarte' && !ecranAscuns('rapoarte')) return '/reports';
  return null;
}

function _citeste(k: string): string | null { try { return localStorage.getItem(k); } catch { return null; } }
function _scrie(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* */ } }
