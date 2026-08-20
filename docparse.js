// docparse.js — transformă textul citit de pe un talon / CIV / RCA / ITP în câmpuri de completat.
//
// ─── De ce NU costă tokeni ────────────────────────────────────────────────────────────────────────
// Pentru că nu ghicește. Documentele de vehicul din UE au CODURI DE CÂMP tipărite pe ele (A, B, D.1,
// E, P.1…), iar restul valorilor au formate stricte: seria de șasiu are exact 17 caractere și nu
// conține niciodată I, O sau Q; numărul de înmatriculare are un tipar fix; datele sunt zi.lună.an.
// Cu atâta structură, extragerea se face pe reguli. Un model de limbă ar fi plătit de fiecare dată
// ca să redescopere ceva ce e deja scris în standard.
//
// ─── Regula de aur ────────────────────────────────────────────────────────────────────────────────
// Nimic de aici nu se salvează singur. Fiecare câmp iese ca PROPUNERE, cu un grad de încredere, iar
// omul confirmă. O citire greșită de VIN salvată tăcut e mai rea decât un câmp gol: câmpul gol se
// vede, cel greșit nu.
//
// ─── Ce trebuie calibrat pe documente REALE ───────────────────────────────────────────────────────
// Codurile de mai jos sunt cele armonizate european, stabile din 1999. NU le-am putut verifica pe
// textul oficial (EUR-Lex n-a răspuns), deci stau într-un singur tabel, la vedere, tocmai ca să se
// corecteze ușor după primul talon adevărat scanat. Dacă ceva nu se potrivește, aici se schimbă —
// nu prin cod împrăștiat.

const COD_TALON = {
  'A':   { camp: 'plate',            eticheta: 'Număr de înmatriculare' },
  'B':   { camp: 'first_reg',        eticheta: 'Data primei înmatriculări' },
  'D.1': { camp: 'brand',            eticheta: 'Marca' },
  'D.2': { camp: 'model',            eticheta: 'Tip / variantă' },
  'D.3': { camp: 'model',            eticheta: 'Denumire comercială' },
  'E':   { camp: 'vin',              eticheta: 'Serie șasiu (VIN)' },
  'F.1': { camp: 'max_weight_legal', eticheta: 'Masa maximă tehnic admisibilă' },
  'F.2': { camp: 'max_weight_legal', eticheta: 'Masa maximă admisă în circulație' },
  'G':   { camp: 'tare_weight',      eticheta: 'Masa proprie' },
  'J':   { camp: 'vehicle_type',     eticheta: 'Categoria vehiculului' },
  'P.1': { camp: 'displacement',     eticheta: 'Capacitate cilindrică' },
  'P.2': { camp: 'power_kw',         eticheta: 'Putere maximă' },
  'P.3': { camp: 'fuel_type',        eticheta: 'Tip combustibil' },
  'S.1': { camp: 'passenger_seats',  eticheta: 'Număr locuri' },
};

// Cum se cheamă combustibilii pe talon vs în aplicație. Valorile din dreapta sunt EXACT cele din
// selectorul fișei (`#edit-fuel-type` pe web, VehicleSpecs.tsx pe mobil) — orice altă formă ar
// completa tăcut o valoare pe care selectorul n-o recunoaște, iar câmpul ar rămâne gol la afișare.
const COMBUSTIBIL = [
  [/\bMOTORIN|\bDIESEL|\bDIZEL/i, 'Motorina'],
  [/\bBENZIN/i,                   'Benzina'],
  [/\bG\.?P\.?L\b|GAZ PETROL/i,   'GPL'],
  [/\bELECTRIC/i,                 'Electric'],
  [/\bHIBRID|\bHYBRID/i,          'Hibrid'],
  [/\bG\.?N\.?C\b|METAN/i,        'Altul'],  // selectorul n-are GNC — mai bine „Altul" decât o valoare orfană
];

// Categoria europeană de pe talon (codul J) → propunerea de tip din aplicație. Se PROPUNE, nu se
// impune: omul confirmă încadrarea, iar pictograma se trage din ea.
const CATEGORIE_VEHICUL = {
  M1: 'autoturism', M2: 'microbuz', M3: 'autobuz',
  N1: 'autoutilitara', N2: 'camion', N3: 'camion',
  O1: 'remorca', O2: 'remorca', O3: 'semiremorca', O4: 'semiremorca',
  L: 'motocicleta', T: 'tractor',
};

