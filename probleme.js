// probleme.js — „Am găsit o problemă", în locul benzii „De verificat" (Alin, 15.10: „de verificat… păi pe bune, ce să
// verific? Am AI… îmi zice clar dacă e greșit ceva sau nu, nu să verific eu… mă duce exact unde e problema… e un detector
// de probleme AI-ul ăsta, dar și un bun concluzionist și un bun îndrumător").
//
// Problemele le găsește APLICAȚIA, din date, pe reguli scrise aici; RA Insight doar le spune pe românește. Fiecare
// problemă are: ce e (titlu), dovada (din ce cifre reiese) și butoanele spre locul exact (Traseu la minutul acela, fișa
// mașinii, raportul). Trei feluri azi:
//   1. sursaConsum      — de unde vine cifra de consum: MĂSURATĂ (contor, senzor) sau SOCOTITĂ din fișă. Până pe 15.10
//                         RA Insight spunea „47 L, estimat din nivelul CAN" despre o cifră socotită din fișă.
//   2. problemaSenzor   — nivelul din rezervor stă pe loc pe zeci / sute de km: senzorul nu măsoară nimic.
//   3. verdictViteza    — o viteză mare e REALĂ (mai multe poziții la rând, drumul se leagă) sau o EROARE DE GPS (un
//                         singur punct ieșit din șir). Până pe 15.10: „159 km/h — merită verificate".
// Curat: fără bază, fără rețea, fără model. Pragurile stau AICI și nicăieri altundeva.
'use strict';
const I = require('./insight.js');
const CE = require('./cereri_echipa.js');   // „Anunță echipa RA Track" (22.10): butonul și nota casetei, un singur loc

const KM_SENZOR = 100;          // pe atâția km un rezervor TREBUIE să scadă vizibil
const SENZOR_PRAG_L = 1.5;      // nivelul a variat sub atât pe toată perioada = nu se mișcă
const VITEZA_AUTO = 130;        // cea mai mare limită din România (autostradă)
const VITEZA_CAMION = 90;       // camioanele și autobuzele (limitatorul lor)
const PUNCTE_REALE = 2;         // poziții la rând peste prag = viteză reală
const SALT_GPS_KMH = 250;       // din poziția dinainte în asta, mai repede de atât = punctul a „sărit"

const ZI = 86400000;
function nr(v, z) { return Number(v).toLocaleString('ro-RO', { minimumFractionDigits: z || 0, maximumFractionDigits: z || 0 }); }
function _km(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
function _parti(ms) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).forEach(function (x) { if (x.type !== 'literal') p[x.type] = x.value; });
  return p;
}
// „8 octombrie" și „14:32", pe ora României.
function ziua(ms) { const p = _parti(ms); return (+p.day) + ' ' + LUNI[+p.month - 1]; }
function ora(ms) { const p = _parti(ms); return p.hour + ':' + p.minute; }

// ─── 1. De unde vine cifra de consum ────────────────────────────────────────────────────────────────
// v = { sursa: 'CAN' | 'Senzor' | 'Estimat (nivel CAN)' | 'Estimat', consumFisa, consumImplicit, nivelBlocat, nivelStart }
// → { masurat, text } — textul îl primește RA Insight lângă cifră și îl spune omului așa.
function sursaConsum(v) {
  v = v || {};
  if (v.sursa === 'CAN') return { masurat: true, text: 'măsurat de calculatorul mașinii (contorul de consum)' };
  if (v.sursa === 'Senzor') return { masurat: true, text: 'măsurat din cât a scăzut nivelul din rezervor' };
  const dinFisa = v.consumFisa != null
    ? 'socotit din consumul trecut în fișa mașinii (' + nr(v.consumFisa, 1) + ' l/100 km)'
    : (v.consumImplicit != null ? 'socotit dintr-un consum obișnuit pentru felul mașinii (' + nr(v.consumImplicit, 1) + ' l/100 km), fiindcă fișa n-are consumul trecut' : 'socotit, nu măsurat');
  // Fapte, fără vină pe echipament (Alin, 19.10: „nu trebuie să ne învinuim pe noi… «păi voi nu ați verificat dacă are, eu vă
  // plătesc»"): aparatul, senzorii și montajul sunt treaba noastră, nu a clientului. NU scrie „senzorul e blocat", „mașina nu trimite".
  if (v.nivelBlocat) return { masurat: false, text: 'NU e măsurat: nivelul din rezervor a stat pe ' + nr(v.nivelStart) + ' L toată perioada, deși mașina a mers; ' + dinFisa };
  if (v.sursa === 'Estimat (nivel CAN)') return { masurat: false, text: 'NU e măsurat: nivelul din rezervor nu e destul de precis ca să se poată socoti din el; ' + dinFisa };
  return { masurat: false, text: 'NU e măsurat; ' + dinFisa };
}

