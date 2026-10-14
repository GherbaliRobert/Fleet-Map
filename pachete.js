'use strict';
// ─── Pachetele RA Insight (Alin, 14.10: „Capitolul 1") — O SINGURĂ regulă ──────────────────────────────────────────────
// RA Insight nu se mai vinde cont cu cont, ci în patru pachete fixe pe FIRMĂ. Platforma rămâne fără planuri (ofertă →
// contract → abonament pe mașină); doar RA Insight are pachete. Aici stă tot ce înseamnă un pachet: cât costă, câte conturi,
// câte întrebări, ce primește, cât ne poate costa o firmă (plasa) și ce i se spune omului când nu mai poate întreba.
// Curat: fără bază de date și fără server — serverul adună cifrele și le dă aici.
//
//   Start    — inclus în orice contract: DOAR administratorul, 50 de răspunsuri pe butoane pe lună, fără AI.
//   Basic    — 10 lei: 2 conturi, 200 de întrebări pe lună la comun, ramurile.
//   Pro      — 20 de lei: până la 5 conturi, 600 de întrebări, împărțirea pe oameni, analiza aprofundată.
//   Business — 30 de lei: conturi nelimitate, 1.000 de întrebări, împărțirea pe oameni, analiza aprofundată.
//
// Hotărât cu Alin pe 14.10: plasa (o firmă costă cel mult 80% din prețul pachetului, din costul REAL pe răspuns), bugetul
// de analiză aprofundată (Sonnet: 5 lei la Pro, 8 la Business, pornită doar dacă proba o cere), FĂRĂ pachete de întrebări
// în plus, se reîncarcă pe 1. Prețurile de aici sunt pornirea; cel semnat stă pe firmă (`settings.ai_pachet.pretRON`).

const PACHETE = [
  { cod: 'start', nume: 'Start', pret: 0, conturi: 1, intrebari: 50, ai: false, ramuri: false, imparte: false, sonnetLei: 0, doarAdmin: true },
  { cod: 'basic', nume: 'Basic', pret: 10, conturi: 2, intrebari: 200, ai: true, ramuri: true, imparte: false, sonnetLei: 0, doarAdmin: false },
  { cod: 'pro', nume: 'Pro', pret: 20, conturi: 5, intrebari: 600, ai: true, ramuri: true, imparte: true, sonnetLei: 5, doarAdmin: false },
  { cod: 'business', nume: 'Business', pret: 30, conturi: null, intrebari: 1000, ai: true, ramuri: true, imparte: true, sonnetLei: 8, doarAdmin: false },
];
const CODURI = PACHETE.map(function (p) { return p.cod; });
const PLASA = 0.80;                                   // cât din preț poate costa o firmă într-o lună
const ROLURI_ADMIN = ['company_admin', 'admin'];      // „admin" = numele vechi, încă trimis de telefonul vechi
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];

// „10 întrebări", dar „50 de întrebări": de la 20 în sus româna cere „de" (ultimele două cifre între 1 și 19 = fără „de").
function deNr(n) { const r = Math.abs(Math.round(Number(n) || 0)) % 100; return (r >= 1 && r <= 19) ? ' ' : ' de '; }
function cant(n, unu, multe) { return Math.round(n) === 1 ? '1 ' + unu : Math.round(n) + deNr(n) + multe; }
function r2(x) { return Math.round((Number(x) || 0) * 100) / 100; }

