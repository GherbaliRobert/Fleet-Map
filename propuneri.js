// propuneri.js — Pasul 2 al Capitolului 2, partea 2 (Alin, 23.10: „da"): „RA Insight face, cu Da-ul tău" — ALERTA DE VITEZĂ și
// „AM VORBIT CU EL". RA Insight pregătește cartonașul, omul apasă „Da", aplicația face pe calea ecranului (Alerte › Adaugă regulă;
// RA Drive › „Am vorbit cu el"), cu aceleași drepturi. Curat: fără bază, fără server. Aici stau înțelegerea cererii (pe reguli,
// fără model), cartonașele, textele și socoteala „din ultimele 30 de zile" — de câte ori ar fi sunat alerta, cu regula MOTORULUI
// de alerte (pragul + marja lui, o dată la 5 minute pe mașină; serverul îi dă cifrele). Serverul adună datele și aplică.
'use strict';
const insight = require('./insight');
const soferiMasini = require('./soferi_masini');   // aceleași 10 minute pentru „Anulează", aceeași zi pentru o propunere veche
const condus = require('./condus');
const safeDrive = require('./safe_drive');

const ZILE_ISTORIC = 30;               // „Din ultimele 30 de zile" (macheta M3)
const PRAG_MIN = 30, PRAG_MAX = 250;   // km/h: pragul unei alerte de viteză cerute în cuvinte
const RACIRE_MS = 5 * 60000;           // motorul de alerte: pe aceeași mașină, cel mult o dată la 5 minute
const PE_ZI_DES = 10;                  // de la atâtea anunțuri pe zi, cartonașul o spune: un prag mai mare sună mai rar
const NUME_MAX = 120, NOTA_MAX = 300, DESPRE_MAX = 120;
const PRAGURI_PROPUSE = [90, 110, 130];
const MASINI_IN_LISTA = 60;            // „Pe" (din „Schimbă"): cel mult atâtea mașini, plus toată flota

// Textele pe care le spune RA Insight în jurul cartonașelor (serverul doar le trimite; pagina doar le arată).
const TEXTE = {
  fondator: 'Propunerile cu „Da" (o alertă, o discuție notată) se fac pe flota unei firme, iar contul de fondator n-are una. Intră cu contul administratorului firmei ca să le vezi.',
  pachet: 'Propunerile cu „Da" (o alertă, o discuție notată, șoferul pe mașină) sunt de la pachetul Basic în sus.',
  faraMasini: 'Nu văd nicio mașină pe care să pun alerta.',
  careMasina: 'Pe care mașină pun alerta?',
  sauFlota: 'Sau pe toată flota.',
  peCe: 'Pe ce mașină pun alerta? Scrie-i numărul sau alege-o de mai jos.',
  flotaDoarCuToata: 'Pe toată flota pune alerta cine vede toată flota. Alege una dintre mașinile tale.',
  nuVad: 'Nu văd mașina asta printre cele la care ai acces.',
  amPregatitAlerta: 'Am pregătit alerta. Uite ce pun — apeși **Da** și o pornesc.',
  careSofer: 'Cu care șofer ai vorbit?',
  careSoferScrie: 'Cu care șofer ai vorbit? Scrie-i numele.',
  sauAlege: 'Sau alege-l de mai jos.',
  nuGasescSofer: 'Nu găsesc șoferul în fișele firmei.',
  amPregatitDiscutia: 'Notez discuția. Uite ce scriu — apeși **Da** și o trec în RA Drive.',
  masinaPlecata: 'Mașina nu mai e a firmei: cere din nou alerta.',
  soferPlecat: 'Șoferul nu mai e în fișele firmei.',
  dupaAnulare: {
    sofer: 'schimbi din fișa mașinii, ca de obicei.',
    alerta: 'o oprești sau o ștergi din Management › Alerte, ca de obicei.',
    discutie: 'o scoți din RA Drive, de lângă numele șoferului.'
  }
};
function dupaAnulare(fel) { return TEXTE.dupaAnulare[fel] || TEXTE.dupaAnulare.sofer; }

