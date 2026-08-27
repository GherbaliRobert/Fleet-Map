// tollro.js — taxa rutieră pe kilometru pentru marfă peste 3,5 t (TollRo).
//
// Din 2026 România trece de la rovinieta plătită pe perioadă la o taxă calculată pe distanță,
// categorie de drum, masă și normă de poluare. Rovinieta rămâne pentru autoturisme și pentru
// marfa de până la 3,5 t — deci NU orice vehicul din flotă intră aici, iar modulul trebuie să
// spună asta răspicat, nu să întoarcă un cost inventat.
//
// ── De ce grila NU e bătută în cod ────────────────────────────────────────────────────────────
// Data intrării în vigoare s-a mutat de trei ori (1 ianuarie → 1 iulie → toamna lui 2026), iar
// valorile pe kilometru se stabilesc prin ordonanță. Dacă le fixăm în cod, la prima modificare
// calculatorul începe să mintă și e nevoie de un deploy ca să spună adevărul. Aici stau doar ca
// VALORI IMPLICITE; grila reală se ține în setări și o poate corecta super-adminul.
//
// ── Ce e publicat și ce e presupus ────────────────────────────────────────────────────────────
// Publicate: peste 12 t → 0,24 lei/km drum național și 0,48 lei/km autostradă pentru Euro VI,
// respectiv 0,31 și 0,62 pentru cele mai poluante; 3,5–7,5 t → ~0,08 și ~0,22 lei/km.
// NEPUBLICATE la data scrierii: treapta 7,5–12 t și valorile intermediare pe Euro 4/5.
// Alea sunt marcate `presupus: true` și apar în interfață cu avertisment. Un tarif presupus,
// afișat ca și cum ar fi oficial, e mai rău decât lipsa lui — omul își face calcule pe el.

// Treptele de masă (MTMA, în kilograme — cum ține fișa vehiculului `max_weight_legal`).
const CATEGORII = [
  { key: 'c1', eticheta: '3,5 – 7,5 t', minKg: 3500, maxKg: 7500 },
  { key: 'c2', eticheta: '7,5 – 12 t', minKg: 7500, maxKg: 12000 },
  { key: 'c3', eticheta: 'peste 12 t', minKg: 12000, maxKg: null },
];

// Normele de poluare, de la cea mai curată (plătește minimul) la cea mai poluantă.
const EURO = [
  { key: 'euro6', eticheta: 'Euro 6' },
  { key: 'euro5', eticheta: 'Euro 5' },
  { key: 'euro4', eticheta: 'Euro 4' },
  { key: 'euro3', eticheta: 'Euro 3 sau mai vechi' },
];

// Clasele de drum, cu corespondentul lor în OpenStreetMap (de acolo aflăm pe ce fel de drum a mers
// mașina). `trunk` = drum expres în România, `primary` = drum național.
// Drumurile județene, comunale și străzile NU se taxează — de aceea a treia clasă are taxabil: false.
//
// ── Culorile spun CÂT COSTĂ, nu ce fel de drum e (cerut de Alin, 26.08) ───────────────────────
// Erau pe dos: verde pe autostradă, roșu pe drumul național. Pe un ecran cu bani, roșul se citește
// „scump" — iar autostrada e de DOUĂ ORI mai scumpă decât nationalul în fiecare celulă din grilă
// (0,48 față de 0,24 lei/km la peste 12 t Euro 6). Acum: roșu = cel mai scump, verde = mai ieftin,
// albastru = nu se plătește deloc.
// ⚠ Alegerea se sprijină pe faptul că autostrada rămâne mai scumpă decât nationalul în TOATE
// celulele. Grila e editabilă de super-admin, deci `verify_tollro.js` verifică presupunerea și cade
// dacă raportul se inversează — altfel roșul ar ajunge pe cel ieftin și ecranul ar minți prin culoare.
// Culorile astea se folosesc DOAR la costuri (web + telefon), nu sunt legendă de hartă.
const CLASE_DRUM = [
  { key: 'autostrada', eticheta: 'Autostradă / drum expres', culoare: '#ef4444', taxabil: true,
    osm: ['motorway', 'motorway_link', 'trunk', 'trunk_link'] },
  { key: 'national', eticheta: 'Drum național', culoare: '#22c55e', taxabil: true,
    osm: ['primary', 'primary_link'] },
  { key: 'alte', eticheta: 'Alte drumuri (netaxate)', culoare: '#3b82f6', taxabil: false,
    osm: ['secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service', 'road'] },
];

