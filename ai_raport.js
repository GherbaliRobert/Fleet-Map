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
// Ordinea contează: primul care se potrivește câștigă. „Km și consum" → consum (raportul de consum are și km-ii);
// „cât m-a costat motorina" → costuri (are și litrii); „cât a stat în ralanti" → ralanti, nu staționări.
const SUBIECTE = [
  { k: 'ore_condus', raport: 'hos', et: 'Condus & repaus', re: /\b(ore de condus|condus continuu|pauz\w*|repaus|561|tahograf\w*)\b/ },
  { k: 'ore_motor', raport: 'enginehours', et: 'Ore motor', re: /\bore (de )?motor\b/ },
  { k: 'clasament', raport: 'ecodrive_drivers', et: 'Clasamentul șoferilor', re: /\b(clasament\w*|top (al )?soferilor|top soferi|cel mai bun sofer|cei mai buni soferi)\b/ },
  { k: 'scor', raport: 'ecodrive', et: 'Stilul de condus (EcoDrive)', re: /\b(scor\w*|ecodrive|eco drive|franar\w*|frane bruste|acceler\w*|viraj\w*|agresiv\w*|stil(ul)? de condus)\b/ },
  { k: 'ralanti', raport: 'idling', et: 'Ralanti', re: /\b(ralanti\w*|mers in gol|motor(ul)? pornit pe loc)\b/ },
  { k: 'alimentari', raport: 'fuel', et: 'Alimentări & scăderi', re: /\b(aliment\w*|plinul|plin|scader\w*|furt\w*|golit\w*)\b/ },
  { k: 'costuri', raport: 'costs', et: 'Costuri combustibil', re: /\b(cost\w*|bani|cheltui\w*|lei)\b/ },
  { k: 'consum', raport: 'consumption', et: 'Consum carburant', re: /\b(consum\w*|litri|l\/100|motorin\w*|benzin\w*)\b/ },
  { k: 'disponibilitate', raport: 'uptime', et: 'Disponibilitate flotă', re: /\b(inactiv\w*|disponibilitat\w*|fara semnal|(nu au|n-?au|nu a) mers deloc)\b/ },
  { k: 'km', raport: 'utilization', et: 'Km parcurși', re: /\b(km|kilometr\w*|kilometir\w*|parcurs\w*|distant\w*|rulaj\w*|(a|au) mers|(a|au) facut)\b/ },
  { k: 'viteza', raport: 'speeding', et: 'Depășiri de viteză', re: /\b(vitez\w*|depasir\w*|vitezoman\w*|peste limita)\b/ },
  { k: 'opriri', raport: 'stops', et: 'Staționări', re: /\b(oprir\w*|stationa\w*|(a|au) stat|parcat\w*)\b/ },
  { k: 'curse', raport: 'trips', et: 'Foaie de parcurs', re: /\b(curse|cursa|cursel\w*|foaie de parcurs|foaia de parcurs|deplasar\w*)\b/ },
  { k: 'scadente', raport: 'due', et: 'Ce expiră (acte și service)', re: /\b(expir\w*|itp|rca|casco|rovinieta|revizi\w*|service|scaden\w*|acte(le)?|documente\w*)\b/ },
  { k: 'zone', raport: 'geofence', et: 'Vizite în zone', re: /\b(zon(a|e|ele|ei)|hotspot\w*|vizit\w*)\b/ },
  { k: 'emisii', raport: 'emissions', et: 'Emisii CO₂', re: /\b(emisii|co2|carbon)\b/ },
  { k: 'alerte', raport: 'events', et: 'Alertele declanșate', re: /\b(alert\w*|evenimente)\b/ },
  { k: 'locatie', raport: 'location', et: 'Ultima locație', re: /\b(ultima (locatie|pozitie)|unde (a|au) parcat|unde (a|au) stat ultima)\b/ },
];
const SUB = {}; SUBIECTE.forEach(function (s) { SUB[s.k] = s; });
function subiectDin(t) { for (const s of SUBIECTE) if (s.re.test(t)) return s; return null; }