function _n(t) { return insight.norm(t || ''); }
function _de(n) { const r = Math.abs(Math.round(n)) % 100; return (r >= 1 && r <= 19) ? ' ' : ' de '; }
function _ori(n) { return n === 1 ? 'o dată' : 'de ' + n + _de(n) + 'ori'; }
// Ziua României a unei clipe: „14.10" (anul doar dacă nu e cel de acum).
function _zi(ms, acum) {
  const z = new Date(Date.parse(insight.perioada({ period: 'today' }, ms).from) + 12 * 3600000);
  const an = new Date(Date.parse(insight.perioada({ period: 'today' }, acum || Date.now()).from) + 12 * 3600000).getUTCFullYear();
  return String(z.getUTCDate()).padStart(2, '0') + '.' + String(z.getUTCMonth() + 1).padStart(2, '0') + (z.getUTCFullYear() !== an ? '.' + z.getUTCFullYear() : '');
}
function _ziAn(ms) {
  const z = new Date(Date.parse(insight.perioada({ period: 'today' }, ms).from) + 12 * 3600000);
  return String(z.getUTCDate()).padStart(2, '0') + '.' + String(z.getUTCMonth() + 1).padStart(2, '0') + '.' + z.getUTCFullYear();
}
function _nr(n) { return Math.round(Number(n) || 0).toLocaleString('ro-RO'); }
function _curat(s, max) { return String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

// ─── Ce cere omul: o alertă ────────────────────────────────────────────────────────────────────────────────────────────────
// O CERERE = „anunță-mă / avertizează-mă / alertează-mă / notifică-mă / dă-mi de știre / să fiu anunțat", „vreau să știu când …
// trece / depășește / merge" sau „pune / fă / creează / adaugă / setează / pornește (o) alertă". Ce NU e: o întrebare („câte
// alerte a avut…", „când a trecut…" — timpul trecut), un raport („fă-mi raportul alertelor"). Se rezolvă pe reguli, fără model.
const RE_ANUNTA = /\b(anunta-ma|anuntati-ma|anunta ma|avertizeaza-ma|alerteaza-ma|notifica-ma|da-mi de stire|da-mi de veste|sa fiu anuntat|sa fiu avertizat|sa fiu notificat|trimite-mi o alerta|trimite-mi o notificare)\b/;
const RE_VREAU_STIU = /\bvreau sa stiu (cand|daca)\b/;
const RE_ALERTA = /\b(pune|pune-mi|fa|fa-mi|creeaza|creeaza-mi|adauga|adauga-mi|seteaza|seteaza-mi|porneste|porneste-mi|activeaza|configureaza|vreau|imi trebuie|as vrea)\b[^.?!]{0,40}\balert(a|e|ele)\b/;
const RE_TRECUT = /\b(a|au|am|ai|ati|ar fi)\s+(fost|trecut|mers|avut|depasit|intrat|iesit|pornit|oprit|stat|sunat|declansat)\b|\bcate\b|\bce alerte\b|\bcare alerte\b|\bde cate ori\b|\bistoric(ul)? alertelor\b|\blista alertelor\b/;
const RE_RAPORT = /\braport/;
const RE_VITEZA = /\b(km\/h|kmh|km\/ora|km pe ora|viteza|vitezei|vitezele|depaseste|depasesc|trece de|trec de|merge cu peste|merg cu peste|merge cu mai mult de|mai repede de|mai repede decat)\b/;
const RE_FLOTA = /\b(toata flota|toate masinile|toate vehiculele|orice masina|oricare masina|vreo masina|fiecare masina|orice vehicul|vreun vehicul|flota)\b/;
const ALT_TIP = [
  ['ralanti', /\b(ralanti|motorul pornit|motor pornit|sta pe loc)\b/, 'ralanti (staționare cu motorul pornit)'],
  ['zona', /\b(zona|zonei|zone|intra in|iese din|ajunge la|pleaca din|perimetru)\b/, 'intrare sau ieșire dintr-o zonă'],
  ['combustibil', /\b(combustibil|motorina|benzina|carburant|rezervor|furt)\b/, 'scădere de combustibil'],
  ['pornire', /\b(porneste motorul|pornire|pornesc|opreste motorul|oprire|contact)\b/, 'pornire sau oprire a motorului'],
  ['temperatura', /\b(temperatur|supraincalz)/, 'temperatura motorului'],
  ['acte', /\b(itp|rca|rovinieta|asigurar|casco|permis)\b/, 'expirarea actelor'],
  ['revizie', /\b(revizi|service|schimb de ulei|ulei)\b/, 'service']
];

function pareCerereAlerta(text) {
  const t = _n(text);
  if (RE_RAPORT.test(t) || RE_TRECUT.test(t)) return false;
  return RE_ANUNTA.test(t) || RE_VREAU_STIU.test(t) || RE_ALERTA.test(t);
}
// Numerele mașinilor („B 154 UIP") și numele lor („Iveco Daily 35", „Logan 3") ies din text înainte de căutarea pragului.
function _faraMasini(text, fisa) {
  let t = ' ' + _n(text) + ' ';
  const sc = function (s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
  (fisa || []).forEach(function (v) {
    [v.nr, v.nume].forEach(function (x) {
      const k = _n(x).trim();
      if (k.length < 3) return;
      t = t.replace(new RegExp(sc(k).replace(/\s+/g, '\\s*'), 'g'), ' ');
    });
  });
  return t.replace(/\b[a-z]{1,2}\s?\d{2,3}\s?[a-z]{3}\b/g, ' ');
}
function pragDin(text, fisa) {
  const t = _faraMasini(text, fisa);
  const m = /\b(\d{2,3})\s*(km|kmh)\b/.exec(t) || /\b(?:peste|trece de|trec de|depaseste|depasesc|depasi|la|cu|de)\s+(\d{2,3})\b/.exec(t) || /\b(\d{2,3})\b/.exec(t);
  return m ? Number(m[1]) : null;
}
// → null (nu e o cerere de alertă) | { fel: 'alerta', tip: null, altTip } (alt fel de alertă: se pune din Alerte) |
//   { fel: 'alerta', tip: 'overspeed', prag | pragGresit, imei | toataFlota | variante | lipsa }.
function cerereAlerta(text, fisa) {
  if (!pareCerereAlerta(text)) return null;
  const t = _n(text);
  const deViteza = RE_VITEZA.test(t) || /\b\d{2,3}\s*(km|kmh)\b/.test(t);
  if (!deViteza) {
    const a = ALT_TIP.filter(function (x) { return x[1].test(t); })[0];
    return { fel: 'alerta', tip: null, altTip: a ? a[0] : null };
  }
  const p = pragDin(text, fisa);
  const r = { fel: 'alerta', tip: 'overspeed', prag: p != null && p >= PRAG_MIN && p <= PRAG_MAX ? p : null };
  if (p != null && r.prag == null) r.pragGresit = p;
  const g = insight.gasesteInText(text, fisa || []);
  const dinGrupe = [];
  (g.grupe || []).forEach(function (gr) { (gr.masini || []).forEach(function (v) { if (!dinGrupe.some(function (z) { return z.imei === v.imei; })) dinGrupe.push(v); }); });
  const toate = g.masini.concat(dinGrupe.filter(function (v) { return !g.masini.some(function (z) { return z.imei === v.imei; }); }));
  if (toate.length === 1 && !RE_FLOTA.test(t)) r.imei = toate[0].imei;
  else if (toate.length > 1) r.variante = toate.slice(0, 8);
  else if (RE_FLOTA.test(t)) r.toataFlota = true;
  else if (g.ambigue && g.ambigue.length) r.variante = g.ambigue[0].variante.slice(0, 8);
  else r.lipsa = 'masina';
  return r;
}
// Cererea scrisă de un buton de alegere (o mașină, un prag): aceeași formă pe care o înțelege `cerereAlerta`.
function cerereText(ceMasina, prag) {
  return 'Anunță-mă când ' + (ceMasina || 'orice mașină') + ' trece de ' + (prag || PRAGURI_PROPUSE[0]) + ' km/h';
}
function textPragLipsa(gresit) {
  return (gresit != null ? 'Pragul trebuie să fie între ' + PRAG_MIN + ' și ' + PRAG_MAX + ' km/h. ' : '') + 'Peste câți km/h să sune?';
}
function textAltTip(alt) {
  const a = ALT_TIP.filter(function (x) { return x[0] === alt; })[0];
  return 'Din discuție pun deocamdată doar **alerte de viteză**. O alertă de ' + (a ? a[2] : 'felul ăsta') + ' o pui din **Management › Alerte › Adaugă regulă**, unde sunt toate felurile.';
}
// „Viteză peste 130 — B 154 UIP" / „Viteză peste 120 — toată flota".
function numeAlerta(prag, scurt) { return _curat('Viteză peste ' + prag + ' — ' + (scurt || 'toată flota'), NUME_MAX); }

// ─── „Din ultimele 30 de zile": de câte ori ar fi sunat, cu regula motorului ────────────────────────────────────────────────
// Pragul efectiv = max(baza motorului, prag) + marja (motorul nu sună sub 60 km/h și lasă o marjă); pe aceeași mașină, cel mult
// o dată la 5 minute. `puncte` = pozițiile din perioadă, de la serverul care a cerut deja doar ce trece de pragul efectiv
// (ordonate pe mașină și timp): { imei, t (ms), v (km/h) }.
function pragEfectiv(prag, marja) { return Math.max(Number(marja && marja.baza) || 0, Number(prag) || 0) + (Number(marja && marja.marja) || 0); }
function simuleazaViteza(puncte, prag, marja) {
  const ef = pragEfectiv(prag, marja);
  const ultima = {}, pe = {};
  let ori = 0;
  (puncte || []).forEach(function (p) {
    if (!(Number(p.v) > ef)) return;
    const u = ultima[p.imei];
    if (u != null && p.t - u < RACIRE_MS) return;
    ultima[p.imei] = p.t; pe[p.imei] = (pe[p.imei] || 0) + 1; ori++;
  });
  return { ori: ori, masini: Object.keys(pe).length, peMasina: pe, efectiv: ef };
}

// ─── Cartonașul alertei (macheta M3) ───────────────────────────────────────────────────────────────────────────────────────
// o = { prag, imei (null = toată flota), optiuni: [{ v: imei|'', t: eticheta, scurt }], sim, max: { v, t, unde } | null,
//       marja: { baza, marja }, poate, aproba, cine, acum }
function doveziViteza(o) {
  const d = [], sim = o.sim, mx = o.max;
  const cand = function (m) { return _zi(m.t, o.acum) + ', la ' + _ora(m.t); };
  if (!sim) d.push({ nivel: 'i', text: 'Nu am putut citi drumurile din ultimele ' + ZILE_ISTORIC + _de(ZILE_ISTORIC) + 'zile.' });
  else if (sim.ori > 0) {
    d.push({ nivel: 'w', text: 'Ar fi sunat ' + _ori(sim.ori) + (o.imei ? '' : (sim.masini > 1 ? ', pe ' + sim.masini + _de(sim.masini) + 'mașini' : ', pe o mașină')) + '.' +
      (mx && mx.v ? ' Cea mai mare viteză: ' + mx.v + ' km/h' + (mx.eticheta && !o.imei ? ' (' + mx.eticheta + ')' : '') + ', pe ' + cand(mx) + (mx.unde ? ', ' + mx.unde : '') + '.' : '') });
    const peZi = sim.ori / ZILE_ISTORIC;
    if (peZi >= PE_ZI_DES) d.push({ nivel: 'w', text: 'Asta înseamnă cam ' + Math.round(peZi) + _de(Math.round(peZi)) + 'anunțuri pe zi. Un prag mai mare sună mai rar.' });
  } else {
    d.push({ nivel: 'ok', text: 'N-ar fi sunat niciodată.' + (mx && mx.v ? ' Cea mai mare viteză: ' + mx.v + ' km/h' + (mx.eticheta && !o.imei ? ' (' + mx.eticheta + ')' : '') + ', pe ' + cand(mx) + '.' : ' Nu are drumuri în perioada asta.') });
  }
  const tm = textMarjaViteza(o.prag, o.marja);
  if (tm) d.push({ nivel: 'i', text: tm });
  d.push({ nivel: 'i', text: 'Ajunge la cei care primesc azi alertele firmei, ca orice altă alertă.' });
  return d;
}
// Când sună de fapt o alertă de viteză — O frază, pentru cartonașul din RA Insight și pentru ecranul Alerte (26.10, Alin: „da"
// la „spune-o și acolo"). Sub baza motorului pragul efectiv e baza + marja (un prag de 30 sună tot peste 60), iar fraza o spune.
function textMarjaViteza(prag, marja) {
  const baza = Number(marja && marja.baza) || 0, m = Number(marja && marja.marja) || 0, p = Number(prag) || 0;
  const ef = pragEfectiv(prag, marja);
  if (p < baza) return 'Sună când trece de ' + ef + ' km/h: pragul cel mai mic al alertelor de viteză e ' + baza + ' km/h' + (m > 0 ? ', iar toate sună cu ' + m + ' km/h peste prag.' : '.');
  if (m > 0) return 'Ca toate alertele de viteză din aplicație, sună cu ' + m + ' km/h peste prag: când trece de ' + ef + ' km/h.';
  return '';
}
function textRacireViteza(racireMs) {
  const min = Math.round((Number(racireMs) || RACIRE_MS) / 60000);
  return 'Cât timp mașina merge peste, sună cel mult o dată la ' + (min === 1 ? 'un minut' : min + _de(min) + 'minute') + '.';
}
// Ora României („10:42"), ca la șoferi (o dată pe cartonaș, nu pe poziție).
function _ora(ms) { return new Date(ms).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }); }
function cardAlerta(o) {
  const opt = (o.optiuni || []).filter(function (x) { return String(x.v) === String(o.imei || ''); })[0] || { v: '', t: 'Toată flota', scurt: 'toată flota' };
  const nume = numeAlerta(o.prag, opt.scurt);
  return {
    fel: 'alerta', ic: 'fa-bell', titlu: 'Pun o alertă de viteză',
    randuri: [{ l: 'Ce urmăresc', v: 'Depășire viteză', b: true }, { l: 'Peste', v: o.prag + ' km/h' }, { l: 'Pe', v: opt.t }, { l: 'Numele alertei', v: nume }],
    campuri: { prag: o.prag, imei: String(o.imei || ''), nume: nume, optiuni: o.optiuni || [], min: PRAG_MIN, max: PRAG_MAX },
    dovT: 'Din ultimele ' + ZILE_ISTORIC + _de(ZILE_ISTORIC) + 'zile', dovezi: doveziViteza(o),
    sub: o.poate ? 'Se face exact ca din Management › Alerte › Adaugă regulă, cu drepturile tale. În jurnal: „' + (o.cine || 'tu') + ', prin RA Insight”. O oprești oricând din lista de alerte; se poate anula ' + soferiMasini.ANULARE_MIN + ' minute.'
      : 'Doar cine poate schimba alertele apasă „Da"' + (o.aproba ? ': ' + o.aproba : '') + '.',
    butonDa: 'Da, pune alerta', poate: !!o.poate
  };
}
// „Schimbă" (pragul, mașina, numele): ce trimite pagina, verificat pe ce e pe cartonaș. Numele scris de om rămâne; cel pus de
// aplicație se reface după pragul și mașina noi.
function campuriAlerta(cerute, card) {
  const c = cerute || {}, k = (card && card.campuri) || {};
  const prag = c.prag != null && String(c.prag).trim() !== '' ? Number(String(c.prag).replace(',', '.')) : Number(k.prag);
  if (!Number.isInteger(prag) || prag < PRAG_MIN || prag > PRAG_MAX) return { eroare: 'Pragul trebuie să fie un număr întreg între ' + PRAG_MIN + ' și ' + PRAG_MAX + ' km/h.' };
  const imei = c.imei != null ? String(c.imei) : String(k.imei || '');
  const opt = (k.optiuni || []).filter(function (x) { return String(x.v) === imei; })[0];
  if (!opt) return { eroare: 'Mașina aleasă nu e printre cele de pe cartonaș.' };
  let nume = _curat(c.nume != null ? c.nume : k.nume, NUME_MAX);
  if (!nume || (nume === k.nume && (prag !== Number(k.prag) || imei !== String(k.imei || '')))) nume = numeAlerta(prag, opt.scurt);
  return { spec: { type: 'overspeed', imei: imei || null, condition: { maxSpeed: prag }, name: nume, enabled: true }, eticheta: opt.t, prag: prag };
}
// Cartonașul după „Da": rândurile cu ce s-a pus de fapt (pragul, mașina, numele — poate schimbate din „Schimbă").
function cardAlertaDupa(card, c) {
  return Object.assign({}, card, { randuri: [{ l: 'Ce urmăresc', v: 'Depășire viteză', b: true }, { l: 'Peste', v: c.prag + ' km/h' }, { l: 'Pe', v: c.eticheta }, { l: 'Numele alertei', v: c.spec.name }] });
}
function jurnalAlerta(spec) { return 'alerta ' + spec.name; }
function anulareAlerta(spec, era) {
  const n = spec && spec.name ? '„' + spec.name + '”' : '';
  return era ? 'Am anulat: alerta ' + n + ' nu mai există.' : 'Alerta ' + n + ' nu mai era în listă, deci n-am avut ce opri.';
}
function gataAlerta(spec, cine, la) {
  const ora = _ora(la);
  return {
    text: 'Gata. Alerta **' + spec.name + '** e pornită de azi, ' + ora + '.',
    jurnal: 'În jurnal: „' + (cine || 'tu') + ', prin RA Insight: alerta ' + spec.name + '” · ' + _ziAn(la) + ', ' + ora + '. O oprești oricând din Management › Alerte.',
    buton: { fel: 'ecran', ecran: 'alerts', text: 'Vezi alertele' }
  };
}

