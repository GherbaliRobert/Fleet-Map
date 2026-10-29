'use strict';
// aparat_schimbat.js — „Schimbă aparatul" (Robert, 29.10: „1 da, 2 acum").
//
// Când aparatul GPS al unei mașini se strică, aparatul nou PREIA mașina. În aplicație mașina rămâne aceeași: cheia ei e
// IMEI-ul aparatului de la montaj (`devices.imei`), iar istoricul (poziții, curse, alerte), fișa, actele, reviziile,
// șoferul și abonamentul stau toate pe cheia asta. Aparatul montat ACUM se ține în `devices.aparat_imei` (NULL = cel de la
// montaj). La conectare, serverul traduce IMEI-ul aparatului în cheia mașinii (`vehiculPentru`), deci pozițiile noi intră
// pe aceeași mașină și NIMIC din istoric nu se mută. Aparatul înlocuit nu mai e primit: altfel, un aparat vechi „înviat"
// ar scrie pe mașină în același timp cu cel nou.
//
// Aici stau regulile și textele, fără bază de date (le folosesc serverul, pagina — prin server — și proba).

const incarcare = require('./incarcare');   // `cand`: „azi, 09:12" pe ora României (nu face un formatator nou)

// Ce se întâmplă cu aparatul scos. Stările sunt ale stocului (stoc.js): din „montat" se poate trece doar pe „retur" sau
// „defect".
const VECHIUL = [
  { k: 'defect', et: 'S-a stricat — îl trec în stoc pe „defect”' },
  { k: 'retur', et: 'Merge — l-am luat înapoi (în stoc pe „retur”)' },
];
function vechiulValid(k) { return VECHIUL.some(function (v) { return v.k === k; }); }

function esteImei(s) { return /^\d{10,20}$/.test(String(s == null ? '' : s)); }

// Aparatul montat ACUM pe o mașină (rândul din `devices`).
function aparatAl(d) { return d ? String(d.aparat_imei || d.imei || '') || null : null; }

// ─── Harta de la conectare ───
// Din rândurile `devices` cu aparat schimbat: aparat → mașina pe care scrie, și mașinile al căror aparat de la montaj
// nu mai e primit. Intră și mașinile arhivate: aparatul lor nou trebuie să ajungă la mașina arhivată (și să fie refuzat
// acolo), nu să fie luat drept un aparat necunoscut.
function harta(randuri) {
  const laVehicul = new Map(), retrase = new Set(), peMasina = new Map();
  (randuri || []).forEach(function (r) {
    if (!r || !r.imei || !r.aparat_imei || String(r.aparat_imei) === String(r.imei)) return;
    laVehicul.set(String(r.aparat_imei), String(r.imei));
    peMasina.set(String(r.imei), String(r.aparat_imei));
    retrase.add(String(r.imei));
  });
  return { laVehicul: laVehicul, retrase: retrase, peMasina: peMasina };
}
// Mașina → aparatul montat acum (pentru stoc: bucata din stoc are seria APARATULUI, nu cheia mașinii).
function aparatPeMasina(vehicul, h) {
  const x = String(vehicul == null ? '' : vehicul);
  return (h && h.peMasina && h.peMasina.get(x)) || x;
}
// IMEI-ul primit la conectare → cheia mașinii pe care se scriu pozițiile. `null` = aparat înlocuit: nu mai e primit.
// Un aparat mutat pe ALTĂ mașină (scos de pe una, pus pe alta) câștigă harta, chiar dacă IMEI-ul lui e cheia celei dintâi.
function vehiculPentru(imeiAparat, h) {
  const x = String(imeiAparat == null ? '' : imeiAparat);
  if (h && h.laVehicul && h.laVehicul.has(x)) return h.laVehicul.get(x);
  if (h && h.retrase && h.retrase.has(x)) return null;
  return x;
}

// ─── Contorul de km al aparatului ───
// `total_odometer` (IO 16, în metri) e contorul APARATULUI, nu al mașinii: unul nou pornește de la altă cifră (de obicei 0).
// Ca km-ii mașinii să meargă mai departe (reviziile la km, „km la bord", rapoartele), la prima poziție a aparatului nou
// aflăm diferența față de ultima cifră a celui vechi și o adunăm, de acolo înainte, la fiecare poziție.
// stare = { ajustare: metri | null, vechi: ultima cifră a aparatului vechi | null }. Întoarce `nou: true` când ajustarea
// tocmai s-a aflat (serverul o scrie atunci în bază, o singură dată).
function _ts(r) { const t = r && r.timestamp; return t == null ? 0 : (typeof t === 'number' ? t : new Date(t).getTime() || 0); }
function continuaContorul(records, stare) {
  if (!stare || !Array.isArray(records) || !records.length) return { nou: false };
  let nou = false;
  if (stare.ajustare == null && stare.vechi != null) {
    let prim = null;
    records.forEach(function (r) {
      if (r && r.io && typeof r.io.total_odometer === 'number' && (!prim || _ts(r) < _ts(prim))) prim = r;
    });
    if (prim) { stare.ajustare = Number(stare.vechi) - prim.io.total_odometer; stare.vechi = null; nou = true; }
  }
  if (stare.ajustare != null && Number(stare.ajustare) !== 0) {
    const a = Number(stare.ajustare);
    records.forEach(function (r) { if (r && r.io && typeof r.io.total_odometer === 'number') r.io.total_odometer = r.io.total_odometer + a; });
  }
  return { nou: nou };
}

