import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useRoute } from 'preact-iso';
import L from 'leaflet';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { showToast, vehicles, uiPrefs } from '../app/store';
import { reverseGeocode } from '../api/geocode';
import { numeKmlTraseu, salveazaDeLaServer } from '../lib/export';
import { salveazaText } from '../components/salveazaText';
import './route.css';
import './detail.css'; // .sheet-ov / .sheet (foaia „Exportă traseul")
import '../components/locFlota.css'; // .loc-exp (butoanele mari din foaie)

type Period = 'today' | 'yesterday' | 'week' | 'custom';
interface Range { from: string; to: string }

function range(p: Exclude<Period, 'custom'>): Range {
  const now = new Date(); const from = new Date(now); from.setHours(0, 0, 0, 0);
  if (p === 'yesterday') { from.setDate(from.getDate() - 1); const to = new Date(from); to.setHours(23, 59, 59, 999); return { from: from.toISOString(), to: to.toISOString() }; }
  if (p === 'week') { from.setDate(from.getDate() - 7); }
  return { from: from.toISOString(), to: now.toISOString() };
}
// Valoarea pentru <input type="datetime-local"> (ora locală, fără fus orar).
function localInput(d: Date): string { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); }
function fmtScurt(iso: string) {
  try { return new Date(iso).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; }
}
function fmtTime(s: string) { try { return new Date(s).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } }
function fmtDur(sec: number) {
  if (!sec || sec < 0) return '0m';
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? (h + 'h ' + m + 'm') : (m + 'm');
}
function ptMs(p: any) { return new Date(p.timestamp || p.server_time || p.time || 0).getTime(); }
const MAX_ZILE = 92; // aceeași limită ca serverul (/api/history)

type LatLng = [number, number];
const GREEN = '#3FE07D', START = '#22c55e', STOP = '#ef4444', DIM = '#9aa3ad';
// Trepte de gravitate pt. depășirea limitei REALE (OSM): galben ≤+30, portocaliu +30..+50, roșu >+50
const OSM_TIERS = [
  { label: '≤ +30', color: '#fbbf24' },
  { label: '+30–50', color: '#f59e0b' },
  { label: '> +50', color: '#ef4444' },
];
const osmTier = (delta: number) => (delta <= 30 ? 0 : delta <= 50 ? 1 : 2);
// Culoarea traseului după viteză față de limita MAȘINII (fișa → „Limită de viteză"). Aceleași praguri și
// culori ca pe web (_hpSegColor): până la limită verde, până la +15 portocaliu, peste roșu.
const SPD = [
  { label: 'sub limită', color: '#3FE07D' },
  { label: 'până la +15', color: '#f59e0b' },
  { label: 'peste +15', color: '#ef4444' },
];
function segColor(speed: number, limit: number) {
  const sp = Number(speed) || 0;
  return sp <= limit ? SPD[0].color : sp <= limit + 15 ? SPD[1].color : SPD[2].color;
}
// O linie de traseu; cu viteze + limită → bucăți colorate după viteză, altfel o singură culoare.
function addLine(lg: L.LayerGroup, ll: LatLng[], sp: number[] | null, limit: number | null, base: L.PolylineOptions) {
  if (ll.length < 2) return;
  if (!sp || !limit || sp.length !== ll.length) { L.polyline(ll, base).addTo(lg); return; }
  let cc = segColor(sp[1], limit), chunk: LatLng[] = [ll[0]];
  for (let i = 1; i < ll.length; i++) {
    const c = segColor(sp[i], limit);
    if (c !== cc) { L.polyline(chunk, { ...base, color: cc }).addTo(lg); chunk = [ll[i - 1]]; cc = c; }
    chunk.push(ll[i]);
  }
  if (chunk.length > 1) L.polyline(chunk, { ...base, color: cc }).addTo(lg);
}
const llOf = (arr: any[]) => arr.map((p) => [p.latitude, p.longitude] as LatLng);
const spOf = (arr: any[]) => arr.map((p) => Number(p.speed) || 0);
function dot(latlng: LatLng, fill: string) {
  return L.circleMarker(latlng, { radius: 6, color: '#fff', fillColor: fill, fillOpacity: 1, weight: 2 });
}

