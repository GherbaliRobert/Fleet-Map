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

// Data la care expiră codul, propusă din data de start. Întoarce null dacă data de start nu e bună —
// NU o zi inventată: mai bine „termen necunoscut" decât un termen fals liniștitor.
function valabilPana(dataStart, tip) {
  const d = dataStart ? new Date(dataStart) : null;
  if (!d || isNaN(d.getTime())) return null;
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + zileValabile(tip));
  // Ziua se încheie la miezul nopții: un cod valabil „până pe 30" e valabil toată ziua de 30.
  out.setHours(23, 59, 59, 0);
  return out.toISOString();
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
  zileValabile, valabilPana, scadenta, tacere, stareTransport, consumatPct,
};