// ─── 2. Nivelul din rezervor care nu se schimbă ─────────────────────────────────────────────────────
// niveluri = citirile de nivel din perioadă (L), km = drumul făcut. true = pe KM_SENZOR km sau mai mult nivelul a variat
// sub SENZOR_PRAG_L — o mașină care merge consumă, deci din nivel nu se poate socoti consumul. Clientului i se spune DOAR
// faptul (consumul e socotit, nu măsurat), fără „senzorul e blocat" și fără butoane spre lucruri tehnice (19.10).
function nivelBlocat(nivMin, nivMax, km, alimentat) {
  if (nivMin == null || nivMax == null || !(km >= KM_SENZOR)) return false;
  return (nivMax - nivMin) < SENZOR_PRAG_L && !(alimentat >= SENZOR_PRAG_L);
}
// v = { vehicul, imei, km, nivelStart, consumFisa, consumImplicit }, per = { from, to, eticheta }
function problemaSenzor(v, per) {
  const s = sursaConsum(Object.assign({}, v, { nivelBlocat: true }));
  return {
    fel: 'senzor', grav: 'galben',
    titlu: 'Consumul la ' + v.vehicul + ' nu se poate măsura acum',
    dovada: (per && per.eticheta ? 'Pe ' + per.eticheta + ' nivelul din rezervor' : 'Nivelul din rezervor') + ' a stat la ' + nr(v.nivelStart) + ' L, deși mașina a mers ' + nr(v.km) +
      ' km, așa că din el nu se poate măsura consumul. Consumul de aici e ' + s.text.replace(/^NU e măsurat: [^;]*; /, '') + '.',
    // „Anunță echipa RA Track" e PRIMUL (macheta din 21.10, aprobată 22.10): aparatul e treaba noastră, deci singurul lucru pe care
    // îl are omul de făcut e să ne anunțe. Sub butoane, nota (`nota`); după trimitere serverul pune în loc „Echipa se ocupă".
    butoane: [
      { fel: 'echipa', text: CE.BUTON, problema: 'consum', imei: v.imei },
      { fel: 'raport', text: 'Deschide raportul de consum', tip: 'consumption', imei: v.imei, de: per && per.from, pana: per && per.to }
    ],
    nota: CE.NOTA_CASETA
  };
}
// O mașină care nu transmite (22.10, macheta E1): faptul, ce poate face omul singur (să sune șoferul; în service, într-o hală
// sau la subsol e normal) și „Anunță echipa RA Track" — fără vină pe aparat. v = { vehicul, imei, tacutMin, ultima, adresa }
function problemaSemnal(v, acum) {
  return {
    fel: 'semnal', grav: 'galben',
    titlu: v.vehicul + ' nu transmite de ' + CE.durata(v.tacutMin),
    dovada: CE.ceSemnal({ ultima: v.ultima, adresa: v.adresa, acum: acum }) + ' Dacă ar trebui să fie pe drum, sună șoferul. Dacă e în service, într-o hală sau la subsol, e normal: transmite din nou când iese.',
    butoane: [
      { fel: 'harta', text: 'Pe hartă', imei: v.imei },
      { fel: 'echipa', text: CE.BUTON, problema: 'semnal', imei: v.imei }
    ],
    nota: CE.NOTA_CASETA
  };
}
// Consumul greu de crezut (cifre.consumDeVerificat): spus pe față, cu raportul lui.
function problemaConsum(v, texte, per) {
  return {
    fel: 'consum', grav: 'galben',
    titlu: 'Consum neobișnuit la ' + v.vehicul,
    dovada: texte.join('; ') + '.',
    butoane: [{ fel: 'raport', text: 'Deschide raportul de consum', tip: 'consumption', imei: v.imei, de: per && per.from, pana: per && per.to }]
  };
}

