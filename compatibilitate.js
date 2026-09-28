'use strict';
// compatibilitate.js — ce aparat se potrivește pe ce mașină, după listele oficiale Teltonika (28.09).
//
// Alin: „să introducem o listă cu model și an de fabricație ca să vedem ce se potrivește exact —
// Dacia, Logan 2, 2024, benzină + GPL — și calculatorul să-mi recomande ce echipament i se potrivește."
// Sursa sunt listele Excel publicate de Teltonika, încărcate din aplicație când apar altele noi:
//   • LV-CAN200 — modulul care citește CAN-ul, montat lângă FMC130;
//   • FMX150    — FMC150, aparatul cu CAN integrat;
//   • ALL-CAN300 — modulul pentru utilaje, camioane, autobuze. Nu-l vindem, dar spune ce se poate citi.
//
// Modulul e CURAT: primește foile deja citite (textul fiecărei celule + ce înseamnă culoarea ei) și
// întoarce rânduri normalizate, potrivirile unei mașini și aparatul recomandat. Excel-ul îl citește
// `citesteExcel`, la capăt, cu ExcelJS — singurul loc care atinge fișierul.
//
// Cum se citesc listele (verificat pe listele din 2025):
//   • LV-CAN200 / ALL-CAN300: câte o foaie pe fel de vehicul (Cars, Trucks, Buses...), antetul pe rândul
//     2, anii scriși „2016>" = de la 2016 încolo. Un „+" albastru = „depinde de dotarea mașinii";
//     unul portocaliu = „poate lipsi cu cititorul fără contact". Jos, două rânduri de legendă.
//   • FMX150: o foaie, antetul pe rândul 3, deasupra grupul („Standard" / „Extended" — cei extinși se
//     cer separat de la Teltonika, deci nu-i numărăm), anii „2017+" sau „2013-2016", „+*" = experimental,
//     „+" pe galben = lipsește cu ECAN02.

const LISTE = {
  lvcan:  { nume: 'LV-CAN200',  pentru: 'FMC130 + modulul LV-CAN200' },
  fmc150: { nume: 'FMC150',     pentru: 'FMC150 (CAN integrat)' },
  allcan: { nume: 'ALL-CAN300', pentru: 'modulul ALL-CAN300 — utilaje, camioane, autobuze (nu e în ofertă)' },
};
// Aparatele pe care le vindem. Cheile le citește și pagina (câmpurile din pașii 4 și 5).
const APARATE = {
  fmc130:       { et: 'FMC130 (doar poziție)' },
  fmc130_lvcan: { et: 'FMC130 + LV-CAN200' },
  fmc150:       { et: 'FMC150 (CAN integrat)' },
  fmc650:       { et: 'FMC650 (camion, FMS)' },
};
const COMBUSTIBILI = { benzina: 'benzină', motorina: 'motorină', gpl: 'benzină + GPL', hibrid: 'hibrid', electric: 'electric' };
const MAX_RANDURI_LISTA = 30000;   // o listă reală are 2–5 mii; peste asta nu e o listă Teltonika

// ─── Scris ────────────────────────────────────────────────────────────────────────────────────────
function norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
}
// Aceeași marcă, scrisă altfel în liste diferite (MERCEDES / Mercedes-Benz, VW / Volkswagen).
const MARCI_ALIAS = { 'MERCEDES BENZ': 'MERCEDES', MB: 'MERCEDES', VW: 'VOLKSWAGEN', KINGLONG: 'KING LONG',
  'GREAT WALL MOTOR': 'GREAT WALL', 'CASE IH': 'CASE', 'MAN STEYR': 'MAN', 'MITSUBISHI FUSO': 'FUSO' };