function dupaCod(cod) {
  const p = PACHETE.find(function (x) { return x.cod === String(cod || '').toLowerCase(); });
  return p ? Object.assign({}, p) : null;
}
function _setari(settings) {
  if (!settings) return {};
  if (typeof settings === 'string') { try { return JSON.parse(settings) || {}; } catch (e) { return {}; } }
  return settings;
}
// Pachetul firmei, din setările ei. Fără pachet scris → Start (Alin, 14.10: „orice firmă începe cu Start").
// Firma rămasă pe regula VECHE, pe cont (`ai_quota` cu întrebări pe cont sau cotă fixă) → null: o citește regula veche
// până o mutăm noi pe un pachet, din fișa firmei. Prețul semnat (`pretRON`) bate prețul de pornire.
function pachetFirma(settings) {
  const s = _setari(settings);
  const ap = s.ai_pachet;
  if (ap && typeof ap === 'object' && dupaCod(ap.cod)) {
    const p = dupaCod(ap.cod);
    const pret = Number(ap.pretRON);
    p.pretRON = Number.isFinite(pret) && pret >= 0 ? r2(pret) : p.pret;
    p.deLa = Number.isFinite(Number(ap.de_la)) ? Number(ap.de_la) : null;
    return p;
  }
  const q = s.ai_quota || {};
  if (Number(q.questionsPerSeat) > 0 || Number(q.questions) > 0) return null;   // regula veche, pe cont
  const p = dupaCod('start');
  p.pretRON = 0; p.deLa = null;
  return p;
}
// Ce se scrie pe firmă când îi punem un pachet (super-admin, oferta, trecerea din aplicație). null = date greșite.
function curataPachet(b) {
  if (!b || typeof b !== 'object') return null;
  const p = dupaCod(b.cod);
  if (!p) return null;
  const out = { cod: p.cod };
  if (b.pretRON != null && b.pretRON !== '') {
    const pret = Number(b.pretRON);
    if (!Number.isFinite(pret) || pret < 0 || pret > 100000) return null;
    out.pretRON = r2(pret);
  } else out.pretRON = p.pret;
  if (b.de_la != null && Number.isFinite(Number(b.de_la))) out.de_la = Math.round(Number(b.de_la));
  return out;
}
function plafonLei(p) { return p ? r2((p.pretRON != null ? p.pretRON : p.pret) * PLASA) : 0; }
function esteAdmin(rol) { return ROLURI_ADMIN.indexOf(String(rol || '')) >= 0; }

// ─── Conturile ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Poate primi omul ăsta RA Insight? (`conturiAcum` = câte are firma deja, fără el). null = da, altfel motivul, pe față.
function refuzLoc(p, conturiAcum, rol) {
  if (!p) return null;
  if (p.doarAdmin && !esteAdmin(rol)) {
    return 'Pe pachetul ' + p.nume + ' RA Insight îl are doar administratorul firmei. De la Basic îl pot avea și colegii.';
  }
  if (p.conturi != null && (Number(conturiAcum) || 0) >= p.conturi) {
    const urm = PACHETE[CODURI.indexOf(p.cod) + 1];
    return 'Pachetul ' + p.nume + ' are ' + cant(p.conturi, 'cont', 'conturi') + ', toate date.' +
      (urm ? ' Pentru mai mulți oameni, treceți la ' + urm.nume + ' (' + (urm.conturi == null ? 'conturi nelimitate' : 'până la ' + cant(urm.conturi, 'cont', 'conturi')) + ').' : '');
  }
  return null;
}

// ─── Împărțirea întrebărilor pe oameni (Pro și Business) ─────────────────────────────────────────────────────────────
// `limita` = întrebările date omului pe lună (null = „la comun"). `sumaAltor` = limitele celorlalți. null = bine.
function refuzLimita(p, limita, sumaAltor) {
  if (!p) return 'Firma nu are un pachet RA Insight.';
  if (!p.imparte) return 'Pe pachetul ' + p.nume + ' întrebările sunt la comun. Împărțirea pe oameni e de la Pro în sus.';
  if (limita == null) return null;
  const n = Number(limita);
  if (!Number.isInteger(n) || n < 0) return 'Limita e un număr întreg de întrebări (0 sau mai mult).';
  if (n + (Number(sumaAltor) || 0) > p.intrebari) {
    const libere = Math.max(0, p.intrebari - (Number(sumaAltor) || 0));
    return 'Pachetul ' + p.nume + ' are ' + cant(p.intrebari, 'întrebare', 'întrebări') + ' pe lună, iar colegilor le-ați dat deja ' +
      cant(Number(sumaAltor) || 0, 'întrebare', 'întrebări') + '. Mai puteți da cel mult ' + libere + '.';
  }
  return null;
}