// ─── Ce cere omul: „Am vorbit cu el" ───────────────────────────────────────────────────────────────────────────────────────
// „Notează că am vorbit cu Ion despre viteză" (o comandă) sau „Am vorbit cu Ion despre viteză" (spus pe față, fără întrebare).
// O întrebare („ce s-a schimbat de când am vorbit cu Ion?") rămâne întrebare: o analizează RA Insight.
const RE_NOTEAZA = /\b(noteaza|noteaza-mi|noteaza-ti|treci|scrie|scrie-mi|marcheaza|consemneaza|inregistreaza|tine minte)\b[^?]{0,40}\b(am vorbit|am discutat|vorbit|discutat|discutie|discutia)\b/;
const RE_AM_VORBIT = /^\s*(azi |astazi |tocmai |deja |ieri )?(am vorbit|am discutat)\s+cu\b/;
const RE_INTREB = /\?|\b(ce|cum|cat|cate|de cand|dupa ce|s-a schimbat|a mers|merge mai|a condus|conduce mai)\b/;
// Fără bază: e măcar posibil să fie o discuție de notat? (Abia atunci serverul citește șoferii firmei.)
function pareCerereDiscutie(text) {
  const t = _n(text);
  return RE_NOTEAZA.test(t) || (RE_AM_VORBIT.test(t) && !RE_INTREB.test(t));
}
// Cererea scrisă de un buton de alegere (un șofer): aceeași formă pe care o înțelege `cerereDiscutie`.
function discutieText(nume, despre) { return 'Notează că am vorbit cu ' + nume + (despre ? ' despre ' + despre : ''); }
function cerereDiscutie(text, soferi) {
  const t = _n(text);
  const comanda = RE_NOTEAZA.test(t);
  if (!comanda && !(RE_AM_VORBIT.test(t) && !RE_INTREB.test(t))) return null;
  const sf = soferiMasini.gasesteSoferi(text, soferi);
  const m = /\b(?:despre|legat de|pe tema|în legătură cu|in legatura cu)\s+([^.!?\n]+)/i.exec(String(text || ''));
  const despre = m ? _curat(m[1], DESPRE_MAX).replace(/[\s,;:]+$/, '') : '';
  const r = { fel: 'discutie', despre: despre };
  if (sf.soferi.length === 1) r.soferId = sf.soferi[0].id;
  else if (sf.soferi.length > 1) r.ambigui = sf.soferi.slice(0, 8);
  else if (sf.ambigui.length) r.ambigui = sf.ambigui.slice(0, 8);
  else r.lipsa = 'sofer';
  return r;
}
// o = { sofer: { id, nume }, despre, rd (rândul șoferului din RA Drive, luna asta) | null, pregatire, poate, aproba, cine, acum }
function cardDiscutie(o) {
  const s = o.sofer || {}, rd = o.rd, dov = [];
  if (rd) {
    const fata = rd.fata && rd.fata.text && rd.fata.text !== 'la fel' ? ' (' + rd.fata.text + ' față de luna trecută)' : '';
    dov.push({ nivel: rd.fata && rd.fata.fel === 'atentie' ? 'w' : 'i', text: 'Luna asta: ' + _nr(rd.km) + ' km, ' + _nr(rd.manevre) + _de(rd.manevre) + (rd.manevre === 1 ? 'manevră bruscă' : 'manevre bruște') +
      (rd.laSuta != null ? ' (' + String(rd.laSuta).replace('.', ',') + ' la 100 km)' : '') + ', ' + condus.lei(rd.cost && rd.cost.total || 0) + ' în plus' + fata + '.' });
    if (rd.discutie) dov.push({ nivel: 'i', text: 'Ultima discuție notată: pe ' + _zi(Date.parse(rd.discutie.zi + 'T12:00:00Z'), o.acum) + (rd.discutie.nota ? ' — „' + rd.discutie.nota + '”' : '') + '.' + (rd.discutie.comparatie && rd.discutie.comparatie.text ? ' ' + rd.discutie.comparatie.text : '') });
  } else dov.push({ nivel: 'i', text: o.pregatire ? 'RA Drive încă pregătește luna: discuția se notează oricum.' : 'Luna asta n-are drum în RA Drive.' });
  dov.push({ nivel: 'i', text: 'De azi, RA Drive compară cum a condus în cele ' + safeDrive.ZILE_DISCUTIE + _de(safeDrive.ZILE_DISCUTIE) + 'zile de dinainte și de după discuție.' });
  return {
    fel: 'discutie', ic: 'fa-comments', titlu: 'Notez că ai vorbit cu ' + s.nume, soferId: s.id,
    randuri: [{ l: 'Șoferul', v: s.nume, b: true }, { l: 'Când', v: 'azi, din clipa în care apeși Da' }, { l: 'Despre', v: o.despre || '—' }],
    campuri: { nota: o.despre || '', max: NOTA_MAX },
    dovT: 'Din RA Drive', dovezi: dov,
    sub: o.poate ? 'Se face exact ca din RA Drive › „Am vorbit cu el”. În jurnal: „' + (o.cine || 'tu') + ', prin RA Insight”. Se poate anula ' + soferiMasini.ANULARE_MIN + ' minute. Șoferul nu primește niciun mesaj.'
      : 'Doar cine conduce flota apasă „Da"' + (o.aproba ? ': ' + o.aproba : '') + '.',
    butonDa: 'Da, notează', poate: !!o.poate
  };
}
function notaDiscutie(cerute, card) {
  const c = cerute || {};
  return _curat(c.nota != null ? c.nota : (card && card.campuri && card.campuri.nota), NOTA_MAX);
}
function _numeDin(card) { return String((card && card.titlu) || '').replace(/^Notez că ai vorbit cu /, ''); }
function cardDiscutieDupa(card, nota) {
  return Object.assign({}, card, { randuri: (card.randuri || []).map(function (r) { return r.l === 'Despre' ? { l: 'Despre', v: nota || '—' } : (r.l === 'Când' ? { l: 'Când', v: 'azi' } : r); }) });
}
function anulareDiscutie(card, era) {
  const n = _numeDin(card);
  return era ? 'Am anulat: discuția cu ' + n + ' nu mai e în RA Drive.' : 'Discuția cu ' + n + ' nu mai era în RA Drive, deci n-am avut ce scoate.';
}
function gataDiscutie(card, nota, cine, la) {
  const ora = _ora(la), nume = _numeDin(card);
  return {
    text: 'Gata. Am notat discuția cu **' + nume + '** de azi, ' + ora + '.',
    jurnal: 'În jurnal: „' + (cine || 'tu') + ', prin RA Insight: discuția cu ' + nume + (nota ? ' — ' + nota : '') + '” · ' + _ziAn(la) + ', ' + ora + '. În RA Drive o vezi lângă numele lui.',
    buton: { fel: 'ramura', ramura: 'safedrive', text: 'Vezi RA Drive' }
  };
}

module.exports = {
  ZILE_ISTORIC, PRAG_MIN, PRAG_MAX, RACIRE_MS, PE_ZI_DES, NUME_MAX, NOTA_MAX, PRAGURI_PROPUSE, MASINI_IN_LISTA, TEXTE,
  pareCerereAlerta, cerereAlerta, pragDin, cerereText, textPragLipsa, textAltTip, numeAlerta, pragEfectiv, simuleazaViteza, doveziViteza,
  textMarjaViteza, textRacireViteza,
  cardAlerta, campuriAlerta, cardAlertaDupa, jurnalAlerta, gataAlerta, anulareAlerta,
  pareCerereDiscutie, discutieText, cerereDiscutie, cardDiscutie, notaDiscutie, cardDiscutieDupa, gataDiscutie, anulareDiscutie, dupaAnulare
};