function cheieMarca(m) { const n = norm(m); return MARCI_ALIAS[n] || n; }
// „LOGAN MCV" → „Logan MCV": cuvintele scurte și codurile (MCV, GT, FH, 5G) rămân cu litere mari.
function titlu(s) {
  return String(s).split(' ').map((w) => (w.length <= 3 || /\d/.test(w)) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// ─── Anii ─────────────────────────────────────────────────────────────────────────────────────────
// „2016>" / „2017+" = de la; „2013-2016" = între; „<=2010" = până la; gol = nu spune.
function ani(text) {
  const t = String(text == null ? '' : text).trim();
  const nr = (t.match(/\b(19[5-9]\d|20\d\d|21\d\d)\b/g) || []).map(Number);
  if (!nr.length) return { de: null, pana: null };
  if (nr.length >= 2) return { de: Math.min(nr[0], nr[1]), pana: Math.max(nr[0], nr[1]) };
  if (/^\s*(<|≤|pana|până|until|to)/i.test(t)) return { de: null, pana: nr[0] };
  return { de: nr[0], pana: null };
}
function aniText(de, pana) {
  if (de && pana) return de + '–' + pana;
  if (de) return 'din ' + de;
  if (pana) return 'până în ' + pana;
  return 'fără ani';
}

// ─── Modelul: bază, generație, etichete ───────────────────────────────────────────────────────────
// „LOGAN (III) (LPG)" → bază [LOGAN], generația 3, etichete [III, LPG]
// „Logan mk2 facelift" → bază [LOGAN], generația 2
// „OCTAVIA IV (NX)"   → bază [OCTAVIA], generația 4, etichete [NX]
// „3 (G20 / G21)"     → bază [3], etichete [G20 G21] — cifra de la început e NUMELE modelului
const ROMANE = { II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10 };
const ZGOMOT = new Set(['FACELIFT', 'E5', 'E6']);
function descompuneModel(model) {
  const etichete = [];
  const fara = String(model == null ? '' : model).replace(/\(([^)]*)\)/g, (m, x) => { const n = norm(x); if (n) etichete.push(n); return ' '; });
  const t = norm(fara).split(' ').filter(Boolean);
  let gen = null; const baza = [];
  t.forEach((x, i) => {
    if (i > 0 && ROMANE[x]) { gen = ROMANE[x]; return; }
    const mk = /^MK(\d{1,2})$/.exec(x); if (mk) { gen = Number(mk[1]); return; }
    if (ZGOMOT.has(x)) return;
    if (/^\d$/.test(x) && t[i - 1] === 'FACELIFT') return;       // „facelift 2"
    baza.push(x);
  });
  etichete.forEach((e) => { if (gen == null && ROMANE[e]) gen = ROMANE[e]; });
  return { baza, gen, etichete };
}
// Etichetele care NU sunt pentru o mașină din România: volan pe dreapta, alte piețe.
function piataStraina(etichete, baza) {
  return etichete.some((e) => /^RHD$|MARKET$|^LATAM/.test(e)) || baza.includes('LATAM');
}
// Variante ale ACELUIAȘI model, între care alege instalatorul la montaj.
const VARIANTE = { KEYLESS: 'fără cheie (keyless)', 'REGULAR KEY': 'cu cheie normală', 'START BUTTON': 'cu buton de pornire',
  'AUTOMATIC TRANSMISSION': 'cutie automată', LPG: 'cu GPL', BETA: 'program în probă la Teltonika', HYBRID: 'hibrid',
  'PLUG IN': 'plug-in', ELECTRIC: 'electric' };
function eticheteVariante(etichete) { return etichete.filter((e) => VARIANTE[e]); }

// ─── Datele care se citesc ────────────────────────────────────────────────────────────────────────
// Cheia din rândul normalizat ← antetul coloanei (în engleză, cum îl scrie Teltonika).
// „bord" = citit din mașină; „socotit" = numărat de aparat (mai puțin precis, dar merge).
const COLOANE = [
  ['km', 'bord', /^total mileage of the vehicle|^total mileage \(km\)$/],
  ['km', 'socotit', /^vehicle mileage.*counted|^total mileage \(counted\)$/],
  ['rezervor', 'bord', /^fuel level/],
  ['consum', 'bord', /^total fuel consumption$|^fuel consumption$/],
  ['consum', 'socotit', /^total fuel consumption.*counted|^fuel consumed \(counted\)$/],
  ['gplNivel', 'bord', /^lpg level/],
  ['gplConsum', 'bord', /^total lpg use/],
  ['gplStare', 'bord', /^engine is working on lpg/],
  ['baterie', 'bord', /^hv battery level$|^hvbattery charge level$/],
  ['adblue', 'bord', /^adblue level/],
];
function coloanaDate(antet) {
  const a = String(antet || '').toLowerCase().replace(/\s+/g, ' ').replace(/[–—]/g, '-').trim();
  for (const [k, sursa, re] of COLOANE) if (re.test(a)) return { k, sursa };
  return null;
}
// Codul unei celule: '' (nu se citește), sau o literă + semne:
//   'b' = din bord, 's' = socotit de aparat; apoi 'q' = depinde de dotare, 'x' = experimental,
//   'c' = lipsește cu cititorul fără contact (ECAN02 / P400 / U400).
// `celula` = { t: textul, albastru, portocaliu, galben } — culorile le citește `citesteExcel`.
function codCelula(celula, sursa) {
  const t = String((celula && celula.t) || '').trim();
  if (!t || t.charAt(0) !== '+') return '';
  let c = sursa === 'socotit' ? 's' : 'b';
  if (celula.albastru) c += 'q';
  if (t.indexOf('*') >= 0) c += 'x';
  if (celula.portocaliu || celula.galben) c += 'c';
  return c;
}
// Două coduri pentru aceeași cheie (ex. km din bord ȘI socotit): câștigă cel mai sigur.
function greutateCod(c) { if (!c) return 0; let g = c.charAt(0) === 'b' ? 4 : 3; if (c.indexOf('q') >= 0) g -= 1; if (c.indexOf('x') >= 0) g -= 1.5; return g; }
function maiBun(a, b) { return greutateCod(b) > greutateCod(a) ? b : a; }

// ─── Felul vehiculului ────────────────────────────────────────────────────────────────────────────
function felDinFoaie(nume) {
  const n = String(nume || '').toLowerCase();
  if (/electric/.test(n)) return 'masina';
  if (/^cars?$|passenger|light/.test(n)) return 'masina';
  if (/truck|tanker/.test(n)) return 'camion';
  if (/bus/.test(n)) return 'autobuz';
  if (/agric|construct|special|utility|forest|machinery/.test(n)) return 'utilaj';
  if (/motorbike|moto/.test(n)) return 'moto';
  return 'altele';
}
function felDinCategorie(c) {
  const n = String(c || '').toLowerCase();
  if (/^(car|van|light)$/.test(n)) return 'masina';
  if (/^(truck|heavy)$/.test(n)) return 'camion';
  if (/^bus$/.test(n)) return 'autobuz';
  if (/agric/.test(n)) return 'utilaj';
  return 'altele';
}
const FEL_ET = { masina: 'autoturism / utilitară', camion: 'camion', autobuz: 'autobuz', utilaj: 'utilaj', moto: 'motocicletă', altele: 'alt vehicul' };

// ─── Citirea foilor ───────────────────────────────────────────────────────────────────────────────
// `foi` = [{ nume, randuri: [[celula, celula, ...], ...] }], celula = { t, albastru, portocaliu, galben }
// (primul rând din tablou = rândul 1 din Excel). Întoarce { tip, randuri } sau aruncă o eroare pe
// înțelesul omului, dacă fișierul nu e o listă Teltonika.
const txt = (c) => String((c && c.t) || '').replace(/\s+/g, ' ').trim();
function gasesteAntet(randuri) {
  for (let r = 0; r < Math.min(randuri.length, 10); r++) {
    const vals = (randuri[r] || []).map((c) => txt(c).toLowerCase());
    const iM = vals.findIndex((v) => v === 'brand' || v === 'manufacturer');
    const iMo = vals.findIndex((v) => v === 'model');
    if (iM >= 0 && iMo >= 0) return { r, vals };
  }
  return null;
}
function tipLista(foi, numeFisier) {
  const f = String(numeFisier || '').toLowerCase().replace(/[\s_-]+/g, '');
  for (const foaie of foi) {
    const a = gasesteAntet(foaie.randuri); if (!a) continue;
    if (a.vals.includes('manufacturer') && a.vals.some((v) => /model year/.test(v))) return 'fmc150';
    if (a.vals.includes('brand') && a.vals.some((v) => /program/.test(v))) {
      if (/allcan300/.test(f)) return 'allcan';
      if (/lvcan200/.test(f)) return 'lvcan';
      // Fără nume grăitor: ALL-CAN300 citește mult mai mult (cheia din contact, Webasto, încuietori).
      const toate = foi.map((x) => (gasesteAntet(x.randuri) || { vals: [] }).vals).flat();
      if (toate.some((v) => /key inserted|webasto|central locking/.test(v))) return 'allcan';
      if (foi.some((x) => /special machinery|forest machinery/i.test(x.nume))) return 'allcan';
      return 'lvcan';
    }
  }
  return null;
}
function citesteFoi(foi, numeFisier) {
  const tip = tipLista(foi, numeFisier);
  if (!tip) throw new Error('Nu recunosc fișierul: nu e o listă de mașini Teltonika (LV-CAN200, FMC150 sau ALL-CAN300).');
  const randuri = [];
  for (const foaie of foi) {
    const a = gasesteAntet(foaie.randuri); if (!a) continue;
    const col = (re) => a.vals.findIndex((v) => re.test(v));
    const cMarca = col(/^(brand|manufacturer)$/), cModel = col(/^model$/), cAn = col(/^(year|model year)$/);
    const cProg = col(/^program/), cCan = col(/number of can|^can lines$/), cCat = col(/^category$/), cComb = col(/^fuel type$/), cReg = col(/^region$/);
    // Coloanele de date. La FMX150, grupul „Extended" (deasupra antetului) se cere separat — nu-l numărăm.
    const deasupra = foaie.randuri[a.r - 1] || [];
    const cDate = [];
    a.vals.forEach((v, i) => {
      if (i <= Math.max(cAn, cCan, cReg)) return;
      if (/extended/i.test(txt(deasupra[i]))) return;
      const d = coloanaDate(v); if (d) cDate.push({ i, k: d.k, sursa: d.sursa });
    });
    const felFoaie = felDinFoaie(foaie.nume);
    for (let r = a.r + 1; r < foaie.randuri.length; r++) {
      const rand = foaie.randuri[r] || [];
      const marca = txt(rand[cMarca]), model = txt(rand[cModel]);
      if (!marca || !model) continue;
      if (marca.length > 40 || /^this parameter/i.test(marca)) continue;   // legenda de la coada foii
      const an = ani(txt(rand[cAn]));
      const e = { marca, model, de: an.de, pana: an.pana };
      e.fel = cCat >= 0 ? felDinCategorie(txt(rand[cCat])) : felFoaie;
      const d = descompuneModel(model);
      const combCol = cComb >= 0 ? txt(rand[cComb]).toLowerCase() : '';
      if (/electric|^fev$/.test(combCol) || d.etichete.includes('ELECTRIC') || (/electric/i.test(foaie.nume) && !d.etichete.includes('HYBRID'))) e.comb = 'electric';
      else if (/hybrid/.test(combCol) || d.etichete.includes('HYBRID') || d.etichete.includes('PLUG IN')) e.comb = 'hibrid';
      else if (d.etichete.includes('LPG')) e.comb = 'gpl';
      if (cProg >= 0 && txt(rand[cProg])) e.program = txt(rand[cProg]);
      if (cCan >= 0 && /^[12]$/.test(txt(rand[cCan]))) e.can = Number(txt(rand[cCan]));
      if (cReg >= 0 && txt(rand[cReg])) e.regiune = txt(rand[cReg]);
      const date = {};
      for (const c of cDate) { const cod = codCelula(rand[c.i], c.sursa); if (cod) date[c.k] = maiBun(date[c.k] || '', cod); }
      if (Object.keys(date).length) e.date = date;
      randuri.push(e);
      if (randuri.length > MAX_RANDURI_LISTA) throw new Error('Lista are prea multe rânduri ca să fie o listă Teltonika.');
    }
  }
  if (randuri.length < 20) throw new Error('Am găsit doar ' + randuri.length + ' mașini în fișier — nu pare lista întreagă.');
  return { tip, randuri };
}
// Ziua listei, din numele fișierului: „…_2025_07_23_…" (an, lună, zi) sau „…_12_02_2025…" (lună, zi, an,
// cum își numește Teltonika listele FMX150). Fără o dată limpede → null: nu inventăm una.
function dataDinNume(numeFisier) {
  const f = String(numeFisier || '');
  let m = /(20\d\d)[_\-. ](\d{1,2})[_\-. ](\d{1,2})/.exec(f);
  if (m && +m[2] <= 12 && +m[3] <= 31) return m[1] + '-' + String(m[2]).padStart(2, '0') + '-' + String(m[3]).padStart(2, '0');
  m = /(\d{1,2})[_\-. ](\d{1,2})[_\-. ](20\d\d)/.exec(f);
  if (m && +m[1] <= 12 && +m[2] <= 31) return m[3] + '-' + String(m[1]).padStart(2, '0') + '-' + String(m[2]).padStart(2, '0');
  return null;
}

// ─── Pregătirea pentru căutare ────────────────────────────────────────────────────────────────────
// Se face o dată, la încărcarea listei, nu la fiecare căutare.
function pregateste(randuri) {
  const peMarca = new Map();
  for (const e of randuri || []) {
    const d = descompuneModel(e.model);
    const p = { e, baza: d.baza, gen: d.gen, etichete: d.etichete, strain: piataStraina(d.etichete, d.baza) || (e.regiune && !/^(global|unknown)$/i.test(e.regiune)) };
    const k = cheieMarca(e.marca);
    if (!peMarca.has(k)) peMarca.set(k, []);
    peMarca.get(k).push(p);
  }
  return peMarca;
}
function marcaDin(peMarca, marca) {
  const k = cheieMarca(marca); if (!k) return [];
  if (peMarca.has(k)) return peMarca.get(k);
  // „Mercedes" găsește „MERCEDES-BENZ"; „Land" nu găsește nimic (prea scurt, ar fi o ghicire).
  if (k.length >= 3) for (const [kk, v] of peMarca) if (kk.startsWith(k + ' ') || k.startsWith(kk + ' ')) return v;
  return [];
}

// ─── Potrivirea unei mașini pe o listă ────────────────────────────────────────────────────────────
// `m` = { marca, model, an, combustibil }. Ordinea de alegere, pe românește:
//   1. cel mai PRECIS model: „Sandero Stepway" întâi pe rândurile STEPWAY, abia apoi pe SANDERO;
//   2. anul: rândul trebuie să-l cuprindă. La „de la 2013" și „de la 2021", pentru 2024 câștigă cel mai
//      nou (lista adaugă un rând când se schimbă generația, fără să-l închidă pe cel vechi);
//   3. combustibilul: electric și hibrid sunt obligatorii (alt program), GPL doar contează la egalitate;
//   4. generația scrisă de om (Logan 2), apoi variantele (fără etichete întâi), apoi programul cel mai nou.
function potriveste(peMarca, m) {
  // `note` = ce trebuie VERIFICAT (pe ecran, portocaliu); `info` = bine de știut (gri). Amestecate, totul
  // arăta a problemă — și „merge și cu FMC150" nu e o problemă.
  const out = { stare: 'nu', ales: null, variante: [], alteModele: [], note: [], info: [] };
  const lista = marcaDin(peMarca, m.marca);
  if (!lista.length) { out.note.push('marca nu e pe listă'); return out; }
  const u = descompuneModel(m.model);
  const uTok = new Set(u.baza.concat(u.etichete.flatMap((x) => x.split(' '))));
  // Cifra singură de la capăt („Logan 2") poate fi generația — dacă modelul din listă n-o are în nume.
  const ultim = u.baza[u.baza.length - 1];
  const genOm = u.gen != null ? u.gen : (u.baza.length > 1 && /^[1-9]$/.test(ultim) ? Number(ultim) : null);
  const an = Number(m.an) > 1900 ? Math.round(Number(m.an)) : null;
  const comb = COMBUSTIBILI[m.combustibil] ? m.combustibil : '';
  const inAn = (p) => an == null || ((p.e.de == null || p.e.de <= an) && (p.e.pana == null || p.e.pana >= an));
  const combOk = (p) => {
    if (comb === 'electric') return p.e.comb === 'electric';
    if (comb === 'hibrid') return p.e.comb === 'hibrid';
    return p.e.comb !== 'electric' && p.e.comb !== 'hibrid';
  };
  const potrivite = [], mai = [];
  for (const p of lista) {
    if (p.strain || !p.baza.length) continue;
    if (p.baza.every((t) => uTok.has(t))) potrivite.push(p);
    else if (u.baza.length && u.baza.every((t) => p.baza.includes(t) || !/[A-Z]/.test(t))) mai.push(p);
  }
  // Rândurile pe precizie (câte cuvinte din nume se potrivesc), apoi primul nivel cu ceva pe anul cerut.
  const niveluri = [...new Set(potrivite.map((p) => p.baza.length))].sort((a, b) => b - a);
  let alese = [], relaxat = false, generatiePeNume = false;
  for (const n of niveluri) {
    const nivel = potrivite.filter((p) => p.baza.length === n && inAn(p));
    let bune = nivel.filter(combOk);
    if (!bune.length && nivel.length && (comb === 'hibrid')) { bune = nivel.filter((p) => p.e.comb !== 'electric'); relaxat = bune.length > 0; }
    if (bune.length) { alese = bune; break; }
  }
  // Omul scrie „Actros" sau „Golf", lista scrie „ACTROS MP4" sau „GOLF 7": cuvântul în plus e o
  // generație (are cifre). Atunci luăm rândul bun pe an, dar spunem că trebuie verificat. Un cuvânt în
  // plus FĂRĂ cifre („LOGAN VAN", „TRANSIT CUSTOM") e alt model — acolo nu ghicim.
  if (!alese.length) {
    const gen = mai.filter((p) => inAn(p) && combOk(p) && p.baza.filter((t) => !uTok.has(t)).every((t) => /\d/.test(t)));
    if (gen.length) { alese = gen; generatiePeNume = true; }
  }
  // Alte modele din aceeași familie (Logan → Logan MCV, Logan Van) — ca sugestii, nu ca potrivire.
  const vazute = new Set();
  for (const p of mai) {
    if (!inAn(p) || !combOk(p)) continue;
    const nume = titlu(p.baza.join(' '));
    if (vazute.has(nume) || nume === titlu(u.baza.join(' '))) continue;
    vazute.add(nume); out.alteModele.push(nume);
    if (out.alteModele.length >= 4) break;
  }
  if (!alese.length) {
    out.note.push(potrivite.length ? ('modelul e pe listă, dar nu pentru ' + (an ? 'anul ' + an : 'anul ăsta') + (comb === 'electric' || comb === 'hibrid' ? ' și ' + COMBUSTIBILI[comb] : '')) : 'modelul nu e pe listă');
    if (potrivite.length) out.aniPeLista = [...new Set(potrivite.filter(combOk).map((p) => aniText(p.e.de, p.e.pana)))].slice(0, 6);
    return out;
  }
  const scorComb = (p) => (comb === 'gpl' ? (p.e.comb === 'gpl' ? 0 : 1) : (p.e.comb === 'gpl' ? 1 : 0));
  const nrVar = (p) => eticheteVariante(p.etichete).filter((x) => x !== 'LPG').length + (p.etichete.includes('BETA') ? 5 : 0);
  alese.sort((a, b) =>
    ((b.e.de || 0) - (a.e.de || 0))
    || (scorComb(a) - scorComb(b))
    || ((genOm != null ? (a.gen === genOm ? 0 : 1) : 0) - (genOm != null ? (b.gen === genOm ? 0 : 1) : 0))
    || (nrVar(a) - nrVar(b))
    || (Number(b.e.program) || 0) - (Number(a.e.program) || 0));
  const best = alese[0];
  out.ales = best.e;
  // Variantele: alt program pentru aceeași mașină, din același an de pornire (cu cheie / keyless / GPL).
  out.variante = alese.slice(1).filter((p) => p.e.de === best.e.de && (p.e.program || p.e.model) !== (best.e.program || best.e.model))
    .slice(0, 5).map((p) => p.e);
  out.stare = 'da';
  if (out.variante.length) out.stare = 'variante';
  if (relaxat) { out.stare = 'nesigur'; out.note.push('lista n-are varianta ' + COMBUSTIBILI[comb] + ' — se confirmă la montaj'); }
  if (comb === 'gpl' && best.e.comb !== 'gpl' && alese.some((p) => p.e.comb === 'gpl')) out.info.push('există și program pentru varianta cu GPL');
  if (comb && comb !== 'gpl' && best.e.comb === 'gpl') { out.stare = out.stare === 'da' ? 'variante' : out.stare; out.note.push('lista are doar programul pentru varianta cu GPL — pe ' + COMBUSTIBILI[comb] + ' se confirmă la montaj'); }
  if (genOm != null && best.gen != null && best.gen !== genOm) {
    out.stare = 'nesigur';
    out.note.push('ai scris generația ' + genOm + ', dar pentru ' + (an || 'anul ăsta') + ' lista are ' + best.e.model + ' (' + aniText(best.e.de, best.e.pana) + ') — verifică generația');
  }
  if (generatiePeNume) { out.stare = 'nesigur'; out.note.push('lista scrie modelul mai exact: ' + best.e.model + ' (' + aniText(best.e.de, best.e.pana) + ') — verifică dacă e generația clientului'); }
  if (an == null) { out.stare = out.stare === 'da' ? 'nesigur' : out.stare; out.note.push('fără an: am luat programul cel mai nou — scrie anul ca să fie sigur'); }
  if (best.etichete.includes('BETA')) out.note.push('programul e încă în probă la Teltonika');
  return out;
}

// ─── Ce se citește, pe românește ──────────────────────────────────────────────────────────────────
const DATE_ET = { rezervor: 'rezervor', consum: 'consum', km: 'kilometri', gplNivel: 'GPL (nivel)', gplConsum: 'GPL (consum)', gplStare: 'merge pe GPL', baterie: 'baterie', adblue: 'AdBlue' };
function dateCitite(e, comb) {
  const d = (e && e.date) || {}, out = [];
  // La o mașină electrică rezervorul și consumul de carburant n-au sens: contează kilometrii și bateria.
  const electrica = comb === 'electric' || (e && e.comb === 'electric');
  const chei = electrica ? ['km', 'baterie'] : ['rezervor', 'consum', 'km'];
  if (comb === 'gpl') chei.push('gplNivel', 'gplConsum', 'gplStare');
  if (!electrica && d.baterie) chei.push('baterie');   // hibridul: bateria doar dacă se citește
  if (d.adblue) chei.push('adblue');
  for (const k of chei) {
    const c = d[k] || '';
    out.push({ k, et: DATE_ET[k], da: !!c, socotit: c.charAt(0) === 's', depinde: c.indexOf('q') >= 0, exp: c.indexOf('x') >= 0, faraContact: c.indexOf('c') >= 0 });
  }
  // La GPL, „merge pe GPL" contează doar dacă n-avem nici nivelul, nici consumul.
  const gn = out.find((x) => x.k === 'gplNivel'), gc = out.find((x) => x.k === 'gplConsum');
  if (gn && gc && (gn.da || gc.da)) return out.filter((x) => x.k !== 'gplStare');
  return out;
}
function scorDate(e, comb) {
  const g = { rezervor: 2, consum: 2, km: 1, gplNivel: 1, gplConsum: 1 };
  return dateCitite(e, comb).reduce((s, x) => s + (x.da ? (g[x.k] || 0) * (x.socotit ? 0.8 : 1) * (x.depinde ? 0.7 : 1) * (x.exp ? 0.5 : 1) : 0), 0);
}

// ─── Recomandarea ─────────────────────────────────────────────────────────────────────────────────
// `pot` = { lvcan, fmc150, allcan } (fiecare din `potriveste`), `opt` = { pref: 'lvcan'|'fmc150',
// vreaMotor, combustibil }. Aceeași regulă ca sugestiile din pași (25.09): camion → FMC650 prin FMS;
// mașină cu date din motor → FMC130 + LV-CAN200 sau FMC150, după ce e pe listă și ce citește mai mult.
function felulMasinii(pot) {
  const fel = ['lvcan', 'fmc150', 'allcan'].map((k) => pot[k] && pot[k].ales && pot[k].ales.fel).filter(Boolean);
  for (const f of ['camion', 'autobuz', 'utilaj', 'moto']) if (fel.includes(f)) return f;
  return fel.length ? 'masina' : null;
}
function recomanda(pot, opt) {
  opt = opt || {};
  const comb = opt.combustibil || '';
  const fel = felulMasinii(pot);
  const ok = (k) => pot[k] && pot[k].ales && pot[k].stare !== 'nu';
  const r = { fel, aparat: 'fmc130', sigur: 'nu', motiv: '', note: [], info: [], lista: null };
  if (fel === 'camion' || fel === 'autobuz') {
    r.aparat = 'fmc650'; r.sigur = 'da';
    r.motiv = (fel === 'camion' ? 'Camion' : 'Autobuz') + ': FMC650 citește direct priza FMS.';
    r.note.push('verifică la montaj că priza FMS e activă (la unele camioane e blocată) și ce tahograf are, pentru descărcarea de la distanță');
    return r;
  }
  if (fel === 'utilaj') {
    // Tractoarele și utilajele cu CAN pe lista FMC150 se citesc cu el; restul, doar cu ALL-CAN300.
    if (ok('fmc150') && opt.vreaMotor !== false) {
      const p = pot.fmc150;
      r.aparat = 'fmc150'; r.lista = 'fmc150'; r.sigur = p.stare === 'da' ? 'da' : (p.stare === 'nesigur' ? 'nesigur' : 'variante');
      r.motiv = 'Utilaj pe lista FMC150: ' + p.ales.model + ' (' + aniText(p.ales.de, p.ales.pana) + ').';
      return r;
    }
    r.aparat = 'fmc130'; r.sigur = ok('allcan') ? 'da' : 'nu';
    r.motiv = ok('allcan') ? 'Utilaj: datele din motor se citesc doar cu ALL-CAN300, care nu e în ofertă. Cu FMC130 vezi poziția și orele de lucru.' : 'Utilaj: nu e pe liste. Cu FMC130 vezi poziția.';
    return r;
  }
  if (opt.vreaMotor === false) { r.aparat = 'fmc130'; r.sigur = 'da'; r.motiv = 'Clientul vrea doar poziția: FMC130 merge pe orice mașină.'; return r; }
  const lv = ok('lvcan'), f = ok('fmc150');
  if (!lv && !f) {
    r.aparat = 'fmc130'; r.sigur = 'nu';
    const altAn = ['lvcan', 'fmc150'].some((k) => pot[k] && (pot[k].aniPeLista || []).length);
    r.motiv = ok('allcan') ? 'Nu e pe listele LV-CAN200 și FMC150 (doar pe ALL-CAN300, care nu e în ofertă). Cu FMC130 vezi poziția; pentru consum întreabă Teltonika.'
      : ('Nu e pe listele Teltonika' + (altAn && opt.an ? ' pentru anul ' + opt.an : '') + '. Cu FMC130 vezi poziția; pentru consum întreabă Teltonika (marcă, model, an).');
    return r;
  }
  // Pe amândouă listele: întâi cea pe care potrivirea e SIGURĂ, apoi cea care citește mai mult, abia
  // apoi alegerea ta (comutatorul de la pasul 4).
  const rang = { da: 3, variante: 2, nesigur: 1 };
  let alege;
  if (lv && f) {
    const rl = rang[pot.lvcan.stare] || 0, rf = rang[pot.fmc150.stare] || 0;
    const sl = scorDate(pot.lvcan.ales, comb), sf = scorDate(pot.fmc150.ales, comb);
    if ((rl === 1) !== (rf === 1)) alege = rl > rf ? 'lvcan' : 'fmc150';
    else if (Math.abs(sl - sf) >= 1) alege = sl > sf ? 'lvcan' : 'fmc150';
    else alege = opt.pref === 'fmc150' ? 'fmc150' : 'lvcan';
  } else alege = lv ? 'lvcan' : 'fmc150';
  const p = pot[alege];
  r.aparat = alege === 'lvcan' ? 'fmc130_lvcan' : 'fmc150';
  r.lista = alege;
  r.sigur = p.stare === 'da' ? 'da' : 'variante';
  if (p.stare === 'nesigur') r.sigur = 'nesigur';
  r.motiv = alege === 'lvcan'
    ? ('Pe lista LV-CAN200: ' + p.ales.model + ' (' + aniText(p.ales.de, p.ales.pana) + ')' + (p.ales.program ? ', program ' + p.ales.program : '') + '.')
    : ('Pe lista FMC150: ' + p.ales.model + ' (' + aniText(p.ales.de, p.ales.pana) + ').');
  if (lv && f) {
    const cealalta = pot[alege === 'lvcan' ? 'fmc150' : 'lvcan'];
    r.info.push((cealalta.stare === 'nesigur' ? 'poate merge și cu ' : 'merge și cu ') + (alege === 'lvcan' ? 'FMC150' : 'FMC130 + LV-CAN200') + (cealalta.stare === 'nesigur' ? ' (de verificat)' : ''));
  }
  if (comb === 'gpl') {
    const d = dateCitite(p.ales, 'gpl');
    const gpl = d.filter((x) => /^gpl/.test(x.k) && x.da);
    if (!gpl.length) r.note.push(alege === 'fmc150' ? 'FMC150 nu citește GPL-ul: vezi doar benzina' : 'lista nu dă datele de GPL: vezi doar benzina');
  }
  if ((p.variante || []).length) {
    const et = [...new Set([p.ales].concat(p.variante).flatMap((e) => eticheteVariante(descompuneModel(e.model).etichete)).map((x) => VARIANTE[x]))];
    r.info.push('lista are variante' + (et.length ? ' (' + et.join(', ') + ')' : '') + ': instalatorul alege programul la montaj');
  }
  return r;
}

// ─── Mărcile și modelele, pentru completarea casetelor ────────────────────────────────────────────
function marci(listePregatite) {
  const m = new Map();
  for (const peMarca of listePregatite) for (const [k, v] of peMarca) {
    if (!v.length || v.every((p) => p.strain)) continue;
    const frumos = v.find((p) => /[a-z]/.test(p.e.marca));
    if (!m.has(k) || frumos) m.set(k, frumos ? frumos.e.marca : (m.get(k) || titlu(k)));
  }
  return [...m.values()].sort((a, b) => a.localeCompare(b, 'ro'));
}
function modele(listePregatite, marca) {
  const s = new Set();
  for (const peMarca of listePregatite) for (const p of marcaDin(peMarca, marca)) if (!p.strain && p.baza.length) s.add(titlu(p.baza.join(' ')));
  return [...s].sort((a, b) => a.localeCompare(b, 'ro', { numeric: true }));
}

// ─── Șablonul „Mașinile clientului" (28.09) ──────────────────────────────────────────────────────
// Alin: „LIPEȘTE DIN EXCEL nu e ok. Vreau buton de export a unui șablon fix, cu ce trebuie să identifice
// calculatorul nostru, și buton de încărcare a șablonului." Coloanele stau AICI, o dată: după ele se face
// șablonul (report_export.js → `sablonMasiniXlsx`) și tot după ele se citește fișierul completat. Capul de
// tabel se caută după NUME, nu după rând — dacă cineva mută un rând de explicație, șablonul tot se citește.
const SABLON_COLOANE = [
  { cheie: 'marca', et: 'Marcă', lat: 20, alias: ['MARCA'] },
  { cheie: 'model', et: 'Model', lat: 24, alias: ['MODEL', 'MODELUL'] },
  { cheie: 'an', et: 'An fabricație', lat: 15, alias: ['AN FABRICATIE', 'ANUL FABRICATIEI', 'AN', 'ANUL'] },
  { cheie: 'combustibil', et: 'Combustibil', lat: 18, alias: ['COMBUSTIBIL', 'CARBURANT'] },
  { cheie: 'buc', et: 'Bucăți', lat: 10, alias: ['BUCATI', 'BUC', 'NR', 'NUMAR', 'CANTITATE'] },
];
const SABLON_MAX = 500;   // rânduri de mașini citite dintr-un șablon (și rânduri pregătite în el)
// Ce arată lista modelului când n-are ce propune (marca nescrisă sau necunoscută). Dacă cineva îl alege din
// greșeală, citirea îl socotește model LIPSĂ — nu „un model numit așa".
const SABLON_FARA_SUGESTII = '(fără sugestii — scrieți modelul)';
function combustibilDin(t) {
  const s = norm(t);
  if (!s) return '';
  if (/GPL|LPG/.test(s)) return 'gpl';
  if (/ELECTRIC|EV\b|BEV/.test(s)) return 'electric';
  if (/HIBRID|HYBRID|PHEV|HEV/.test(s)) return 'hibrid';
  if (/MOTORIN|DIESEL|TDI|DCI|CDI|HDI/.test(s)) return 'motorina';
  if (/BENZIN|PETROL|GASOLINE|TSI|TCE/.test(s)) return 'benzina';
  return '';
}
// Citește șablonul completat (foile, ca la listele Teltonika). Întoarce mașinile și, pe rând, ce n-a mers:
// { masini: [{ marca, model, an, combustibil, buc, rand }], probleme: [{ rand, ce }] }. Rândul fără marcă
// sau fără model NU intră (n-avem ce căuta); la an, combustibil sau bucăți greșite rândul intră, fără
// valoarea greșită, și se spune pe nume. Rândul = numărul din Excel, ca omul să-l găsească.
function citesteSablon(foi) {
  for (const foaie of foi || []) {
    const randuri = foaie.randuri || [];
    for (let r = 0; r < Math.min(randuri.length, 30); r++) {
      const col = {};
      (randuri[r] || []).forEach((c, i) => {
        const n = norm(txt(c));
        const sc = SABLON_COLOANE.find((x) => x.alias.includes(n));
        if (sc && col[sc.cheie] == null) col[sc.cheie] = i;
      });
      if (col.marca == null || col.model == null) continue;
      const masini = [], probleme = [];
      const val = (rand, k) => (col[k] == null ? '' : txt(rand[col[k]]));
      for (let i = r + 1; i < randuri.length; i++) {
        const rand = randuri[i] || [], nr = i + 1;
        const v = { marca: val(rand, 'marca'), model: val(rand, 'model'), an: val(rand, 'an'), comb: val(rand, 'combustibil'), buc: val(rand, 'buc') };
        if (v.model === SABLON_FARA_SUGESTII) v.model = '';                                // îndemnul listei, nu un model
        if (!v.marca && !v.model && !v.an && !v.comb && !v.buc) continue;                  // rând gol
        if (!v.marca || !v.model) { probleme.push({ rand: nr, ce: !v.marca && !v.model ? 'lipsesc marca și modelul' : (!v.marca ? 'lipsește marca' : 'lipsește modelul') + ' — rândul nu l-am luat' }); continue; }
        if (masini.length >= SABLON_MAX) { probleme.push({ rand: nr, ce: 'am citit doar primele ' + SABLON_MAX + ' de mașini' }); break; }
        const m = { marca: v.marca.slice(0, 60), model: v.model.slice(0, 80), an: null, combustibil: '', buc: 1, rand: nr };
        if (v.an) { const a = Number(String(v.an).replace(/\.0+$/, '')); if (Number.isInteger(a) && a >= 1950 && a <= 2100) m.an = a; else probleme.push({ rand: nr, ce: 'anul „' + v.an + '" nu e un an (ex. 2024)' }); }
        if (v.comb) { m.combustibil = combustibilDin(v.comb); if (!m.combustibil) probleme.push({ rand: nr, ce: 'combustibilul „' + v.comb + '" nu-l recunosc' }); }
        if (v.buc) { const b = Number(String(v.buc).replace(/\.0+$/, '')); if (Number.isInteger(b) && b >= 1 && b <= 10000) m.buc = b; else probleme.push({ rand: nr, ce: 'bucăți „' + v.buc + '" — am pus 1' }); }
        masini.push(m);
      }
      return { masini, probleme };
    }
  }
  throw new Error('Nu găsesc capul de tabel al șablonului (' + SABLON_COLOANE.map((x) => x.et).join(' · ') + '). Descarcă șablonul din calculator și completează-l pe el.');
}

module.exports = {
  LISTE, APARATE, COMBUSTIBILI, FEL_ET, VARIANTE, MAX_RANDURI_LISTA,
  norm, cheieMarca, ani, aniText, descompuneModel, codCelula, coloanaDate,
  citesteFoi, dataDinNume, pregateste, potriveste, recomanda, dateCitite, marci, modele,
  SABLON_COLOANE, SABLON_MAX, SABLON_FARA_SUGESTII, citesteSablon, combustibilDin,
};

// ─── Excel → foi (singurul loc care atinge fișierul) ──────────────────────────────────────────────
// Culorile care contează: litera albastră (depinde de dotare), portocalie (lipsește cu cititorul fără
// contact) și fundalul galben (lipsește cu ECAN02). Restul formatării nu spune nimic.
async function foiDinExcel(buffer, maxRanduri, mesaj) {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buffer); } catch (e) { throw new Error(mesaj); }
  const culoare = (c) => String((c && c.argb) || '').toUpperCase().slice(-6);
  const foi = [];
  wb.eachSheet((ws) => {
    // Doar celulele care EXISTĂ (`eachCell`): cerute una câte una, pe toate cele ~130 de coloane,
    // citirea listei ALL-CAN300 dura o jumătate de minut.
    const randuri = [];
    const maxR = Math.min(ws.rowCount, maxRanduri);
    for (let r = 1; r <= maxR; r++) {
      const cel = [];
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell, c) => {
        let v = cell.value;
        if (v && typeof v === 'object') v = v.richText ? v.richText.map((x) => x.text).join('') : (v.text != null ? v.text : (v.result != null ? v.result : ''));
        const t = v == null ? '' : String(v);
        if (!t) return;
        const f = culoare(cell.font && cell.font.color), g = culoare(cell.fill && cell.fill.fgColor);
        cel[c - 1] = { t, albastru: f === '0000FF', portocaliu: f === 'EF7F1A', galben: g === 'FFFF00' };
      });
      randuri.push(cel);
    }
    foi.push({ nume: ws.name, randuri });
  });
  return foi;
}
async function citesteExcel(buffer, numeFisier) {
  return citesteFoi(await foiDinExcel(buffer, MAX_RANDURI_LISTA + 20, 'Nu pot deschide fișierul: trebuie să fie un Excel (.xlsx) de pe site-ul Teltonika.'), numeFisier);
}
async function citesteSablonExcel(buffer) {
  return citesteSablon(await foiDinExcel(buffer, SABLON_MAX + 60, 'Nu pot deschide fișierul: trebuie să fie șablonul Excel (.xlsx) descărcat din calculator.'));
}
module.exports.citesteExcel = citesteExcel;
module.exports.citesteSablonExcel = citesteSablonExcel;