// ─── Starea: ce mai poate face omul ACUM ─────────────────────────────────────────────────────────────────────────────
// o = { pachet, peOm (starea unui OM anume; fără = a firmei), folositeFirma, folositeOm, limitaOm (null = la comun),
//       sumaLimite, folositeCuLimita (întrebările puse de oamenii CU limită), costLei, costAprofundatLei }
// La Start, „folosite" = răspunsurile pe butoane (nu are AI). La celelalte, întrebările către RA Insight (cele pe
// butoane nu se numără). Ordinea motivelor: plasa → cota firmei → limita omului → partea la comun. Limita și partea la
// comun privesc un om: starea FIRMEI (rezumatul agenților, fără om) se oprește doar la plasă și la cotă.
function stare(o) {
  const p = o.pachet;
  const folosite = Math.max(0, Number(o.folositeFirma) || 0);
  const lim = (o.limitaOm != null && Number.isFinite(Number(o.limitaOm))) ? Math.max(0, Math.round(Number(o.limitaOm))) : null;
  const folositeOm = Math.max(0, Number(o.folositeOm) || 0);
  const sumaLimite = p.imparte ? Math.max(0, Number(o.sumaLimite) || 0) : 0;
  const comun = Math.max(0, p.intrebari - sumaLimite);
  const folositeComun = Math.max(0, folosite - (p.imparte ? (Number(o.folositeCuLimita) || 0) : 0));
  const plafon = plafonLei(p);
  const cost = Math.max(0, Number(o.costLei) || 0);
  const aprof = Math.max(0, Number(o.costAprofundatLei) || 0);
  let motiv = null;
  if (p.ai && plafon > 0 && cost >= plafon) motiv = 'plasa';
  else if (folosite >= p.intrebari) motiv = 'cota';
  else if (o.peOm && p.imparte && lim != null && folositeOm >= lim) motiv = 'limita';
  else if (o.peOm && p.imparte && lim == null && folositeComun >= comun) motiv = 'comun';
  return {
    cod: p.cod, nume: p.nume, ai: p.ai, ramuri: p.ramuri, imparte: p.imparte, pretRON: p.pretRON != null ? p.pretRON : p.pret,
    conturi: p.conturi, intrebari: p.intrebari, folosite: folosite, ramase: Math.max(0, p.intrebari - folosite),
    limitaOm: p.imparte ? lim : null, folositeOm: folositeOm,
    ramaseOm: p.imparte && lim != null ? Math.max(0, lim - folositeOm) : null,
    sumaLimite: sumaLimite, comun: comun, ramaseComun: Math.max(0, comun - folositeComun),
    plafonLei: plafon, costLei: r2(cost), plasaProcent: plafon > 0 ? Math.min(1, cost / plafon) : 0,
    aprofundatLei: p.sonnetLei, aprofundatCheltuitLei: r2(aprof), aprofundatRamasLei: r2(Math.max(0, p.sonnetLei - aprof)),
    blocat: motiv != null, motiv: motiv
  };
}

// ─── Analiza aprofundată: ce model răspunde ───────────────────────────────────────────────────────────────────────────
// Doar la Pro / Business, doar dacă e pornită (Alin, 14.10: „doar dacă proba arată că Haiku 5.5 e slab"), doar la o
// întrebare de analiză („de ce", „compară", „ce să fac") și doar cât ține bugetul lunii. Altfel, modelul obișnuit.
// `rezervaLei` = cât lăsăm deoparte pentru răspunsul ăsta (o analiză grea pe Sonnet ≈ 25 de bani, măsurat pe 09.10).
const REZERVA_APROFUNDAT_LEI = 0.25;
function alegeModel(o) {
  const p = o.pachet;
  if (!p || !p.ai || !(p.sonnetLei > 0) || !o.pornita || !o.analiza) return 'obisnuit';
  return (Number(o.cheltuitLei) || 0) + REZERVA_APROFUNDAT_LEI <= p.sonnetLei ? 'aprofundat' : 'obisnuit';
}