// ─── 3. Viteza: reală sau eroare de GPS ─────────────────────────────────────────────────────────────
function pragViteza(o) {
  o = o || {};
  if (o.limita != null && o.limita > 0) return { kmh: Number(o.limita), fraza: 'Limita trecută în fișa mașinii e ' + nr(o.limita) + ' km/h.' };
  return o.camion ? { kmh: VITEZA_CAMION, fraza: 'La camioane și autobuze, pragul e ' + nr(VITEZA_CAMION) + ' km/h.' }
    : { kmh: VITEZA_AUTO, fraza: 'Cea mai mare limită din România e ' + nr(VITEZA_AUTO) + ' km/h, pe autostradă.' };
}
// puncte = [{ t (ms), lat, lng, v (km/h) }] în ordinea timpului, în jurul celui mai rapid punct.
// → null (sub prag) sau { verdict: 'reala' | 'eroare' | 'nesigur', vmax, t, lat, lng, nPeste, km, impl }
function verdictViteza(puncte, prag) {
  const p = (puncte || []).filter(function (x) { return x && isFinite(x.v) && isFinite(x.lat) && isFinite(x.lng) && isFinite(x.t); });
  if (!p.length) return null;
  let idx = 0;
  p.forEach(function (x, i) { if (x.v > p[idx].v) idx = i; });
  const vmax = p[idx].v;
  if (!(vmax >= prag)) return null;
  let a = idx, b = idx;
  while (a - 1 >= 0 && p[a - 1].v >= prag) a--;
  while (b + 1 < p.length && p[b + 1].v >= prag) b++;
  const nPeste = b - a + 1;
  let km = 0;
  for (let i = a; i < b; i++) km += _km(p[i], p[i + 1]);
  const prev = p[idx - 1], next = p[idx + 1];
  let impl = null;
  if (prev && next && next.t > prev.t) impl = _km(prev, next) / ((next.t - prev.t) / 3600000);
  const salt = (prev && p[idx].t > prev.t && _km(prev, p[idx]) / ((p[idx].t - prev.t) / 3600000) > SALT_GPS_KMH) ||
               (next && next.t > p[idx].t && _km(p[idx], next) / ((next.t - p[idx].t) / 3600000) > SALT_GPS_KMH);
  let verdict;
  if (nPeste === 1 && ((impl != null && impl < vmax * 0.6) || salt)) verdict = 'eroare';
  else if (nPeste >= PUNCTE_REALE || (impl != null && impl >= vmax * 0.8)) verdict = 'reala';
  else verdict = 'nesigur';
  return { verdict: verdict, vmax: Math.round(vmax), t: p[idx].t, lat: p[idx].lat, lng: p[idx].lng, nPeste: nPeste, km: Math.round(km * 10) / 10, impl: impl != null ? Math.round(impl) : null };
}
// vd = verdictul de mai sus; o = { vehicul, imei, prag: { kmh, text }, adresa, cuMasina }
function problemaViteza(vd, o) {
  const cand = ziua(vd.t) + ', la ' + ora(vd.t);
  const cine = o.cuMasina ? o.vehicul + ': ' : '';
  const laTraseu = { fel: 'traseu', text: 'Vezi pe hartă, la ' + ora(vd.t), imei: o.imei, de: new Date(vd.t - 15 * 60000).toISOString(), pana: new Date(vd.t + 15 * 60000).toISOString(),
    la: new Date(vd.t).toISOString(), lat: vd.lat, lng: vd.lng, eticheta: nr(vd.vmax) + ' km/h · ' + ora(vd.t) };
  const unde = o.adresa ? ', lângă ' + o.adresa : '';
  if (vd.verdict === 'eroare') {
    return { fel: 'gps', grav: 'galben', titlu: cine + nr(vd.vmax) + ' km/h pe ' + cand + ' e o eroare de GPS',
      dovada: 'Un singur punct ieșit din șir' + (vd.impl != null ? ': din poziția dinainte în cea de după, mașina a mers cu ' + nr(vd.impl) + ' km/h' : '') + '. Nu-l lua în calcul.',
      butoane: [laTraseu] };
  }
  if (vd.verdict === 'nesigur') {
    return { fel: 'viteza', grav: 'galben', titlu: cine + nr(vd.vmax) + ' km/h pe ' + cand,
      dovada: 'Un singur punct, fără altele aproape: nu se poate spune sigur dacă e o viteză reală' + unde + '. Uită-te pe traseu.',
      butoane: [laTraseu] };
  }
  const p0 = _parti(vd.t), zi0 = I.inceputZiRO(+p0.year, +p0.month - 1, +p0.day);
  return { fel: 'viteza', grav: 'rosu', titlu: cine + nr(vd.vmax) + ' km/h pe ' + cand,
    dovada: 'Viteză reală, nu eroare de GPS: ' + nr(vd.nPeste) + (vd.nPeste === 1 ? ' poziție' : ' poziții la rând') + ' peste ' + nr(o.prag.kmh) + ' km/h' +
      (vd.km > 0 ? ', pe ' + nr(vd.km, 1) + ' km' : '') + unde + '. ' + o.prag.fraza,
    butoane: [laTraseu, { fel: 'raport', text: 'Raportul Depășiri viteză', tip: 'speeding', imei: o.imei,
      de: new Date(zi0).toISOString(), pana: new Date(I.inceputZiRO(+p0.year, +p0.month - 1, +p0.day + 1)).toISOString() }] };
}