// ── Categorii care NU intră NICIODATĂ la taxa pe kilometru ────────────────────────────────────
// Fără regula asta, aplicația cere „masa maximă autorizată" pentru un Dacia Logan — o întrebare la
// care nu există răspuns util, fiindcă un autoturism nu trece de 3,5 t. Omul ori o completează
// degeaba, ori se întreabă ce a greșit. Prins pe flota reală a fondatorilor (Alin, 26.08): toate
// cele trei mașini ale lor cereau masa, deși două erau un Logan și un Caddy.
//
// Aici stau DOAR cazurile fără dubiu. „Dubă" lipsește dinadins: o dubă mare (Sprinter, Ducato) e
// chiar la limita de 3,5 t și trebuie cântărită, nu presupusă.
const TIPURI_FARA_TAXA = {
  'auto': 'autoturism — plătește rovinietă, nu taxă pe km',
  'motocicleta': 'motocicletă — plătește rovinietă, nu taxă pe km',
  'barca': 'nu circulă pe drum public',
  'remorca': 'remorca nu se taxează separat — taxa e pe vehiculul care o trage',
  'remorca tehnologica': 'remorca nu se taxează separat — taxa e pe vehiculul care o trage',
  'tractor': 'tractor agricol — nu e transport rutier de marfă',
  'utilaj': 'utilaj — nu e transport rutier de marfă',
  'buldoexcavator': 'utilaj — nu e transport rutier de marfă',
  'motostivuitor': 'utilaj — nu e transport rutier de marfă',
  'combina agricola': 'utilaj — nu e transport rutier de marfă',
  'grup electrogen': 'utilaj — nu e transport rutier de marfă',
};
// Categoria se scrie cu diacritice în fișă („Combină agricolă"), dar cheile de mai sus sunt fără —
// altfel o singură literă cu căciulă ar face regula să nu se potrivească niciodată.
function _faraDiacritice(s) {
  return String(s == null ? '' : s).toLowerCase().trim()
    .replace(/[ăâ]/g, 'a').replace(/[îi]/g, 'i').replace(/[șş]/g, 's').replace(/[țţ]/g, 't').replace(/[é]/g, 'e');
}
// Motivul pentru care categoria asta nu intră la taxă, sau null dacă poate intra.
function tipFaraTaxa(tip) {
  return TIPURI_FARA_TAXA[_faraDiacritice(tip)] || null;
}

// Data de la care se aplică. Publicată și amânată de mai multe ori — de aceea e editabilă.
const APLICABIL_DIN = '2026-10-01';

// lei/km. `presupus: true` = valoare interpolată de noi, nu publicată.
function _t(autostrada, national, presupus) { return { autostrada, national, presupus: !!presupus }; }
const GRILA_IMPLICITA = {
  aplicabilDin: APLICABIL_DIN,
  moneda: 'RON',
  tarife: {
    // 3,5–7,5 t: publicate doar ca ordin de mărime („~0,08" / „~0,22"), fără defalcare pe Euro.
    c1: { euro6: _t(0.22, 0.08), euro5: _t(0.24, 0.09, true), euro4: _t(0.26, 0.10, true), euro3: _t(0.28, 0.11, true) },
    // 7,5–12 t: treaptă NEPUBLICATĂ — toată coloana e presupusă, la mijloc între c1 și c3.
    c2: { euro6: _t(0.35, 0.16, true), euro5: _t(0.38, 0.18, true), euro4: _t(0.42, 0.20, true), euro3: _t(0.45, 0.21, true) },
    // peste 12 t: capetele sunt publicate (Euro 6 și Euro 3-), mijlocul e interpolat liniar.
    c3: { euro6: _t(0.48, 0.24), euro5: _t(0.53, 0.26, true), euro4: _t(0.57, 0.29, true), euro3: _t(0.62, 0.31) },
  },
};

