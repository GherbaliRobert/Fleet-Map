// etransport.js — regulile RO e-Transport, într-un singur loc.
//
// SURSĂ UNICĂ, ca `tacho.js` și `license_cats.js`. Serverul calculează scadențarul de aici; interfața
// doar desenează ce primește. Fără asta, „mai am 6 ore" s-ar socoti în două locuri și s-ar contrazice.
//
// ── Ce spune legea (verificat 26.08.2026) ────────────────────────────────────────────────────────
// • Codul UIT e valabil 5 zile calendaristice; 15 zile la achiziții intracomunitare de bunuri.
// • Transportatorul trebuie să transmită la ANAF poziția vehiculului pe TOATĂ durata transportului.
//   Amenzile pentru netransmitere au intrat în vigoare la 1 ianuarie 2026 (prima amendă publică:
//   16 februarie 2026). Persoane juridice: 20.000–100.000 lei.
//
// ⚠ De confirmat cu ANAF: felul EXACT în care se numără cele 5 zile (de la data declarată a
// transportului, inclusiv sau exclusiv ziua de start). De-aia termenul calculat aici e doar o
// PROPUNERE — se salvează ca dată explicită pe transport și omul o poate corecta. Aplicația nu
// trebuie să ghicească tăcut o convenție legală.

const insight = require('./insight');   // ziua României: miezul nopții de la noi, nu cel al serverului (UTC)

const ZILE_NATIONAL = 5;
const ZILE_INTRACOMUNITAR = 15;

// Cât timp fără nicio poziție înseamnă „nu mai transmite". Mecanismul nostru trimite din 3 în 3
// minute; 15 minute e destul cât să nu sune alarma la un tunel sau la o pauză de semnal, dar destul
// de scurt cât să prinzi un tracker mort înainte să conteze.
const TACERE_MINUTE = 15;
// Sub atâtea ore rămase, transportul urcă în „expiră astăzi".
const CURAND_ORE = 24;

const TIPURI = [
  { cod: 'national', label: 'Pe teritoriul național', zile: ZILE_NATIONAL },
  { cod: 'intracomunitar', label: 'Achiziție intracomunitară', zile: ZILE_INTRACOMUNITAR },
];

function zileValabile(tip) {
  const t = TIPURI.find(x => x.cod === String(tip || '').toLowerCase());
  return t ? t.zile : ZILE_NATIONAL;
}

// ── Ziua și ora României (23.10) ─────────────────────────────────────────────────────────────────
// Serverul e pe UTC, iar coloana termenului ține ora fără fus. Termenul se încheia la miezul nopții de
// la Londra: „valabil până pe 23.10" ținea, la noi, până pe 24.10 la 02:59 (vara; iarna la 01:59) —
// trei ore în care ecranul spunea „valabil", iar la ANAF codul expirase. Acum orice termen se scrie ca
// CLIPA ultimei secunde a zilei României, iar o dată fără fus (cum o trimit pagina și telefonul) se
// citește ca oră a României.
const _FARA_FUS = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/;
const _CU_FUS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/i;