// ─── 4. Fișa mașinii necompletată (Alin, 15.10: „anii de înmatriculare" → „nu sunt disponibili în RA Track") ─────────────
// Când omul întreabă de un câmp din fișă (anul, marca, modelul, combustibilul, rezervorul) și la unele mașini lipsește,
// i se spune pe față la care și primește butonul spre fila „Detalii vehicul" a fiecăreia. Textul e întrebarea normalizată
// (fără diacritice, litere mici); `masini` = [{ nr, imei, necompletat: [nume câmp] }] din list_vehicles.
const CAMPURI_FISA = [
  ['anul de fabricație', /\b(an|anul|anii|anilor)\b|fabricat|inmatricul/],
  ['marca', /\bmarc(a|i|ile|ilor)\b/],
  ['modelul', /\bmodel(ul|e|ele|elor)?\b/],
  ['combustibilul', /\b(combustibil\w*|motorina|benzina|gpl|carburant\w*)\b/],
  ['rezervorul', /\brezervor\w*\b/],
];
function campuriCerute(t) { return CAMPURI_FISA.filter(function (c) { return c[1].test(String(t || '')); }).map(function (c) { return c[0]; }); }
function problemaFisa(camp, masini) {
  const lista = (masini || []).filter(function (m) { return m && Array.isArray(m.necompletat) && m.necompletat.indexOf(camp) >= 0; });
  if (!lista.length) return null;
  return {
    fel: 'fisa', grav: 'galben',
    titlu: 'Nu e completat în fișa mașinii: ' + camp + (lista.length > 1 ? ' (' + lista.length + ' mașini)' : ''),
    dovada: lista.slice(0, 8).map(function (m) { return m.nr; }).join(', ') + (lista.length > 8 ? ' și încă ' + (lista.length - 8) : '') +
      '. Se completează din fișa mașinii, fila „Detalii vehicul".',
    butoane: lista.slice(0, 3).map(function (m) { return { fel: 'fisa', text: 'Completează la ' + m.nr, imei: m.imei, fila: 'basic' }; })
  };
}

// Cel mult atâtea probleme sub un răspuns: întâi cele roșii.
const MAX_PROBLEME = 4;
function ordoneaza(lista) {
  const vazut = new Set(), out = [];
  (lista || []).filter(Boolean).sort(function (a, b) { return (a.grav === 'rosu' ? 0 : 1) - (b.grav === 'rosu' ? 0 : 1); }).forEach(function (p) {
    const k = p.fel + '|' + p.titlu; if (vazut.has(k)) return; vazut.add(k); out.push(p);
  });
  return out.slice(0, MAX_PROBLEME);
}

module.exports = {
  KM_SENZOR, SENZOR_PRAG_L, VITEZA_AUTO, VITEZA_CAMION, PUNCTE_REALE, SALT_GPS_KMH, MAX_PROBLEME, ZI,
  sursaConsum, nivelBlocat, problemaSenzor, problemaSemnal, problemaConsum, pragViteza, verdictViteza, problemaViteza, ordoneaza, ziua, ora,
  CAMPURI_FISA, campuriCerute, problemaFisa,
};