// ── Încadrarea vehiculului ───────────────────────────────────────────────────────────────────
// Sub 3,5 t nu e TollRo, ci rovinietă. Întoarcem null, iar apelantul spune asta pe șleau.
function categorieDupaMasa(kg) {
  const m = Number(kg);
  if (!Number.isFinite(m) || m <= 0) return null;
  if (m < 3500) return null;
  for (const c of CATEGORII) {
    if (c.maxKg == null) { if (m >= c.minKg) return c.key; }
    else if (m >= c.minKg && m < c.maxKg) return c.key;
  }
  return null;
}

// Fișa vehiculului ține norma ca text liber: „Euro 6", „EURO6", „euro VI", „6". Le aducem la
// aceeași formă. Necunoscut → tratăm ca cea mai poluantă: mai bine o estimare prudentă (cost
// maxim) decât una optimistă pe care omul o pune în ofertă și pierde bani.
const _ROMAN = { i: 1, ii: 2, iii: 3, iv: 4, v: 5, vi: 6 };
function euroNormalizat(x) {
  const s = String(x == null ? '' : x).toLowerCase().replace(/[\s\-_.]/g, '');
  if (!s) return null;
  let n = null;
  const cifra = s.match(/euro?(\d)/) || s.match(/^(\d)$/);
  if (cifra) n = parseInt(cifra[1], 10);
  if (n == null) {
    const rom = s.match(/euro?([ivx]+)$/);
    if (rom && _ROMAN[rom[1]] != null) n = _ROMAN[rom[1]];
  }
  if (n == null) return null;
  if (n >= 6) return 'euro6';
  if (n === 5) return 'euro5';
  if (n === 4) return 'euro4';
  return 'euro3';
}

// Clasa de drum OSM → clasa noastră de taxare.
const _OSM_LA_CLASA = (() => {
  const m = {};
  for (const c of CLASE_DRUM) for (const h of c.osm) m[h] = c.key;
  return m;
})();
function clasaDinOsm(highway) {
  const k = _OSM_LA_CLASA[String(highway || '').toLowerCase()];
  return k || 'alte';
}

// Grila salvată de super-admin poate fi parțială sau stricată; o completăm cu implicitele și
// respingem valorile absurde. O taxă de 900 lei/km, „salvată din greșeală", ar trece nevăzută.
function grilaValida(g) {
  const out = { aplicabilDin: APLICABIL_DIN, moneda: 'RON', tarife: {} };
  const src = (g && typeof g === 'object') ? g : {};
  if (typeof src.aplicabilDin === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(src.aplicabilDin)) out.aplicabilDin = src.aplicabilDin;
  const st = (src.tarife && typeof src.tarife === 'object') ? src.tarife : {};
  for (const c of CATEGORII) {
    out.tarife[c.key] = {};
    for (const e of EURO) {
      const impl = GRILA_IMPLICITA.tarife[c.key][e.key];
      const dat = (st[c.key] && st[c.key][e.key]) || {};
      const num = (v, d) => { const n = Number(v); return (Number.isFinite(n) && n >= 0 && n <= 10) ? n : d; };
      const a = num(dat.autostrada, impl.autostrada), n2 = num(dat.national, impl.national);
      // „Presupus" rămâne doar dacă valoarea a rămas cea implicită; dacă omul a scris-o, e a lui.
      const atins = (a !== impl.autostrada) || (n2 !== impl.national);
      out.tarife[c.key][e.key] = { autostrada: a, national: n2, presupus: impl.presupus && !atins };
    }
  }
  return out;
}