function _ziBuna(y, m0, d) {
  const t = new Date(Date.UTC(y, m0, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m0 && t.getUTCDate() === d;
}
// Clipa (ms) în care ceasul României arată y-m0-d h:mi:s. Ora se schimbă la 01:00 UTC (regula UE), deci
// o zi are cel mult un salt: după el se folosește decalajul de la miezul nopții URMĂTOARE.
function _clipaRO(y, m0, d, h, mi, s) {
  const naiv = Date.UTC(y, m0, d, h, mi, s);
  const deLaMiezulZilei = Date.UTC(y, m0, d) - insight.inceputZiRO(y, m0, d);          // 2 sau 3 ore
  const deLaMiezulDeMaine = Date.UTC(y, m0, d + 1) - insight.inceputZiRO(y, m0, d + 1);
  const ms = naiv - deLaMiezulZilei;
  return (deLaMiezulZilei !== deLaMiezulDeMaine && ms >= Date.UTC(y, m0, d, 1)) ? naiv - deLaMiezulDeMaine : ms;
}
// Ziua României [an, lună0, zi] a unei date: cea scrisă, dacă e fără fus; altfel ziua clipei, la noi.
function _ziRO(v) {
  const s = String(v == null ? '' : v).trim();
  const m = _FARA_FUS.exec(s);
  if (m) return _ziBuna(+m[1], +m[2] - 1, +m[3]) ? [+m[1], +m[2] - 1, +m[3]] : null;
  if (!_CU_FUS.test(s)) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  const z = new Date(Date.parse(insight.perioada({ period: 'today' }, ms).from) + 12 * 3600000);   // miezul nopții de la noi + 12 h
  return [z.getUTCFullYear(), z.getUTCMonth(), z.getUTCDate()];
}

// Data la care expiră codul, propusă din data de start. Întoarce null dacă data de start nu e bună —
// NU o zi inventată: mai bine „termen necunoscut" decât un termen fals liniștitor.
// Ziua se încheie la miezul nopții României: un cod valabil „până pe 30" e valabil toată ziua de 30, și nu mai mult.
function valabilPana(dataStart, tip) {
  const z = dataStart ? _ziRO(dataStart) : null;
  if (!z) return null;
  return new Date(_clipaRO(z[0], z[1], z[2] + zileValabile(tip), 23, 59, 59)).toISOString();
}

// Termenul venit de la un formular (pagina, telefonul, o cheie API): „AAAA-LL-ZZ" = toată ziua aceea a
// României; „AAAA-LL-ZZT23:59:59" fără fus = ora României; cu fus (…Z, +03:00) = clipa ca atare.
// Ce nu e o dată → null (ruta o refuză pe față), nu un termen ghicit.
function termenDinFormular(v) {
  if (v == null || String(v).trim() === '') return null;
  const s = String(v).trim();
  const m = _FARA_FUS.exec(s);
  if (m) {
    const y = +m[1], m0 = +m[2] - 1, d = +m[3];
    const cuOra = m[4] != null;
    const h = cuOra ? +m[4] : 23, mi = cuOra ? +m[5] : 59, sec = cuOra ? (m[6] != null ? +m[6] : 0) : 59;
    if (!_ziBuna(y, m0, d) || h > 23 || mi > 59 || sec > 59) return null;
    return new Date(_clipaRO(y, m0, d, h, mi, sec)).toISOString();
  }
  if (!_CU_FUS.test(s)) return null;
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

// Câte ore mai are codul. `stare` e cuvântul pe care îl folosește tot restul aplicației.
function scadenta(valabil, acum) {
  const azi = acum ? new Date(acum) : new Date();
  const v = valabil ? new Date(valabil) : null;
  if (!v || isNaN(v.getTime())) {
    return { stare: 'necunoscut', oreRamase: null, text: 'termen necunoscut' };
  }
  const ore = Math.floor((v.getTime() - azi.getTime()) / 3600000);
  if (ore < 0) return { stare: 'expirat', oreRamase: ore, text: Math.abs(ore) + ' ore de când a expirat' };
  if (ore < CURAND_ORE) return { stare: 'curand', oreRamase: ore, text: ore + ' ore rămase' };
  return { stare: 'ok', oreRamase: ore, text: ore + ' ore rămase' };
}

// De câte minute tace vehiculul. null = n-avem nicio poziție (altceva decât „tace de 0 minute").
function tacere(ultimaPozitie, acum) {
  const azi = acum ? new Date(acum) : new Date();
  const p = ultimaPozitie ? new Date(ultimaPozitie) : null;
  if (!p || isNaN(p.getTime())) return null;
  const min = Math.floor((azi.getTime() - p.getTime()) / 60000);
  return min < 0 ? 0 : min;
}

// ── Starea unui transport ────────────────────────────────────────────────────────────────────────
// Două lucruri DIFERITE, ținute separat dinadins:
//   A. vehiculul transmite către NOI  (știm mereu, din pozițiile trackerului)
//   B. noi trimitem către ANAF        (doar când e configurat tokenul ANAF)
// Machetele le amestecau. Dacă le-am arăta ca pe una singură, un client fără token ar citi „transmite"
// și ar înțelege „sunt în regulă la ANAF" — exact opusul adevărului.
//
// `anafPornit` spune care dintre ele are voie să tragă alarma.
function stareTransport(t, acum, anafPornit) {
  const sc = scadenta(t.valabil_pana, acum);
  const minTacut = tacere(t.ultima_pozitie, acum);
  const catreAnaf = anafPornit ? tacere(t.last_sent_at, acum) : null;

  const motive = [];
  if (sc.stare === 'expirat') motive.push('cod UIT expirat');
  // Fără nicio poziție e mai grav decât o pauză de semnal: nu poți raporta ce nu ai.
  if (minTacut === null) motive.push('nicio poziție de la vehicul');
  else if (minTacut >= TACERE_MINUTE) motive.push('vehiculul nu mai transmite de ' + minTacut + ' min');
  if (anafPornit && (catreAnaf === null || catreAnaf >= TACERE_MINUTE)) {
    motive.push(catreAnaf === null ? 'nu s-a trimis nimic la ANAF' : 'nimic la ANAF de ' + catreAnaf + ' min');
  }

  let stare = 'ok';
  if (motive.length) stare = 'problema';
  else if (sc.stare === 'curand') stare = 'curand';
  else if (sc.stare === 'necunoscut') stare = 'necunoscut';

  return {
    stare,
    motive,
    oreRamase: sc.oreRamase,
    textTermen: sc.text,
    stareTermen: sc.stare,
    minuteTacut: minTacut,
    minuteFaraAnaf: catreAnaf,
  };
}

// Cât din termen s-a consumat, ca procent — pentru bara din listă. Fără termen = bară plină:
// nu e „gol", e „nu știm", iar necunoscutul nu se desenează ca liniște.
function consumatPct(t, acum) {
  const zile = zileValabile(t.tip_operatiune);
  const sc = scadenta(t.valabil_pana, acum);
  if (sc.oreRamase === null) return 100;
  const total = zile * 24;
  const pct = Math.round(((total - sc.oreRamase) / total) * 100);
  return Math.max(2, Math.min(100, pct));
}

module.exports = {
  ZILE_NATIONAL, ZILE_INTRACOMUNITAR, TACERE_MINUTE, CURAND_ORE, TIPURI,
  zileValabile, valabilPana, termenDinFormular, scadenta, tacere, stareTransport, consumatPct,
};
