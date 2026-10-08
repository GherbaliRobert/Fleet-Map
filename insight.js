// insight.js — RA Insight: cum își cheamă clientul mașinile, ce perioadă a cerut și ce ținem minte dintr-o discuție.
//
// Fără bază, fără rețea, fără model: tot ce e aici se rulează într-o probă (verify_insight.js).
//
// De ce există (Alin, 02.10, cu două capturi): „Câți km a făcut B 154 UIP săptămâna trecută?" → „B 154 UIP nu
// apare în flotă". RA Insight primea mașinile DOAR cu numele („Dacia Logan 3"); numărul de înmatriculare nu
// ajungea la el. Iar la „Dacia Logan 3", trimis imediat după, uitase întrebarea: fiecare mesaj pleca singur.
// Aici stau cele două reparații: fișa flotei (număr, nume, șofer, grupă) și forma memoriei.
'use strict';

const DIACRITICE = /[̀-ͯ]/g;
function norm(s) { return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(DIACRITICE, '').replace(/\s+/g, ' ').trim(); }
// „B 154 UIP", „b154uip", „B-154-UIP" → „b154uip". Numerele se compară așa, fără spații și semne.
function compact(s) { return norm(s).replace(/[^a-z0-9]/g, ''); }
function cuvinte(s) { return norm(s).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean); }

// Terminațiile lipite de un nume în română: „Loganul", „Caddy-ului", „Passatului", „Transitul".
// Doar pentru POTRIVIRE (nu schimbăm ce scrie omul); un cuvânt prea scurt după tăiere rămâne întreg.
const TERMINATII = ['urile', 'ului', 'ul', 'lui', 'le', 'ii', 'a'];
function radacina(c) {
  for (const t of TERMINATII) if (c.length - t.length >= 4 && c.endsWith(t)) return c.slice(0, -t.length);
  return c;
}
// Cuvinte care apar în aproape orice întrebare și nu deosebesc o mașină de alta: „mașina", „camionul"…
// O mașină numită „Camion 1" se găsește tot, prin cifra de lângă (vezi `_dupaNume`).
const GENERICE = new Set(['masina', 'masini', 'masinii', 'masinile', 'vehicul', 'vehicule', 'vehiculul', 'auto', 'camion',
  'camionul', 'camioane', 'duba', 'dubita', 'autoutilitara', 'utilitara', 'autoturism', 'tir', 'tirul', 'utilaj', 'utilajul',
  'flota', 'flotei', 'firma', 'masinuta', 'nr', 'numar', 'numarul', 'cu', 'de', 'la', 'si', 'pe', 'in', 'din']);
const GENERICE_R = new Set(Array.from(GENERICE).map(radacina));   // aceleași, după tăierea terminației

// ─── Fișa flotei: tot ce știm despre cum se cheamă o mașină ─────────────────────────────────────────
// devices = rândurile din db.getDevices (deja trecute prin canAccessImei și fără cele arhivate);
// soferi  = { id → nume }. Întoarce câte o fișă pe mașină, cu formele normalizate gata de comparat.
function fisaFlotei(devices, soferi) {
  const s = soferi || {};
  return (devices || []).map(function (d) {
    const nume = String(d.name || '').trim();
    const nr = String(d.plate || '').trim();
    const sofer = d.driver_id != null && s[d.driver_id] ? String(s[d.driver_id]).trim() : '';
    const grupa = String(d.group_name || '').trim();
    return {
      imei: String(d.imei), nume: nume || nr || String(d.imei), nr: nr, sofer: sofer, grupa: grupa,
      tip: d.vehicle_type || null,
      // cum o scriu rapoartele („Dacia Logan 3 (B 154 UIP)") — ca AI Raport s-o recunoască în rândurile lor
      etRaport: (nume || String(d.imei)) + (nr ? ' (' + nr + ')' : ''),
      _nr: compact(nr), _nume: norm(nume), _cuv: cuvinte(nume).map(radacina), _sofer: cuvinte(sofer), _grupa: norm(grupa)
    };
  });
}
// Cum scriem o mașină pe ecran: numărul întâi (la o flotă mare, după el se caută), apoi numele.
function eticheta(v) {
  if (!v) return '';
  if (v.nr && v.nume && compact(v.nume) !== compact(v.nr)) return v.nr + ' · ' + v.nume;
  return v.nr || v.nume || v.imei;
}