// ── Steagurile de plecare/sosire — aceleași desene ca pe web (public/index.html → hpFlagIcon).
// Dacă le schimbi, schimbă-le în AMBELE locuri. Vârful catargului = punctul exact, de aceea iconAnchor
// nu e la centrul imaginii.
function flagIcon(color: string) {
  return L.divIcon({
    className: 'rt-flag',
    html: '<svg width="26" height="34" viewBox="0 0 26 34">'
      + '<path d="M4.6 33 V2.4" stroke="#ffffff" stroke-width="4.4" stroke-linecap="round"/>'
      + '<path d="M4.6 33 V2.4" stroke="#2b3440" stroke-width="2" stroke-linecap="round"/>'
      + '<path d="M6 3.2 H20.6 L17.3 8.5 L20.6 13.8 H6 Z" fill="' + color + '" stroke="#ffffff" stroke-width="1.5" stroke-linejoin="round"/>'
      + '<circle cx="4.6" cy="32.4" r="2.9" fill="' + color + '" stroke="#ffffff" stroke-width="1.6"/>'
      + '</svg>',
    iconSize: [26, 34], iconAnchor: [4.6, 33], popupAnchor: [7, -29],
  });
}
function escHtml(s: string) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
// Steag cu popup: oră, adresă (cerută abia la deschidere, ca să nu geocodăm degeaba) și cât a stat pe loc.
function flagMarker(latlng: LatLng, color: string, label: string, ts: string | null, standMs: number | null, when: string) {
  const t = ts ? new Date(ts) : null;
  const head = '<div class="rt-flagpop"><b style="color:' + color + '">' + escHtml(label) + '</b>'
    + (t ? '<div class="t">' + t.toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + '</div>' : '');
  const stand = (standMs != null && standMs > 60000)
    ? '<div class="s">A staționat ' + fmtDur(Math.round(standMs / 1000)) + ' ' + when + '</div>' : '';
  const m = L.marker(latlng, { icon: flagIcon(color), zIndexOffset: 900 })
    .bindPopup(head + '<div class="a">Se caută adresa…</div>' + stand + '</div>');
  let cerut = false;
  m.on('popupopen', () => {
    if (cerut) return;
    cerut = true;
    reverseGeocode(latlng[0], latlng[1], 'full')
      .then((a) => m.setPopupContent(head + '<div class="a">' + escHtml(a || '—') + '</div>' + stand + '</div>'))
      .catch(() => { cerut = false; });
  });
  return m;
}
// Prima și ultima MIȘCARE reală, nu marginile intervalului: dacă mașina a stat în curte până la 07:12,
// un steag pus la 00:00 ar susține că a pornit la miezul nopții.
const MOVE_KMH = 3;
function moveBounds(pts: any[]) {
  let go = -1, stop = -1;
  for (let i = 0; i < pts.length; i++) if ((pts[i].speed || 0) > MOVE_KMH) { go = i; break; }
  for (let i = pts.length - 1; i >= 0; i--) if ((pts[i].speed || 0) > MOVE_KMH) { stop = i; break; }
  if (go < 0) return { go: 0, stop: Math.max(0, pts.length - 1), moved: false };
  return { go, stop, moved: true };
}

// Traseul aliniat pe drumuri: pentru care cursă s-a cerut (null = tot intervalul), geometria și vitezele.
interface Snap { sel: number | null; ll: LatLng[]; sp: number[]; source?: string }

