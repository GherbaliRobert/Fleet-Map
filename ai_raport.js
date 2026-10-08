// ai_raport.js — „AI Raport" (Rapoarte → fila „AI Raport"): întrebări despre rapoarte, pe REGULI — fără model, zero tokeni.
//
// Alin, 02.10: „în rapoarte vreau să fie un agent unde întrebi ceva despre rapoarte și tot ce ai nevoie să afli din
// rapoarte, cu sugestii" + „AI Raport va lua din rapoarte date, deci nu ne costă bani/tokeni; RA Insight va fi singurul
// care costă".
//
// Ce face: înțelege întrebările scrise simplu — CE (km, consum, viteză…), CARE mașină (număr, nume, șofer, grupă — fișa
// din insight.js) și CE perioadă („săptămâna trecută", „septembrie", „ieri") —, ține minte subiectul, mașina și perioada
// de la întrebarea de dinainte („și luna trecută?", „dar B 155 UIP?"), iar serverul rulează raportul aplicației. Aici se
// pun cifrele raportului în propoziții gata scrise, cu sugestii pe reguli. La „de ce", „compară", „ce să fac" — nu se
// preface: trimite la RA Insight. Fără bază, fără rețea, fără model: totul se probează (verify_ai_raport.js).
'use strict';
const I = require('./insight');