// ── Calculul ─────────────────────────────────────────────────────────────────────────────────
// v    — { masaKg, euro } (din fișa vehiculului)
// km   — { autostrada, national, alte } în kilometri
// grila— grila validată
// acum — ISO/ms, ca să putem spune dacă taxa e deja în vigoare (implicit: momentul apelului)
function estimeaza(v, km, grila, acum) {
  const g = grilaValida(grila);
  const avertismente = [];
  const cat = categorieDupaMasa(v && v.masaKg);

  // Categoria vehiculului se verifică ÎNAINTEA masei: la un autoturism sau la un utilaj, „completează
  // masa maximă" e o cerință fără rost. Tipul e un răspuns, nu o lipsă de răspuns.
  const fara = tipFaraTaxa(v && v.tip);
  if (fara) {
    return { aplicabil: false, motiv: 'Vehiculul nu intră la taxa pe kilometru: ' + fara + '.',
      total: 0, linii: [], categorie: null, euro: null, avertismente };
  }

  if (cat == null) {
    const m = Number(v && v.masaKg);
    return {
      aplicabil: false,
      motiv: (!Number.isFinite(m) || m <= 0)
        ? 'Vehiculul nu are masa maximă autorizată completată în fișă — fără ea nu se poate încadra la taxare.'
        : 'Sub 3,5 t: vehiculul NU intră la TollRo. Pentru el rămâne rovinieta, plătită pe perioadă.',
      total: 0, linii: [], categorie: null, euro: null, avertismente,
    };
  }

  let euro = euroNormalizat(v && v.euro);
  if (!euro) {
    euro = 'euro3';
    avertismente.push('Norma de poluare nu e completată în fișă — am calculat la tariful maxim (Euro 3 sau mai vechi). Completeaz-o ca să scadă estimarea.');
  }

  const tarif = g.tarife[cat][euro];
  if (tarif.presupus) avertismente.push('Tariful pentru această treaptă nu e publicat oficial — valoarea e o estimare a noastră. Corectează grila din Administrare când apare ordonanța.');

  const linii = CLASE_DRUM.map(function (c) {
    const k = Math.max(0, Number((km || {})[c.key]) || 0);
    const lei = c.taxabil ? (tarif[c.key] || 0) : 0;
    return { clasa: c.key, eticheta: c.eticheta, culoare: c.culoare, taxabil: c.taxabil, km: Math.round(k * 10) / 10, leiPerKm: lei, cost: Math.round(k * lei * 100) / 100 };
  });
  const total = Math.round(linii.reduce(function (a, x) { return a + x.cost; }, 0) * 100) / 100;

  const t = acum == null ? Date.now() : (typeof acum === 'number' ? acum : Date.parse(acum));
  const inVigoare = t >= Date.parse(g.aplicabilDin + 'T00:00:00');
  const _dRo = (function (x) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(x || '')); return m ? (m[3] + '.' + m[2] + '.' + m[1]) : String(x || ''); })(g.aplicabilDin);
  if (!inVigoare) avertismente.push('TollRo se aplică de la ' + _dRo + '. Până atunci plătești rovinietă, iar suma de mai jos e o previziune.');

  return {
    aplicabil: true, categorie: cat, euro: euro,
    categorieEticheta: (CATEGORII.find(function (c) { return c.key === cat; }) || {}).eticheta,
    euroEticheta: (EURO.find(function (e) { return e.key === euro; }) || {}).eticheta,
    leiPerKm: { autostrada: tarif.autostrada, national: tarif.national },
    tarifPresupus: !!tarif.presupus,
    linii, total, moneda: g.moneda, aplicabilDin: g.aplicabilDin, inVigoare, avertismente,
  };
}

module.exports = {
  CATEGORII, EURO, CLASE_DRUM, GRILA_IMPLICITA, APLICABIL_DIN, TIPURI_FARA_TAXA,
  categorieDupaMasa, euroNormalizat, clasaDinOsm, grilaValida, estimeaza, tipFaraTaxa,
};