export function RouteScreen() {
  const { params, query } = useRoute();
  const imei = decodeURIComponent((params as any).imei);
  // `?pana=<ms>` — deschis din Dispozitive arhivate („Istoric"): un aparat arhivat n-are date azi, deci intervalul
  // se termină la ULTIMA lui poziție (7 zile până atunci). `arhivat=1` + `nume` = eticheta „(arhivat)" din antet,
  // fiindcă aparatul nu mai e în lista de vehicule (ca pe web, archViewHistory).
  const panaMs = Number((query as any)?.pana);
  const dinArhiva = isFinite(panaMs) && panaMs > 0 ? { from: new Date(panaMs - 7 * 86400000).toISOString(), to: new Date(panaMs).toISOString() } : null;
  const [period, setPeriod] = useState<Period>(dinArhiva ? 'custom' : 'today');
  const [rng, setRng] = useState<Range>(() => dinArhiva || range('today'));
  // „De la / Până la", ca pe web — scurtăturile Azi / Ieri / 7 zile rămân alături.
  const [cFrom, setCFrom] = useState(dinArhiva ? localInput(new Date(dinArhiva.from)) : '');
  const [cTo, setCTo] = useState(dinArhiva ? localInput(new Date(dinArhiva.to)) : '');
  const [pts, setPts] = useState<any[] | null>(null);
  const [routes, setRoutes] = useState<any[] | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  // Din /api/history?ext=1: limita de viteză din fișă + depășirile pe tot intervalul.
  const [ext, setExt] = useState<{ limit: number | null; overCount: number; maxOver: number } | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const osmLayer = useRef<L.LayerGroup | null>(null);   // overlay „limite reale" (OSM)
  const [osmOn, setOsmOn] = useState(false);
  const [osmBusy, setOsmBusy] = useState(false);
  const [osmInfo, setOsmInfo] = useState<string | null>(null);
  const [osmOver, setOsmOver] = useState(false); // există depășiri → arată legenda treptelor de culoare
  const [snap, setSnap] = useState<Snap | null>(null);
  const [snapBusy, setSnapBusy] = useState(false);
  const [snapMsg, setSnapMsg] = useState<{ t: string; err?: boolean } | null>(null);
  // Cererile lungi (alinierea pe drumuri poate dura ~25 s prin Overpass, limitele OSM la fel) pot sosi DUPĂ ce
  // omul a schimbat perioada sau ruta. `genDate` crește la fiecare set nou de date (perioadă / vehicul);
  // `selCur` e ruta selectată ACUM. Un răspuns pentru altceva decât ce e pe ecran se aruncă — altfel linia
  // aliniată a intervalului vechi s-ar desena sub steagurile și totalurile celui nou.
  const genDate = useRef(0);
  const selCur = useRef<number | null>(null);
  selCur.current = sel;
  const [expOpen, setExpOpen] = useState(false);
  const [exporting, setExporting] = useState('');

  // ── Harta (o singură dată) ───────────────────────────────────────────────
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return;
    const map = L.map(mapEl.current, { attributionControl: false }).setView([45.9, 25], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
    layer.current = L.layerGroup().addTo(map);
    osmLayer.current = L.layerGroup().addTo(map); // overlay limite OSM, deasupra traseului
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 120);
    return () => { map.remove(); mapRef.current = null; };
  }, []);

  function alegePerioada(p: Period) {
    setPeriod(p);
    if (p === 'custom') {
      // Pornește de la intervalul de acum, ca să nu scrii totul de la zero.
      setCFrom(localInput(new Date(rng.from))); setCTo(localInput(new Date(rng.to)));
      return; // se încarcă abia la „Încarcă traseul"
    }
    setRng(range(p));
  }
  function aplicaInterval() {
    if (!cFrom || !cTo) { showToast('Alege intervalul (De la / Până la), sau apasă Azi / Ieri / 7 zile.', true); return; }
    const a = new Date(cFrom), b = new Date(cTo);
    if (isNaN(a.getTime()) || isNaN(b.getTime())) { showToast('Data nu e validă.', true); return; }
    if (a.getTime() >= b.getTime()) { showToast('„De la" trebuie să fie înainte de „Până la".', true); return; }
    if (b.getTime() - a.getTime() > MAX_ZILE * 86400000) { showToast('Intervalul poate avea cel mult ' + MAX_ZILE + ' de zile. Restrânge perioada.', true); return; }
    setRng({ from: a.toISOString(), to: b.toISOString() });
  }

  // ── Date: punctele brute (pentru desen) + rutele grupate (din raport) ─────
  useEffect(() => {
    let alive = true; // anti-race: la schimbare rapidă de perioadă, ignoră răspunsul vechi care sosește ultimul
    genDate.current++; // alinierea / limitele OSM cerute pe datele de dinainte nu mai au voie să se deseneze
    setPts(null); setRoutes(null); setSummary(null); setSel(null); setExt(null);
    setOsmOn(false); setOsmInfo(null); if (osmLayer.current) osmLayer.current.clearLayers(); // overlay OSM e stale la schimbarea perioadei
    setSnap(null); setSnapMsg(null);
    const { from, to } = rng;
    Promise.all([
      Api.history(imei, from, to).then((r: any) => r).catch((e: any) => ({ __err: (e && e.message) || 'Traseul nu s-a putut încărca' })),
      Api.report(imei, from, to).catch(() => null),
    ]).then(([h, rep]: any) => {
      if (!alive) return;
      if (h && h.__err) showToast(h.__err, true); // ex. „Interval prea mare (max 92 de zile…)" — nu „nicio rută"
      const points = Array.isArray(h) ? h : ((h && (h.points || h.rows)) || []);
      const dev = h && !Array.isArray(h) ? h.device : null;
      const sm = h && !Array.isArray(h) ? h.summary : null;
      setExt({
        limit: dev && Number(dev.speed_limit) > 0 ? Number(dev.speed_limit) : null,
        overCount: (sm && Number(sm.overspeedCount)) || 0, maxOver: (sm && Math.round(Number(sm.maxOverKmh))) || 0,
      });
      setPts((points || []).filter((p: any) => p.latitude != null && p.longitude != null));
      if (rep && Array.isArray(rep.routes)) { setRoutes(rep.routes); setSummary(rep.summary || null); }
      else { setRoutes([]); setSummary(null); }
    });
    return () => { alive = false; };
  }, [rng.from, rng.to, imei]);

  // Alinierea e făcută pentru cursa de atunci; schimbi cursa → revii la linia brută (butonul se stinge).
  useEffect(() => { if (snap && snap.sel !== sel) { setSnap(null); setSnapMsg(null); } }, [sel]);

  // Fiecare rută → punctele ei (feliate din istoric după intervalul de timp)
  const slices = useMemo<any[][]>(() => {
    if (!pts || !routes) return [];
    return routes.map((r) => {
      const a = new Date(r.startTime).getTime(), b = new Date(r.endTime).getTime();
      return pts.filter((p) => { const t = ptMs(p); return t >= a && t <= b; });
    });
  }, [pts, routes]);

  // Colorarea după viteză: pornită din „Afișaj" (overspeed_heatmap, implicit da) ȘI doar dacă mașina are o
  // limită de viteză în fișă — fără limită n-ai față de ce colora.
  const heatPref = !(uiPrefs.value && uiPrefs.value.overspeed_heatmap === false);
  const limit = heatPref && ext && ext.limit ? ext.limit : null;

  // ── Desen: ruta selectată evidențiată, restul estompate; fără selecție → toate ──
  useEffect(() => {
    const map = mapRef.current, lg = layer.current; if (!map || !lg || pts === null) return;
    try {
      lg.clearLayers();
      const haveRoutes = !!routes && slices.some((s) => s.length > 1);
      // Aliniat pe tot intervalul → linia aliniată ia locul tuturor bucăților. Steagurile rămân pe punctele
      // BRUTE (acolo a stat mașina), ca pe web.
      const snapTot = !!snap && snap.sel == null && sel == null;
      if (haveRoutes) {
        let focus: LatLng[] | null = null;
        if (snapTot) addLine(lg, snap!.ll, snap!.sp, limit, { color: GREEN, weight: 4, opacity: 1 });
        slices.forEach((s, i) => {
          if (s.length < 2) return;
          const isSel = sel === i, isDim = sel != null && !isSel;
          if (isSel) focus = llOf(s);
          if (snapTot) return;
          const aliniat = !!snap && snap.sel === i && isSel;
          addLine(lg, aliniat ? snap!.ll : llOf(s), isDim ? null : (aliniat ? snap!.sp : spOf(s)), isDim ? null : limit,
            { color: isDim ? DIM : GREEN, weight: isSel ? 5 : (isDim ? 2 : 4), opacity: isDim ? 0.5 : 1 });
        });
        if (sel != null && focus) {
          // O cursă selectată e deja delimitată de mișcare — capetele ei SUNT plecarea și sosirea.
          const rr = routes && routes[sel] ? routes[sel] : null;
          const f = focus as LatLng[];
          flagMarker(f[0], START, 'Pornire', rr && rr.start ? rr.start : null, null, '').addTo(lg);
          flagMarker(f[f.length - 1], STOP, 'Oprire', rr && rr.end ? rr.end : null, null, '').addTo(lg);
          map.fitBounds(L.latLngBounds(focus).pad(0.15), { animate: false });
        } else if (sel != null && routes && routes[sel]) {
          // Ruta selectată dar cu <2 puncte în istoric → centrează pe coordonatele rutei din raport (mereu prezente)
          const r = routes[sel];
          if (r.startLat != null && r.startLng != null) flagMarker([r.startLat, r.startLng], START, 'Pornire', r.start || null, null, '').addTo(lg);
          if (r.endLat != null && r.endLng != null) flagMarker([r.endLat, r.endLng], STOP, 'Oprire', r.end || null, null, '').addTo(lg);
          const b = L.latLngBounds([[r.startLat, r.startLng], [r.endLat, r.endLng]] as LatLng[]);
          if (b.isValid()) map.fitBounds(b.pad(0.15), { animate: false });
        } else {
          const all = llOf(slices.flat());
          // Fără cursă selectată: steagurile marchează prima și ultima mișcare din TOT intervalul,
          // iar popup-ul spune cât a stat pe loc înainte de plecare și de la oprire încoace.
          const b = moveBounds(pts);
          const p0 = pts[b.go], p1 = pts[b.stop];
          if (p0) flagMarker([p0.latitude, p0.longitude], START, b.moved ? 'Pornire' : 'Nu s-a deplasat',
            p0.timestamp, b.moved ? (ptMs(p0) - ptMs(pts[0])) : null, 'înainte').addTo(lg);
          if (p1) flagMarker([p1.latitude, p1.longitude], STOP, b.moved ? 'Oprire' : 'Ultima poziție',
            p1.timestamp, b.moved ? (ptMs(pts[pts.length - 1]) - ptMs(p1)) : null, 'de atunci').addTo(lg);
          if (all.length) map.fitBounds(L.latLngBounds(all).pad(0.15), { animate: false });
        }
      } else if (pts.length >= 2) {
        // Fallback: nicio rută detectată → o singură linie din toate punctele
        const ll = llOf(pts);
        if (snap && snap.sel == null) addLine(lg, snap.ll, snap.sp, limit, { color: GREEN, weight: 4 });
        else addLine(lg, ll, spOf(pts), limit, { color: GREEN, weight: 4 });
        const bb = moveBounds(pts);
        const q0 = pts[bb.go], q1 = pts[bb.stop];
        if (q0) flagMarker([q0.latitude, q0.longitude], START, bb.moved ? 'Pornire' : 'Nu s-a deplasat',
          q0.timestamp, bb.moved ? (ptMs(q0) - ptMs(pts[0])) : null, 'înainte').addTo(lg);
        if (q1) flagMarker([q1.latitude, q1.longitude], STOP, bb.moved ? 'Oprire' : 'Ultima poziție',
          q1.timestamp, bb.moved ? (ptMs(pts[pts.length - 1]) - ptMs(q1)) : null, 'de atunci').addTo(lg);
        map.fitBounds(L.latLngBounds(ll).pad(0.15), { animate: false });
      }
    } catch { /* hartă în curs de demontare */ }
  }, [pts, routes, slices, sel, snap, limit]);

  // Punctele pe care lucrează butoanele de pe hartă: cursa apăsată, altfel tot intervalul.
  function puncteLucru(): any[] {
    let data = (pts || []).filter((p) => p.latitude != null && p.longitude != null);
    if (sel != null && routes && routes[sel]) {
      const a = new Date(routes[sel].startTime).getTime(), b = new Date(routes[sel].endTime).getTime();
      data = data.filter((p) => { const t = ptMs(p); return t >= a && t <= b; });
    }
    return data;
  }

  // ── Overlay „limite reale" (OSM): roșu unde viteza a depășit limita REALĂ a drumului (la cerere) ──
  async function toggleOsm() {
    const og = osmLayer.current; if (!og) return;
    if (osmOn) { og.clearLayers(); setOsmOn(false); setOsmInfo(null); setOsmOver(false); return; }
    // DOAR ruta selectată (dacă userul a apăsat una) — altfel toată perioada. Nu mai verifică toată ziua când e o rută apăsată.
    const data = puncteLucru();
    if (data.length < 2) { showToast(sel != null ? 'Ruta selectată n-are traseu detaliat.' : 'Selectează o rută sau verifică perioada.'); return; }
    setOsmBusy(true);
    const g = genDate.current, s0 = sel;
    try {
      const r = await Api.roadLimits(data.map((p) => [p.latitude, p.longitude] as [number, number]));
      // Altă perioadă / altă rută între timp → limitele sunt ale altui traseu; nu le desenăm peste cel nou.
      if (genDate.current !== g || selCur.current !== s0) return;
      const lim = r.limits || [];
      og.clearLayers();
      let over = 0, withLimit = 0, maxOver = 0;
      let chunk: LatLng[] | null = null, chunkLim = 0, chunkMaxSp = 0, chunkTier = 0;
      const GAP_MS = 3 * 60 * 1000; // >3 min între poziții = pauză/gap GPS → NU lega segmentul (altfel linie dreaptă greșită peste hartă)
      // Închide segmentul + atașează popup (tap) cu limita reală + viteza mașinii. Culoarea = treapta depășirii.
      const closeChunk = () => {
        if (chunk && chunk.length > 1) {
          const o = Math.round(chunkMaxSp - chunkLim);
          const c = OSM_TIERS[chunkTier].color;
          L.polyline(chunk, { color: c, weight: 6, opacity: 0.95 }).addTo(og)
            .bindPopup(`<b style="color:${c};">Depășire viteză</b><br>Limita drumului: <b>${chunkLim} km/h</b><br>Mașina: <b>${Math.round(chunkMaxSp)} km/h</b> (+${o})`);
        }
        chunk = null; chunkLim = 0; chunkMaxSp = 0; chunkTier = 0;
      };
      for (let i = 0; i < data.length; i++) {
        const lm = lim[i], sp = Number(data[i].speed) || 0;
        if (typeof lm === 'number') withLimit++;
        const gap = i > 0 ? (ptMs(data[i]) - ptMs(data[i - 1])) : 0;
        if (gap > GAP_MS) closeChunk(); // rupe la pauze — nu conecta puncte îndepărtate în timp
        const isOver = typeof lm === 'number' && sp > lm + 3; // toleranță 3 km/h (zgomot GPS)
        if (isOver) {
          over++; if (sp - lm > maxOver) maxOver = sp - lm;
          const t = osmTier(sp - (lm as number));
          if (chunk && t !== chunkTier) closeChunk(); // treapta se schimbă → segment nou (culoare diferită)
          if (!chunk) {
            const prev = (i > 0 && gap <= GAP_MS) ? data[i - 1] : data[i]; // pornește de la punctul anterior DOAR dacă e contiguu
            chunk = [[prev.latitude, prev.longitude]]; chunkLim = lm as number; chunkMaxSp = 0; chunkTier = t;
          }
          chunk.push([data[i].latitude, data[i].longitude]);
          if (sp > chunkMaxSp) chunkMaxSp = sp;
          if ((lm as number) < chunkLim) chunkLim = lm as number;
        } else { closeChunk(); }
      }
      closeChunk();
      setOsmOn(true);
      setOsmOver(over > 0);
      setOsmInfo(withLimit === 0 ? 'Fără limite OSM pe acest traseu (drumuri netagate)'
        : (over > 0 ? `${over} puncte peste limită${sel != null ? ' (ruta selectată)' : ''} · max +${maxOver} km/h` : 'Fără depășiri vs. limita reală' + (sel != null ? ' (ruta selectată)' : '')));
    } catch (e: any) {
      showToast(e?.message || 'Limite OSM indisponibile');
    } finally { setOsmBusy(false); }
  }

  // ── „Aliniază pe drumuri", la cerere: mută punctele pe carosabil (OpenStreetMap, gratuit) ──
  // Nu e map-matching adevărat: punctele se mută pe cel mai apropiat drum, drumul dintre ele nu se reconstruiește.
  // A doua apăsare revine la linia brută.
  async function toggleSnap() {
    if (snap) { setSnap(null); setSnapMsg(null); return; }
    const data = puncteLucru();
    if (data.length < 2) { showToast(sel != null ? 'Ruta selectată n-are traseu detaliat.' : 'Încarcă întâi un traseu.'); return; }
    setSnapBusy(true); setSnapMsg(null);
    const g = genDate.current, s0 = sel;
    try {
      const j = await Api.matchRoads(data.map((p) => [p.latitude, p.longitude] as [number, number]));
      // Între timp s-a schimbat perioada / vehiculul / ruta → răspunsul e pentru alt traseu. Îl aruncăm.
      if (genDate.current !== g || selCur.current !== s0) return;
      if (j && Array.isArray(j.matched) && j.matched.length > 1) {
        const m = j.matched as LatLng[];
        // Culorile de viteză: proiecția păstrează punctele 1:1, deci vitezele se mapează direct. Altă
        // geometrie (OSRM) → viteza celui mai apropiat punct brut, mergând înainte pe traseu (ca pe web).
        let sp: number[];
        if (m.length === data.length) sp = spOf(data);
        else {
          sp = []; let k = 0;
          const d2 = (ay: number, ax: number, by: number, bx: number) => { const dy = ay - by, dx = ax - bx; return dy * dy + dx * dx; };
          for (let i = 0; i < m.length; i++) {
            const v = m[i];
            while (k < data.length - 1 && d2(v[0], v[1], data[k + 1].latitude, data[k + 1].longitude) <= d2(v[0], v[1], data[k].latitude, data[k].longitude)) k++;
            sp.push(data[k] ? Number(data[k].speed) || 0 : 0);
          }
        }
        setSnap({ sel, ll: m, sp, source: j.source });
        setSnapMsg({ t: 'Traseu aliniat pe drumuri' + (sel != null ? ' (ruta selectată)' : '') + (j.source === 'osm' ? ' · © OpenStreetMap contributors' : '') });
      } else if (j && j.reason === 'zona_prea_mare') {
        setSnapMsg({ t: 'Traseul e prea întins pentru aliniere. Alege un interval mai scurt.', err: true });
      } else if (j && j.reason === 'osm_indisponibil') {
        // Serverele publice OpenStreetMap chiar cad des — nu lăsa omul să creadă că e ceva cu datele lui.
        setSnapMsg({ t: 'Serviciul OpenStreetMap nu răspunde acum. Încearcă din nou peste câteva minute.', err: true });
      } else {
        setSnapMsg({ t: 'Nu am găsit drumuri aproape de traseu (zonă fără acoperire OSM sau deplasare în afara drumurilor).', err: true });
      }
    } catch (e: any) {
      if (genDate.current !== g || selCur.current !== s0) return;
      setSnapMsg({ t: (e && e.status === 408) ? e.message : 'Eroare la aliniere.', err: true });
    } finally { setSnapBusy(false); }
  }

  const veh = vehicles.value.find((v) => v.imei === imei);

  // ── Export: Excel (de la server, ca pe web: numele casei, logo-ul, sumarul și pozițiile pe românește — 01.10)
  //    și KML (Google Earth / Maps, făcut aici). CSV-ul brut a ieșit: avea codurile aparatului și se deschidea
  //    într-o singură coloană în Excel (Alin, 01.10: „doar cifre, nimic de înțeles"). ──
  async function exportExcel() {
    if (exporting) return;
    setExporting('xlsx');
    try {
      const q = '?imeis=' + encodeURIComponent(imei) + '&from=' + encodeURIComponent(rng.from) + '&to=' + encodeURIComponent(rng.to);
      await salveazaDeLaServer('/api/traseu/excel' + q, 'RA-Track - Traseu.xlsx');
      setExpOpen(false);
    } catch (e: any) { showToast(e?.message || 'Exportul n-a mers', true); }
    finally { setExporting(''); }
  }
  async function exportKml() {
    if (exporting) return;
    const p = pts || [];
    if (!p.length) { showToast('Nu sunt date pentru perioada selectată', true); return; }
    setExporting('kml');
    try {
      const vname = (veh && (veh.name || veh.plate)) || imei;
      const x = (s: any) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const coords = p.map((q) => q.longitude + ',' + q.latitude + ',0').join(' ');
      const s = p[0], e = p[p.length - 1];
      // Același fișier ca pe web (exportKML): linia traseului + „Start" și „Stop".
      const kml = '<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<kml xmlns="http://www.opengis.net/kml/2.2"><Document>\n'
        + '<name>' + x('Traseu ' + vname) + '</name>\n'
        + '<Style id="t"><LineStyle><color>fff8bd38</color><width>4</width></LineStyle></Style>\n'
        + '<Style id="s"><IconStyle><color>ff22c55e</color></IconStyle></Style>\n'
        + '<Style id="f"><IconStyle><color>ff4444ef</color></IconStyle></Style>\n'
        + '<Placemark><name>' + x(vname) + '</name><styleUrl>#t</styleUrl>'
        + '<LineString><tessellate>1</tessellate><coordinates>' + coords + '</coordinates></LineString></Placemark>\n'
        + '<Placemark><name>Start</name><description>' + x(new Date(s.timestamp).toLocaleString('ro-RO')) + '</description><styleUrl>#s</styleUrl><Point><coordinates>' + s.longitude + ',' + s.latitude + ',0</coordinates></Point></Placemark>\n'
        + '<Placemark><name>Stop</name><description>' + x(new Date(e.timestamp).toLocaleString('ro-RO')) + '</description><styleUrl>#f</styleUrl><Point><coordinates>' + e.longitude + ',' + e.latitude + ',0</coordinates></Point></Placemark>\n'
        + '</Document></kml>';
      const fname = numeKmlTraseu((veh && veh.name) || imei, veh && veh.plate);
      await salveazaText(fname, kml, 'application/vnd.google-earth.kml+xml');
      setExpOpen(false);
    } catch (e: any) { showToast(e?.message || 'Eroare la export KML', true); }
    finally { setExporting(''); }
  }

  const loading = pts === null || routes === null;
  const nRoutes = routes ? routes.length : 0;
  const km = summary && summary.totalKm != null ? Number(summary.totalKm) : (routes || []).reduce((a, r) => a + (r.distance || 0), 0);
  const maxSp = summary && summary.maxSpeed != null ? Number(summary.maxSpeed) : (routes || []).reduce((a, r) => Math.max(a, r.maxSpeed || 0), 0);
  // Carburant + timpi (din summary-ul raportului) — null la vehiculele fără senzor de combustibil / fără contact
  const fuel = summary && summary.fuelConsumed != null ? Number(summary.fuelConsumed) : null;
  const avgC = summary && summary.avgConsumption != null ? Number(summary.avgConsumption) : null;
  const moveSec = summary && summary.movingTime != null ? Number(summary.movingTime) : 0;
  const idleSec = summary && summary.engineIdleTime != null ? Number(summary.engineIdleTime) : 0;
  const areTraseu = !loading && !!pts && pts.length > 1;

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()}><Icon name="chevronL" /></button>
        <div class="h-title" style="display:flex;flex-direction:column;line-height:1.15">
          <span>Traseu</span>
          {veh ? <span style="font-size:11.5px;font-weight:600;color:var(--text-muted)">{veh.name || veh.imei}{veh.plate ? ' · ' + veh.plate : ''}</span>
            : (query as any)?.arhivat ? <span style="font-size:11.5px;font-weight:600;color:var(--text-muted)">{(query as any).nume || imei} (arhivat)</span> : null}
        </div>
        <button class="h-btn" disabled={loading} onClick={() => setExpOpen(true)} aria-label="Exportă traseul (Excel / KML)" title="Exportă">
          <Icon name="download" />
        </button>
      </header>
      <div class="rt-periods">
        {(['today', 'yesterday', 'week', 'custom'] as Period[]).map((p) => (
          <button class={'rt-period' + (period === p ? ' on' : '')} onClick={() => alegePerioada(p)}>
            {p === 'today' ? 'Azi' : p === 'yesterday' ? 'Ieri' : p === 'week' ? '7 zile' : 'Interval'}
          </button>
        ))}
      </div>
      {period === 'custom' && (
        <div style="padding:0 14px 10px;display:flex;flex-direction:column;gap:8px">
          <div style="display:flex;gap:8px">
            <label style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:var(--text-muted)">De la
              <input type="datetime-local" value={cFrom} onInput={(e) => setCFrom((e.target as HTMLInputElement).value)}
                style="min-height:44px;width:100%;box-sizing:border-box;background:var(--bg-dark);border:1px solid var(--border);border-radius:10px;color:var(--text-primary);padding:0 8px;font-size:14px;font-family:inherit" />
            </label>
            <label style="flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:var(--text-muted)">Până la
              <input type="datetime-local" value={cTo} onInput={(e) => setCTo((e.target as HTMLInputElement).value)}
                style="min-height:44px;width:100%;box-sizing:border-box;background:var(--bg-dark);border:1px solid var(--border);border-radius:10px;color:var(--text-primary);padding:0 8px;font-size:14px;font-family:inherit" />
            </label>
          </div>
          <button class="btn btn-primary" style="min-height:44px" onClick={aplicaInterval}><Icon name="download" size={16} /> Încarcă traseul</button>
          <div style="font-size:11.5px;color:var(--text-muted)">Acum: {fmtScurt(rng.from)} → {fmtScurt(rng.to)} · cel mult {MAX_ZILE} de zile</div>
        </div>
      )}
      <div class="rt-map">
        <div ref={mapEl} />
        {loading && <div class="rt-mapload"><div class="spin" /></div>}
        {areTraseu && (
          <button class={'rt-osmbtn' + (osmOn ? ' on' : '')} onClick={toggleOsm} disabled={osmBusy} aria-label="Limite reale (OSM)" title="Limite reale (OSM)">
            {osmBusy ? <div class="spin sm" /> : <Icon name="gauge" size={18} />}
          </button>
        )}
        {areTraseu && (
          <button class={'rt-osmbtn' + (snap ? ' on' : '')} style="top:56px" onClick={toggleSnap} disabled={snapBusy}
            aria-label={snap ? 'Traseu aliniat pe drumuri (apasă pentru linia brută)' : 'Aliniază pe drumuri'}
            title={snap ? 'Traseu aliniat pe drumuri' : 'Aliniază pe drumuri'}>
            {snapBusy ? <div class="spin sm" /> : <Icon name="route" size={18} />}
          </button>
        )}
      </div>
      {areTraseu && limit != null && ext && (
        <div class="rt-osmcap" style="flex-wrap:wrap;row-gap:3px">
          <span style="display:inline-flex;align-items:center;gap:8px;white-space:nowrap">
            {SPD.map((t) => (
              <span style="display:inline-flex;align-items:center;gap:3px">
                <span style={`width:8px;height:8px;border-radius:50%;display:inline-block;background:${t.color}`} />{t.label}
              </span>
            ))}
          </span>
          <span style="margin-left:4px">
            · {ext.overCount > 0
              ? `${ext.overCount} depășiri · max +${ext.maxOver} km/h (limită ${limit} km/h)`
              : `Fără depășiri (limită ${limit} km/h)`}
          </span>
        </div>
      )}
      {osmInfo && (
        <div class="rt-osmcap">
          <Icon name="gauge" size={12} /> {osmInfo} · <span class="src">© OpenStreetMap contributors</span>
          {osmOver && (
            <span style="display:inline-flex;align-items:center;gap:8px;margin-left:8px;white-space:nowrap">
              {OSM_TIERS.map((t) => (
                <span style="display:inline-flex;align-items:center;gap:3px">
                  <span style={`width:8px;height:8px;border-radius:50%;display:inline-block;background:${t.color}`} />{t.label}
                </span>
              ))}
            </span>
          )}
        </div>
      )}
      {snapMsg && (
        <div class="rt-osmcap" style={snapMsg.err ? 'color:var(--red)' : ''}>
          <Icon name={snapMsg.err ? 'alert' : 'route'} size={12} /> {snapMsg.t}
        </div>
      )}

      <div class="rt-summary">
        <div class="rt-sum"><div class="v">{loading ? '—' : km.toFixed(1)}</div><div class="l">km parcurși</div></div>
        <div class="rt-sum"><div class="v">{loading ? '—' : nRoutes}</div><div class="l">rute</div></div>
        <div class="rt-sum"><div class="v">{loading ? '—' : Math.round(maxSp)}</div><div class="l">km/h max</div></div>
      </div>
      <div class="rt-substats">
        <div class="rt-sum"><div class="v">{loading ? '—' : (fuel != null ? fuel.toFixed(1) : '—')}</div><div class="l">carburant (L)</div></div>
        <div class="rt-sum"><div class="v">{loading ? '—' : (avgC != null ? avgC.toFixed(1) : '—')}</div><div class="l">consum (L/100)</div></div>
        <div class="rt-sum"><div class="v">{loading ? '—' : fmtDur(moveSec)}</div><div class="l">timp mers</div></div>
        <div class="rt-sum"><div class="v">{loading ? '—' : fmtDur(idleSec)}</div><div class="l">motor staționat</div></div>
      </div>

      <div class="rt-list">
        {loading ? (
          <div class="rt-empty"><div class="spin" /></div>
        ) : nRoutes === 0 ? (
          <div class="rt-empty">Nicio rută în perioada selectată.</div>
        ) : (
          <>
            <div class="rt-listhead">
              <span>{nRoutes} {nRoutes === 1 ? 'rută' : 'rute'} · apasă o rută pentru a o vedea pe hartă</span>
              {sel != null && <button class="rt-allbtn" onClick={() => setSel(null)}><Icon name="layers" size={14} /> Toate</button>}
            </div>
            {routes!.map((r, i) => (
              <button class={'rt-card' + (sel === i ? ' on' : '')} onClick={() => setSel(sel === i ? null : i)}>
                <div class="rt-card-top">
                  <span class="rt-card-time"><span class="rt-rdot" /> {fmtTime(r.startTime)} <span class="arr">→</span> {fmtTime(r.endTime)}</span>
                  <span class="rt-card-km">{(r.distance || 0).toFixed(1)} km</span>
                </div>
                <div class="rt-card-meta">
                  <span><Icon name="clock" size={12} /> {fmtDur(r.duration)}</span>
                  <span><Icon name="gauge" size={12} /> {r.avgSpeed || 0} km/h</span>
                  <span class={(r.maxSpeed || 0) > 120 ? 'hot' : ''}><Icon name="alert" size={12} /> {r.maxSpeed || 0} km/h</span>
                </div>
              </button>
            ))}
          </>
        )}
      </div>

      {expOpen && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !exporting) setExpOpen(false); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b>Exportă traseul</b>
              <button class="h-btn" onClick={() => setExpOpen(false)} aria-label="Închide"><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              <div class="loc-exp-note" style="margin:0 2px 10px">Tot intervalul ales: {fmtScurt(rng.from)} → {fmtScurt(rng.to)}</div>
              <button class="loc-exp" disabled={!!exporting} onClick={exportExcel}>
                <Icon name="list" size={22} /><div><b>Excel</b><small>Sumarul și fiecare poziție, pe românește</small></div>
                {exporting === 'xlsx' && <div class="spin" />}
              </button>
              <button class="loc-exp" disabled={!!exporting || !pts || !pts.length} onClick={exportKml}>
                <Icon name="map" size={22} /><div><b>KML</b><small>Pentru Google Earth / Google Maps</small></div>
                {exporting === 'kml' && <div class="spin" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