// ─── Numere scrise românește ────────────────────────────────────────────────────────────────────────
function nr(n, zec) {
  if (n == null || !isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('ro-RO', { maximumFractionDigits: zec == null ? 0 : zec, minimumFractionDigits: 0 });
}
// „12 litri", dar „158 de litri"; „1 litru". Cu zecimale nu se pune „de" („6,8 litri").
function cant(n, sing, plur, zec) {
  const f = Math.pow(10, zec || 0), r = Math.round(Number(n) * f) / f;
  if (r === 1) return '1 ' + sing;
  if (!Number.isInteger(r)) return nr(r, zec) + ' ' + plur;
  const v = Math.abs(r) % 100;
  return nr(r) + ((v === 0 && r) || v >= 20 ? ' de ' : ' ') + plur;
}
const lei = (n) => cant(Math.round(n), 'leu', 'lei');

// ─── Subiectele: cuvintele care le aleg și raportul din spate ───────────────────────────────────────
// Două treceri (07.10, Alin: „de cât timp staționează B 154 UIP?" → „Nu am înțeles despre ce raport e vorba"):
//   `re`   = cuvintele care NUMESC subiectul (substantive, întrebări întregi: „staționări", „unde e", „ce a făcut");
//   `slab` = verbele care îl pot numi doar când nimic altceva nu se potrivește („a mers", „a făcut", „a stat").
// Până pe 07.10 „a făcut" era printre cuvintele tari ale km-ilor, deci „ce curse a făcut ieri" primea km-ii, iar
// „parcurs" prindea și „foaia de parcurs". În fiecare trecere ordinea contează: primul care se potrivește câștigă.
// „Km și consum" → consum (raportul de consum are și km-ii); „cât m-a costat motorina" → costuri (are și litrii);
// „a stat cu motorul pornit" → ralanti, nu staționări; „km până la revizie" → ce expiră.
//
// Prezentul („staționează", „unde e", „de cât timp stă") = ACUM → „Ultima locație"; trecutul („a staționat",
// „staționări", „unde a stat ieri") = o perioadă → „Staționări".
const LOCATIE_RE = new RegExp('\\b(' + [
  'ultima (locatie|pozitie)', '(locatia|pozitia) (actuala|curenta|de acum)',
  'unde (e|este|sunt|se afla|se gaseste|se gasesc|a ramas|au ramas|sta|stau|stationeaza|stationeza|a parcat|au parcat)',
  'unde (a|au) stat ultima',
  'de cand (sta|stau|stationeaza|(e|este|sunt) (oprit\\w*|parcat\\w*|pe loc))',
  'de cat (timp|vreme) (sta|stau|stationeaza|stationeza|(e|este|sunt) \\w+|nu (mai )?(merge|a mai mers|se misca|s-a (mai )?miscat|a (mai )?plecat))',
  'stationeaza', 'stationeza', 'sta pe loc', '(e|este|sunt) (oprit\\w*|parcat\\w*|pe loc|in parcare)'
].join('|') + ')\\b');
const SUBIECTE = [
  { k: 'ore_condus', raport: 'hos', et: 'Condus & repaus', re: /\b((ore|orele) de condus|(ore|orele) la volan|condus continuu|timp(ul|ii)? de condus|pauz\w*|repaus|561|tahograf\w*)\b/ },
  { k: 'ore_motor', raport: 'enginehours', et: 'Ore motor', re: /\bore (de )?motor\b/ },
  { k: 'clasament', raport: 'ecodrive_drivers', et: 'Clasamentul șoferilor', re: /\b(clasament\w*|top (al )?soferilor|top soferi|cel mai bun sofer|cei mai buni soferi)\b/ },
  { k: 'scor', raport: 'ecodrive', et: 'Stilul de condus (EcoDrive)', re: /\b(scor\w*|ecodrive|eco drive|franar\w*|frane bruste|acceler\w*|viraj\w*|agresiv\w*|stil(ul)? de condus|cum (a|au) condus)\b/ },
  { k: 'ralanti', raport: 'idling', et: 'Ralanti', re: /\b(ralanti\w*|mers in gol|motor(ul)? pornit pe loc|(stat|stationat|sta|stationeaza) cu motorul pornit)\b/ },
  { k: 'alimentari', raport: 'fuel', et: 'Alimentări & scăderi', re: /\b(aliment\w*|plinul|plin|scader\w*|furt\w*|golit\w*)\b/ },
  { k: 'costuri', raport: 'costs', et: 'Costuri combustibil', re: /\b(cost\w*|bani|cheltui\w*|lei)\b/ },
  { k: 'consum', raport: 'consumption', et: 'Consum carburant', re: /\b(consum\w*|litri|l\/100|motorin\w*|benzin\w*|carburant\w*|combustibil\w*)\b/ },
  { k: 'alerte', raport: 'events', et: 'Alertele declanșate', re: /\b(alert\w*|evenimente)\b/ },
  { k: 'disponibilitate', raport: 'uptime', et: 'Disponibilitate flotă', re: /\b(inactiv\w*|disponibilitat\w*|fara semnal|(nu au|n-?au|nu a) mers deloc|nu (mai )?transmit\w*|(a|au) (mai )?transmis|ultima transmisie|semnal(ul)?)\b/ },
  { k: 'viteza', raport: 'speeding', et: 'Depășiri de viteză', re: /\b(vitez\w*|depasir\w*|vitezoman\w*|peste limita|prea repede)\b/ },
  { k: 'scadente', raport: 'due', et: 'Ce expiră (acte și service)', re: /\b(expir\w*|itp|rca|casco|rovinieta|revizi\w*|service|scaden\w*|acte(le)?|documente\w*)\b/ },
  { k: 'zone', raport: 'geofence', et: 'Vizite în zone', re: /\b(zon(a|e|ele|ei)|hotspot\w*|vizit\w*)\b/ },
  { k: 'emisii', raport: 'emissions', et: 'Emisii CO₂', re: /\b(emisii\w*|co2|carbon)\b/ },
  { k: 'rezumat', raport: 'daily', et: 'Situație zilnică', re: /\b(ce (a|au) (mai )?facut|rezumat\w*|situati\w* (zilnic\w*|pe zi\w*|zilei)|activitat\w*|cum (a|au) (fost|mers) (ziua|azi|ieri|saptamana)|(la ce ora|cand|de la ce ora) (a|au) (plecat|pornit|iesit|inceput|ajuns|venit|terminat|intrat))\b/ },
  { k: 'curse', raport: 'trips', et: 'Foaie de parcurs', re: /\b(curse|cursa|cursel\w*|foaie de parcurs|foaia de parcurs|deplasar\w*|drumuri\w*|trasee|traseu\w*|pe unde (a|au) (umblat|mers|fost))\b/ },
  { k: 'km', raport: 'utilization', et: 'Km parcurși', re: /\b(km|kilometr\w*|kilometir\w*|parcurs\w*|distant\w*|rulaj\w*)\b/, slab: /\b((a|au) (mai )?(mers|facut|rulat)|cat (a|au) mers)\b/ },
  { k: 'opriri', raport: 'stops', et: 'Staționări', re: /\b(oprir\w*|stationar\w*|stationat\w*|parcar\w*)\b/, slab: /\b((a|au) (stat|parcat|oprit)|unde (a|au) stat|cat (a|au) stat)\b/ },
  { k: 'locatie', raport: 'location', et: 'Ultima locație', re: LOCATIE_RE },
];
const SUB = {}; SUBIECTE.forEach(function (s) { SUB[s.k] = s; });
function subiectDin(t) {
  for (const s of SUBIECTE) if (s.re.test(t)) return s;
  for (const s of SUBIECTE) if (s.slab && s.slab.test(t)) return s;
  return null;
}
// Rapoartele pe care AI Raport nu le citește (încă): numite în întrebare, primesc butonul care deschide raportul,
// cu mașina și perioada din întrebare — în loc de „nu am înțeles". Cheile sunt cele din catalogul reports.js.
const ALTE_RAPOARTE = [
  { raport: 'overrev', re: /\b(supratura\w*|turati\w*|rpm)\b/ },
  { raport: 'pto', re: /\b(pto|priza de putere)\b/ },
  { raport: 'fuelprobe', re: /\b(sonda\w*|litrometric\w*)\b/ },
  { raport: 'weight', re: /\b(greutat\w*|incarcatur\w*|supraincarc\w*)\b/ },
  { raport: 'tipping', re: /\b(bascul\w*)\b/ },
  { raport: 'arm', re: /\b(brat\w*|excavator\w*|macara\w*)\b/ },
  { raport: 'iot', re: /\b(temperatur\w*|frigorific\w*|senzori? iot)\b/ },
  { raport: 'can', re: /\b(date can|raport(ul)? can|erori\w* (dtc|de motor)|dtc|cod(uri)? de eroare)\b/ },
  { raport: 'driver', re: /\b(pontaj\w*)\b/ },
  { raport: 'fuel_anomaly', re: /\b(anomali\w*)\b/ },
  { raport: 'analytic', re: /\b(analitic\w*|date brute)\b/ },
];
function altRaportDin(t) { for (const a of ALTE_RAPOARTE) if (a.re.test(t)) return a.raport; return null; }

// Întrebările la care răspunde RA Insight, nu AI Raport: cauze, comparații întinse, sfaturi, texte de scris.
const PENTRU_INSIGHT = /\b(de ce|din ce cauza|explic\w*|compar\w*|ce sa fac|ce ar trebui|recomand\w*|sfat\w*|cum pot|cum as putea|analiz\w*|prezic\w*|estimeaz\w*|scrie(-i)?|motivul)\b/;
// „Cine/care … cel mai mult", „top", „clasament": se răspunde cu ordinea, nu doar cu totalul.
const RANG = /(\b(cine|care)\b[^?]*\b(cel mai|cea mai|cei mai|cele mai)\b)|\btop\b|\b(cele mai multe|cei mai multi)\b/;
const TOATA_FLOTA = /\b(flota|flotei|toate masinile|toata flota|fiecare masina|fiecare|masinile)\b/;
// O întrebare despre mașini, la plural, sau „cine": privește flota chiar dacă tocmai s-a vorbit de o mașină.
const DESPRE_FLOTA = /\b(care masin\w*|ce masin\w*|cate masin\w*|care dintre|cine)\b/;
const CELALALT = /(^|[^a-z])(celalalt|cealalta|celelalte|celalti|alta|altul|alte|altei)([^a-z]|$)/;

// ─── Perioada, din cuvinte ──────────────────────────────────────────────────────────────────────────
const ZI = 86400000;
const MAX_ZILE = 93;   // un raport pe mai mult de o lună-două încetinește serverul pentru toți
const LUNI_RE = 'ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|sept|octombrie|noiembrie|decembrie';
function _luna(cuv) { const i = I.LUNI.indexOf(cuv); return i >= 0 ? i : (cuv === 'sept' ? 8 : -1); }
function _zi(y, m0, d) { return I.inceputZiRO(y, m0, d); }
function _parti(ms) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date(ms)).forEach(function (x) { if (x.type !== 'literal') p[x.type] = +x.value; });
  return { y: p.year, m0: p.month - 1, d: p.day };
}
function _per(from, to, acum, extra) {
  const r = { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
  r.eticheta = I.etichetaPerioadei(r.from, r.to, acum);
  return Object.assign(r, extra || {});
}
// Un interval scris de om — „01.10.2026-07.10.2026", „1-7 octombrie", „de pe 1 până pe 7 octombrie", „între 1 și 7
// octombrie", „din 28 septembrie până pe 4 octombrie", „de pe 1 octombrie până azi". Ultima zi intră întreagă. Până pe
// 08.10, „1-7 octombrie" ieșea „1 iulie" (citit ca o zi: 1.7), iar „de pe 1 până pe 7 octombrie" ieșea doar 7 octombrie
// (Alin, 08.10: „eu am dat doar până pe 07"). Fără an scris, un interval din viitor e cel de anul trecut.
const _PANA = '(?:-|–|—|pana (?:pe|la|in)|pana|si)';
function _interval(t, z, now) {
  let m, d1, m1, y1 = null, d2, m2, y2 = null, panaAcum = false;
  if ((m = new RegExp('\\b(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?\\s*' + _PANA + '\\s*(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?\\b').exec(t))) {
    d1 = +m[1]; m1 = +m[2] - 1; y1 = m[3] ? +m[3] : null; d2 = +m[4]; m2 = +m[5] - 1; y2 = m[6] ? +m[6] : null;
  } else if ((m = new RegExp('\\b(\\d{1,2})\\s*(?:-|–|—)\\s*(\\d{1,2}) (' + LUNI_RE + ')(?: (\\d{4}))?\\b').exec(t))) {
    d1 = +m[1]; d2 = +m[2]; m1 = m2 = _luna(m[3]); y1 = y2 = m[4] ? +m[4] : null;
  } else if ((m = new RegExp('\\b(?:de pe|de la|din|intre) (\\d{1,2})(?: (' + LUNI_RE + '))?(?: (\\d{4}))? ' + _PANA + ' (?:pe )?(\\d{1,2}) (' + LUNI_RE + ')(?: (\\d{4}))?\\b').exec(t))) {
    d1 = +m[1]; m2 = _luna(m[5]); m1 = m[2] ? _luna(m[2]) : m2; y1 = m[3] ? +m[3] : null; d2 = +m[4]; y2 = m[6] ? +m[6] : null;
  } else if ((m = new RegExp('\\b(?:de pe|de la|din) (\\d{1,2})(?: (' + LUNI_RE + ')|[./](\\d{1,2}))(?:[ ./](\\d{4}))? (?:pana )?(?:azi|astazi|acum|in prezent)\\b').exec(t))) {
    d1 = +m[1]; m1 = m[2] ? _luna(m[2]) : +m[3] - 1; y1 = m[4] ? +m[4] : null; panaAcum = true;
  } else return null;
  if (y1 != null && y1 < 100) y1 += 2000;
  if (y2 != null && y2 < 100) y2 += 2000;
  if (!(m1 >= 0 && m1 <= 11 && d1 >= 1 && d1 <= 31)) return null;
  if (!panaAcum && !(m2 >= 0 && m2 <= 11 && d2 >= 1 && d2 <= 31)) return null;
  const faraAn = y1 == null && y2 == null;
  if (y1 == null) y1 = y2 != null ? y2 : z.y;
  if (y2 == null) y2 = y1;
  if (faraAn && _zi(y1, m1, d1) > now) { y1 -= 1; y2 -= 1; }
  const de = _zi(y1, m1, d1);
  let pana = now;
  if (!panaAcum) { if (_zi(y2, m2, d2) < de) y2 += 1; pana = Math.min(now, _zi(y2, m2, d2 + 1)); }
  if (!(de < pana)) return null;
  if (pana - de > MAX_ZILE * ZI) return _per(pana - MAX_ZILE * ZI, pana, now, { taiat: true });
  return _per(de, pana, now);
}
// Întoarce { from, to, eticheta } sau null dacă textul nu spune nicio perioadă. `s` = subiectul (scadențele privesc înainte).
function perioadaDin(t, acum, s) {
  const now = acum != null ? Number(acum) : Date.now();
  const z = _parti(now), azi0 = _zi(z.y, z.m0, z.d);
  const viitor = s && s.k === 'scadente';
  let m;
  if (viitor) {
    if ((m = /\b(urmatoarele|in urmatoarele|pe urmatoarele) (\d{1,3}) (de )?zile\b/.exec(t))) return _per(now, now + Math.min(366, +m[2]) * ZI, now, { inainte: true });
    if (/\b(luna asta|luna aceasta|luna curenta|luna in curs)\b/.test(t)) return _per(now, _zi(z.y, z.m0 + 1, 1), now, { inainte: true });
    if (/\b(saptamana asta|saptamana aceasta|saptamana curenta)\b/.test(t)) return _per(now, now + 7 * ZI, now, { inainte: true });
    if (/\b(luna viitoare|luna urmatoare)\b/.test(t)) return _per(_zi(z.y, z.m0 + 1, 1), _zi(z.y, z.m0 + 2, 1), now, { inainte: true });
    return null;
  }
  const iv = _interval(t, z, now);
  if (iv) return iv;
  if (/\balaltaieri\b/.test(t)) return _per(_zi(z.y, z.m0, z.d - 2), _zi(z.y, z.m0, z.d - 1), now);
  if (/\b(ieri|aseara|azi-?\s?noapte|noaptea trecuta)\b/.test(t)) return _per(_zi(z.y, z.m0, z.d - 1), azi0, now);
  if (/\b(azi|astazi|de dimineata|in dimineata asta)\b/.test(t)) return _per(azi0, now, now);
  if ((m = /\bultim(ele|a|ii)? (\d{1,3}) (de )?zile\b/.exec(t))) return _per(now - Math.min(MAX_ZILE, Math.max(1, +m[2])) * ZI, now, now, { taiat: +m[2] > MAX_ZILE });
  if (/\bultima saptamana\b/.test(t)) return _per(now - 7 * ZI, now, now);
  if (/\b(ultima luna|ultimele 30 de zile)\b/.test(t)) return _per(now - 30 * ZI, now, now);
  if (/\bsaptamana (trecuta|precedenta|anterioara)\b/.test(t)) { const r = I.perioada({ period: 'last_week' }, now); return _per(r.from, r.to, now); }
  if (/\b(saptamana (asta|aceasta|curenta)|de luni pana azi)\b/.test(t)) { const r = I.perioada({ period: 'this_week' }, now); return _per(r.from, r.to, now); }
  if (/\bluna (trecuta|precedenta|anterioara)\b/.test(t)) { const r = I.perioada({ period: 'last_month' }, now); return _per(r.from, r.to, now); }
  if (/\b(luna (asta|aceasta|curenta|in curs)|de la inceputul lunii)\b/.test(t)) { const r = I.perioada({ period: 'this_month' }, now); return _per(r.from, r.to, now); }
  // o zi anume: „15.09", „15.09.2026", „pe 15 septembrie"
  if ((m = /\b(\d{1,2})[.\/-](\d{1,2})(?:[.\/-](\d{2,4}))?\b/.exec(t))) {
    const d = +m[1], m0 = +m[2] - 1; let y = m[3] ? +m[3] : z.y; if (y < 100) y += 2000;
    if (d >= 1 && d <= 31 && m0 >= 0 && m0 <= 11) {
      if (!m[3] && _zi(y, m0, d) > now) y -= 1;
      const de = _zi(y, m0, d); return _per(de, Math.min(now, _zi(y, m0, d + 1)), now);
    }
  }
  if ((m = new RegExp('\\b(?:pe |din )?(\\d{1,2}) (' + LUNI_RE + ')(?: (\\d{4}))?\\b').exec(t))) {
    const d = +m[1], m0 = _luna(m[2]); let y = m[3] ? +m[3] : z.y;
    if (m0 >= 0 && d >= 1 && d <= 31) {
      if (!m[3] && _zi(y, m0, d) > now) y -= 1;
      const de = _zi(y, m0, d); return _per(de, Math.min(now, _zi(y, m0, d + 1)), now);
    }
  }
  // o lună întreagă: „septembrie", „în august", „septembrie 2025". „mai" doar cu „în/luna/din" sau cu anul (altfel e „mai mult").
  if ((m = new RegExp('\\b(?:(?:in|luna|din|pe) )?(' + LUNI_RE.replace('mai|', '') + ')(?: (\\d{4}))?\\b').exec(t)) ||
      (m = /\b(?:in|luna|din|pe) (mai)(?: (\d{4}))?\b/.exec(t)) || (m = /\b(mai) (\d{4})\b/.exec(t))) {
    const m0 = _luna(m[1]); let y = m[2] ? +m[2] : z.y;
    if (m0 >= 0) {
      if (!m[2] && _zi(y, m0, 1) > now) y -= 1;
      return _per(_zi(y, m0, 1), Math.min(now, _zi(y, m0 + 1, 1)), now);
    }
  }
  return null;
}
// Textul spune DOAR o perioadă („ieri?", „luna trecută", „în septembrie") — nimic altceva cu înțeles.
const _UMPLUTURA = /\b(si|dar|iar|apoi|acum|pe|in|din|la|de|pentru|cat|cati|cate|ce|care|cu|al|a|ale|lui|asta|aceasta|curenta|trecuta|precedenta|anterioara|azi|astazi|ieri|aseara|alaltaieri|saptamana|luna|ultimele|ultima|ultimii|zile|zi|anul|\d+|ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|sept|octombrie|noiembrie|decembrie)\b/g;
function _doarPerioada(t) { return !String(t).replace(/[^a-z0-9 ]/g, ' ').replace(_UMPLUTURA, ' ').trim(); }
// Fără perioadă spusă: ultimele 7 zile; la „ce expiră" — următoarele 30 de zile; la „unde e / de cât timp stă" — ACUM,
// citit pe ultimele 30 de zile (raportul „Ultima locație" caută ultima oprire în perioadă: pe 7 zile, o mașină parcată
// de două săptămâni ar fi ieșit „de 7 zile").
const ZILE_LOCATIE = 30;
function perioadaImplicita(s, acum) {
  const now = acum != null ? Number(acum) : Date.now();
  if (s && s.k === 'scadente') return _per(now, now + 30 * ZI, now, { inainte: true, implicita: true });
  if (s && s.k === 'locatie') return _per(now - ZILE_LOCATIE * ZI, now, now, { implicita: true, acum: true });
  return _per(now - 7 * ZI, now, now, { implicita: true });
}
// Perioada de dinainte, la fel de lungă (pentru „față de perioada dinainte").
function perioadaAnterioara(p) {
  const a = Date.parse(p.from), b = Date.parse(p.to);
  return { from: new Date(a - (b - a)).toISOString(), to: new Date(a).toISOString() };
}
// Ce fel de perioadă e (pentru „Și săptămâna dinainte?"): o zi, o săptămână de luni, o lună întreagă — pe ora României —
// sau altfel („ultimele 7 zile" = „perioada").
function _unitate(p) {
  const a = Date.parse(p.from), b = Date.parse(p.to);
  if (!(b > a)) return 'perioada';
  const z = _parti(a);
  if (_zi(z.y, z.m0, z.d) !== a) return 'perioada';                       // nu începe la miezul nopții
  if (b - a <= ZI + 3600000) return 'ziua';
  if (z.d === 1 && b <= _zi(z.y, z.m0 + 1, 1)) return 'luna';
  if (new Date(Date.UTC(z.y, z.m0, z.d)).getUTCDay() === 1 && b - a <= 7 * ZI + 3600000) return 'saptamana';
  return 'perioada';
}
// „Și săptămâna dinainte?" = perioada de dinaintea celei discutate: ziua / săptămâna / luna întreagă de dinainte (și
// când cea discutată e „azi" sau „luna asta", până acum), altfel la fel de lungă, lipită înainte.
const DINAINTE = /\b(ziua|saptamana|luna|perioada) (de )?dinainte\b/;
function perioadaDinainte(per, acum) {
  const a = Date.parse(per.from), b = Date.parse(per.to), z = _parti(a);
  const u = _unitate(per);
  let de;
  if (u === 'ziua') de = _zi(z.y, z.m0, z.d - 1);
  else if (u === 'saptamana') de = _zi(z.y, z.m0, z.d - 7);
  else if (u === 'luna') de = _zi(z.y, z.m0 - 1, 1);
  else de = a - (b - a);
  return _per(de, a, acum);
}

// ─── Înțelegerea întrebării ─────────────────────────────────────────────────────────────────────────
// ctx = ce s-a discutat la întrebarea de dinainte: { subiect, masini: [imei], grupa, perioada: { from, to } }.
// Întoarce { ok: true, subiect, raport, et, masini (null = toată flota), grupa, perioada, top, mem } sau
// { ok: false, motiv: 'gol' | 'pentru_insight' | 'fara_subiect' | 'doar_masina' | 'alt_raport' | 'ambiguu', variante?,
//   masini?, raport?, perioada?, context } — `context` = ce se ține minte și după o întrebare neînțeleasă (mașina,
//   subiectul), ca răspunsul următor („din raportul staționări", butonul ales) să nu înceapă de la zero.
//
// Mașina discutată rămâne în discuție (Alin, 07.10: după o întrebare despre B 154 UIP, „din raport staționări" a primit
// toată flota). Se schimbă doar când întrebarea numește alta, o grupă, toată flota, sau întreabă despre mașini la plural
// („care mașină…", „cine…", „cei mai mulți km"). Până pe 07.10 rămânea doar la „și…" / „dar…".
function intelege(text, ctx, fisa, acum) {
  const t = I.norm(text);
  const c = ctx || {};
  if (!t) return { ok: false, motiv: 'gol', context: c };
  if (PENTRU_INSIGHT.test(t)) return { ok: false, motiv: 'pentru_insight', context: c };
  const urmare = /^(si|dar|iar|apoi|acum|ok)\b/.test(t);
  const mem = { subiect: false, masini: false, perioada: false };
  let s = subiectDin(t);
  const g = I.gasesteInText(text, fisa || []);
  const areMasina = g.masini.length || g.grupe.length || g.ambigue.length;
  let p = perioadaDin(t, acum, s);
  // O continuare: lipsește subiectul, dar omul a schimbat mașina sau perioada („și luna trecută?", „dar B 155 UIP?").
  // Doar perioada, fără alte cuvinte („ieri?", „luna trecută") — altfel „vreme frumoasă azi" ar moșteni subiectul.
  if (!s && c.subiect && SUB[c.subiect] && (urmare || areMasina || (p && _doarPerioada(t)))) { s = SUB[c.subiect]; mem.subiect = true; if (!p) p = perioadaDin(t, acum, s); }
  // Mașinile numite în text: număr, nume, șofer, grupă. Îndoiala nu se rezolvă pe ghicite.
  let masini = null, grupa = null, numite = false;
  if (g.masini.length) { masini = g.masini.map(function (v) { return v.imei; }); numite = true; }
  else if (g.grupe.length === 1) { masini = g.grupe[0].masini.map(function (v) { return v.imei; }); grupa = g.grupe[0].nume; numite = true; }
  else if (g.ambigue.length) {
    let variante = [].concat.apply([], g.ambigue.map(function (a) { return a.variante; }));
    if (CELALALT.test(t) && Array.isArray(c.masini)) variante = variante.filter(function (v) { return c.masini.indexOf(v.imei) < 0; });
    const unice = []; const vaz = new Set();
    variante.forEach(function (v) { if (!vaz.has(v.imei)) { vaz.add(v.imei); unice.push(v); } });
    if (unice.length === 1) { masini = [unice[0].imei]; numite = true; }
    else {
      // Ce s-a întrebat rămâne (subiectul, perioada), ca mașina aleasă din butoane să primească răspunsul întrebării.
      const cx = Object.assign({}, c);
      if (s) cx.subiect = s.k;
      if (p) cx.perioada = { from: p.from, to: p.to };
      return { ok: false, motiv: 'ambiguu', variante: unice, subiect: s ? s.k : null, context: cx };
    }
  }
  if (!s) {
    const alt = altRaportDin(t);
    const pe = numite ? masini : (Array.isArray(c.masini) && c.masini.length ? c.masini.slice() : null);
    const cx = Object.assign({}, c);
    if (numite) { cx.masini = masini; if (grupa) cx.grupa = grupa; else delete cx.grupa; }
    if (alt) return { ok: false, motiv: 'alt_raport', raport: alt, masini: pe, perioada: p || perioadaImplicita(null, acum), context: cx };
    if (numite) return { ok: false, motiv: 'doar_masina', masini: masini, grupa: grupa, perioada: p, context: cx };
    return { ok: false, motiv: 'fara_subiect', masini: pe, context: cx };
  }
  if (!numite) {
    if (TOATA_FLOTA.test(t) || RANG.test(t) || DESPRE_FLOTA.test(t)) masini = null;
    else if (Array.isArray(c.masini) && c.masini.length) { masini = c.masini.slice(); grupa = c.grupa || null; mem.masini = true; }
  }
  // „Și săptămâna dinainte?": perioada de dinaintea celei discutate (întrebarea de continuare de sub răspuns, 08.10).
  if (!p && DINAINTE.test(t) && c.perioada && c.perioada.from && s.k !== 'scadente' && s.k !== 'locatie') p = perioadaDinainte(c.perioada, acum);
  // Perioada discutată rămâne la o continuare (nu la „ce expiră", care privește înainte, și nu la „unde e", care e acum).
  if (!p && c.perioada && c.perioada.from && (mem.subiect || urmare || mem.masini) && s.k !== 'scadente' && c.subiect !== 'scadente' && s.k !== 'locatie') {
    p = _per(c.perioada.from, c.perioada.to, acum); mem.perioada = true;
  }
  // „Unde e azi?" e tot „acum": citit pe o zi, o mașină parcată de ieri ar fi ieșit „stă de la miezul nopții".
  if (p && s.k === 'locatie' && Math.abs(Date.parse(p.to) - (acum != null ? Number(acum) : Date.now())) < 60000) p = null;
  if (!p) p = perioadaImplicita(s, acum);
  return { ok: true, subiect: s.k, raport: s.raport, et: s.et, masini: masini, grupa: grupa, perioada: p, top: RANG.test(t), mem: mem };
}
// Ce ține minte discuția după un răspuns (îl întoarce serverul; ecranul i-l trimite înapoi la întrebarea următoare).
// „Unde e acum" nu lasă perioadă în urmă: întrebarea următoare („și staționările?") pornește de la perioada ei.
function contextul(u, from, to) {
  return { subiect: u.subiect, masini: u.masini || null, grupa: u.grupa || null,
    perioada: (u.perioada && u.perioada.acum) ? null : { from: from, to: to } };
}
// „Am înțeles": ce a priceput, pe bucăți (aceeași formă ca la RA Insight, ca ecranul să le deseneze la fel).
function inteles(u, fisa) {
  const peImei = {}; (fisa || []).forEach(function (v) { peImei[v.imei] = v; });
  const out = [{ tip: 'subiect', text: u.et, mem: !!(u.mem && u.mem.subiect) }];
  let masina;
  if (!u.masini) masina = 'toată flota';
  else if (u.grupa) masina = 'grupa ' + u.grupa;
  else masina = u.masini.map(function (i) { return peImei[i] ? I.eticheta(peImei[i]) : i; }).join(', ');
  out.push({ tip: 'masina', text: masina, mem: !!(u.mem && u.mem.masini) });
  const per = u.perioada.acum ? 'acum' : (u.perioada.eticheta + (u.perioada.implicita ? (u.perioada.inainte ? ' (implicit)' : ' (n-ai spus perioada)') : ''));
  out.push({ tip: 'perioada', text: per, mem: !!(u.mem && u.mem.perioada) });
  return out;
}

// ─── Întrebările de continuare (Alin, 08.10: „da") ───────────────────────────────────────────────────
// Sub ultimul răspuns, cel mult trei întrebări gata scrise, pe reguli, din ce s-a răspuns: perioada dinainte, subiectul
// care urmează firesc și mașina (prima din tabel, ori toată flota după o singură mașină). Fiecare trebuie înțeleasă de
// `intelege` cu discuția de după răspuns (păzit de probă). Le folosește și RA Insight, din rapoartele pe care le-a citit
// (acolo apăsarea e o întrebare din lună; aici, la AI Raport, nu costă nimic).
const URMATORUL = {
  km: ['Și consumul?'], consum: ['Și costurile?'], costuri: ['Și alimentările?'], alimentari: ['Și consumul?'],
  ralanti: ['Și consumul?'], viteza: ['Și stilul de condus?'], scor: ['Și depășirile de viteză?'],
  clasament: ['Și depășirile de viteză?'], alerte: ['Și depășirile de viteză?'], zone: ['Și alertele?'],
  emisii: ['Și consumul?'], ore_condus: ['Și km-ii?'], ore_motor: ['Și ralantiul?'], scadente: ['Și luna viitoare?'],
  disponibilitate: ['Unde e acum?', 'Unde sunt mașinile acum?'], opriri: ['Unde e acum?', 'Unde sunt mașinile acum?'],
  locatie: ['Unde a stat azi?', 'Unde au stat azi?'], rezumat: ['Unde a stat?', 'Unde au stat?'], curse: ['Unde a stat?', 'Unde au stat?'],
};
const UNITATE_TEXT = { ziua: 'ziua', saptamana: 'săptămâna', luna: 'luna', perioada: 'perioada' };
// u = înțelegerea (subiect, masini, grupa, perioada); primaMasina = cum se scrie prima mașină din tabel („B 154 UIP").
function urmari(u, primaMasina) {
  const out = [];
  const una = !!(u && Array.isArray(u.masini) && u.masini.length === 1 && !u.grupa);
  const p = u && u.perioada;
  if (p && p.from && p.to && !p.acum && !p.inainte) out.push('Și ' + UNITATE_TEXT[_unitate(p)] + ' dinainte?');
  const urm = u && URMATORUL[u.subiect];
  if (urm) out.push(urm.length > 1 && !una ? urm[1] : urm[0]);
  if (una) out.push('Și pe toată flota?');
  else if (primaMasina) out.push('Dar ' + primaMasina + '?');
  return out.slice(0, 3).map(function (t) { return { text: t, trimite: t }; });
}
// Prima mașină din tabelul unui răspuns (coloana „Mașina"), scrisă cum o recunoaște `intelege`: numărul, altfel numele.
function _primaDinTabel(r, fisa) {
  if (!r || !r.tabel || !Array.isArray(r.tabel.coloane) || r.tabel.coloane[0] !== 'Mașina' || !r.tabel.randuri.length) return null;
  const et = String(r.tabel.randuri[0][0] || '');
  const v = (fisa || []).find(function (x) { return I.eticheta(x) === et; });
  return v ? (v.nr || v.nume) : null;
}

// ─── Răspunsurile, din raport ───────────────────────────────────────────────────────────────────────
// Cum scriem o mașină venită din raport („Dacia Logan 3 (B 154 UIP)") → „B 154 UIP · Dacia Logan 3".
function _etichete(fisa) {
  const m = {};
  (fisa || []).forEach(function (v) { m[v.etRaport] = I.eticheta(v); m[v.imei] = I.eticheta(v); });
  return function (x) { return (x && m[x]) || x || ''; };
}
function _pereche(lista, cheie) {
  const p = (lista || []).find(function (x) { return Array.isArray(x) && x[0] === cheie; });
  return p ? p[1] : undefined;
}
function _numar(v) {
  if (typeof v === 'number') return v;
  const s = String(v == null ? '' : v).replace(/\s/g, '').replace(/[^\d.,-]/g, '');
  if (!s) return NaN;
  // „1.234" (mii) / „6.8" (zecimale) / „6,8": dacă după punct sunt fix 3 cifre și nu e virgulă, e separator de mii.
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) return Number(s.replace(/\./g, ''));
  return Number(s.replace(',', '.'));
}
function _cine(u, et, fisa) {
  if (!u.masini) return null;
  if (u.grupa) return 'grupa ' + u.grupa;
  const peImei = {}; (fisa || []).forEach(function (v) { peImei[v.imei] = v; });
  return u.masini.map(function (i) { return peImei[i] ? I.eticheta(peImei[i]) : i; }).join(', ');
}
// O cifră din sumarul unui raport, scrisă românește: 12.5 → „12,5"; „0.45" (text cu punct zecimal) → „0,45".
function _val(v) {
  if (typeof v === 'number') return nr(v, 1);
  if (typeof v === 'string' && /^-?\d+\.\d+$/.test(v)) return nr(Number(v), 2);
  return String(v == null ? '—' : v);
}
// Eticheta din sumar în mijlocul propoziției: doar prima literă mică („Timp staționat total" → „timp staționat total"),
// dar „CO₂ total" rămâne „CO₂ total" și „PTO" rămâne „PTO".
function _mic(k) { k = String(k); return /^[A-ZĂÂÎȘȚ]{2}/.test(k) ? k : k.charAt(0).toLowerCase() + k.slice(1); }
// Rândurile unui tabel, numărate pe o coloană („Depășire viteză" × 5) — cele mai multe primele. `col` = o funcție (rând → text).
function _numara(rows, col) {
  const m = new Map();
  (rows || []).forEach(function (row) { const v = col(row); const k = String(v == null ? '' : v).trim(); if (k) m.set(k, (m.get(k) || 0) + 1); });
  return Array.from(m.entries()).sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); });
}
// Celula unui rând, după NUMELE coloanei. Rapoartele primesc pe locul 2 coloana „Șofer" (runReport → _injectDriverColumn),
// deci o coloană nu stă mereu pe același loc: până pe 07.10 AI Raport le citea după poziție și, pe raportul adevărat,
// „Ce expiră" citea coloana „Efectuat" în loc de „Stare" (deci „Nimic nu expiră"), iar „Ultima locație" scria șoferul
// în locul adresei. `c(row, 'Stare')` → valoarea; coloana lipsă → undefined.
function _col(rep) {
  const cols = (rep && Array.isArray(rep.columns)) ? rep.columns.map(function (x) { return I.norm(x); }) : [];
  const loc = {};
  return function (row, nume) {
    const k = I.norm(nume);
    if (!(k in loc)) loc[k] = cols.indexOf(k);
    return loc[k] >= 0 && Array.isArray(row) ? row[loc[k]] : undefined;
  };
}
// Durata scrisă de rapoarte („3h 20m", „45m", „30s") → secunde.
function _sec(txt) {
  const s = String(txt == null ? '' : txt);
  const h = /(\d+)\s*h/.exec(s), m = /(\d+)\s*m(?!s)/.exec(s), sc = /(\d+)\s*s/.exec(s);
  return (h ? +h[1] * 3600 : 0) + (m ? +m[1] * 60 : 0) + (sc ? +sc[1] : 0);
}
// Secunde → „3h 20m" (aceeași formă ca rapoartele).
function _dur(sec) {
  sec = Math.round(sec || 0);
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
  if (h > 0) return m > 0 ? h + 'h ' + m + 'm' : h + 'h';
  if (m > 0) return m + 'm';
  return (sec % 60) + 's';
}
// Data scrisă de rapoarte („06.10.2026, 08:10:00") → „06.10, 08:10"; `doarOra` → „08:10".
function _scurt(txt, doarOra) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s*(\d{1,2}):(\d{2})/.exec(String(txt || ''));
  if (!m) return String(txt || '');
  const ora = (m[4].length === 1 ? '0' : '') + m[4] + ':' + m[5];
  return doarOra ? ora : ((m[1].length === 1 ? '0' : '') + m[1] + '.' + (m[2].length === 1 ? '0' : '') + m[2] + ', ' + ora);
}
// Când, în vorbe: „azi la 13:47", „ieri la 18:40", „pe 05.10 la 08:10" (din data scrisă de rapoarte, pe ora României).
function _cand(txt, acum) {
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4}),?\s*(\d{1,2}):(\d{2})/.exec(String(txt || ''));
  if (!m) return 'pe ' + String(txt || '');
  const z = _parti(acum != null ? Number(acum) : Date.now());
  const ieri = _parti(_zi(z.y, z.m0, z.d - 1) + 3600000);
  const ora = (m[4].length === 1 ? '0' : '') + m[4] + ':' + m[5];
  if (+m[1] === z.d && +m[2] === z.m0 + 1 && +m[3] === z.y) return 'azi la ' + ora;
  if (+m[1] === ieri.d && +m[2] === ieri.m0 + 1 && +m[3] === ieri.y) return 'ieri la ' + ora;
  return 'pe ' + _scurt(txt).replace(', ', ' la ');
}
// O zi din „Situație zilnică" („2026-10-06") → „luni 06.10".
const ZILE_SAPT = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
function _ziText(zi) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(zi || ''));
  if (!m) return String(zi || '');
  return ZILE_SAPT[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).getUTCDay()] + ' ' + m[3] + '.' + m[2];
}
// Perioada e o singură zi (ieri, azi, „pe 15.09")? Atunci orele se scriu fără dată.
function _oZi(p) { return !!(p && Date.parse(p.to) - Date.parse(p.from) <= ZI + 3600000 && !p.inainte); }