// ─── Ce mașini pomenește un text ────────────────────────────────────────────────────────────────────
// Întoarce { masini, grupe, ambigue, folosit }:
//   masini  = fișele găsite fără îndoială;
//   grupe   = { nume, masini } — „grupa Cluj" înseamnă toate mașinile ei;
//   ambigue = { cheie, variante } — „Logan" când flota are trei Logan: NU alegem noi, întrebăm omul.
function gasesteInText(text, fisa, optiuni) {
  const dinUnealta = !!(optiuni && optiuni.dinUnealta);
  const out = { masini: [], grupe: [], ambigue: [] };
  if (!text || !fisa || !fisa.length) return out;
  let t = ' ' + norm(text) + ' ';
  const luate = new Set();
  const adauga = function (v) { if (!luate.has(v.imei)) { luate.add(v.imei); out.masini.push(v); } };

  // 1) Numerele de înmatriculare — întâi, fiindcă sunt unice. Se compară fără spații: „B154UIP" = „B 154 UIP".
  //    După potrivire, bucata se scoate din text, ca cifrele ei („154") să nu mai prindă și alt nume.
  const tc = compact(text);
  for (const v of fisa) {
    if (v._nr && v._nr.length >= 5 && tc.indexOf(v._nr) >= 0) { adauga(v); t = _scoateNr(t, v.nr); }
  }
  // Număr scris pe jumătate („154 UIP", fără județ): doar dacă are cifre ȘI litere și e destul de lung,
  // ca o cifră oarecare din întrebare să nu ajungă număr de mașină.
  if (!out.masini.length) {
    const bucati = (t.match(/\b\d{2,3}\s?[a-z]{3}\b/g) || []).map(compact);
    for (const b of bucati) {
      const cand = fisa.filter(function (v) { return v._nr && v._nr.endsWith(b); });
      if (cand.length === 1) { adauga(cand[0]); t = t.replace(new RegExp(b.replace(/(\d+)([a-z]+)/, '$1\\s?$2')), ' '); }
      else if (cand.length > 1) out.ambigue.push({ cheie: b.toUpperCase(), variante: cand });
    }
  }

  // 2) Grupele: „grupa Cluj", „grupul Distribuție", sau numele grupei scris întreg.
  const grupeVazute = {};
  for (const v of fisa) if (v._grupa) (grupeVazute[v._grupa] = grupeVazute[v._grupa] || { nume: v.grupa, masini: [] }).masini.push(v);
  for (const k of Object.keys(grupeVazute)) {
    if (k.length < 3 || GENERICE.has(k)) continue;
    if (new RegExp('(^|[^a-z0-9])' + _re(k) + '([^a-z0-9]|$)').test(t)) out.grupe.push(grupeVazute[k]);
  }

  // 3) Numele mașinii: întâi scris întreg („Dacia Logan 3"), cel mai lung întâi, ca „Dacia Logan" să nu fure „Dacia Logan 3".
  const dupaLungime = fisa.filter(function (v) { return v._nume && v._nume.length >= 3 && !luate.has(v.imei); })
    .sort(function (a, b) { return b._nume.length - a._nume.length; });
  for (const v of dupaLungime) {
    const re = new RegExp('(^|[^a-z0-9])' + _re(v._nume) + '([^a-z0-9]|$)');
    if (re.test(t)) { adauga(v); t = t.replace(re, ' '); }
  }
  // …apoi scris cu terminație („Camionul 1", „Loganul 3" la o mașină numită „Logan 3"): aceleași cuvinte, în ordine.
  const stemeText = cuvinte(t).map(radacina);
  for (const v of fisa) {
    if (luate.has(v.imei) || v._cuv.length < 2) continue;
    for (let i = 0; i + v._cuv.length <= stemeText.length; i++) {
      let la = true;
      for (let k = 0; k < v._cuv.length && la; k++) if (stemeText[i + k] !== v._cuv[k]) la = false;
      if (la) { adauga(v); break; }
    }
  }
  // …apoi după cuvintele care deosebesc numele („Passat", „Caddy", „Loganul"). Dacă rămân mai multe, e ambiguu.
  const dupaNume = _dupaNume(t, fisa.filter(function (v) { return !luate.has(v.imei); }));
  for (const g of dupaNume) {
    if (g.variante.length === 1) adauga(g.variante[0]);
    else out.ambigue.push(g);
  }

  // 4) Șoferul: numele întreg, sau „lui Ion" / „șoferul Popescu" (un singur cuvânt doar cu vorba de dinainte,
  //    altfel „consum mare" ar găsi pe Ionel Mare).
  const tok = cuvinte(t);
  const pePrenume = {};   // cuvântul scris → mașinile șoferilor care îl au în nume
  const dinNumeIntreg = new Set();   // „Ion Mare" scris întreg: „ion" nu mai caută și alți Ion
  for (const v of fisa) {
    if (!v._sofer.length || luate.has(v.imei)) continue;
    const intreg = v._sofer.join(' ');
    if (intreg.length >= 5 && new RegExp('(^|[^a-z0-9])' + _re(intreg) + '([^a-z0-9]|$)').test(t)) { adauga(v); v._sofer.forEach(function (c) { dinNumeIntreg.add(c); }); }
  }
  for (const v of fisa) {
    if (!v._sofer.length || luate.has(v.imei)) continue;
    for (let i = 0; i < tok.length; i++) {
      if (dinNumeIntreg.has(tok[i])) continue;
      // Din unealtă (modelul a scris doar „Ion"), cuvântul vine singur: e deja un nume ales, nu o frază.
      const cuVorba = i > 0 && /^(lui|soferul|soferului|sofer|soferii)$/.test(tok[i - 1]);
      if ((cuVorba || dinUnealta) && tok[i].length >= 3 && v._sofer.indexOf(tok[i]) >= 0) {
        (pePrenume[tok[i]] = pePrenume[tok[i]] || []).push(v);
        break;
      }
    }
  }
  for (const k of Object.keys(pePrenume)) {
    const lista = pePrenume[k].filter(function (v) { return !luate.has(v.imei); });
    if (!lista.length) continue;
    const soferi = new Set(lista.map(function (v) { return v._sofer.join(' '); }));
    if (soferi.size === 1) lista.forEach(adauga);       // un singur șofer (poate cu mai multe mașini) — ale lui
    else out.ambigue.push({ cheie: k, variante: lista }); // doi „Ion" în firmă: întrebăm care
  }
  // „Loganul lui Ion": trei Logan și doi Ion, dar un singur Logan al unui Ion. Când două îndoieli se taie
  // într-o singură mașină, aia e.
  if (out.ambigue.length >= 2) {
    let comun = out.ambigue[0].variante;
    for (let i = 1; i < out.ambigue.length; i++) {
      const ids = new Set(out.ambigue[i].variante.map(function (v) { return v.imei; }));
      comun = comun.filter(function (v) { return ids.has(v.imei); });
    }
    if (comun.length === 1) { out.ambigue = []; adauga(comun[0]); }
  }
  return out;
}
// Cuvintele unui nume care pot numi o mașină: nu sunt generice și nu sunt doar cifre. Un cuvânt pe care îl au
// toate mașinile („Logan", la o flotă numai de Logan) tot numește ceva: toate — deci e o îndoială de lămurit, nu
// „nimic" (proba a prins asta: „cât a mers loganul?" nu găsea nicio mașină). O cifră din nume („Logan 3",
// „Camion 1") alege între mașinile găsite după cuvânt, dacă omul a scris-o lângă.
function _dupaNume(t, ramase) {
  const tok = cuvinte(t).map(radacina);
  if (!tok.length || !ramase.length) return [];
  const grupuri = {};
  for (const v of ramase) {
    const distinctive = v._cuv.filter(function (c) { return c.length >= 3 && !/^\d+$/.test(c) && !GENERICE_R.has(c); });
    const prinse = distinctive.filter(function (c) { return tok.indexOf(c) >= 0; });
    // un cod cu cifre („B7", „TGX") prinde și singur
    const coduri = v._cuv.filter(function (c) { return /\d/.test(c) && /[a-z]/.test(c) && c.length >= 2 && tok.indexOf(c) >= 0; });
    if (!prinse.length && !coduri.length) continue;
    const cheie = (prinse[0] || coduri[0]);
    (grupuri[cheie] = grupuri[cheie] || []).push(v);
  }
  return Object.keys(grupuri).map(function (cheie) {
    let variante = grupuri[cheie];
    if (variante.length > 1) {
      // „Logan 3": cifra scrisă imediat după cuvânt alege mașina cu cifra aceea în nume
      const i = tok.indexOf(cheie);
      const cifra = i >= 0 && tok[i + 1] && /^\d+$/.test(tok[i + 1]) ? tok[i + 1] : null;
      if (cifra) { const cu = variante.filter(function (v) { return v._cuv.indexOf(cifra) >= 0; }); if (cu.length) variante = cu; }
    }
    return { cheie: cheie, variante: variante };
  });
}
function _re(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function _scoateNr(t, nr) {
  // „B 154 UIP", „b154uip", „b-154-uip": orice despărțire între bucăți
  const parti = String(nr).match(/[A-Za-z]+|\d+/g) || [];
  if (!parti.length) return t;
  const re = new RegExp(parti.map(function (p) { return _re(norm(p)); }).join('[\\s.\\-]*'), 'g');
  return t.replace(re, ' ');
}

// Ce a cerut modelul printr-o unealtă („vehicle": „B 154 UIP" / „Loganul lui Ion" / „Logan") → o mașină sigură,
// mai multe de ales, o grupă sau nimic. Aceleași reguli ca la textul omului, ca să nu existe două socoteli.
function rezolva(cine, fisa) {
  const q = String(cine == null ? '' : cine).trim();
  if (!q) return { tip: 'toata' };
  const g = gasesteInText(q, fisa, { dinUnealta: true });
  if (g.masini.length === 1 && !g.ambigue.length) return { tip: 'unic', v: g.masini[0] };
  if (g.masini.length > 1 && !g.ambigue.length) return { tip: 'mai_multe', vs: g.masini };
  if (g.grupe.length === 1 && !g.masini.length) return { tip: 'grupa', grupa: g.grupe[0].nume, vs: g.grupe[0].masini };
  const variante = g.masini.concat.apply(g.masini, g.ambigue.map(function (a) { return a.variante; }));
  const unice = []; const vaz = new Set();
  for (const v of variante) if (!vaz.has(v.imei)) { vaz.add(v.imei); unice.push(v); }
  if (unice.length > 1) return { tip: 'ambiguu', variante: unice };
  if (unice.length === 1) return { tip: 'unic', v: unice[0] };
  return { tip: 'nimic' };
}

// ─── Ora României ───────────────────────────────────────────────────────────────────────────────────
// „Azi", „ieri", „săptămâna trecută" se socotesc pe ceasul ROMÂNIEI, nu pe al serverului (UTC). Înainte,
// „azi" pentru RA Insight începea la 03:00 vara, iar cifrele nu se potriveau cu raportul din ecran.
const TZ = 'Europe/Bucharest';
function _parti(ms) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short' })
    .formatToParts(new Date(ms)).forEach(function (x) { if (x.type !== 'literal') p[x.type] = x.value; });
  return { y: +p.year, m0: +p.month - 1, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second,
    dow: { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[p.weekday] || 1 };
}
// Momentul (UTC) în care e miezul nopții în România, în ziua y-m0-d (zilele în plus/minus se întorc singure).
function inceputZiRO(y, m0, d) {
  const naiv = Date.UTC(y, m0, d, 0, 0, 0);
  const p = _parti(naiv);
  const offset = Date.UTC(p.y, p.m0, p.d, p.h, p.mi, p.s) - naiv;   // 2 sau 3 ore
  let ms = naiv - offset;
  // la trecerea pe ora de vară, miezul nopții poate cădea în ora sărită — corecția de o oră
  const q = _parti(ms); if (q.h !== 0) ms -= (q.h > 12 ? q.h - 24 : q.h) * 3600000;
  return ms;
}
const PERIOADE = ['today', 'yesterday', 'last_7_days', 'last_30_days', 'this_week', 'last_week', 'this_month', 'last_month'];
// Perioada cerută → { from, to } (ISO). `month` = „2026-09" (o lună anume). Fără nimic: ultimele 7 zile.
function perioada(input, acum) {
  const now = acum != null ? Number(acum) : Date.now();
  const i = input || {};
  const z = _parti(now);
  const azi0 = inceputZiRO(z.y, z.m0, z.d);
  const p = String(i.period || '').toLowerCase();
  let from, to = now;
  const luna = /^(\d{4})-(\d{2})$/.exec(String(i.month || ''));
  // O zi scrisă „AAAA-LL-ZZ" e o zi a României: „from" de la miezul ei, „to" = ultima zi, care intră ÎNTREAGĂ (08.10: un
  // „to" de „2026-10-07" se citea ca miezul nopții UTC dinaintea zilei, deci 7 octombrie ieșea din interval).
  const zi = function (x) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(x || '').trim()); return m ? [+m[1], +m[2] - 1, +m[3]] : null; };
  const zf = zi(i.from), zt = zi(i.to);
  if (i.from && i.to && (zf || !isNaN(Date.parse(i.from))) && (zt || !isNaN(Date.parse(i.to)))) {
    from = zf ? inceputZiRO(zf[0], zf[1], zf[2]) : Date.parse(i.from);
    to = zt ? inceputZiRO(zt[0], zt[1], zt[2] + 1) : Date.parse(i.to);
  }
  else if (luna) { from = inceputZiRO(+luna[1], +luna[2] - 1, 1); to = Math.min(now, inceputZiRO(+luna[1], +luna[2], 1)); }
  else if (p === 'today') from = azi0;
  else if (p === 'yesterday') { from = inceputZiRO(z.y, z.m0, z.d - 1); to = azi0; }
  else if (p === 'this_week') from = inceputZiRO(z.y, z.m0, z.d - (z.dow - 1));
  else if (p === 'last_week') { to = inceputZiRO(z.y, z.m0, z.d - (z.dow - 1)); from = inceputZiRO(z.y, z.m0, z.d - (z.dow - 1) - 7); }
  else if (p === 'this_month') from = inceputZiRO(z.y, z.m0, 1);
  else if (p === 'last_month') { from = inceputZiRO(z.y, z.m0 - 1, 1); to = inceputZiRO(z.y, z.m0, 1); }
  else if (p === 'last_30_days' || p === 'month') from = now - 30 * 86400000;
  else from = now - 7 * 86400000;
  if (!(from < to)) { from = now - 7 * 86400000; to = now; }
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString() };
}
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
// { from, to } → cum o spune omul: „azi", „ieri", „21–27 septembrie", „septembrie 2026", „1 octombrie – azi".
function etichetaPerioadei(from, to, acum) {
  const now = acum != null ? Number(acum) : Date.now();
  const a = Date.parse(from), b = Date.parse(to);
  if (isNaN(a) || isNaN(b)) return '';
  const pa = _parti(a);
  const z = _parti(now);
  const azi0 = inceputZiRO(z.y, z.m0, z.d);
  const panaAcum = Math.abs(b - now) < 5 * 60000;
  const ultimaZi = _parti(b - 1);
  const ziua = function (p) { return p.d + ' ' + LUNI[p.m0]; };
  if (a === azi0 && panaAcum) return 'azi';
  if (a === inceputZiRO(z.y, z.m0, z.d - 1) && b === azi0) return 'ieri';
  // o lună întreagă (sau luna asta, până acum)
  if (pa.d === 1 && pa.h === 0 && (b === inceputZiRO(pa.y, pa.m0 + 1, 1) || (panaAcum && z.y === pa.y && z.m0 === pa.m0))) {
    return LUNI[pa.m0] + ' ' + pa.y + (panaAcum ? ' (până azi)' : '');
  }
  const sfarsit = panaAcum ? 'azi' : ziua(ultimaZi);
  if (!panaAcum && ultimaZi.y === pa.y && ultimaZi.m0 === pa.m0 && ultimaZi.d === pa.d) return ziua(pa);
  if (!panaAcum && ultimaZi.y === pa.y && ultimaZi.m0 === pa.m0) return pa.d + '–' + ultimaZi.d + ' ' + LUNI[pa.m0];
  return ziua(pa) + ' – ' + sfarsit;
}