// Întrebările la care răspunde RA Insight, nu AI Raport: cauze, comparații întinse, sfaturi, texte de scris.
const PENTRU_INSIGHT = /\b(de ce|din ce cauza|explic\w*|compar\w*|ce sa fac|ce ar trebui|recomand\w*|sfat\w*|cum pot|cum as putea|analiz\w*|prezic\w*|estimeaz\w*|scrie(-i)?|motivul)\b/;
// „Cine/care … cel mai mult", „top", „clasament": se răspunde cu ordinea, nu doar cu totalul.
const RANG = /(\b(cine|care)\b[^?]*\b(cel mai|cea mai|cei mai|cele mai)\b)|\btop\b|\b(cele mai multe|cei mai multi)\b/;
const TOATA_FLOTA = /\b(flota|flotei|toate masinile|toata flota|fiecare masina|fiecare|masinile)\b/;
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
  if (/\balaltaieri\b/.test(t)) return _per(_zi(z.y, z.m0, z.d - 2), _zi(z.y, z.m0, z.d - 1), now);
  if (/\bieri\b/.test(t)) return _per(_zi(z.y, z.m0, z.d - 1), azi0, now);
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
const _UMPLUTURA = /\b(si|dar|iar|apoi|acum|pe|in|din|la|de|pentru|cat|cati|cate|ce|care|cu|al|a|ale|lui|asta|aceasta|curenta|trecuta|precedenta|anterioara|azi|astazi|ieri|alaltaieri|saptamana|luna|ultimele|ultima|ultimii|zile|zi|anul|\d+|ianuarie|februarie|martie|aprilie|mai|iunie|iulie|august|septembrie|sept|octombrie|noiembrie|decembrie)\b/g;
function _doarPerioada(t) { return !String(t).replace(/[^a-z0-9 ]/g, ' ').replace(_UMPLUTURA, ' ').trim(); }
// Fără perioadă spusă: ultimele 7 zile; la „ce expiră" — următoarele 30 de zile.
function perioadaImplicita(s, acum) {
  const now = acum != null ? Number(acum) : Date.now();
  if (s && s.k === 'scadente') return _per(now, now + 30 * ZI, now, { inainte: true, implicita: true });
  return _per(now - 7 * ZI, now, now, { implicita: true });
}
// Perioada de dinainte, la fel de lungă (pentru „față de perioada dinainte").
function perioadaAnterioara(p) {
  const a = Date.parse(p.from), b = Date.parse(p.to);
  return { from: new Date(a - (b - a)).toISOString(), to: new Date(a).toISOString() };
}