// ─── Ce i se spune omului ─────────────────────────────────────────────────────────────────────────────────────────────
// `acum` = ms; „se reîncarcă pe 1 noiembrie" pe ora României. Niciun cost, niciun preț pe întrebare (regula din 11.09).
function reincarcare(acum) {
  const z = new Date(Number(acum) || Date.now());
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit' })
    .formatToParts(z).forEach(function (x) { if (x.type !== 'literal') p[x.type] = +x.value; });
  return { luna: LUNI[p.month - 1], urmatoarea: LUNI[p.month % 12] };
}
const PE_BUTOANE = 'Până atunci răspund la întrebările de pe butoane: unde e o mașină, km, staționări, rapoarte.';
function textBlocat(st, acum) {
  const r = reincarcare(acum);
  const pe1 = 'Se reîncarcă pe 1 ' + r.urmatoarea + ', fără niciun cost în plus.';
  if (st.cod === 'start') {
    return 'Ați folosit cele ' + cant(st.intrebari, 'răspuns', 'răspunsuri') + ' din ' + r.luna + ' ale pachetului Start. ' + pe1 +
      ' Cu Basic, întrebările de pe butoane n-au limită și puteți întreba orice despre flotă.';
  }
  if (st.motiv === 'cota') return 'Ați folosit cele ' + cant(st.intrebari, 'întrebare', 'întrebări') + ' din ' + r.luna + '. ' + pe1 + ' ' + PE_BUTOANE;
  if (st.motiv === 'limita') {
    return 'Ai folosit cele ' + cant(st.limitaOm, 'întrebare', 'întrebări') + ' date de administrator pentru ' + r.luna + '. ' + pe1 + ' ' + PE_BUTOANE +
      ' Pentru mai multe, vorbește cu administratorul firmei.';
  }
  if (st.motiv === 'comun') {
    return 'S-au terminat întrebările lăsate la comun pentru ' + r.luna + ' (celelalte sunt date colegilor). ' + pe1 + ' ' + PE_BUTOANE +
      ' Pentru mai multe, vorbește cu administratorul firmei.';
  }
  // plasa: clientul NU află de costuri — află doar că RA Insight s-a oprit pe luna asta și când revine.
  return 'RA Insight a ajuns la limita lunii ' + r.luna + ' pentru firma voastră. ' + pe1 + ' ' + PE_BUTOANE;
}
// Pe Start, o întrebare liberă (care ar avea nevoie de AI).
function textDoarButoane() {
  return 'Asta e o întrebare liberă: răspund la ea de la pachetul **Basic** (200 de întrebări pe lună). Pe **Start** răspund la ' +
    'întrebările de pe butoane: unde e o mașină, câți km a făcut, unde a stat, ce acte expiră, rapoartele.';
}
// Rândul scurt de pe ecran: „412 din 600 rămase în octombrie" / „34 din 50 de răspunsuri pe butoane rămase".
function textRamase(st, acum) {
  const r = reincarcare(acum);
  if (st.cod === 'start') return st.ramase + ' din ' + st.intrebari + deNr(st.intrebari) + 'răspunsuri pe butoane rămase în ' + r.luna;
  return st.ramase + ' din ' + st.intrebari + ' rămase în ' + r.luna;
}

module.exports = {
  PACHETE, CODURI, PLASA, ROLURI_ADMIN, REZERVA_APROFUNDAT_LEI,
  dupaCod, pachetFirma, curataPachet, plafonLei, esteAdmin, refuzLoc, refuzLimita, stare, alegeModel,
  reincarcare, textBlocat, textDoarButoane, textRamase, deNr,
};