// u = înțelegerea; rep = raportul rulat; extra = { fisa, anterior (raportul perioadei dinainte), alimentari, pret, acum }.
// Întoarce { text (cu **bold** și „• "), tiles: [{ et, val }], tabel?: { coloane, randuri }, sugestii: [{ fel: 'bun'|'atentie'|'info', text }] }.
// Când raportul s-a oprit la plafonul de poziții (`rep.trunchiat`, din reports.js), PRIMA sugestie o spune pe față:
// cifrele de deasupra nu acoperă toată perioada.
function raspunde(u, rep, extra) {
  const r = _raspunde(u, rep, extra);
  r.urmari = urmari(u, _primaDinTabel(r, (extra || {}).fisa));
  const tr = rep && Array.isArray(rep.trunchiat) ? rep.trunchiat : [];
  if (tr.length) {
    const et = _etichete((extra || {}).fisa);
    const pana = function (iso) { return new Date(iso).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', year: 'numeric' }); };
    r.sugestii.unshift({ fel: 'atentie', text: 'Atenție: perioada are prea multe poziții, așa că raportul s-a oprit înainte de capăt — ' +
      tr.slice(0, 3).map(function (x) { return et(x.vehicul) + ' (citit până pe ' + pana(x.panaLa) + ')'; }).join(', ') + (tr.length > 3 ? '…' : '') +
      '. Cifrele de mai sus nu acoperă toată perioada: întreabă pe o perioadă mai scurtă.' });
  }
  return r;
}
function _raspunde(u, rep, extra) {
  const x = extra || {};
  const fisa = x.fisa || [];
  const et = _etichete(fisa);
  const per = u.perioada.eticheta;
  const cine = _cine(u, et, fisa);
  const una = !!(u.masini && u.masini.length === 1 && !u.grupa);
  const r = { text: '', tiles: [], sugestii: [] };
  const sum = (rep && rep.summary) || {};
  const valori = (rep && Array.isArray(rep.valori)) ? rep.valori : null;

  if (u.subiect === 'km' && valori) {
    const km = valori.filter(function (v) { return v.unitate !== 'ore'; });
    const ore = valori.filter(function (v) { return v.unitate === 'ore'; });
    const tot = km.reduce(function (a, v) { return a + (v.km || 0); }, 0);
    const ord = km.slice().sort(function (a, b) { return (b.km || 0) - (a.km || 0); });
    if (una && km.length === 1) {
      const v = km[0];
      // Sursa, ca în raport: CAN = calculatorul de bord; „GPS (estimat)" = din pozițiile GPS; „bord+GPS" = indexul de
      // la bord, ținut la zi de aparat — nu se mai spune nimic, e cifra de încredere.
      r.text = '**' + et(v.imei) + '** a parcurs **' + cant(Math.round(v.km), 'km', 'km') + '** — ' + per + '.' +
        (v.sursa === 'CAN' ? ' (din calculatorul de bord)' : (v.sursa === 'GPS (estimat)' ? ' (estimat din GPS)' : ''));
      r.tiles = [{ et: 'Km', val: nr(v.km) }];
    } else if (una && ore.length === 1) {
      r.text = '**' + et(ore[0].imei) + '** a lucrat **' + cant(ore[0].ore, 'oră', 'ore', 1) + '** — ' + per + '.';
      r.tiles = [{ et: 'Ore de lucru', val: nr(ore[0].ore, 1) }];
    } else {
      const merse = km.filter(function (v) { return v.km > 0.5; }).length;
      r.text = (u.top ? 'Cei mai mulți km' : ((cine ? cine : 'Flota') + ' a parcurs **' + cant(Math.round(tot), 'km', 'km') + '**')) + ' — ' + per + '.';
      if (ord.length) r.tabel = { coloane: ['Mașina', 'Km'], randuri: ord.slice(0, u.top ? 5 : 8).map(function (v) { return [et(v.imei), nr(v.km)]; }) };
      r.tiles = [{ et: 'Km în total', val: nr(tot) }, { et: 'Au mers', val: merse + ' din ' + km.length }];
      if (ord[0] && ord[0].km > 0) r.tiles.push({ et: 'Cei mai mulți', val: et(ord[0].imei) });
      const pe0 = km.filter(function (v) { return v.km <= 0.5; });
      if (pe0.length && pe0.length < km.length) r.sugestii.push({ fel: 'atentie', text: (pe0.length === 1 ? 'O mașină n-a mers deloc: ' : pe0.length + ' mașini n-au mers deloc: ') + pe0.slice(0, 3).map(function (v) { return et(v.imei); }).join(', ') + (pe0.length > 3 ? '…' : '') + '.' });
    }
    if (x.anterior && Array.isArray(x.anterior.valori)) {
      const ant = x.anterior.valori.filter(function (v) { return v.unitate !== 'ore'; }).reduce(function (a, v) { return a + (v.km || 0); }, 0);
      const azi = km.reduce(function (a, v) { return a + (v.km || 0); }, 0);
      if (ant > 0 && azi > 0) {
        const dif = Math.round(azi - ant), pr = Math.round((azi - ant) / ant * 100);
        if (Math.abs(pr) >= 5) r.sugestii.push({ fel: 'info', text: (dif > 0 ? 'Cu ' + cant(dif, 'km', 'km') + ' mai mult' : 'Cu ' + cant(-dif, 'km', 'km') + ' mai puțin') + ' decât în perioada dinainte, la fel de lungă (' + (pr > 0 ? '+' : '') + pr + '%).' });
      }
    }
    return r;
  }

  if ((u.subiect === 'consum' || u.subiect === 'costuri') && valori) {
    // Cifrele greu de crezut, din raport (cifre.js, prin `valori`): spuse lângă răspuns, nu ascunse (Alin, 08.10).
    const deVerificat = function () {
      valori.filter(function (v) { return (v.deVerificat || []).length; }).slice(0, 4).forEach(function (v) {
        r.sugestii.unshift({ fel: 'atentie', text: 'De verificat — ' + et(v.imei) + ': ' + v.deVerificat.join('; ') + '.' });
      });
    };
    const cuDate = valori.filter(function (v) { return u.subiect === 'costuri' ? v.litri > 0 : v.areDate; });
    const litri = valori.reduce(function (a, v) { return a + (v.litri || 0); }, 0);
    const km = valori.reduce(function (a, v) { return a + (v.km || 0); }, 0);
    if (u.subiect === 'costuri') {
      const cost = valori.reduce(function (a, v) { return a + (v.cost || 0); }, 0);
      const est = valori.some(function (v) { return v.estimat; });
      if (una && valori.length === 1) {
        const v = valori[0];
        r.text = 'Combustibilul pentru **' + et(v.imei) + '** a costat **~' + lei(v.cost) + '** — ' + per + ': ' + cant(Math.round(v.litri), 'litru', 'litri') + ', la ' + nr(v.pret, 2) + ' lei litrul, pe ' + cant(v.km, 'km', 'km') + '.' + (v.estimat ? ' (litrii sunt estimați din fișa mașinii)' : '');
        r.tiles = [{ et: 'Cost', val: '~' + lei(v.cost) }, { et: 'Litri', val: nr(v.litri) }, { et: 'Cost pe km', val: v.km > 1 ? nr(v.cost / v.km, 2) + ' lei' : '—' }];
      } else {
        r.text = 'Combustibilul ' + (cine ? 'pentru ' + cine : 'flotei') + ' a costat **~' + lei(cost) + '** — ' + per + ': ' + cant(Math.round(litri), 'litru', 'litri') + ', pe ' + cant(Math.round(km), 'km', 'km') + '.' + (est ? ' (o parte din litri sunt estimați din fișele mașinilor)' : '');
        const ord = valori.slice().sort(function (a, b) { return (b.cost || 0) - (a.cost || 0); });
        r.tabel = { coloane: ['Mașina', 'Cost', 'Litri', 'Km'], randuri: ord.slice(0, u.top ? 5 : 8).map(function (v) { return [et(v.imei), '~' + lei(v.cost), nr(v.litri), nr(v.km)]; }) };
        r.tiles = [{ et: 'Cost total', val: '~' + lei(cost) }, { et: 'Litri', val: nr(litri) }, { et: 'Cost pe km', val: km > 1 ? nr(cost / km, 2) + ' lei' : '—' }];
      }
      deVerificat();
      return r;
    }
    if (una && valori.length === 1) {
      const v = valori[0];
      if (!v.areDate) {
        r.text = 'Pentru **' + et(v.imei) + '** nu am date de consum — ' + per + ': mașina nu are senzor de combustibil sau calculatorul ei de bord nu trimite consumul. Km parcurși: **' + nr(v.km) + '**.';
        r.tiles = [{ et: 'Km', val: nr(v.km) }];
      } else {
        r.text = '**' + et(v.imei) + '** a consumat **' + cant(Math.round(v.litri), 'litru', 'litri') + '** — ' + per + (v.l100 != null ? ': **' + nr(v.l100, 1) + ' L la 100 km**' : '') + ', pe ' + cant(v.km, 'km', 'km') + '.' + (v.sursa ? ' (sursa: ' + String(v.sursa).toLowerCase() + ')' : '');
        r.tiles = [{ et: 'Litri', val: nr(v.litri) }, { et: 'La 100 km', val: v.l100 != null ? nr(v.l100, 1) + ' L' : '—' }, { et: 'Km', val: nr(v.km) }];
      }
      const ant = x.anterior && Array.isArray(x.anterior.valori) ? x.anterior.valori[0] : null;
      if (ant && ant.l100 != null && v.l100 != null) {
        const d = Math.round((v.l100 - ant.l100) * 10) / 10;
        if (Math.abs(d) >= 0.2) r.sugestii.push({ fel: d < 0 ? 'bun' : 'atentie', text: 'Consumul e cu ' + nr(Math.abs(d), 1) + ' L la 100 km mai ' + (d < 0 ? 'mic' : 'mare') + ' decât în perioada dinainte, la fel de lungă (' + nr(v.l100, 1) + ' față de ' + nr(ant.l100, 1) + ').' });
      }
    } else {
      const med = km > 1 && litri > 0 ? litri / km * 100 : null;
      r.text = (cine ? cine : 'Flota') + ' a consumat **' + cant(Math.round(litri), 'litru', 'litri') + '** — ' + per + (med != null ? ', în medie **' + nr(med, 1) + ' L la 100 km**' : '') + ', pe ' + cant(Math.round(km), 'km', 'km') + '.' +
        (cuDate.length < valori.length ? ' (' + (valori.length - cuDate.length) + ' fără date de consum)' : '');
      const ord = cuDate.slice().sort(function (a, b) { return u.top ? ((b.litri || 0) - (a.litri || 0)) : ((b.litri || 0) - (a.litri || 0)); });
      if (ord.length) r.tabel = { coloane: ['Mașina', 'Litri', 'L la 100 km', 'Km'], randuri: ord.slice(0, u.top ? 5 : 8).map(function (v) { return [et(v.imei), nr(v.litri), v.l100 != null ? nr(v.l100, 1) : '—', nr(v.km)]; }) };
      r.tiles = [{ et: 'Litri', val: nr(litri) }, { et: 'Media la 100 km', val: med != null ? nr(med, 1) + ' L' : '—' }, { et: 'Km', val: nr(km) }];
      const cuL = cuDate.filter(function (v) { return v.l100 != null && v.km >= 50; });
      if (med != null && cuL.length >= 2) {
        const max = cuL.slice().sort(function (a, b) { return b.l100 - a.l100; })[0];
        if (max.l100 > med * 1.2) r.sugestii.push({ fel: 'atentie', text: et(max.imei) + ' consumă cel mai mult la 100 km: ' + nr(max.l100, 1) + ' L, față de media de ' + nr(med, 1) + '. Merită verificată.' });
      }
    }
    // Scăderile din raportul „Alimentări & scăderi", din cifrele lui (`valori`), nu din textul tabelului.
    if (x.alimentari && Array.isArray(x.alimentari.valori)) {
      const sc = x.alimentari.valori.filter(function (v) { return v.fel === 'scadere'; });
      if (sc.length) {
        const prim = sc[0];
        const zi = new Date(prim.ts).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', year: 'numeric' });
        r.sugestii.push({ fel: 'atentie', text: (sc.length === 1 ? 'Pe ' + zi + ', rezervorul ' + (una ? '' : 'lui ' + et(prim.imei) + ' ') + 'a scăzut cu ' + cant(Math.abs(Math.round(prim.litri)), 'litru', 'litri') + ' fără să se explice prin drum.' : sc.length + ' scăderi suspecte de combustibil în perioada asta.') + ' Vezi raportul „Alimentări & scăderi”.' });
      }
    }
    deVerificat();
    return r;
  }

  if (u.subiect === 'ralanti') {
    const litri = Number(sum['Combustibil irosit (L)']) || 0;
    const timp = sum['Timp ralanti total'] || '0';
    if (!Number(sum['Evenimente ralanti'])) {
      r.text = (cine ? '**' + cine + '**' : 'Flota') + ' nu a stat în ralanti — ' + per + '. (Se numără opririle cu motorul pornit mai lungi de 3 minute.)';
      r.tiles = [{ et: 'Timp în ralanti', val: '0' }, { et: 'Combustibil irosit', val: '0 L' }];
      return r;
    }
    r.text = (cine ? '**' + cine + '**' : 'Flota') + ' a stat în ralanti **' + timp + '** — ' + per + (litri ? ', arzând **' + cant(litri, 'litru', 'litri', 1) + '**' : '') + '.';
    r.tiles = [{ et: 'Timp în ralanti', val: String(timp) }, { et: 'Combustibil irosit', val: nr(litri, 1) + ' L' }, { et: 'Opriri cu motorul pornit', val: nr(sum['Evenimente ralanti'] || 0) }];
    if (litri > 0 && x.pret) r.sugestii.push({ fel: 'atentie', text: 'Asta înseamnă cam ' + lei(litri * x.pret) + ' pierduți (la ' + nr(x.pret, 2) + ' lei litrul).' });
    const pv = (Array.isArray(rep && rep.perVehicle) ? rep.perVehicle : []).filter(function (v) { return Number(_pereche(v.summary, 'Evenimente ralanti')) > 0; });
    if (!una && pv.length) {
      const ord = pv.slice().sort(function (a, b) { return (Number(_pereche(b.summary, 'Combustibil irosit (L)')) || 0) - (Number(_pereche(a.summary, 'Combustibil irosit (L)')) || 0); });
      r.tabel = { coloane: ['Mașina', 'Timp în ralanti', 'Litri'], randuri: ord.slice(0, 8).map(function (v) { return [et(v.vehicul), String(_pereche(v.summary, 'Timp ralanti') || '—'), nr(_pereche(v.summary, 'Combustibil irosit (L)'), 1)]; }) };
    }
    return r;
  }

  if (u.subiect === 'viteza') {
    const n = Number(sum['Depășiri'] != null ? sum['Depășiri'] : sum['Depășiri (vs. limită reală)']) || 0;
    const max = sum['Viteză maximă (km/h)'] != null ? sum['Viteză maximă (km/h)'] : sum['Max peste limită (km/h)'];
    r.text = n ? ((cine ? '**' + cine + '**' : 'Flota') + ': **' + cant(n, 'depășire', 'depășiri') + '** de viteză — ' + per + (max ? ', cea mai mare: **' + nr(max) + ' km/h**' : '') + (sum['Limită folosită'] ? ' (limita folosită: ' + sum['Limită folosită'] + ' km/h)' : '') + '.')
      : ((cine ? '**' + cine + '**' : 'Flota') + ': nicio depășire de viteză — ' + per + '.');
    r.tiles = [{ et: 'Depășiri', val: nr(n) }, { et: 'Viteza cea mai mare', val: max != null ? nr(max) + ' km/h' : '—' }];
    const pv = (Array.isArray(rep && rep.perVehicle) ? rep.perVehicle : []).filter(function (v) { return Number(_pereche(v.summary, 'Depășiri')) > 0; });
    if (!una && pv.length) {
      const ord = pv.slice().sort(function (a, b) { return Number(_pereche(b.summary, 'Depășiri')) - Number(_pereche(a.summary, 'Depășiri')); });
      r.tabel = { coloane: ['Mașina', 'Depășiri'], randuri: ord.slice(0, 8).map(function (v) { return [et(v.vehicul), nr(_pereche(v.summary, 'Depășiri'))]; }) };
      if (ord.length >= 2 && Number(_pereche(ord[0].summary, 'Depășiri')) >= 2 * Number(_pereche(ord[1].summary, 'Depășiri'))) r.sugestii.push({ fel: 'atentie', text: et(ord[0].vehicul) + ' are de două ori mai multe depășiri decât oricare altă mașină.' });
    }
    return r;
  }

  if (u.subiect === 'opriri') {
    // Rândurile: Vehicul, Șofer, Început, Sfârșit, Durată, Locație. Pe o mașină: fiecare oprire, cu locul.
    const rows = Array.isArray(rep && rep.rows) ? rep.rows : [];
    const c = _col(rep);
    if (!rows.length || !Number(sum['Opriri'])) { r.text = 'Nicio staționare — ' + (cine || 'toată flota') + ', ' + per + '.'; return r; }
    const oZi = _oZi(u.perioada);
    const sec = function (row) { return _sec(c(row, 'Durată')); };
    const lungi = rows.slice().sort(function (a, b) { return sec(b) - sec(a); });
    if (una) {
      const max = lungi[0];
      r.text = rows.length === 1
        ? '**' + et(c(max, 'Vehicul')) + '** a avut **o singură oprire** — ' + per + ': **' + String(c(max, 'Durată') || '') + '**, la ' + String(c(max, 'Locație') || '—') + ' (de la ' + _scurt(c(max, 'Început'), oZi) + ').'
        : '**' + et(c(max, 'Vehicul')) + '** a avut **' + cant(rows.length, 'oprire', 'opriri') + '** — ' + per + ', în total **' + String(sum['Timp staționat total'] || _dur(rows.reduce(function (a, row) { return a + sec(row); }, 0))) + '** pe loc. ' +
          'Cea mai lungă: **' + String(c(max, 'Durată') || '') + '**, la ' + String(c(max, 'Locație') || '—') + ' (de la ' + _scurt(c(max, 'Început'), oZi) + ').';
      // Câteva opriri: în ordinea zilei; multe: cele mai lungi.
      const arata = rows.length <= 8 ? rows : lungi.slice(0, 8);
      r.tabel = { coloane: ['De la', 'Până la', 'Cât', 'Unde'], randuri: arata.map(function (row) { return [_scurt(c(row, 'Început'), oZi), _scurt(c(row, 'Sfârșit'), oZi), String(c(row, 'Durată') || ''), String(c(row, 'Locație') || '')]; }) };
      if (rows.length > 8) r.sugestii.push({ fel: 'info', text: 'Sunt cele mai lungi 8 opriri din ' + rows.length + '. Toată lista, cu ora fiecăreia, e în raportul „Staționări”.' });
      r.tiles = [{ et: 'Opriri', val: nr(rows.length) }, { et: 'Timp pe loc', val: String(sum['Timp staționat total'] || '—') }, { et: 'Cea mai lungă', val: String(c(max, 'Durată') || '—') }];
      return r;
    }
    // Pe mai multe mașini: câte opriri și cât timp a stat fiecare (sumarul pe mașină al raportului).
    const pv = Array.isArray(rep && rep.perVehicle) ? rep.perVehicle : [];
    r.text = (cine ? '**' + cine + '**' : 'Flota') + ': **' + cant(Number(sum['Opriri']), 'oprire', 'opriri') + '** — ' + per + ', în total **' + String(sum['Timp staționat total'] || '—') + '** pe loc.';
    if (pv.length) {
      const ord = pv.slice().sort(function (a, b) { return _sec(_pereche(b.summary, 'Timp staționat')) - _sec(_pereche(a.summary, 'Timp staționat')); });
      r.tabel = { coloane: ['Mașina', 'Opriri', 'Timp pe loc', 'Cea mai lungă'], randuri: ord.slice(0, 8).map(function (v) { return [et(v.vehicul), nr(_pereche(v.summary, 'Opriri')), String(_pereche(v.summary, 'Timp staționat') || ''), String(_pereche(v.summary, 'Cea mai lungă') || '')]; }) };
    }
    r.tiles = [{ et: 'Opriri', val: nr(sum['Opriri']) }, { et: 'Timp pe loc', val: String(sum['Timp staționat total'] || '—') }];
    return r;
  }

  if (u.subiect === 'curse') {
    // Rândurile: Vehicul, Șofer, Plecare, Loc. plecare, Sosire, Loc. sosire, Durată, Distanță (km), …
    const rows = Array.isArray(rep && rep.rows) ? rep.rows : [];
    const c = _col(rep);
    if (!rows.length || !Number(sum['Curse'])) { r.text = 'Nicio cursă — ' + (cine || 'toată flota') + ', ' + per + '.'; return r; }
    const oZi = _oZi(u.perioada);
    const km = Number(sum['Distanță totală (km)']) || 0;
    if (una) {
      const prim = rows[0], ult = rows[rows.length - 1];
      r.text = '**' + et(c(prim, 'Vehicul')) + '** a făcut **' + cant(rows.length, 'cursă', 'curse') + '** — ' + per + ': **' + cant(Math.round(km), 'km', 'km') + '**, ' + String(sum['Durată totală'] || '—') + ' la drum. ' +
        'Prima plecare: ' + _scurt(c(prim, 'Plecare'), oZi) + ' (' + String(c(prim, 'Loc. plecare') || '—') + '); ultima sosire: ' + _scurt(c(ult, 'Sosire'), oZi) + ' (' + String(c(ult, 'Loc. sosire') || '—') + ').';
      r.tabel = { coloane: ['Plecare', 'De la', 'Până la', 'Km'], randuri: rows.slice(0, 8).map(function (row) { return [_scurt(c(row, 'Plecare'), oZi), String(c(row, 'Loc. plecare') || ''), String(c(row, 'Loc. sosire') || ''), nr(Number(c(row, 'Distanță (km)')), 1)]; }) };
      if (rows.length > 8) r.sugestii.push({ fel: 'info', text: 'Sunt primele 8 curse din ' + rows.length + '. Toate, cu orele și locurile, sunt în raportul „Foaie de parcurs”.' });
      r.tiles = [{ et: 'Curse', val: nr(rows.length) }, { et: 'Km', val: nr(km) }, { et: 'La drum', val: String(sum['Durată totală'] || '—') }];
      return r;
    }
    const pv = Array.isArray(rep && rep.perVehicle) ? rep.perVehicle : [];
    r.text = (cine ? '**' + cine + '**' : 'Flota') + ': **' + cant(Number(sum['Curse']), 'cursă', 'curse') + '** — ' + per + ', **' + cant(Math.round(km), 'km', 'km') + '**, ' + String(sum['Durată totală'] || '—') + ' la drum.';
    if (pv.length) {
      const ord = pv.slice().sort(function (a, b) { return (Number(_pereche(b.summary, 'Km totali')) || 0) - (Number(_pereche(a.summary, 'Km totali')) || 0); });
      r.tabel = { coloane: ['Mașina', 'Curse', 'Km', 'Prima plecare'], randuri: ord.slice(0, 8).map(function (v) { return [et(v.vehicul), nr(_pereche(v.summary, 'Curse')), nr(_pereche(v.summary, 'Km totali')), _scurt(_pereche(v.summary, 'Prima plecare'), oZi)]; }) };
    }
    r.tiles = [{ et: 'Curse', val: nr(sum['Curse']) }, { et: 'Km', val: nr(km) }, { et: 'La drum', val: String(sum['Durată totală'] || '—') }];
    return r;
  }

  if (u.subiect === 'rezumat') {
    // „Situație zilnică": Vehicul, Șofer, Zi, Interval activ, Km, Curse, Timp mers, Ralanti, Motor pornit, Opriri, Vit. max.
    const rows = Array.isArray(rep && rep.rows) ? rep.rows : [];
    const c = _col(rep);
    if (!rows.length) { r.text = 'Nu am poziții — ' + (cine || 'toată flota') + ', ' + per + ': aparatul n-a trimis nimic în perioada asta.'; return r; }
    const kmR = function (row) { return Number(c(row, 'Km')) || 0; };
    const merse = rows.filter(function (row) { return kmR(row) > 0.5 || Number(c(row, 'Curse')) > 0; });
    if (una) {
      const nume = '**' + et(c(rows[0], 'Vehicul')) + '**';
      if (!merse.length) { r.text = nume + ' n-a mers — ' + per + '. Aparatul a transmis, deci mașina a stat pe loc.'; r.tiles = [{ et: 'Km', val: '0' }]; return r; }
      if (rows.length === 1) {
        const z = rows[0];
        const ralZ = _sec(c(z, 'Ralanti'));
        r.text = nume + ' — ' + per + ': a lucrat între **' + String(c(z, 'Interval activ') || '—') + '**, **' + cant(Math.round(kmR(z)), 'km', 'km') + '** în ' + cant(Number(c(z, 'Curse')) || 0, 'cursă', 'curse') + '; ' +
          String(c(z, 'Timp mers') || '0m') + ' în mers, ' + (ralZ ? _dur(ralZ) + ' în ralanti' : 'fără ralanti') + ', ' + cant(Number(c(z, 'Opriri')) || 0, 'oprire', 'opriri') + '. Viteza cea mai mare: ' + nr(c(z, 'Vit. max')) + ' km/h.';
        r.tiles = [{ et: 'Km', val: nr(kmR(z)) }, { et: 'Curse', val: nr(c(z, 'Curse') || 0) }, { et: 'În mers', val: String(c(z, 'Timp mers') || '0m') }, { et: 'Ralanti', val: ralZ ? _dur(ralZ) : '0 min' }];
        return r;
      }
      const km = rows.reduce(function (a, row) { return a + kmR(row); }, 0);
      const curse = rows.reduce(function (a, row) { return a + (Number(c(row, 'Curse')) || 0); }, 0);
      const mers = rows.reduce(function (a, row) { return a + _sec(c(row, 'Timp mers')); }, 0);
      const ral = rows.reduce(function (a, row) { return a + _sec(c(row, 'Ralanti')); }, 0);
      r.text = nume + ' — ' + per + ': **' + cant(Math.round(km), 'km', 'km') + '** în **' + cant(merse.length, 'zi', 'zile') + '** de mers, ' + cant(curse, 'cursă', 'curse') + '; ' + _dur(mers) + ' în mers, ' + (ral ? _dur(ral) + ' în ralanti' : 'fără ralanti') + '.';
      r.tabel = { coloane: ['Ziua', 'Între', 'Km', 'Curse'], randuri: rows.slice(-10).map(function (row) { return [_ziText(c(row, 'Zi')), String(c(row, 'Interval activ') || '—'), nr(kmR(row)), nr(c(row, 'Curse') || 0)]; }) };
      r.tiles = [{ et: 'Km', val: nr(km) }, { et: 'Zile de mers', val: nr(merse.length) }, { et: 'Curse', val: nr(curse) }, { et: 'Ralanti', val: _dur(ral) }];
      return r;
    }
    // Pe mai multe mașini: câți km și câte zile de mers a avut fiecare.
    const peM = {};
    rows.forEach(function (row) {
      const k = String(c(row, 'Vehicul'));
      const m = peM[k] || (peM[k] = { km: 0, zile: 0, mers: 0 });
      m.km += kmR(row); if (kmR(row) > 0.5 || Number(c(row, 'Curse')) > 0) m.zile++; m.mers += _sec(c(row, 'Timp mers'));
    });
    const ord = Object.keys(peM).sort(function (a, b) { return peM[b].km - peM[a].km; });
    const kmTot = Number(sum['Km total']) || ord.reduce(function (a, k) { return a + peM[k].km; }, 0);
    r.text = (cine ? '**' + cine + '**' : 'Flota') + ' — ' + per + ': **' + cant(Math.round(kmTot), 'km', 'km') + '**; au mers ' + ord.filter(function (k) { return peM[k].zile > 0; }).length + ' din ' + ord.length + ' mașini' + (sum['Ralanti total (flotă)'] ? ', ralanti în total ' + sum['Ralanti total (flotă)'] : '') + '.';
    r.tabel = { coloane: ['Mașina', 'Km', 'Zile de mers', 'În mers'], randuri: ord.slice(0, 8).map(function (k) { return [et(k), nr(peM[k].km), nr(peM[k].zile), _dur(peM[k].mers)]; }) };
    r.tiles = [{ et: 'Km', val: nr(kmTot) }, { et: 'Au mers', val: ord.filter(function (k) { return peM[k].zile > 0; }).length + ' din ' + ord.length }];
    return r;
  }

  if (u.subiect === 'alimentari') {
    const chei = Object.keys(sum).filter(function (k) { return k !== 'Total vehicule'; });
    // Fără nimic de numărat, o propoziție, nu un șir de zerouri.
    if ((!Number(sum['Alimentări']) && !Number(sum['Scăderi suspecte'])) || !chei.length) {
      r.text = 'Nicio alimentare și nicio scădere de combustibil — ' + (cine || 'toată flota') + ', ' + per + '.';
      r.sugestii.push({ fel: 'info', text: 'Alimentările se văd doar la mașinile care trimit nivelul rezervorului (senzor de combustibil sau calculatorul de bord).' });
      return r;
    }
    r.text = '**' + u.et + '** — ' + (cine || 'toată flota') + ', ' + per + ': ' + chei.map(function (k) { return _mic(k) + ' **' + _val(sum[k]) + '**'; }).join(', ') + '.';
    r.tiles = chei.slice(0, 4).map(function (k) { return { et: k, val: _val(sum[k]) }; });
    if (Number(sum['Scăderi suspecte']) > 0) r.sugestii.push({ fel: 'atentie', text: cant(Number(sum['Scăderi suspecte']), 'scădere suspectă', 'scăderi suspecte') + ' (' + cant(Number(sum['Litri scăzuți']) || 0, 'litru', 'litri') + '). Merită verificate în raport, pe zile și locuri.' });
    return r;
  }

  if (u.subiect === 'scadente') {
    // Coloanele raportului: Vehicul, Șofer, Categorie, Tip, Scadență, Efectuat, Stare; starea = Depășit / Critic (≤ 7 zile) /
    // Curând (în preaviz) / OK / „—" (revizie pe km, fără kilometraj citit) / Efectuat.
    const rows = Array.isArray(rep && rep.rows) ? rep.rows : [];
    const c = _col(rep);
    const st = function (row) { return String(c(row, 'Stare') || ''); };
    const ce = function (row) { return String(c(row, 'Tip') || c(row, 'Categorie') || ''); };
    const exp = rows.filter(function (row) { return /^depășit/i.test(st(row)); });
    const urm = rows.filter(function (row) { return /^(critic|curând)/i.test(st(row)); });
    const deAles = exp.concat(urm);
    r.text = deAles.length ? ('**Ce expiră** — ' + (cine || 'toată flota') + ', ' + per + ': **' + cant(urm.length, 'scadență', 'scadențe') + '**' + (exp.length ? ', plus **' + cant(exp.length, 'act sau revizie', 'acte și revizii') + ' deja ' + (exp.length === 1 ? 'expirat' : 'expirate') + '**' : '') + '.')
      : ('Nimic nu expiră — ' + (cine || 'toată flota') + ', ' + per + '.');
    if (deAles.length) r.tabel = { coloane: ['Mașina', 'Ce', 'Scadența', 'Starea'], randuri: deAles.slice(0, 10).map(function (row) { return [et(c(row, 'Vehicul')), ce(row), String(c(row, 'Scadență') || ''), st(row)]; }) };
    r.tiles = [{ et: 'De urmărit', val: nr(urm.length) }, { et: 'Deja expirate', val: nr(exp.length) }];
    if (exp.length) r.sugestii.push({ fel: 'atentie', text: 'Expirat: ' + exp.slice(0, 3).map(function (row) { return et(c(row, 'Vehicul')) + ' — ' + ce(row); }).join('; ') + (exp.length > 3 ? '…' : '') + '.' });
    const critic = urm.filter(function (row) { return /^critic/i.test(st(row)); });
    if (critic.length) r.sugestii.push({ fel: 'atentie', text: (critic.length === 1 ? 'Unul expiră' : critic.length + ' expiră') + ' în cel mult 7 zile: ' + critic.slice(0, 3).map(function (row) { return et(c(row, 'Vehicul')) + ' — ' + ce(row); }).join('; ') + (critic.length > 3 ? '…' : '') + '.' });
    const faraKm = rows.filter(function (row) { return st(row) === '—'; }).length;
    if (faraKm) r.sugestii.push({ fel: 'info', text: cant(faraKm, 'revizie pe km nu se poate socoti', 'revizii pe km nu se pot socoti') + ': aparatul mașinii nu trimite kilometrajul.' });
    return r;
  }

  if (u.subiect === 'alerte') {
    // Coloanele: Vehicul, Șofer, Eveniment, Data, Detalii, Locație.
    const rows = Array.isArray(rep && rep.rows) ? rep.rows : [];
    const c = _col(rep);
    if (!rows.length) { r.text = 'Nicio alertă — ' + (cine || 'toată flota') + ', ' + per + '.'; return r; }
    const pe = _numara(rows, function (row) { return c(row, 'Eveniment'); }), peMas = _numara(rows, function (row) { return c(row, 'Vehicul'); });
    r.text = (cine ? '**' + cine + '**' : 'Flota') + ': **' + cant(rows.length, 'alertă', 'alerte') + '** — ' + per + '. Cele mai multe: ' + pe.slice(0, 3).map(function (x) { return x[0] + ' (' + x[1] + ')'; }).join(', ') + '.';
    r.tabel = { coloane: ['Alerta', 'De câte ori'], randuri: pe.slice(0, 8).map(function (x) { return [x[0], nr(x[1])]; }) };
    r.tiles = [{ et: 'Alerte', val: nr(rows.length) }, { et: 'Feluri de alerte', val: nr(pe.length) }];
    if (!una && peMas.length >= 2 && peMas[0][1] >= 2 * peMas[1][1]) r.sugestii.push({ fel: 'atentie', text: et(peMas[0][0]) + ' are cele mai multe alerte (' + peMas[0][1] + '), de cel puțin două ori mai multe decât oricare altă mașină.' });
    return r;
  }

  if (u.subiect === 'zone') {
    // Coloanele: Vehicul, Șofer, Zonă, Intrare, Ieșire, Durată.
    const rows = Array.isArray(rep && rep.rows) ? rep.rows : [];
    const c = _col(rep);
    if (!rows.length) { r.text = 'Nicio vizită în zone — ' + (cine || 'toată flota') + ', ' + per + '.'; return r; }
    const pe = _numara(rows, function (row) { return c(row, 'Zonă'); });
    r.text = (cine ? '**' + cine + '**' : 'Flota') + ': **' + cant(rows.length, 'vizită', 'vizite') + '** în zone — ' + per + ', în ' + cant(pe.length, 'zonă', 'zone') + '.';
    r.tabel = { coloane: ['Zona', 'Vizite'], randuri: pe.slice(0, 8).map(function (x) { return [x[0], nr(x[1])]; }) };
    r.tiles = [{ et: 'Vizite', val: nr(rows.length) }, { et: 'Zone', val: nr(pe.length) }];
    return r;
  }

  if (u.subiect === 'locatie') {
    // Coloanele: Vehicul, Șofer, Locație (unde a oprit), A oprit la, Staționează de („în mișcare"), Contact, Sateliți.
    // Plus `valori` (cifrele, pe mașină): de când stă, dacă oprirea ține de la capătul citit („de cel puțin"), ultima poziție.
    const rows = Array.isArray(rep && rep.rows) ? rep.rows : [];
    const c = _col(rep);
    const val = {}; (Array.isArray(rep && rep.valori) ? rep.valori : []).forEach(function (v) { val[v.vehicul] = v; });
    if (!rows.length) { r.text = 'Nu am poziții — ' + (cine || 'toată flota') + ', ' + per + ': aparatul n-a trimis nimic.'; return r; }
    const acum = u.perioada && u.perioada.acum;
    const merge = function (row) { return String(c(row, 'Staționează de')) === 'în mișcare'; };
    if (una && rows.length === 1) {
      const row = rows[0], v = val[c(row, 'Vehicul')] || {};
      const nume = '**' + et(c(row, 'Vehicul')) + '**', loc = String(c(row, 'Locație (unde a oprit)') || '—');
      const deCat = String(c(row, 'Staționează de') || '');
      if (merge(row)) r.text = nume + (acum ? ' e în mișcare acum, pe la **' + loc + '**.' : ' era în mișcare la capătul perioadei (' + per + '), pe la **' + loc + '**.');
      else if (acum) r.text = nume + ' stă de **' + (v.deCelPutin ? 'cel puțin ' : '') + deCat + '** la **' + loc + '** (a oprit ' + _cand(c(row, 'A oprit la'), x.acum) + ').';
      else r.text = 'La capătul perioadei (' + per + '), ' + nume + ' era parcată la **' + loc + '**, oprită ' + _cand(c(row, 'A oprit la'), x.acum) + ' (' + (v.deCelPutin ? 'de cel puțin ' : 'de ') + deCat + ').';
      r.tiles = [{ et: merge(row) ? 'În mișcare' : 'Stă de', val: merge(row) ? 'da' : (v.deCelPutin ? '≥ ' : '') + deCat }, { et: 'Contactul', val: String(c(row, 'Contact') || '—') }];
      if (v.deCelPutin && !merge(row)) r.sugestii.push({ fel: 'info', text: 'Oprirea ține de la începutul perioadei citite, deci mașina stă de fapt de și mai mult timp. Raportul „Disponibilitate flotă” pe o perioadă mai lungă arată de când n-a mai mers.' });
      if (!merge(row) && String(c(row, 'Contact')) === 'pornit') r.sugestii.push({ fel: 'atentie', text: 'Contactul e pornit cât stă: motorul poate merge în gol (ralanti).' });
      const sem = (acum && v.ultima && typeof x.semnal === 'function') ? String(x.semnal(v.ultima) || '') : '';
      if (/^(tăcut|fără semnal)/.test(sem)) r.sugestii.push({ fel: 'atentie', text: 'Aparatul e ' + sem + ': locul de mai sus e ultimul primit, nu neapărat cel de acum.' });
      return r;
    }
    // Pe mai multe mașini: câte stau și câte merg; cele care stau de cel mai mult timp, primele.
    const vechime = function (row) { const v = val[c(row, 'Vehicul')]; return v && v.opritLa ? Date.parse(v.opritLa) : Infinity; };
    const ord = rows.slice().sort(function (a, b) { return (merge(a) ? 1 : 0) - (merge(b) ? 1 : 0) || vechime(a) - vechime(b); });
    const merg = rows.filter(merge).length;
    r.text = (cine ? '**' + cine + '**' : 'Flota') + (acum ? ' acum' : ' la capătul perioadei (' + per + ')') + ': **' + cant(rows.length - merg, 'mașină parcată', 'mașini parcate') + '**' + (merg ? ' și **' + cant(merg, 'mașină în mișcare', 'mașini în mișcare') + '**' : '') + '.';
    r.tabel = { coloane: ['Mașina', 'Unde', 'De cât timp'], randuri: ord.slice(0, 10).map(function (row) { const v = val[c(row, 'Vehicul')] || {}; return [et(c(row, 'Vehicul')), String(c(row, 'Locație (unde a oprit)') || ''), (v.deCelPutin && !merge(row) ? '≥ ' : '') + String(c(row, 'Staționează de') || '')]; }) };
    r.tiles = [{ et: 'Parcate', val: nr(rows.length - merg) }, { et: 'În mișcare', val: nr(merg) }];
    return r;
  }

  if (u.subiect === 'disponibilitate') {
    // Coloanele: Vehicul, Șofer, Zile active („N zile: …"), Zile inactive, Cea mai lungă pauză, Ultima poziție, Semnal.
    const rows = Array.isArray(rep && rep.rows) ? rep.rows : [];
    const c = _col(rep);
    if (!rows.length) { r.text = 'Nu am mașini de verificat — ' + per + '.'; return r; }
    const zileF = function (row) { return parseInt(c(row, 'Zile inactive'), 10) || 0; };
    const tacut = function (row) { return /^inexistent/i.test(String(c(row, 'Semnal') || '')); };
    if (una && rows.length === 1) {
      const row = rows[0];
      const act = parseInt(c(row, 'Zile active'), 10) || 0;
      r.text = '**' + et(c(row, 'Vehicul')) + '** — ' + per + ': a mers în **' + cant(act, 'zi', 'zile') + '**, ' + (zileF(row) ? 'a stat ' + cant(zileF(row), 'zi', 'zile') : 'în fiecare zi') + '. Cea mai lungă pauză: ' + String(c(row, 'Cea mai lungă pauză') || '—').split('  ·  ')[0] + '; ultima poziție: ' + _scurt(c(row, 'Ultima poziție')) + '; semnalul: ' + String(c(row, 'Semnal') || '—').toLowerCase() + '.';
      r.tiles = [{ et: 'Zile de mers', val: nr(act) }, { et: 'Zile fără mers', val: nr(zileF(row)) }, { et: 'Semnalul', val: String(c(row, 'Semnal') || '—') }];
      if (tacut(row)) r.sugestii.push({ fel: 'atentie', text: 'Aparatul nu mai transmite. Merită verificat (alimentarea, cartela SIM).' });
      return r;
    }
    const inact = rows.filter(function (row) { return zileF(row) > 0; });
    const tac = rows.filter(tacut);
    r.text = (cine ? '**' + cine + '**' : 'Flota') + ' — ' + per + ': **' + (rows.length - inact.length) + ' din ' + rows.length + '** au mers în fiecare zi' + (inact.length ? '; **' + cant(inact.length, 'mașină a avut', 'mașini au avut') + '** zile fără mers' : '') + '.';
    if (inact.length) r.tabel = { coloane: ['Mașina', 'Zile fără mers', 'Semnal'], randuri: inact.slice(0, 8).map(function (row) { return [et(c(row, 'Vehicul')), String(zileF(row)), String(c(row, 'Semnal') || '')]; }) };
    r.tiles = [{ et: 'Au mers zilnic', val: nr(rows.length - inact.length) }, { et: 'Cu zile fără mers', val: nr(inact.length) }, { et: 'Fără semnal', val: nr(tac.length) }];
    if (tac.length) r.sugestii.push({ fel: 'atentie', text: (tac.length === 1 ? 'O mașină nu mai transmite: ' : tac.length + ' mașini nu mai transmit: ') + tac.slice(0, 3).map(function (row) { return et(c(row, 'Vehicul')); }).join(', ') + (tac.length > 3 ? '…' : '') + '. Merită verificat aparatul.' });
    return r;
  }

  if (u.subiect === 'clasament') {
    // Coloanele: Rang, Șofer, Scor, Notă, Evenim./100km, Km.
    const rows = Array.isArray(rep && rep.rows) ? rep.rows : [];
    const c = _col(rep);
    if (!rows.length) { r.text = 'Nu am destule date de condus pentru un clasament — ' + per + '.'; return r; }
    const prim = rows[0];
    r.text = '**Clasamentul șoferilor** după stilul de condus — ' + (cine ? cine + ', ' : '') + per + '. Cel mai bun: **' + c(prim, 'Șofer') + '** (scor ' + c(prim, 'Scor') + ', nota ' + c(prim, 'Notă') + ').';
    r.tabel = { coloane: ['Loc', 'Șofer', 'Scor', 'Nota', 'Manevre bruște la 100 km'], randuri: rows.slice(0, 8).map(function (row) { return ['Rang', 'Șofer', 'Scor', 'Notă', 'Evenim./100km'].map(function (k) { return String(c(row, k)); }); }) };
    if (rows.length >= 2) { const ult = rows[rows.length - 1]; if (Number(c(ult, 'Scor')) < 60) r.sugestii.push({ fel: 'atentie', text: c(ult, 'Șofer') + ' are cel mai mic scor (' + c(ult, 'Scor') + '). O discuție despre frânări și accelerări bruște ar ajuta.' }); }
    r.tiles = [{ et: 'Scorul mediu', val: String(sum['Scor mediu flotă (0-100)'] != null ? sum['Scor mediu flotă (0-100)'] : '—') }, { et: 'Șoferi evaluați', val: nr(rows.length) }];
    return r;
  }

  if (u.subiect === 'scor') {
    const s = sum['Scor flotă (0-100)'];
    const pv = Array.isArray(rep && rep.perVehicle) ? rep.perVehicle : [];
    // Fără drum, raportul pune scorul flotei pe 0 — nu e un scor prost, e lipsa datelor.
    if (!Number(sum['Vehicule evaluate'])) { r.text = 'Nu am destule date de condus — ' + (cine || 'toată flota') + ', ' + per + ': ' + (una ? 'mașina n-a mers' : 'mașinile n-au mers') + ' destul cât să se poată da un scor.'; return r; }
    if (una && pv.length === 1) {
      const v = pv[0];
      r.text = 'Stilul de condus pentru **' + et(v.vehicul) + '** — ' + per + ': scor **' + _pereche(v.summary, 'Scor') + '** (nota ' + _pereche(v.summary, 'Notă') + '), cu ' + cant(Number(_pereche(v.summary, 'Frânări bruște')) || 0, 'frânare bruscă', 'frânări bruște') + ' și ' + cant(Number(_pereche(v.summary, 'Accel. bruște')) || 0, 'accelerare bruscă', 'accelerări bruște') + '.';
      r.tiles = [{ et: 'Scor', val: String(_pereche(v.summary, 'Scor')) }, { et: 'Frânări bruște', val: String(_pereche(v.summary, 'Frânări bruște')) }, { et: 'Accelerări bruște', val: String(_pereche(v.summary, 'Accel. bruște')) }];
    } else {
      r.text = 'Stilul de condus — ' + (cine || 'toată flota') + ', ' + per + ': scorul **' + (s != null ? s : '—') + '** din 100, cu ' + cant(Number(sum['Frânări bruște']) || 0, 'frânare bruscă', 'frânări bruște') + ' și ' + cant(Number(sum['Accelerări bruște']) || 0, 'accelerare bruscă', 'accelerări bruște') + '.';
      if (pv.length) {
        const ord = pv.slice().sort(function (a, b) { return Number(_pereche(a.summary, 'Scor')) - Number(_pereche(b.summary, 'Scor')); });
        r.tabel = { coloane: ['Mașina', 'Scor', 'Nota', 'Frânări bruște'], randuri: ord.slice(0, 8).map(function (v) { return [et(v.vehicul), String(_pereche(v.summary, 'Scor')), String(_pereche(v.summary, 'Notă')), String(_pereche(v.summary, 'Frânări bruște'))]; }) };
        if (Number(_pereche(ord[0].summary, 'Scor')) < 60) r.sugestii.push({ fel: 'atentie', text: et(ord[0].vehicul) + ' are cel mai mic scor (' + _pereche(ord[0].summary, 'Scor') + ').' });
      }
      r.tiles = [{ et: 'Scorul flotei', val: s != null ? String(s) : '—' }, { et: 'Frânări bruște', val: nr(sum['Frânări bruște'] || 0) }, { et: 'Accelerări bruște', val: nr(sum['Accelerări bruște'] || 0) }];
    }
    return r;
  }

  // Orice alt raport (condus & repaus, ore motor, emisii): sumarul lui, pe bucăți (aceleași etichete ca în raport).
  const chei = Object.keys(sum).filter(function (k) { return k !== 'Total vehicule' && sum[k] !== '—'; });
  r.text = '**' + u.et + '** — ' + (cine || 'toată flota') + ', ' + per + (chei.length ? ': ' + chei.slice(0, 4).map(function (k) { return _mic(k) + ' **' + _val(sum[k]) + '**'; }).join(', ') + '.' : '. Detaliile sunt în raport.');
  r.tiles = chei.slice(0, 4).map(function (k) { return { et: k, val: _val(sum[k]) }; });
  return r;
}

// Butoanele de după o întrebare neînțeleasă: ce se poate afla despre o mașină (cu numărul ei în întrebare, ca răspunsul
// să nu depindă de ce ține minte ecranul) sau despre flotă. Fiecare întrebare trebuie înțeleasă de `intelege` — păzit.
const PE_MASINA = [
  { text: 'Unde e acum', q: function (m) { return 'Unde e ' + m + ' acum?'; } },
  { text: 'Ce a făcut azi', q: function (m) { return 'Ce a făcut ' + m + ' azi?'; } },
  { text: 'Staționări azi', q: function (m) { return 'Staționările lui ' + m + ' de azi'; } },
  { text: 'Km săptămâna asta', q: function (m) { return 'Câți km a făcut ' + m + ' săptămâna asta?'; } },
  { text: 'Consum luna asta', q: function (m) { return 'Consumul lui ' + m + ' luna asta'; } },
  { text: 'Viteză săptămâna asta', q: function (m) { return 'Depășiri de viteză ' + m + ' săptămâna asta'; } },
  { text: 'Ce expiră', q: function (m) { return 'Ce expiră la ' + m + '?'; } },
];
const PE_FLOTA = [
  { text: 'Unde sunt mașinile', q: 'Unde sunt mașinile acum?' },
  { text: 'Ce a făcut flota ieri', q: 'Ce a făcut flota ieri?' },
  { text: 'Staționări azi', q: 'Staționările flotei de azi' },
  { text: 'Km săptămâna asta', q: 'Km pe flotă săptămâna asta' },
  { text: 'Consum luna asta', q: 'Consumul flotei luna asta' },
  { text: 'Ce expiră', q: 'Ce expiră pe flotă în următoarele 30 de zile' },
];
function _butoane(masina) {
  if (masina) { const m = masina.nr || masina.nume; return PE_MASINA.map(function (b) { return { text: b.text, trimite: b.q(m) }; }); }
  return PE_FLOTA.map(function (b) { return { text: b.text, trimite: b.q }; });
}
// Răspunsul când nu se poate răspunde pe reguli — spus cinstit, cu drumul mai departe (butoane, nu o listă de cuvinte).
// u = ce a întors `intelege` (motiv, masini, raport…); extra = { areInsight, etRaport (raport → nume) }.
// NU spune nimic despre fondul RA Insight sau despre „gratuit" (Alin, 07.10: „nu e ok să apară asta").
function neinteles(u, fisa, extra) {
  const x = extra || {};
  const motiv = u && u.motiv;
  const peImei = {}; (fisa || []).forEach(function (v) { peImei[v.imei] = v; });
  const una = u && Array.isArray(u.masini) && u.masini.length === 1 ? peImei[u.masini[0]] : null;
  if (motiv === 'pentru_insight') {
    return x.areInsight
      ? { text: 'La „de ce", comparații și sfaturi răspunde **RA Insight**: caută cauza în mai multe rapoarte și ți-o explică.', spreInsight: true }
      : { text: 'Aici răspund cu cifrele din rapoarte: cât, când, unde, care mașină. La „de ce", comparații și sfaturi nu pot răspunde din rapoarte.', alege: _butoane(una) };
  }
  if (motiv === 'ambiguu') return { text: 'Se potrivesc mai multe mașini. Pe care o vrei?', alege: (u.variante || []).slice(0, 8).map(function (v) { return { text: I.eticheta(v), trimite: v.nr || v.nume }; }) };
  if (motiv === 'gol') return { text: 'Scrie o întrebare despre rapoarte — de exemplu „Câți km a făcut B 154 UIP săptămâna trecută?".' };
  if (motiv === 'doar_masina') {
    if (u.grupa) return { text: 'Ce vrei să afli despre grupa **' + u.grupa + '**? Scrie, de exemplu: „km săptămâna asta", „staționări azi", „consum luna asta".' };
    if (una) return { text: 'Ce vrei să afli despre **' + I.eticheta(una) + '**?', alege: _butoane(una) };
    return { text: 'Ce vrei să afli despre mașinile astea? Scrie, de exemplu: „km săptămâna asta", „staționări azi".' };
  }
  if (motiv === 'alt_raport') {
    const nume = (x.etRaport && x.etRaport[u.raport]) || u.raport;
    return { text: 'Raportul **„' + nume + '”** nu-l citesc încă aici. Îl deschizi cu butonul de mai jos' + (una ? ', pe ' + I.eticheta(una) : '') + '.', deschide: true };
  }
  if (una) return { text: 'Nu am înțeles ce vrei să afli despre **' + I.eticheta(una) + '**. Alege mai jos sau scrie altfel: ce (km, consum, staționări, viteză…) și ce perioadă.', alege: _butoane(una), spreInsight: !!x.areInsight };
  return { text: 'Nu am înțeles ce raport te interesează. Alege mai jos sau scrie mai simplu: ce (km, consum, staționări, viteză, ce expiră…), care mașină și ce perioadă.', alege: _butoane(null), spreInsight: !!x.areInsight };
}

// Butonul „Raport" din caseta de scris (08.10): ce se poate afla, cu cuvântul pus în întrebare. Fiecare cuvânt trebuie să
// numească subiectul lui (păzit de probă: subiectDin(cuvânt) = subiectul).
const ALEGERI_RAPORT = [
  ['km', 'Km parcurși', 'km'], ['consum', 'Consum', 'consumul'], ['costuri', 'Costuri cu combustibilul', 'costurile cu combustibilul'],
  ['locatie', 'Unde e acum și de cât timp stă', 'unde e acum'], ['opriri', 'Staționări', 'staționările'], ['rezumat', 'Ce a făcut (pe zile)', 'ce a făcut'],
  ['curse', 'Curse (foaie de parcurs)', 'cursele'], ['viteza', 'Depășiri de viteză', 'depășirile de viteză'], ['ralanti', 'Ralanti', 'ralantiul'],
  ['alimentari', 'Alimentări și scăderi', 'alimentările'], ['scor', 'Stilul de condus', 'stilul de condus'], ['clasament', 'Clasamentul șoferilor', 'clasamentul șoferilor'],
  ['scadente', 'Ce expiră (acte și revizii)', 'ce expiră'], ['alerte', 'Alerte', 'alertele'], ['disponibilitate', 'Disponibilitate (zile fără mers)', 'disponibilitatea'],
  ['ore_condus', 'Ore de condus', 'orele de condus'], ['zone', 'Vizite în zone', 'vizitele în zone'], ['emisii', 'Emisii CO₂', 'emisiile'],
].map(function (x) { return { k: x[0], text: x[1], pune: x[2] }; });

// Întrebările gata făcute (butoanele de sus) — fiecare trebuie să fie înțeleasă de `intelege` (păzit de probă).
const INTREBARI_GATA = [
  { k: 'km', text: 'Km săptămâna asta', ic: 'fa-road' },
  { k: 'consum', text: 'Consum luna trecută', ic: 'fa-gas-pump' },
  { k: 'viteza', text: 'Depășiri de viteză în ultimele 7 zile', ic: 'fa-gauge-high' },
  { k: 'ralanti', text: 'Ralanti azi', ic: 'fa-hourglass-half' },
  { k: 'costuri', text: 'Costuri cu combustibilul luna asta', ic: 'fa-coins' },
  { k: 'scadente', text: 'Ce expiră în următoarele 30 de zile', ic: 'fa-calendar-check' },
  { k: 'clasament', text: 'Clasamentul șoferilor în ultimele 30 de zile', ic: 'fa-ranking-star' },
];

module.exports = {
  SUBIECTE, ALTE_RAPOARTE, INTREBARI_GATA, ALEGERI_RAPORT, PE_MASINA, PE_FLOTA, MAX_ZILE, ZILE_LOCATIE,
  intelege, contextul, inteles, raspunde, neinteles, urmari, perioadaDin, perioadaImplicita, perioadaAnterioara, perioadaDinainte,
  subiectDin, nr, cant, _numar,
};