// Asigurătorii de pe piața RCA. Lista se completează — nu e o barieră, doar ajută la recunoaștere.
const ASIGURATORI = [
  'ALLIANZ', 'ASIROM', 'GROUPAMA', 'GENERALI', 'OMNIASIG', 'UNIQA',
  'GRAWE', 'HOSPITALITY', 'AXERIA', 'EUROINS', 'CITY INSURANCE', 'POOL RCA',
];

// ─── Curățarea textului venit de la OCR ───────────────────────────────────────────────────────────
// OCR-ul confundă mereu aceleași perechi. Reparația NU se poate face global: „0" și „O" trebuie
// tratate diferit după CONTEXT. Într-un VIN, litera O nu există niciodată — deci orice O e 0. Într-o
// marcă („VOLVO"), invers. De asta există două funcții, nu una.
function normNumeric(s) {
  return String(s || '')
    .replace(/[OoQ]/g, '0').replace(/[Il|]/g, '1')
    .replace(/[Ss]/g, '5').replace(/[Bb]/g, '8').replace(/[Zz]/g, '2');
}
// VIN: 17 caractere, alfabet fără I, O, Q (standardul le exclude tocmai ca să nu se confunde cu 1 și 0).
function normVin(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    .replace(/[IO]/g, (c) => (c === 'I' ? '1' : '0')).replace(/Q/g, '0');
}
// Unele PDF-uri scriu titlurile cu litere spațiate („O R I G I N A L", „P O L I T A"). Dacă
// reconstrucția din pagină n-a prins cazul, îl reparăm aici: patru sau mai multe litere singure,
// despărțite de câte un spațiu, sunt UN cuvânt, nu opt. Fără asta, nicio regulă nu se potrivește.
function lipesteLitereRazlete(linie) {
  return linie.replace(/(?:^|\s)((?:[A-ZĂÂÎȘȚ]\s){3,}[A-ZĂÂÎȘȚ])(?=\s|$)/g,
    (tot, grup) => tot.replace(grup, grup.replace(/\s/g, '')));
}
function curataText(t) {
  return String(t || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .split('\n').map((l) => lipesteLitereRazlete(l.trim())).filter(Boolean).join('\n');
}

// ─── Cărămizile ───────────────────────────────────────────────────────────────────────────────────
const RE_VIN_BRUT = /\b[A-HJ-NPR-Z0-9IOQ]{17}\b/g;   // acceptăm I/O/Q la căutare, le reparăm după
const RE_DATA = /\b(\d{1,2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{2,4})\b/g;
// Numărul de înmatriculare din România: 1-2 litere de județ, 2-3 cifre, 3 litere. Bucureștiul are „B".
const RE_NUMAR = /\b([A-Z]{1,2})\s?-?\s?(\d{2,3})\s?-?\s?([A-Z]{3})\b/g;

function ziLunaAn(zi, luna, an) {
  let z = parseInt(zi, 10), l = parseInt(luna, 10), a = parseInt(an, 10);
  if (a < 100) a += a < 70 ? 2000 : 1900;   // „26" = 2026, „98" = 1998
  if (!(z >= 1 && l >= 1 && l <= 12 && a >= 1900 && a <= 2100)) return null;
  // Ziua se verifică pe LUNA ei, nu pe un plafon de 31: altfel „31.02.2027" trecea ca dată bună,
  // iar o dată de expirare GREȘITĂ e mai rea decât una lipsă — alertele s-ar declanșa aiurea, iar
  // omul ar crede că e acoperit. Verificarea prin Date prinde și 29 februarie în ani nebisecți.
  const dt = new Date(Date.UTC(a, l - 1, z));
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== l - 1 || dt.getUTCDate() !== z) return null;
  return `${a}-${String(l).padStart(2, '0')}-${String(z).padStart(2, '0')}`;
}

function toateDatele(text) {
  const out = [];
  let m; RE_DATA.lastIndex = 0;
  while ((m = RE_DATA.exec(text))) {
    const d = ziLunaAn(m[1], m[2], m[3]);
    if (d) out.push({ iso: d, poz: m.index, brut: m[0] });
  }
  return out;
}

function gasesteVin(text) {
  let m; RE_VIN_BRUT.lastIndex = 0;
  const candidati = [];
  while ((m = RE_VIN_BRUT.exec(text))) {
    const v = normVin(m[0]);
    // Un VIN adevărat are și litere, și cifre. Un șir de 17 cifre e alt număr (serie document, cod).
    if (v.length === 17 && /[A-Z]/.test(v) && /[0-9]/.test(v)) candidati.push(v);
  }
  return candidati.length ? candidati[0] : null;
}

function gasesteNumar(text) {
  const T = text.toUpperCase();
  let m; RE_NUMAR.lastIndex = 0;
  while ((m = RE_NUMAR.exec(T))) {
    const jud = m[1], cifre = m[2], lit = m[3];
    // Filtrează potriviri accidentale din alte coduri: județul are 1-2 litere, iar „B" e doar București.
    if (jud.length === 1 && jud !== 'B') continue;
    return `${jud} ${cifre} ${lit}`;
  }
  return null;
}

// Valoarea care urmează după un cod de câmp. Codurile apar ca „E)", „E.", „E ", „(E)" etc., iar
// valoarea poate fi pe același rând sau pe următorul — depinde de cum a citit OCR-ul coloanele.
function valoareDupaCod(text, cod) {
  const c = cod.replace('.', '\\.');
  const re = new RegExp('(?:^|\\n|\\s)\\(?' + c + '\\)?[\\.\\):]?\\s*(.+?)(?:\\n|$)', 'i');
  const m = text.match(re);
  if (!m) return null;
  let v = m[1].trim();
  // Dacă pe rând a nimerit și codul următor, taie acolo.
  v = v.split(/\s(?=\(?[A-Z]\.?\d?\)[\s:])/)[0].trim();
  return v || null;
}

function primulNumar(s) {
  const m = normNumeric(String(s || '')).match(/\d[\d\s.,]*/);
  if (!m) return null;
  const n = parseInt(m[0].replace(/[\s.,]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}

// ─── Datele vehiculului scrise în CUVINTE, nu în coduri ───────────────────────────────────────────
// Talonul are coduri tipărite (D.1, P.1, P.2…) și de aceea se citește ușor. O poliță RCA, un CIV sau
// un certificat ITP conțin ADESEA aceleași date — marca, cilindreea, puterea, masele — dar scrise cu
// etichete în română. Până acum le ignoram complet, deci un client care încărca doar polița rămânea
// cu fișa goală, deși informația era acolo, sub ochii noștri.
//
// Fiecare tipar cere eticheta, apoi valoarea. Unitățile („cm3", „kW", „kg") se acceptă dar nu se cer:
// unele acte le scriu, altele nu.
const CAMP_ETICHETA = [
  // [câmp, tipar, cum se transformă valoarea, încredere]
  ['brand',            /\bMARCA\s*[:\-]?\s*([A-Z0-9ĂÂÎȘȚ][A-Z0-9ĂÂÎȘȚ \-\.]{1,24})/,                    (v) => v.trim(), 0.75],
  ['model',            /\b(?:MODEL|TIPUL?|DENUMIRE\s*COMERCIAL[ĂA])\s*[:\-]?\s*([A-Z0-9ĂÂÎȘȚ][A-Z0-9ĂÂÎȘȚ \-\.\/]{1,30})/, (v) => v.trim(), 0.65],
  ['displacement',     /\bCAPACITATE\s*(?:CILINDRIC[ĂA])?\s*[:\-]?\s*(\d{2,5})\s*(?:CM3|CMC|CM\^?3)?/,   (v) => parseInt(v, 10), 0.85],
  ['power_kw',         /\bPUTERE(?:A)?\s*(?:MAXIM[ĂA])?\s*(?:NET[ĂA])?\s*[:\-]?\s*(\d{1,4})\s*KW/,        (v) => parseInt(v, 10), 0.85],
  ['max_weight_legal', /\bMAS[ĂA]\s*(?:TOTAL[ĂA]\s*)?MAXIM[ĂA]\s*(?:AUTORIZAT[ĂA]|ADMIS[ĂA])?\s*[:\-]?\s*(\d{3,6})/, (v) => parseInt(v, 10), 0.8],
  ['tare_weight',      /\bMAS[ĂA]\s*(?:PROPRIE|GOL)\s*[:\-]?\s*(\d{3,6})/,                                (v) => parseInt(v, 10), 0.8],
  ['passenger_seats',  /\b(?:NUM[ĂA]R(?:UL)?\s*(?:DE\s*)?LOCURI|NR\.?\s*LOCURI|LOCURI)\s*[:\-]?\s*(\d{1,3})\b/, (v) => parseInt(v, 10), 0.75],
  ['year',             /\bAN(?:UL)?\s*(?:DE\s*)?FABRICA[ȚT]IE\s*[:\-]?\s*((?:19|20)\d{2})/,               (v) => parseInt(v, 10), 0.85],
];

// Culege în `pune` tot ce găsește. Verificările de plauzibilitate există pentru că un tipar prea
// îngăduitor produce valori absurde, iar o cilindree de 7 cmc în fișa clientului e mai rea decât
// un câmp gol: nimeni n-o mai verifică după ce a fost „completată automat".
function culegeCampuriVehicul(T, pune) {
  for (const [camp, re, conv, inc] of CAMP_ETICHETA) {
    const m = T.match(re);
    if (!m) continue;
    const v = conv(m[1]);
    if (v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v))) continue;
    if (camp === 'displacement' && (v < 50 || v > 30000)) continue;
    if (camp === 'power_kw' && (v < 1 || v > 2000)) continue;
    if (camp === 'max_weight_legal' && (v < 300 || v > 60000)) continue;
    if (camp === 'tare_weight' && (v < 200 || v > 50000)) continue;
    if (camp === 'passenger_seats' && (v < 1 || v > 100)) continue;
    if (camp === 'year' && (v < 1950 || v > new Date().getFullYear() + 1)) continue;
    if (typeof v === 'string' && (v.length < 2 || NU_E_VALOARE.test(v))) continue;
    pune(camp, v, inc);
  }
  // Combustibilul și categoria: aceleași dicționare ca la talon, ca să nu existe două vocabulare.
  const f = COMBUSTIBIL.find(([re2]) => re2.test(T));
  if (f) pune('fuel_type', f[1], 0.7);
  const cat = T.match(/\bCATEGORIA?\s*[:\-]?\s*([MNOL]\d?|T)\b/);
  if (cat && CATEGORIE_VEHICUL[cat[1]]) pune('vehicle_type', CATEGORIE_VEHICUL[cat[1]], 0.7);
}
// Cuvinte care nu pot fi o marcă sau un model — apar ca etichete vecine în formulare.
const NU_E_VALOARE = /^(DE|LA|SI|ȘI|NR|SERIA|TIP|MARCA|MODEL|VEHICUL|AUTO|ASIGURAT|CATEGORIE|TOTAL)$/;

// ─── Talon / CIV → câmpuri din fișa vehiculului ───────────────────────────────────────────────────
function parseTalon(textBrut) {
  const text = curataText(textBrut);
  const T = text.toUpperCase();
  const campuri = {};
  const incredere = {};
  const pune = (c, v, inc) => { if (v != null && v !== '' && campuri[c] == null) { campuri[c] = v; incredere[c] = inc; } };

  // 1) Valorile cu format propriu — cele mai sigure, nu depind de citirea codului.
  const vin = gasesteVin(T);
  if (vin) pune('vin', vin, 0.9);
  const nr = gasesteNumar(T);
  if (nr) pune('plate', nr, 0.85);

  // 2) Valorile luate după codul armonizat.
  for (const [cod, def] of Object.entries(COD_TALON)) {
    const brut = valoareDupaCod(text, cod);
    if (!brut) continue;
    switch (def.camp) {
      // Aceeași gardă ca la căutarea liberă: un VIN adevărat are și litere, și cifre. Fără ea, o
      // serie de document din 17 cifre pure ar fi trecut drept VIN doar pentru că stătea după „E)".
      case 'vin': { const v = normVin(brut); if (v.length === 17 && /[A-Z]/.test(v) && /[0-9]/.test(v)) pune('vin', v, 0.95); break; }
      case 'plate': { const p = gasesteNumar(brut.toUpperCase()); if (p) pune('plate', p, 0.95); break; }
      case 'brand': pune('brand', brut.replace(/[^A-Za-zĂÂÎȘȚăâîșț0-9 \-]/g, '').trim().slice(0, 40), 0.8); break;
      case 'model': pune('model', brut.replace(/[^A-Za-zĂÂÎȘȚăâîșț0-9 \-\.\/]/g, '').trim().slice(0, 60), 0.7); break;
      case 'fuel_type': { const f = COMBUSTIBIL.find(([re]) => re.test(brut)); if (f) pune('fuel_type', f[1], 0.9); break; }
      case 'first_reg': { const d = toateDatele(brut)[0]; if (d) { pune('first_reg', d.iso, 0.85); pune('year', parseInt(d.iso.slice(0, 4), 10), 0.85); } break; }
      case 'vehicle_type': {
        const cat = (brut.toUpperCase().match(/\b([MNO]\d|[LT])\w*/) || [])[1];
        if (cat && CATEGORIE_VEHICUL[cat]) pune('vehicle_type', CATEGORIE_VEHICUL[cat], 0.75);
        pune('vehicle_type_raw', brut.trim().slice(0, 20), 0.7);   // păstrăm și originalul, la vedere
        break;
      }
      default: { const n = primulNumar(brut); if (n != null) pune(def.camp, n, 0.8); }
    }
  }

  // 3) Plasa de siguranță: dacă OCR-ul a pierdut codul, căutăm după eticheta scrisă în cuvinte.
  if (campuri.fuel_type == null) {
    const f = COMBUSTIBIL.find(([re]) => re.test(T));
    if (f) pune('fuel_type', f[1], 0.6);   // încredere mai mică: nu știm sigur că e câmpul cerut
  }

  return { tip: 'talon', campuri, incredere, text };
}

// ─── RCA / ITP / CASCO / Rovinietă → document cu dată de expirare ─────────────────────────────────
function parseDocument(textBrut, tipCerut) {
  const text = curataText(textBrut);
  const T = text.toUpperCase();
  const campuri = {};
  const incredere = {};
  const pune = (c, v, inc) => { if (v != null && v !== '' && campuri[c] == null) { campuri[c] = v; incredere[c] = inc; } };

  // Tipul, dedus din text dacă nu ni s-a spus.
  let tip = tipCerut || null;
  if (!tip) {
    if (/\bR\.?C\.?A\b|RĂSPUNDERE CIVIL|RASPUNDERE CIVIL/.test(T)) tip = 'RCA';
    else if (/\bI\.?T\.?P\b|INSPEC[ȚT]IE TEHNIC/.test(T)) tip = 'ITP';
    else if (/\bCASCO\b/.test(T)) tip = 'CASCO';
    else if (/ROVINIET|ROVINIETA|PEAJ/.test(T)) tip = 'Rovinietă';
  }
  pune('doc_type', tip || 'Altul', tip ? 0.9 : 0.3);

  // Vehiculul la care se leagă documentul — ne ajută să-l atașăm automat mașinii potrivite.
  const vin = gasesteVin(T); if (vin) pune('vin', vin, 0.9);
  const nr = gasesteNumar(T); if (nr) pune('plate', nr, 0.85);
  // …iar dacă actul conține și datele tehnice (polițele RCA și CIV-urile le au, scrise în cuvinte),
  // le culegem și pe alea. Merg în FIȘA vehiculului, nu în act — și tot omul le confirmă.
  culegeCampuriVehicul(T, pune);

  // Perioada de valabilitate: două date, cea mai mică e începutul, cea mare e expirarea.
  // Preferăm datele care apar lângă cuvintele potrivite; dacă nu, luăm perechea din text.
  // Fereastra de căutare e 220 de caractere, nu 60: într-un PDF de poliță, eticheta și valoarea
  // ajung des în celule diferite de tabel, iar extragerea le pune la distanță pe același rând.
  const langa = (re, fereastra) => {
    const m = T.match(re); if (!m) return null;
    const d = toateDatele(T.slice(m.index, m.index + (fereastra || 220)))[0];
    return d ? d.iso : null;
  };
  // Cazul cel mai frecvent pe RCA: un INTERVAL scris într-o suflare — „valabilă de la 01.03.2026
  // până la 28.02.2027". Îl prindem întreg, ca să nu depindem de două potriviri separate.
  const interval = T.match(/(?:VALABIL\w*|PERIOAD\w*|ASIGURAR\w*)[^\n]{0,40}?(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})[^\n]{0,30}?(?:P[ÂA]N[ĂA]|LA|[-–])\s*(\d{1,2}[.\-\/]\d{1,2}[.\-\/]\d{2,4})/);
  if (interval) {
    const a = toateDatele(interval[1])[0], b = toateDatele(interval[2])[0];
    if (a && b) { pune('issue_date', a.iso, 0.9); pune('expiry_date', b.iso, 0.92); }
  }
  const de_la = langa(/VALABIL(?:Ă|A)?\s*(?:DE\s*LA|DIN)|DATA\s*(?:DE\s*)?(?:ÎNCEPUT|INCEPUT|EMITERE|EMISIE)|EMIS[ĂA]?\s*(?:LA|ÎN|IN)?|INTRARE\s*[ÎI]N\s*VIGOARE/);
  const pana = langa(/P[ÂA]N[ĂA]\s*LA|VALABIL(?:Ă|A|ITATE)?\s*P[ÂA]N[ĂA]|DATA\s*EXPIR|EXPIR(?:Ă|A|ARE|ARII)|SCADEN[ȚT]|TERMEN\s*DE\s*VALABILITATE/);
  if (de_la) pune('issue_date', de_la, 0.85);
  if (pana) pune('expiry_date', pana, 0.9);

  if (campuri.issue_date == null || campuri.expiry_date == null) {
    const toate = toateDatele(T).map((d) => d.iso).filter((v, i, a) => a.indexOf(v) === i).sort();
    if (toate.length >= 2) {
      pune('issue_date', toate[0], 0.55);
      pune('expiry_date', toate[toate.length - 1], 0.55);
    } else if (toate.length === 1) {
      // O singură dată pe document înseamnă, de regulă, expirarea.
      pune('expiry_date', toate[0], 0.5);
    }
  }

  // Emitentul. Lista de nume cunoscute e o scurtătură, nu o barieră: piața se schimbă, iar un act
  // de la un asigurător care nu e în listă nu are voie să rămână fără emitent. Deci, dacă nu se
  // potrivește niciun nume, căutăm tiparul unei firme românești (…S.A. / …SRL / „ASIGURARI").
  const as = ASIGURATORI.find((a) => T.includes(a));
  if (as) pune('issuer', as, 0.85);
  else {
    // Un formular de poliță e plin de ETICHETE scrise cu majuscule („9. NUMELE ȘI ADRESA",
    // „ASIGURATUL", „PROPRIETAR"). Fără filtrul de mai jos, ele arată exact ca un nume de firmă
    // și ajung în fișa clientului ca emitent. Prima poliță reală ne-a dat „9. NUMELE SI ADRESA".
    const ETICHETA_FORMULAR = /(NUMELE|ADRESA|ASIGURAT|PROPRIETAR|UTILIZATOR|DEȚIN[ĂA]TOR|DETIN[ĂA]TOR|CONTRACTANT|VALABIL|PERIOAD|OBIECT|ORIGINAL|COPIE|EXEMPLAR|SERIA|POLI[ȚT]|VEHICUL|AUTOVEHICUL|DATE\b|RUBRIC)/;
    const candidati = [];
    const re = /([A-ZĂÂÎȘȚ][A-ZĂÂÎȘȚ0-9 .&\-]{3,40}?(?:ASIGUR[ĂA]RI|INSURANCE|S\.?A\.?|S\.?R\.?L\.?))(?:\s|$)/g;
    let m;
    while ((m = re.exec(T))) candidati.push(m[1]);
    for (const brut of candidati) {
      const nume = brut.trim().replace(/\s+/g, ' ')
        // Cuvintele-etichetă din față se taie („ASIGURATOR: X SA" → „X SA").
        .replace(/^(?:ASIGUR[ĂA]TOR(?:UL)?|EMITENT(?:UL)?|SOCIETATEA|COMPANIA|FIRMA)\s*[:\-]?\s*/i, '')
        // Numerotarea de rubrică din față („9. X SA" → „X SA").
        .replace(/^\d+\s*[.)]\s*/, '')
        .trim();
      if (nume.length < 6) continue;
      if (ETICHETA_FORMULAR.test(nume)) continue;             // e o etichetă, nu o firmă
      if (!/[A-ZĂÂÎȘȚ]{3}/.test(nume)) continue;
      // O firmă are cel mult câteva cuvinte; o propoziție de formular are multe.
      if (nume.split(' ').length > 6) continue;
      pune('issuer', nume.slice(0, 60), 0.55);
      break;
    }
  }
  // ITP-ul nu e emis de un asigurător, ci de o stație autorizată — alt tipar, altă etichetă.
  if (campuri.issuer == null && /INSPEC[ȚT]IE TEHNIC|\bI\.?T\.?P\b/.test(T)) {
    const m = T.match(/(?:STA[ȚT]IA|EFECTUAT[ĂA]?\s*(?:DE|LA)|OPERATOR)\s*:?\s*([A-ZĂÂÎȘȚ][A-ZĂÂÎȘȚ0-9 .&\-]{3,40})/);
    if (m) pune('issuer', m[1].trim().slice(0, 60), 0.6);
  }

  // Numărul actului. Forma românească uzuală e „Seria XX Nr. 1234567" — seria și numărul sunt
  // despărțite de cuvântul „Nr.", deci un tipar care le cere lipite pierde seria.
  // Cuvinte care NU pot fi o serie, oricât de bine s-ar potrivi tiparul. Fără lista asta, „Nr.
  // înmatriculare" ajungea serie de act, iar „Seria RO/22/H22 Nr 123..." dădea seria „NR".
  const NU_E_SERIE = /^(NR|SERIA|SERIE|NUMAR|NUMĂR|POLITA|POLIȚA|INMATRICULARE|ÎNMATRICULARE|VALABIL|DATA|CNP|CUI|TOTAL|LEI|RON)$/;
  // Seria poate conține cifre și bare („RO/22/H22"), deci nu se poate cere doar litere.
  const serieNr = T.match(/SERIA\s*[:.]?\s*([A-Z][A-Z0-9\/\-]{0,11})\s*(?:NR\.?|NUM[ĂA]RUL?)?\s*[:.]?\s*(\d{5,12})\b/);
  if (serieNr && !NU_E_SERIE.test(serieNr[1])) pune('number', serieNr[1] + '/' + serieNr[2], 0.85);
  else {
    const lipit = T.match(/\b([A-Z]{2,4})[\s\/-]?(\d{6,12})\b/);
    if (lipit && !NU_E_SERIE.test(lipit[1])) pune('number', lipit[1] + '/' + lipit[2], 0.7);
    else {
      const m2 = T.match(/\b(?:NR\.?|NUM[ĂA]R(?:UL)?|POLI[ȚT]A)\s*[:\.]?\s*([A-Z0-9][A-Z0-9\/-]{5,19})\b/);
      // Trebuie să conțină măcar o cifră: un număr de act fără cifre e un cuvânt prins din greșeală.
      if (m2 && /\d/.test(m2[1]) && !NU_E_SERIE.test(m2[1])) pune('number', m2[1], 0.6);
    }
  }

  return { tip: 'document', campuri, incredere, text };
}

// ─── Poarta de intrare ────────────────────────────────────────────────────────────────────────────
// `tip`: 'talon' | 'civ' | 'rca' | 'itp' | 'auto'. La 'auto' hotărăște singur după conținut.
function parse(textBrut, tip = 'auto') {
  const T = curataText(textBrut).toUpperCase();
  let ales = tip;
  if (ales === 'auto') {
    const eTalon = /CERTIFICAT\s*DE\s*[ÎI]NMATRICULARE|CARTEA?\s*DE\s*IDENTITATE\s*A\s*VEHICULULUI/.test(T)
      || (/\bD\.1\b/.test(T) && /\bP\.3\b/.test(T));
    ales = eTalon ? 'talon' : 'document';
  }
  if (ales === 'talon' || ales === 'civ') return parseTalon(textBrut);
  const harta = { rca: 'RCA', itp: 'ITP', casco: 'CASCO' };
  return parseDocument(textBrut, harta[String(ales).toLowerCase()] || null);
}

module.exports = { parse, parseTalon, parseDocument, COD_TALON, COMBUSTIBIL, CATEGORIE_VEHICUL, ASIGURATORI, normVin, ziLunaAn };