// ─── Cine poate fi aparatul nou ───
// Un tracker din stocul nostru, încă nemontat (în depozit sau la instalator), ori unul care transmite deja din „Neasignate"
// (montat înainte să apăsăm „Schimbă aparatul"). Niciodată aparatul altei mașini. Pagina NU alege singură: arată lista asta.
const STARI_STOC = { depozit: 'în depozit', instalator: 'la instalator' };
function _model(tip, modele) { return (modele && modele[tip]) || null; }
function candidati(o) {
  o = o || {};
  const ocupate = o.ocupate || new Set();
  const acum = o.acum || Date.now();
  const aparatAcum = o.aparatAcum ? String(o.aparatAcum) : null;
  const dupa = new Map();
  (o.neasignate || []).forEach(function (d) {
    const im = String(d.imei || '');
    if (!esteImei(im) || im === aparatAcum || ocupate.has(im)) return;
    const cand = d.last_tx ? incarcare.cand(new Date(d.last_tx).getTime(), acum) : '';
    dupa.set(im, { imei: im, model: d.gps_model || null, sursa: 'neasignat',
      unde: cand ? 'transmite deja, din „Neasignate” (ultima poziție ' + cand + ')' : 'conectat, din „Neasignate”' });
  });
  (o.stoc || []).forEach(function (s) {
    const im = String(s.serie || '');
    if (!esteImei(im) || im === aparatAcum || ocupate.has(im) || !STARI_STOC[s.stare]) return;
    const model = _model(s.tip, o.modele);
    if (dupa.has(im)) { const x = dupa.get(im); if (!x.model) x.model = model; return; }
    dupa.set(im, { imei: im, model: model, sursa: 'stoc',
      unde: STARI_STOC[s.stare] + (s.stare === 'instalator' && s.partener_nume ? ' · ' + s.partener_nume : '') });
  });
  // Întâi ce transmite deja (cel mai probabil e chiar aparatul montat azi), apoi stocul; în fiecare, după IMEI.
  return Array.from(dupa.values()).sort(function (a, b) {
    if (a.sursa !== b.sursa) return a.sursa === 'neasignat' ? -1 : 1;
    return a.imei < b.imei ? -1 : a.imei > b.imei ? 1 : 0;
  });
}

// ─── Textele ───
// „3 poziții", „20 de poziții": fără „de" când ultimele două cifre sunt între 1 și 19 (regula din `_raxDe`).
function _nrDe(n, sg, pl) { n = Number(n) || 0; if (n === 1) return '1 ' + sg; const u = n % 100; return n + (u >= 1 && u <= 19 ? ' ' : ' de ') + pl; }
function numeMasina(v) {
  v = v || {};
  const p = v.plate && String(v.plate).trim(), n = v.name && String(v.name).trim();
  return p && n && n !== p ? p + ' (' + n + ')' : (p || n || String(v.imei || 'mașina'));
}
function _zi(ms) {
  return new Date(Number(ms)).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', year: 'numeric' });
}
// Ce scrie fereastra „Schimbă aparatul" înainte de confirmare — pentru aparatul ales.
function textConfirmare(o) {
  o = o || {};
  const masina = numeMasina(o.vehicul);
  const c = o.candidat || {};
  const r = [];
  r.push(masina + ' primește aparatul ' + c.imei + (c.model ? ' (' + c.model + ')' : '') + '.');
  r.push('Istoricul mașinii rămâne întreg, iar pozițiile noi intră pe aceeași mașină. Fișa, actele, reviziile, șoferul și abonamentul merg mai departe.');
  if (c.sursa === 'neasignat') r.push('Ce a trimis aparatul cât a stat în „Neasignate” trece pe mașină, iar rândul lui din „Neasignate” dispare.');
  r.push('Aparatul vechi (' + o.aparatAcum + ') nu mai e primit' +
    (o.vechiInStoc ? '; în stoc trece pe „' + (o.vechiul === 'retur' ? 'retur' : 'defect') + '”' : '; nu e în stocul nostru, deci acolo nu se schimbă nimic') + '.');
  return r.join('\n');
}
// Ce scrie după schimbare (în mesajul de pe ecran).
function textDupa(o) {
  o = o || {};
  const r = ['Gata: ' + numeMasina(o.vehicul) + ' are acum aparatul ' + o.nou + '.'];
  if (o.pozitiiMutate) r.push(_nrDe(o.pozitiiMutate, 'poziție trimisă', 'poziții trimise') + ' din „Neasignate” ' + (o.pozitiiMutate === 1 ? 'a trecut' : 'au trecut') + ' pe mașină.');
  if (o.stocVechi) r.push(o.stocVechi);
  return r.join(' ');
}
// Rândul de sub IMEI din fișa mașinii (îl vede și clientul: aparatul e treaba noastră, dar e bine de știut că istoricul a rămas).
function notaFisa(istoric, d) {
  const ult = (istoric || [])[0];
  if (!ult || !d) return null;
  return 'Aparatul GPS a fost schimbat pe ' + _zi(ult.la) + '. Istoricul de dinainte rămâne pe mașină.';
}
// Lista schimbărilor, pentru noi (fereastra „Schimbă aparatul").
function randIstoric(s) {
  const vechiul = VECHIUL.filter(function (v) { return v.k === s.vechiul; })[0];
  return _zi(s.la) + ' · ' + s.imei_vechi + ' → ' + s.imei_nou + (s.cine ? ' · ' + s.cine : '') +
    (vechiul ? ' · aparatul vechi: ' + (s.vechiul === 'defect' ? 'defect' : 'retur') : '') + (s.motiv ? ' · „' + s.motiv + '”' : '');
}

module.exports = {
  VECHIUL, vechiulValid, esteImei, aparatAl, harta, vehiculPentru, aparatPeMasina, continuaContorul, candidati, STARI_STOC,
  numeMasina, textConfirmare, textDupa, notaFisa, randIstoric,
};