// ─── Răspunsurile rapide (gratuite) — DOAR la întrebări despre ACUM, pe toată flota ──────────────────
// Euristica veche se aprindea pe un cuvânt: „Câți KILOMETRI a făcut B 154 UIP săptămâna trecută și ce consum
// a avut?" primea „Distanță azi — toată flota" (Alin a scăpat doar fiindcă a scris „kilometir"). Acum răspunsul
// rapid pleacă numai dacă întrebarea nu cere altă perioadă, alt subiect sau o continuare a discuției.
const ALTA_PERIOADA = /(^|[^a-z])(ieri|alaltaieri|saptaman\w*|luna|lunii|lunile|anul|anului|zile|zilele|ultim\w*|trecut\w*|precedent\w*|ianuarie|februarie|martie|aprilie|iunie|iulie|august|septembrie|octombrie|noiembrie|decembrie|\d{1,2}[.\/-]\d{1,2})([^a-z]|$)/;
const ALT_SUBIECT = /(consum|combustib|motorin|benzin|litri|cost|bani|lei\b|ralanti|aliment|scor|franar|acceler|condus|pauz|revizi|\bitp\b|\brca\b|service|document|expir|alert|problem|de ce|compar|\bore\b)/;
function potrivitPentruRapid(text, gasite, areContext) {
  const t = norm(text);
  if (!t) return false;
  if (gasite && (gasite.grupe.length || gasite.ambigue.length)) return false;
  if (ALTA_PERIOADA.test(t)) return false;
  if (ALT_SUBIECT.test(t)) return false;
  // o continuare („și ieri?", „dar Loganul?") ține de discuție, nu de o întrebare nouă
  if (areContext && /^(si|dar|iar|apoi|ok|bine)\b/.test(t)) return false;
  return true;
}