// ─── Înțelegerea întrebării ─────────────────────────────────────────────────────────────────────────
// ctx = ce s-a discutat la întrebarea de dinainte: { subiect, masini: [imei], grupa, perioada: { from, to } }.
// Întoarce { ok: true, subiect, raport, et, masini (null = toată flota), grupa, perioada, top, mem } sau
// { ok: false, motiv: 'gol' | 'pentru_insight' | 'fara_subiect' | 'ambiguu', variante? }.
function intelege(text, ctx, fisa, acum) {
  const t = I.norm(text);
  const c = ctx || {};
  if (!t) return { ok: false, motiv: 'gol' };
  if (PENTRU_INSIGHT.test(t)) return { ok: false, motiv: 'pentru_insight' };
  const urmare = /^(si|dar|iar|apoi|acum|ok)\b/.test(t);
  const mem = { subiect: false, masini: false, perioada: false };
  let s = subiectDin(t);
  const g = I.gasesteInText(text, fisa || []);
  const areMasina = g.masini.length || g.grupe.length || g.ambigue.length;
  let p = perioadaDin(t, acum, s);
  // O continuare: lipsește subiectul, dar omul a schimbat mașina sau perioada („și luna trecută?", „dar B 155 UIP?").
  // Doar perioada, fără alte cuvinte („ieri?", „luna trecută") — altfel „vreme frumoasă azi" ar moșteni subiectul.
  if (!s && c.subiect && SUB[c.subiect] && (urmare || areMasina || (p && _doarPerioada(t)))) { s = SUB[c.subiect]; mem.subiect = true; if (!p) p = perioadaDin(t, acum, s); }
  if (!s) return { ok: false, motiv: 'fara_subiect' };
  let masini = null, grupa = null;
  if (g.masini.length) masini = g.masini.map(function (v) { return v.imei; });
  else if (g.grupe.length === 1) { masini = g.grupe[0].masini.map(function (v) { return v.imei; }); grupa = g.grupe[0].nume; }
  else if (g.ambigue.length) {
    let variante = [].concat.apply([], g.ambigue.map(function (a) { return a.variante; }));
    if (CELALALT.test(t) && Array.isArray(c.masini)) variante = variante.filter(function (v) { return c.masini.indexOf(v.imei) < 0; });
    const unice = []; const vaz = new Set();
    variante.forEach(function (v) { if (!vaz.has(v.imei)) { vaz.add(v.imei); unice.push(v); } });
    if (unice.length === 1) masini = [unice[0].imei];
    else return { ok: false, motiv: 'ambiguu', variante: unice, subiect: s.k };
  }
  else if (TOATA_FLOTA.test(t)) masini = null;
  else if (Array.isArray(c.masini) && c.masini.length && (mem.subiect || urmare)) {
    // O continuare („și luna trecută?", „și consumul?") rămâne pe mașina discutată. O întrebare nouă, întreagă
    // („Ce expiră în următoarele 30 de zile?"), privește toată flota — „Am înțeles" o arată, iar omul poate preciza.
    masini = c.masini.slice(); grupa = c.grupa || null; mem.masini = true;
  }
  if (!p && c.perioada && c.perioada.from && (mem.subiect || urmare || mem.masini) && s.k !== 'scadente' && c.subiect !== 'scadente') {
    p = _per(c.perioada.from, c.perioada.to, acum); mem.perioada = true;
  }
  if (!p) p = perioadaImplicita(s, acum);
  return { ok: true, subiect: s.k, raport: s.raport, et: s.et, masini: masini, grupa: grupa, perioada: p, top: RANG.test(t), mem: mem };
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
  out.push({ tip: 'perioada', text: u.perioada.eticheta + (u.perioada.implicita ? (u.perioada.inainte ? ' (implicit)' : ' (n-ai spus perioada)') : ''), mem: !!(u.mem && u.mem.perioada) });
  return out;
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
// Rândurile unui tabel, numărate pe o coloană („Depășire viteză" × 5) — cele mai multe primele.
function _numara(rows, col) {
  const m = new Map();
  (rows || []).forEach(function (row) { const k = String(row[col] == null ? '' : row[col]).trim(); if (k) m.set(k, (m.get(k) || 0) + 1); });
  return Array.from(m.entries()).sort(function (a, b) { return b[1] - a[1] || a[0].localeCompare(b[0]); });
}

// u = înțelegerea; rep = raportul rulat; extra = { fisa, anterior (raportul perioadei dinainte), alimentari, pret, acum }.
// Întoarce { text (cu **bold** și „• "), tiles: [{ et, val }], tabel?: { coloane, randuri }, sugestii: [{ fel: 'bun'|'atentie'|'info', text }] }.
// Când raportul s-a oprit la plafonul de poziții (`rep.trunchiat`, din reports.js), PRIMA sugestie o spune pe față:
// cifrele de deasupra nu acoperă toată perioada.
function raspunde(u, rep, extra) {
  const r = _raspunde(u, rep, extra);
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
    if (x.alimentari && Array.isArray(x.alimentari.rows)) {
      const sc = x.alimentari.rows.filter(function (row) { return /scădere|furt/i.test(String(row[2] || '')); });
      if (sc.length) {
        const prim = sc[0];
        r.sugestii.push({ fel: 'atentie', text: (sc.length === 1 ? 'Pe ' + String(prim[1]).split(/[ ,]/)[0] + ', rezervorul ' + (una ? '' : 'lui ' + et(prim[0]) + ' ') + 'a scăzut cu ' + cant(Math.abs(Math.round(_numar(prim[4]))), 'litru', 'litri') + ' fără să se explice prin drum.' : sc.length + ' scăderi suspecte de combustibil în perioada asta.') + ' Vezi raportul „Alimentări & scăderi”.' });
      }
    }
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

  if (u.subiect === 'opriri' || u.subiect === 'curse' || u.subiect === 'alimentari') {
    const chei = Object.keys(sum).filter(function (k) { return k !== 'Total vehicule'; });
    // Fără nimic de numărat, o propoziție, nu un șir de zerouri („opriri 0, timp staționat total 0s").
    const gol = u.subiect === 'opriri' ? !Number(sum['Opriri']) : u.subiect === 'curse' ? !Number(sum['Curse']) : (!Number(sum['Alimentări']) && !Number(sum['Scăderi suspecte']));
    if (gol || !chei.length) {
      r.text = (u.subiect === 'alimentari' ? 'Nicio alimentare și nicio scădere de combustibil' : 'Nicio ' + (u.subiect === 'opriri' ? 'staționare' : 'cursă')) + ' — ' + (cine || 'toată flota') + ', ' + per + '.';
      if (u.subiect === 'alimentari') r.sugestii.push({ fel: 'info', text: 'Alimentările se văd doar la mașinile care trimit nivelul rezervorului (senzor de combustibil sau calculatorul de bord).' });
      return r;
    }
    r.text = '**' + u.et + '** — ' + (cine || 'toată flota') + ', ' + per + ': ' + chei.map(function (k) { return _mic(k) + ' **' + _val(sum[k]) + '**'; }).join(', ') + '.';
    r.tiles = chei.slice(0, 4).map(function (k) { return { et: k, val: _val(sum[k]) }; });
    if (u.subiect === 'alimentari' && Number(sum['Scăderi suspecte']) > 0) r.sugestii.push({ fel: 'atentie', text: cant(Number(sum['Scăderi suspecte']), 'scădere suspectă', 'scăderi suspecte') + ' (' + cant(Number(sum['Litri scăzuți']) || 0, 'litru', 'litri') + '). Merită verificate în raport, pe zile și locuri.' });
    return r;
  }

  if (u.subiect === 'scadente') {
    // Rândurile raportului: [mașina, categoria, tipul, scadența, efectuat, starea]; starea = Depășit / Critic (≤ 7 zile) /
    // Curând (≤ 30) / OK / „—" (revizie pe km, fără kilometraj citit) / Efectuat.
    const rows = Array.isArray(rep && rep.rows) ? rep.rows : [];
    const exp = rows.filter(function (row) { return /^depășit/i.test(String(row[5] || '')); });
    const urm = rows.filter(function (row) { return /^(critic|curând)/i.test(String(row[5] || '')); });
    const deAles = exp.concat(urm);
    r.text = deAles.length ? ('**Ce expiră** — ' + (cine || 'toată flota') + ', ' + per + ': **' + cant(urm.length, 'scadență', 'scadențe') + '**' + (exp.length ? ', plus **' + cant(exp.length, 'act sau revizie', 'acte și revizii') + ' deja ' + (exp.length === 1 ? 'expirat' : 'expirate') + '**' : '') + '.')
      : ('Nimic nu expiră — ' + (cine || 'toată flota') + ', ' + per + '.');
    if (deAles.length) r.tabel = { coloane: ['Mașina', 'Ce', 'Scadența', 'Starea'], randuri: deAles.slice(0, 10).map(function (row) { return [et(row[0]), String(row[2] || row[1] || ''), String(row[3] || ''), String(row[5] || '')]; }) };
    r.tiles = [{ et: 'De urmărit', val: nr(urm.length) }, { et: 'Deja expirate', val: nr(exp.length) }];
    if (exp.length) r.sugestii.push({ fel: 'atentie', text: 'Expirat: ' + exp.slice(0, 3).map(function (row) { return et(row[0]) + ' — ' + String(row[2] || row[1] || ''); }).join('; ') + (exp.length > 3 ? '…' : '') + '.' });
    const critic = urm.filter(function (row) { return /^critic/i.test(String(row[5] || '')); });
    if (critic.length) r.sugestii.push({ fel: 'atentie', text: (critic.length === 1 ? 'Unul expiră' : critic.length + ' expiră') + ' în cel mult 7 zile: ' + critic.slice(0, 3).map(function (row) { return et(row[0]) + ' — ' + String(row[2] || row[1] || ''); }).join('; ') + (critic.length > 3 ? '…' : '') + '.' });
    const faraKm = rows.filter(function (row) { return String(row[5] || '') === '—'; }).length;
    if (faraKm) r.sugestii.push({ fel: 'info', text: cant(faraKm, 'revizie pe km nu se poate socoti', 'revizii pe km nu se pot socoti') + ': aparatul mașinii nu trimite kilometrajul.' });
    return r;
  }

  if (u.subiect === 'alerte') {
    // Rândurile: [mașina, alerta, data, detalii, locul].
    const rows = Array.isArray(rep && rep.rows) ? rep.rows : [];
    if (!rows.length) { r.text = 'Nicio alertă — ' + (cine || 'toată flota') + ', ' + per + '.'; return r; }
    const pe = _numara(rows, 1), peMas = _numara(rows, 0);
    r.text = (cine ? '**' + cine + '**' : 'Flota') + ': **' + cant(rows.length, 'alertă', 'alerte') + '** — ' + per + '. Cele mai multe: ' + pe.slice(0, 3).map(function (x) { return x[0] + ' (' + x[1] + ')'; }).join(', ') + '.';
    r.tabel = { coloane: ['Alerta', 'De câte ori'], randuri: pe.slice(0, 8).map(function (x) { return [x[0], nr(x[1])]; }) };
    r.tiles = [{ et: 'Alerte', val: nr(rows.length) }, { et: 'Feluri de alerte', val: nr(pe.length) }];
    if (!una && peMas.length >= 2 && peMas[0][1] >= 2 * peMas[1][1]) r.sugestii.push({ fel: 'atentie', text: et(peMas[0][0]) + ' are cele mai multe alerte (' + peMas[0][1] + '), de cel puțin două ori mai multe decât oricare altă mașină.' });
    return r;
  }

  if (u.subiect === 'zone') {
    // Rândurile: [mașina, zona, intrare, ieșire, durata].
    const rows = Array.isArray(rep && rep.rows) ? rep.rows : [];
    if (!rows.length) { r.text = 'Nicio vizită în zone — ' + (cine || 'toată flota') + ', ' + per + '.'; return r; }
    const pe = _numara(rows, 1);
    r.text = (cine ? '**' + cine + '**' : 'Flota') + ': **' + cant(rows.length, 'vizită', 'vizite') + '** în zone — ' + per + ', în ' + cant(pe.length, 'zonă', 'zone') + '.';
    r.tabel = { coloane: ['Zona', 'Vizite'], randuri: pe.slice(0, 8).map(function (x) { return [x[0], nr(x[1])]; }) };
    r.tiles = [{ et: 'Vizite', val: nr(rows.length) }, { et: 'Zone', val: nr(pe.length) }];
    return r;
  }

  if (u.subiect === 'locatie') {
    // Rândurile: [mașina, locul, a oprit la, staționează de („în mișcare"), contact, sateliți].
    const rows = Array.isArray(rep && rep.rows) ? rep.rows : [];
    if (!rows.length) { r.text = 'Nu am poziții — ' + (cine || 'toată flota') + ', ' + per + '.'; return r; }
    if (una && rows.length === 1) {
      const row = rows[0];
      r.text = String(row[3]) === 'în mișcare'
        ? '**' + et(row[0]) + '** e în mișcare, ultima dată la **' + row[1] + '**.'
        : '**' + et(row[0]) + '** stă la **' + row[1] + '** de **' + row[3] + '** (a oprit pe ' + row[2] + ').';
      return r;
    }
    const merg = rows.filter(function (row) { return String(row[3]) === 'în mișcare'; }).length;
    r.text = (cine ? '**' + cine + '**' : 'Flota') + ': **' + cant(rows.length - merg, 'mașină parcată', 'mașini parcate') + '**' + (merg ? ' și **' + cant(merg, 'mașină în mișcare', 'mașini în mișcare') + '**' : '') + '.';
    r.tabel = { coloane: ['Mașina', 'Unde', 'De cât timp'], randuri: rows.slice(0, 10).map(function (row) { return [et(row[0]), String(row[1] || ''), String(row[3] || '')]; }) };
    r.tiles = [{ et: 'Parcate', val: nr(rows.length - merg) }, { et: 'În mișcare', val: nr(merg) }];
    return r;
  }

  if (u.subiect === 'disponibilitate') {
    // Rândurile: [mașina, „N zile: …" active, „N zile: …" fără mers, cea mai lungă pauză, ultima poziție, semnalul].
    const rows = Array.isArray(rep && rep.rows) ? rep.rows : [];
    if (!rows.length) { r.text = 'Nu am mașini de verificat — ' + per + '.'; return r; }
    const inact = rows.filter(function (row) { return parseInt(row[2], 10) > 0; });
    const tac = rows.filter(function (row) { return /^inexistent/i.test(String(row[5] || '')); });
    r.text = (cine ? '**' + cine + '**' : 'Flota') + ' — ' + per + ': **' + (rows.length - inact.length) + ' din ' + rows.length + '** au mers în fiecare zi' + (inact.length ? '; **' + cant(inact.length, 'mașină a avut', 'mașini au avut') + '** zile fără mers' : '') + '.';
    if (inact.length) r.tabel = { coloane: ['Mașina', 'Zile fără mers', 'Semnal'], randuri: inact.slice(0, 8).map(function (row) { return [et(row[0]), String(parseInt(row[2], 10) || 0), String(row[5] || '')]; }) };
    r.tiles = [{ et: 'Au mers zilnic', val: nr(rows.length - inact.length) }, { et: 'Cu zile fără mers', val: nr(inact.length) }, { et: 'Fără semnal', val: nr(tac.length) }];
    if (tac.length) r.sugestii.push({ fel: 'atentie', text: (tac.length === 1 ? 'O mașină nu mai transmite: ' : tac.length + ' mașini nu mai transmit: ') + tac.slice(0, 3).map(function (row) { return et(row[0]); }).join(', ') + (tac.length > 3 ? '…' : '') + '. Merită verificat aparatul.' });
    return r;
  }

  if (u.subiect === 'clasament') {
    const rows = Array.isArray(rep && rep.rows) ? rep.rows : [];
    if (!rows.length) { r.text = 'Nu am destule date de condus pentru un clasament — ' + per + '.'; return r; }
    r.text = '**Clasamentul șoferilor** după stilul de condus — ' + (cine ? cine + ', ' : '') + per + '. Cel mai bun: **' + rows[0][1] + '** (scor ' + rows[0][2] + ', nota ' + rows[0][3] + ').';
    if (rows.length) r.tabel = { coloane: ['Loc', 'Șofer', 'Scor', 'Nota', 'Manevre bruște la 100 km'], randuri: rows.slice(0, 8).map(function (row) { return [String(row[0]), String(row[1]), String(row[2]), String(row[3]), String(row[4])]; }) };
    if (rows.length >= 2) { const ult = rows[rows.length - 1]; if (Number(ult[2]) < 60) r.sugestii.push({ fel: 'atentie', text: ult[1] + ' are cel mai mic scor (' + ult[2] + '). O discuție despre frânări și accelerări bruște ar ajuta.' }); }
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

// Răspunsul când nu se poate răspunde pe reguli — spus cinstit, cu drumul mai departe.
function neinteles(motiv, variante, fisa) {
  if (motiv === 'pentru_insight') return { text: 'La „de ce", comparații și sfaturi răspunde **RA Insight**: caută cauza în mai multe rapoarte și ți-o explică. Întrebarea se scade din fondul lunii.', spreInsight: true };
  if (motiv === 'ambiguu') return { text: 'Se potrivesc mai multe mașini. Pe care o vrei?', alege: (variante || []).slice(0, 8).map(function (v) { return { text: I.eticheta(v), trimite: v.nr || v.nume }; }) };
  if (motiv === 'gol') return { text: 'Scrie o întrebare despre rapoarte — de exemplu „Câți km a făcut B 154 UIP săptămâna trecută?".' };
  return { text: 'Nu am înțeles despre ce raport e vorba. Încearcă o întrebare de mai sus, sau spune ce vrei: km, consum, costuri, viteză, ralanti, opriri, alimentări, ce expiră, stilul de condus.', spreInsight: true };
}

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
  SUBIECTE, INTREBARI_GATA, MAX_ZILE,
  intelege, inteles, raspunde, neinteles, perioadaDin, perioadaImplicita, perioadaAnterioara, subiectDin, nr, cant, _numar,
};
