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
function curataText(t) {
  return String(t || '')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
}

// ─── Cărămizile ───────────────────────────────────────────────────────────────────────────────────
const RE_VIN_BRUT = /\b[A-HJ-NPR-Z0-9IOQ]{17}\b/g;   // acceptăm I/O/Q la căutare, le reparăm după
const RE_DATA = /\b(\d{1,2})\s*[.\-\/]\s*(\d{1,2})\s*[.\-\/]\s*(\d{2,4})\b/g;
// Numărul de înmatriculare din România: 1-2 litere de județ, 2-3 cifre, 3 litere. Bucureștiul are „B".
const RE_NUMAR = /\b([A-Z]{1,2})\s?-?\s?(\d{2,3})\s?-?\s?([A-Z]{3})\b/g;

function ziLunaAn(zi, luna, an) {
  let z = parseInt(zi, 10), l = parseInt(luna, 10), a = parseInt(an, 10);
  if (a < 100) a += a < 70 ? 2000 : 1900;   // „26" = 2026, „98" = 1998
  if (!(z >= 1 && z <= 31 && l >= 1 && l <= 12 && a >= 1900 && a <= 2100)) return null;
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

  // Perioada de valabilitate: două date, cea mai mică e începutul, cea mare e expirarea.
  // Preferăm datele care apar lângă cuvintele potrivite; dacă nu, luăm perechea din text.
  const langa = (re) => {
    const m = T.match(re); if (!m) return null;
    const bucata = T.slice(m.index, m.index + 60);
    const d = toateDatele(bucata)[0];
    return d ? d.iso : null;
  };
  const de_la = langa(/VALABIL(?:Ă|A)?\s*(?:DE\s*LA|DIN)|DATA\s*(?:DE\s*)?(?:ÎNCEPUT|INCEPUT|EMITERE)|EMIS/);
  const pana = langa(/P[ÂA]N[ĂA]\s*LA|VALABIL(?:Ă|A)?\s*P[ÂA]N[ĂA]|DATA\s*EXPIR|EXPIR(?:Ă|A|ARE)|SCADEN[ȚT]/);
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

  // Asigurătorul.
  const as = ASIGURATORI.find((a) => T.includes(a));
  if (as) pune('issuer', as, 0.85);

  // Numărul poliței / documentului: șiruri lungi alfanumerice care nu sunt VIN sau dată.
  const candidat = (T.match(/\b(?:SERIA\s*)?([A-Z]{2,4})[\s\/-]?(\d{6,12})\b/) || []);
  if (candidat[1] && candidat[2]) pune('number', candidat[1] + '/' + candidat[2], 0.7);
  else { const m2 = T.match(/\b(?:NR\.?|NUM[ĂA]R(?:UL)?|POLI[ȚT]A)\s*[:\.]?\s*([A-Z0-9\/-]{6,20})\b/); if (m2) pune('number', m2[1], 0.6); }

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