// ─── Memoria: ce trimitem modelului din discuția de până acum ───────────────────────────────────────
// Doar TEXTUL schimbului (întrebare + răspuns), nu cifrele brute din unelte: așa memoria costă puțin și rămâne
// plafonată. Ultimele `max` mesaje, fiecare tăiat la `lungime`; rolurile alternează (două la rând se lipesc).
function istoricPentruModel(mesaje, max, lungime) {
  const M = Math.max(2, max || 12), L = Math.max(200, lungime || 1500);
  const ultime = (mesaje || []).filter(function (m) { return m && (m.rol === 'user' || m.rol === 'assistant') && String(m.text || '').trim(); }).slice(-M);
  const out = [];
  for (const m of ultime) {
    let text = String(m.text).trim();
    if (text.length > L) text = text.slice(0, L) + ' […]';
    const prev = out[out.length - 1];
    if (prev && prev.role === m.rol) prev.content += '\n\n' + text;
    else out.push({ role: m.rol, content: text });
  }
  while (out.length && out[0].role !== 'user') out.shift();     // modelul vrea să înceapă cu omul
  if (out.length && out[out.length - 1].role === 'user') out.pop(); // întrebarea nouă se adaugă după
  return out;
}
// Titlul unei conversații noi: prima întrebare, curățată și scurtată (fără să mai cheltuim o întrebare pe el).
// `masini` (opțional) = fișele recunoscute: numărul lor se scrie cum e în aplicație („B 154 UIP"), oricum l-ar fi tastat omul.
function titluDin(text, masini) {
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t) return 'Conversație nouă';
  // ALL CAPS (cum scriu mulți pe telefon) → literă mare doar la început
  if (t.length > 8 && t === t.toUpperCase() && /[A-ZĂÂÎȘȚ]/.test(t)) t = t.toLowerCase();
  for (const v of (masini || [])) {
    const parti = String(v.nr || '').match(/[A-Za-z]+|\d+/g);
    if (parti && parti.length) t = t.replace(new RegExp(parti.map(_re).join('[\\s.\\-]*'), 'gi'), v.nr);
  }
  t = t.charAt(0).toUpperCase() + t.slice(1);
  return t.length > 70 ? t.slice(0, 67).replace(/\s+\S*$/, '') + '…' : t;
}

module.exports = {
  norm, compact, cuvinte, radacina, fisaFlotei, eticheta, gasesteInText, rezolva,
  inceputZiRO, perioada, etichetaPerioadei, PERIOADE, LUNI,
  potrivitPentruRapid, istoricPentruModel, titluDin,
};
