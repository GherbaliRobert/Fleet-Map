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
// Firma rămasă pe regula VECHE, pe cont (`ai_quota` cu întrebări pe cont sau cotă fixă, ori limita cea mai veche,
// `companies.ai_monthly_limit` = `limitaVeche`) → null: o citește regula veche până o mutăm noi pe un pachet, din fișa
// firmei. Prețul semnat (`pretRON`) bate prețul de pornire.
// `acum` (ms): o trecere la un pachet mai mic, programată de la 1 a lunii următoare (`ai_pachet_urmator`, pasul 6), devine
// pachetul firmei din clipa aceea; până atunci stă în `urmator` (ecranele scriu „Basic din 1 noiembrie").
function pachetFirma(settings, limitaVeche, acum) {
  const s = _setari(settings);
  const um = s.ai_pachet_urmator && typeof s.ai_pachet_urmator === 'object' && dupaCod(s.ai_pachet_urmator.cod) ? s.ai_pachet_urmator : null;
  const aplicat = um && Number.isFinite(Number(acum)) && Number(acum) >= Number(um.de_la);
  const ap = aplicat ? um : s.ai_pachet;
  if (ap && typeof ap === 'object' && dupaCod(ap.cod)) {
    const p = dupaCod(ap.cod);
    const pret = Number(ap.pretRON);
    p.pretRON = Number.isFinite(pret) && pret >= 0 ? r2(pret) : p.pret;
    p.deLa = Number.isFinite(Number(ap.de_la)) ? Number(ap.de_la) : null;
    if (um && !aplicat) {
      const u = dupaCod(um.cod), pu = Number(um.pretRON);
      p.urmator = { cod: u.cod, nume: u.nume, pretRON: Number.isFinite(pu) && pu >= 0 ? r2(pu) : u.pret, deLa: Number(um.de_la) };
    }
    return p;
  }
  const q = s.ai_quota || {};
  if (Number(q.questionsPerSeat) > 0 || Number(q.questions) > 0 || Number(limitaVeche) > 0) return null;   // regula veche
  const p = dupaCod('start');
  p.pretRON = 0; p.deLa = null;
  return p;
}
// Ce se scrie pe firmă când îi punem un pachet (super-admin, oferta, trecerea din aplicație). null = date greșite.
// `preturi` = prețurile de listă de azi (preturiLista) — fără preț trimis, se ia cel de listă.
function curataPachet(b, preturi) {
  if (!b || typeof b !== 'object') return null;
  const p = dupaCod(b.cod);
  if (!p) return null;
  const out = { cod: p.cod };
  if (b.pretRON != null && b.pretRON !== '') {
    const pret = Number(b.pretRON);
    if (!Number.isFinite(pret) || pret < 0 || pret > 100000) return null;
    out.pretRON = r2(pret);
  } else out.pretRON = preturi && preturi[p.cod] != null ? preturi[p.cod] : p.pret;
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
// `limita` = întrebările date omului pe lună (null = „Fără limită": folosește din ce nu e dat nimănui cu limită). `sumaAltor` =
// limitele celorlalți. null = bine. (Macheta din 15.10, Alin: „4. da" — pe ecran „Fără limită" / „Cel mult … pe lună", nu „la comun".)
function refuzLimita(p, limita, sumaAltor) {
  if (!p) return 'Firma nu are un pachet RA Insight.';
  if (!p.imparte) return 'Pe pachetul ' + p.nume + ' toți cei cu RA Insight folosesc aceleași întrebări. Limita pe om e de la Pro în sus.';
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
    return 'S-au terminat întrebările pentru cei fără limită din ' + r.luna + ' (celelalte sunt date pe nume colegilor). ' + pe1 + ' ' + PE_BUTOANE +
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
// Cât arată ecranul că a rămas: la plasă, 0 (RA Insight s-a oprit pe lună, oricâte întrebări ar fi rămas — macheta din 14.10:
// „0 din 200 rămase · se reîncarcă pe 1"); clientul nu află de costuri.
function ramaseAfisate(st) { return st.motiv === 'plasa' ? 0 : st.ramase; }
// Rândul scurt de pe ecran: „412 din 600 rămase în octombrie" / „34 din 50 de răspunsuri pe butoane rămase".
function textRamase(st, acum) {
  const r = reincarcare(acum);
  if (st.cod === 'start') return st.ramase + ' din ' + st.intrebari + deNr(st.intrebari) + 'răspunsuri pe butoane rămase în ' + r.luna;
  return ramaseAfisate(st) + ' din ' + st.intrebari + ' rămase în ' + r.luna;
}

// Contorul de lângă caseta de scris: „34 din 50" / „îți rămân 38" (omul cu limită) / „0 din 200".
function textScurt(st) {
  if (st.imparte && st.limitaOm != null) return 'îți rămân ' + (st.motiv === 'plasa' ? 0 : st.ramaseOm);
  if (st.motiv === 'comun') return 'îți rămân 0';
  return ramaseAfisate(st) + ' din ' + st.intrebari;
}
// Al doilea rând din caseta pachetului, la omul cu limită (Pro, Business): „Tu: 38 din 100 (limita dată de administrator)".
function textOm(st) {
  if (st.motiv === 'comun') return 'Tu: s-au terminat întrebările pentru cei fără limită';
  if (!(st.imparte && st.limitaOm != null)) return null;
  return 'Tu: ' + (st.motiv === 'plasa' ? 0 : st.ramaseOm) + ' din ' + st.limitaOm + ' (limita dată de administrator)';
}
function textReincarcare(acum) { return 'Se reîncarcă pe 1 ' + reincarcare(acum).urmatoarea + '.'; }

// ─── „Pachet și conturi" (pasul 3): cartonașele de sus, cât a folosit fiecare om, nota de jos ───────────────────────────
function _lei(x) { const n = Number(x) || 0; return Number.isInteger(n) ? n + deNr(n) + 'lei' : n.toLocaleString('ro-RO') + ' lei'; }
function cartonaseConturi(st, conturiDate, acum) {
  const r = reincarcare(acum), date = Number(conturiDate) || 0;
  const out = [
    { k: 'pachet', titlu: 'Pachetul', val: st.nume, sub: st.pretRON > 0 ? _lei(st.pretRON) + ' pe lună' : 'inclus în contract' },
    { k: 'intrebari', titlu: st.cod === 'start' ? 'Răspunsuri pe butoane rămase' : 'Întrebări rămase', val: String(ramaseAfisate(st)),
      sub: 'din ' + st.intrebari + ' · se reîncarcă pe 1 ' + r.urmatoarea },
    { k: 'conturi', titlu: 'Conturi', val: String(date),
      sub: st.conturi == null ? 'conturi nelimitate' : 'din ' + st.conturi + (date < st.conturi ? ' · mai poți da ' + (st.conturi - date === 1 ? 'unul' : (st.conturi - date)) : ' · toate date') }
  ];
  if (st.imparte) out.push({ k: 'limite', titlu: 'Date cu limită', val: String(st.sumaLimite),
    sub: st.sumaLimite ? 'ceilalți folosesc restul de ' + st.comun : 'nimeni n-are limită' });
  return out;
}
// „Pachet și conturi" pe ecranul web (macheta din 15.10, Alin: „3. da, 4. da"): în locul cartonașelor, unul-două rânduri —
// câte conturi s-au dat, câte întrebări au rămas și, pe Pro / Business, cât e dat pe nume. (Cartonașele rămân în răspuns pentru
// telefonul de azi.)
function rezumatConturi(st, conturiDate, acum) {
  const r = reincarcare(acum), date = Number(conturiDate) || 0;
  const conturi = st.conturi == null ? 'Conturi: ' + date + ' (nelimitate)' : 'Conturi: ' + date + ' din ' + st.conturi;
  const ramase = (st.cod === 'start' ? 'Răspunsuri pe butoane rămase: ' : 'Întrebări rămase: ') + ramaseAfisate(st) + ' din ' + st.intrebari +
    ' (se reîncarcă pe 1 ' + r.urmatoarea + ')';
  const out = [conturi + ' · ' + ramase];
  if (st.imparte && st.sumaLimite) out.push('Date cu limită: ' + cant(st.sumaLimite, 'întrebare', 'întrebări') + ' · ceilalți folosesc restul de ' + st.comun + '.');
  return out;
}
// „58 din 200" (omul cu limită) / „64" (fără limită) — câte a folosit în luna asta.
function textFolositeOm(limita, folosite) { return limita != null ? (Number(folosite) || 0) + ' din ' + limita : String(Number(folosite) || 0); }
function notaConturi(p) {
  if (p.cod === 'start') return 'Pe Start, RA Insight îl are doar administratorul. De la Basic îl pot avea și colegii.';
  if (!p.imparte) return 'Pe ' + p.nume + ', toți cei cu RA Insight folosesc aceleași ' + p.intrebari + deNr(p.intrebari) + 'întrebări. Limita pe om e de la Pro.';
  return '„Fără limită” = omul folosește din întrebările firmei care nu sunt date cu limită altcuiva. „Cel mult … pe lună” = omul se ' +
    'oprește la cifra aceea, iar întrebările lui nu le folosesc ceilalți. Limitele nu pot trece de cele ' + p.intrebari + deNr(p.intrebari) +
    'întrebări ale pachetului.';
}

// ─── Oferta, contractul, factura (pasul 5) ─────────────────────────────────────────────────────────────────────────────
// Cât ne costă o întrebare obișnuită pe Haiku 5.5 (măsurat 09–14.10: 0,43–0,49 bani) — capătul prudent. Cu el și cu bugetul
// de analiză aprofundată (cheltuit tot, ca să fim prudenți) se scrie „ce rămâne la noi" în ofertă; cel mai rău caz e plasa.
const COST_INTREBARE_LEI = 0.0049;
function eticheta(p) { return 'RA Insight ' + p.nume; }
// „2 conturi · 200 de întrebări pe lună" — pentru ofertă, contract și factură.
function descriere(p) {
  if (!p.ai) return 'doar administratorul · ' + cant(p.intrebari, 'răspuns', 'răspunsuri') + ' pe butoane pe lună';
  const nr = function (n) { return Number(n).toLocaleString('ro-RO') + deNr(n); };
  return (p.conturi == null ? 'conturi nelimitate' : (p.conturi === 2 ? '2 conturi' : 'până la ' + cant(p.conturi, 'cont', 'conturi'))) + ' · ' +
    nr(p.intrebari) + 'întrebări pe lună';
}
// Ce rămâne la noi dintr-un pachet, pe lună: „obișnuit" = toate întrebările la costul obișnuit + tot bugetul de Sonnet;
// „minim" = plasa (o firmă nu ne poate costa mai mult de 80% din preț). Doar pentru noi — nu ajunge pe hârtia clientului.
function marja(cod, pretRON) {
  const p = dupaCod(cod); if (!p || !p.ai) return { obisnuit: 0, minim: 0 };
  const pret = Number(pretRON != null ? pretRON : p.pret) || 0;
  return { obisnuit: r2(pret - p.intrebari * COST_INTREBARE_LEI - p.sonnetLei), minim: r2(pret * (1 - PLASA)) };
}
// Clauza trecerii la alt pachet (macheta din 14.10, varianta B): scrisă în contract și în condițiile ofertei. O citește
// juristul odată cu restul contractului (la „De amintit").
const CLAUZA_TRECERE = 'Pachetul RA Insight se poate schimba oricând de administratorul Beneficiarului, din aplicație; confirmarea din ' +
  'aplicație ține loc de act adițional. Trecerea la un pachet mai mare se aplică din ziua confirmării, iar luna respectivă se ' +
  'facturează pe zile, pentru fiecare pachet. Trecerea la un pachet mai mic se aplică de la 1 a lunii următoare.';

// ─── Trecerea la alt pachet, din aplicație (pasul 6; macheta din 14.10, varianta B) ───────────────────────────────────
// Administratorul firmei alege; mai mare = din ziua confirmării, iar luna se facturează pe zile (diferența, pe factura lunii
// următoare — ca la aparatele pornite în cursul lunii, abonament.js); mai mic = de la 1 a lunii următoare. Confirmarea din
// aplicație ține loc de act adițional (CLAUZA_TRECERE), iar PDF-ul ei pleacă pe email. Totul pe ORA ROMÂNIEI.
const ORDINE = { start: 0, basic: 1, pro: 2, business: 3 };
function _partiRo(t) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(Number(t))).forEach(function (x) { if (x.type !== 'literal') p[x.type] = +x.value; });
  return p;
}
function ziuaRo(t) { const p = _partiRo(t); return { an: p.year, luna: p.month, zi: p.day }; }
// Clipa în care începe ziua (an, luna, zi) la București (miezul nopții, cu ora de vară / iarnă).
function ziRo(an, luna, zi) {
  const g = Date.UTC(an, luna - 1, zi), p = _partiRo(g);
  return g - (Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - g);
}
function zileLuna(an, luna) { return new Date(Date.UTC(an, luna, 0)).getUTCDate(); }
function inceputZi(t) { const z = ziuaRo(t); return ziRo(z.an, z.luna, z.zi); }
function inceputLunaUrm(t) { const z = ziuaRo(t); return z.luna === 12 ? ziRo(z.an + 1, 1, 1) : ziRo(z.an, z.luna + 1, 1); }
function dataScurta(t) { const z = ziuaRo(t); return String(z.zi).padStart(2, '0') + '.' + String(z.luna).padStart(2, '0') + '.' + z.an; }
function dataLunga(t) { const z = ziuaRo(t); return z.zi + ' ' + LUNI[z.luna - 1] + ' ' + z.an; }
function _bani(x) { return (Number(x) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei'; }
function _pePachet(p, pret) { return 'pachetul RA Insight ' + p.nume + ' (' + (p.ai ? _lei(pret) + ' pe lună, fără TVA' : 'inclus, fără cost') + ')'; }
const FINAL_CONFIRMARE = 'Confirm, ca administrator al firmei, această schimbare. Confirmarea din aplicație ține loc de act adițional la contract.';

// Istoricul pachetului unei firme, pentru factură: [{ de_la, cod, pretRON }] în ordine, cu trecerea programată (dacă e).
// Firmele cu pachet de dinainte de istoric (pașii 1–5) pornesc de la pachetul de azi, din ziua în care l-au primit.
function istoricFirma(settings) {
  const s = _setari(settings);
  let l = Array.isArray(s.ai_pachet_istoric) ? s.ai_pachet_istoric.filter(function (x) { return x && dupaCod(x.cod) && Number.isFinite(Number(x.de_la)); }) : [];
  if (!l.length && s.ai_pachet && dupaCod(s.ai_pachet.cod)) l = [{ de_la: Number(s.ai_pachet.de_la) || 0, cod: s.ai_pachet.cod, pretRON: s.ai_pachet.pretRON }];
  const um = s.ai_pachet_urmator;
  if (um && dupaCod(um.cod) && Number.isFinite(Number(um.de_la))) l = l.filter(function (x) { return Number(x.de_la) < Number(um.de_la); }).concat([um]);
  return l.map(function (x) { const p = dupaCod(x.cod), v = Number(x.pretRON); return { de_la: Number(x.de_la), cod: p.cod, pretRON: Number.isFinite(v) && v >= 0 ? r2(v) : p.pret }; })
    .sort(function (a, b) { return a.de_la - b.de_la; });
}
// O intrare nouă în istoric: tot ce era de la ea încolo (o trecere programată) se înlocuiește. Cel mult 60 de intrări.
function adaugaIstoric(settings, intrare) {
  const l = istoricFirma(settings).filter(function (x) { return x.de_la < Number(intrare.de_la); });
  l.push({ de_la: Number(intrare.de_la), cod: intrare.cod, pretRON: r2(intrare.pretRON) });
  return l.slice(-60);
}
// Trecerea programată care a ajuns la zi devine pachetul firmei (se scrie la prima schimbare de după, ca istoricul să o țină).
// Întoarce setările de scris (o copie) — fără efect dacă n-are ce muta.
function consolideaza(settings, acum) {
  const s = Object.assign({}, _setari(settings)), um = s.ai_pachet_urmator;
  if (!(um && dupaCod(um.cod) && Number(acum) >= Number(um.de_la))) return s;
  s.ai_pachet_istoric = istoricFirma(s);
  s.ai_pachet = { cod: um.cod, pretRON: um.pretRON, de_la: Number(um.de_la) };
  delete s.ai_pachet_urmator;
  return s;
}
// Pachetul (și prețul) la o clipă; înainte de prima intrare = Start, 0 lei.
function pretLa(istoric, t) {
  let e = null;
  (istoric || []).forEach(function (x) { if (x.de_la <= t) e = x; });
  return e || { de_la: 0, cod: 'start', pretRON: 0 };
}
// Zilele lunii (an, luna), din ziua `deLaZi`, strânse pe bucăți cu același pachet și același preț.
function bucatiLuna(istoric, an, luna, deLaZi) {
  const n = zileLuna(an, luna), out = [];
  for (let d = Math.max(1, deLaZi || 1); d <= n; d++) {
    const e = pretLa(istoric, ziRo(an, luna, d) + 12 * 3600000);
    const u = out[out.length - 1];
    if (u && u.cod === e.cod && u.pretRON === e.pretRON) { u.zf = d; u.zile++; } else out.push({ cod: e.cod, pretRON: e.pretRON, zi: d, zf: d, zile: 1 });
  }
  return out;
}
// Rândurile pachetului pe factura lunii M (an, luna) — ACEEAȘI regulă ca abonamentul (abonament.js):
//   intreaga:   firma avea aparate pornite înainte de 1 M → luna M întreagă, la pachetul de pe 1 M;
//   partialaZi: primul aparat a pornit în M-1, din ziua asta → zilele din M-1, pe bucăți, fiecare la pachetul ei;
//   altfel, dacă M-1 s-a facturat întreagă (anterioaraIntreaga) → diferența pe zile pentru fiecare trecere la un pachet mai
//   mare din M-1 (luna M-1 s-a facturat în avans, pe 1, la pachetul de atunci). O trecere la un pachet mai mic nu dă bani înapoi
//   (se aplică de la 1 a lunii următoare, deci nu cade în mijlocul unei luni).
// Întoarce [{ desc, pret }] — prețul pe rând, rotunjit la ban; TVA-ul îl pune factura.
function liniiFactura(o) {
  const ist = o.istoric || [], M = { an: o.an, luna: o.luna };
  const P = M.luna === 1 ? { an: M.an - 1, luna: 12 } : { an: M.an, luna: M.luna - 1 };
  const nP = zileLuna(P.an, P.luna), ll = String(P.luna).padStart(2, '0');
  const per = function (b) { return (b.zi === b.zf ? String(b.zi) : b.zi + '–' + b.zf) + '.' + ll + '.' + P.an + ' (' + cant(b.zile, 'zi', 'zile') + ')'; };
  const out = [];
  if (o.intreaga) {
    const e = pretLa(ist, ziRo(M.an, M.luna, 1) + 3600000);
    if (e.pretRON > 0) out.push({ desc: eticheta(dupaCod(e.cod)) + ' — ' + LUNI[M.luna - 1] + ' ' + M.an, pret: e.pretRON });
  }
  if (o.partialaZi) {
    bucatiLuna(ist, P.an, P.luna, o.partialaZi).forEach(function (b) {
      if (b.pretRON > 0) out.push({ desc: eticheta(dupaCod(b.cod)) + ' — ' + per(b), pret: r2(b.pretRON * b.zile / nP) });
    });
  } else if (o.anterioaraIntreaga) {
    const ref = pretLa(ist, ziRo(P.an, P.luna, 1) + 3600000);
    bucatiLuna(ist, P.an, P.luna, 1).forEach(function (b) {
      if (b.pretRON > ref.pretRON) out.push({ desc: 'RA Insight — trecerea la pachetul ' + dupaCod(b.cod).nume + ', ' + per(b), pret: r2((b.pretRON - ref.pretRON) * b.zile / nP) });
    });
  }
  return out;
}
// Ce se întâmplă dacă administratorul alege pachetul `la`: o = { actual (pachetFirma, cu `urmator`), la, pretNou (prețul
// pachetului ales pentru firma asta — din contract sau lista de azi), conturi (câți au RA Insight acum), firma (numele), acum }.
// Întoarce { refuz } sau { sens: 'sus' | 'jos' | 'anulare', deLa, text } — textul e exact cel pe care îl confirmă omul.
function trecere(o) {
  const a = o.actual, n = dupaCod(o.la), acum = Number(o.acum) || Date.now(), F = String(o.firma || 'Firma').trim();
  if (!a) return { refuz: 'Firma e pe regula veche, pe cont. Pentru pachete, scrie-ne și o trecem noi.' };
  if (!n) return { refuz: 'Pachetul ales nu există. Pachetele: Start, Basic, Pro, Business.' };
  const pV = r2(a.pretRON), pN = n.ai ? r2(o.pretNou) : 0;
  if (n.ai && !(pN > 0)) return { refuz: 'Pachetul ' + n.nume + ' n-are încă preț. Scrie-ne și îl punem noi.' };
  const de = { de: a.cod, la: n.cod, pretVechi: pV, pretNou: pN, numeVechi: a.nume, numeNou: n.nume };
  if (n.cod === a.cod) {
    if (!a.urmator) return { refuz: 'Firma are deja pachetul ' + n.nume + '.' };
    return Object.assign(de, { sens: 'anulare', deLa: acum, pretNou: pV,
      text: 'Firma ' + F + ' rămâne pe ' + _pePachet(a, pV) + '. Trecerea la pachetul ' + a.urmator.nume + ', programată din ' + dataLunga(a.urmator.deLa) + ', se anulează. ' + FINAL_CONFIRMARE });
  }
  if (ORDINE[n.cod] > ORDINE[a.cod]) {
    const deLa = inceputZi(acum), z = ziuaRo(deLa), nL = zileLuna(z.an, z.luna), ramase = nL - z.zi + 1;
    const dif = r2((pN - pV) * ramase / nL);
    const urm = LUNI[z.luna % 12];
    return Object.assign(de, { sens: 'sus', deLa: deLa, diferenta: dif, zileRamase: ramase,
      text: 'Firma ' + F + ' trece de la ' + _pePachet(a, pV) + ' la ' + _pePachet(n, pN) + ', din ' + dataLunga(deLa) + '. ' +
        'Luna ' + LUNI[z.luna - 1] + ' se facturează pe zile: pentru ' + (ramase === nL ? 'toată luna' : 'cele ' + cant(ramase, 'zi rămasă', 'zile rămase')) +
        ' se adaugă diferența de ' + _bani(dif) + ' fără TVA, pe factura din 1 ' + urm + '. ' + FINAL_CONFIRMARE });
  }
  const loc = n.conturi, c = Math.max(0, Math.round(Number(o.conturi) || 0));
  if (loc != null && c > loc) {
    return { refuz: n.cod === 'start'
      ? 'Pe Start, RA Insight îl are doar administratorul; acum îl au ' + cant(c, 'om', 'oameni') + '. Oprește-l întâi celorlalți din „Pachet și conturi”, apoi alege din nou.'
      : 'Pachetul ' + n.nume + ' are ' + cant(loc, 'cont', 'conturi') + '; acum RA Insight îl au ' + cant(c, 'om', 'oameni') + '. Oprește întâi ' + cant(c - loc, 'cont', 'conturi') + ' din „Pachet și conturi”, apoi alege din nou.' };
  }
  const deLa = inceputLunaUrm(acum);
  return Object.assign(de, { sens: 'jos', deLa: deLa,
    text: 'Firma ' + F + ' trece de la ' + _pePachet(a, pV) + ' la ' + _pePachet(n, pN) + ', din ' + dataLunga(deLa) + '. Până atunci rămâne pachetul ' + a.nume + '.' +
      (n.cod === 'start' ? ' Pe Start, RA Insight îl are doar administratorul, cu răspunsuri pe butoane, fără AI.' : '') + ' ' + FINAL_CONFIRMARE });
}
// Ce scrie serverul după confirmare (ecranul doar îl arată). `email` = { trimis, catre } — cum a plecat confirmarea.
function textDupaTrecere(t, email) {
  const conf = email && email.trimis ? ' Confirmarea a plecat pe email (' + email.catre + '), în PDF.'
    : ' Confirmarea, în PDF, o găsești în „Pachet și conturi”' + (email && email.motiv ? ' (emailul n-a plecat: ' + email.motiv + ')' : '') + '.';
  if (t.sens === 'sus') return 'Gata: firma are pachetul ' + t.numeNou + ' de azi.' + conf;
  if (t.sens === 'jos') return 'Gata: firma trece pe pachetul ' + t.numeNou + ' din ' + dataLunga(t.deLa) + '. Până atunci rămâne ' + t.numeVechi + '.' + conf;
  return 'Gata: firma rămâne pe pachetul ' + t.numeVechi + '.' + conf;
}
// Butonul din fereastra de confirmare și rândul din „Confirmările" firmei.
function butonTrecere(t) {
  if (t.sens === 'sus') return 'Trec la ' + t.numeNou + ' de azi';
  if (t.sens === 'jos') return 'Trec la ' + t.numeNou + ' din ' + dataLunga(t.deLa);
  return 'Rămân pe ' + t.numeVechi;
}
function rezumatTrecere(r) {
  const n = function (c) { const p = dupaCod(c); return p ? p.nume : c; };
  return r.sens === 'anulare' ? 'Rămâne ' + n(r.de_la) + ' (trecerea programată, anulată)' : n(r.de_la) + ' → ' + n(r.la) + ', din ' + dataScurta(r.aplicat_de_la);
}

// ─── Ce primește fiecare pachet, pe înțeles (macheta din 14.10, aprobată) — UN singur loc, pentru aplicație și site ───
// Doar ce face aplicația AZI. Analiza aprofundată se scrie doar cât e pornită (o pornim noi, după probă).
const DESCRIERE = {
  start: { titlu: 'Răspunsuri pe loc, pe butoane.', pentru: 'Pentru orice firmă, din prima zi.',
    include: ['1 cont: administratorul', '50 de răspunsuri pe lună: unde e o mașină, câți km, unde a stat, ce acte expiră', 'Scrisoarea de luni'],
    fara: ['Întrebări libere („de ce?”, „ce să fac?”)', 'Ramurile'] },
  basic: { titlu: 'Întreabă orice despre flota ta.', pentru: 'Pentru patron și încă un om.',
    include: ['2 conturi', '200 de întrebări pe lună, la comun', 'Întrebări în cuvintele tale: „De ce a crescut consumul la Caddy?”',
      'Ramurile: RA Drive (condus & costuri), Combustibil, Ore de condus, Mentenanță & acte', 'Răspunsurile pe butoane, fără limită', 'Scrisoarea de luni scrisă de RA Insight'] },
  pro: { titlu: 'Toată echipa întreabă, tu împarți întrebările.', pentru: 'Pentru firme cu dispecerat.',
    include: ['Până la 5 conturi', '600 de întrebări pe lună', 'Împarți întrebările pe oameni', { aprofundat: 'Analiza aprofundată la „de ce” și „ce să fac”' }, 'Tot ce are Basic'] },
  business: { titlu: 'Oricâți oameni, 1.000 de întrebări.', pentru: 'Pentru flote mari, cu mai multe echipe.',
    include: ['Conturi nelimitate', '1.000 de întrebări pe lună', 'Împarți întrebările pe oameni', { aprofundat: 'Analiza aprofundată, cu buget mai mare' }, 'Tot ce are Pro'] },
};
const IN_TOATE = 'În toate: fiecare om își vede doar conversațiile lui · cifrele vin din rapoartele aplicației și se verifică singure · nu se plătește nimic peste preț · se reîncarcă pe 1.';
// Prețurile de listă: cele din cod, peste care se pun cele din „Prețurile noastre" (`tarife_lista`: pkBasic / pkPro /
// pkBusiness). O cifră lipsă sau stricată → prețul din cod, niciodată 0 (un pachet nu se dă pe gratis din greșeală).
const CHEI_PRET = { basic: 'pkBasic', pro: 'pkPro', business: 'pkBusiness' };
function preturiLista(tarife) {
  const t = tarife || {}, out = {};
  PACHETE.forEach(function (p) {
    const k = CHEI_PRET[p.cod], v = k ? Number(t[k]) : NaN;
    out[p.cod] = k && t[k] != null && t[k] !== '' && Number.isFinite(v) && v > 0 ? r2(v) : p.pret;
  });
  return out;
}
// Lista pentru ecrane: o = { aprofundat: pornită?, cuPret: false pe site (Alin, 14.10: „nu afișăm prețurile, «cere ofertă»"),
// preturi: preturiLista(...) }.
function publice(o) {
  o = o || {};
  const pr = o.preturi || {};
  return PACHETE.map(function (p) {
    const d = DESCRIERE[p.cod];
    const include = d.include.map(function (x) { return typeof x === 'string' ? x : (o.aprofundat ? x.aprofundat : null); }).filter(Boolean);
    const out = { cod: p.cod, nume: p.nume, titlu: d.titlu, pentru: d.pentru, include: include, fara: d.fara || [] };
    const lei = pr[p.cod] != null ? pr[p.cod] : p.pret;
    if (o.cuPret !== false) out.pret = lei === 0 ? 'Inclus' : _lei(lei);
    out.subPret = p.pret === 0 ? 'în orice contract' : (o.cuPret !== false ? '/ lună' : 'Cere ofertă');
    return out;
  });
}

// ─── Insigna unui răspuns (Alin, 15.10: „cu mov e analiza RA Insight și consumă întrebare, instant e cu verde — fără
// bonus… să pară ceva profesionist"; 19.10, din cinci variante pozate: „varianta 1 — antetul") ───────────────────────────
// O SINGURĂ regulă pentru ce scrie DEASUPRA fiecărui răspuns: numele, eticheta cu chenar (ANALIZĂ mov / INSTANT verde) și,
// gri, detaliul — dacă s-a numărat și de unde vine. Fără „bonus", „gratuit", „nu se scade". Pe Start (unde și răspunsurile
// instant se numără, din 50) detaliul e „1 răspuns". `text` = propoziția întreagă, pentru cine citește doar text.
const INSIGNA = { nume: 'RA Insight', ai: 'Analiză', instant: 'Instant' };
// fel = 'ai' | 'instant'; o = { numarat, live }
function insigna(fel, o) {
  o = o || {};
  const ai = fel === 'ai';
  const eticheta = ai ? INSIGNA.ai : INSIGNA.instant;
  // „propunere" (pasul 2, 22.10): un cartonaș care pregătește o schimbare — pe reguli, nu se numără (Alin: „da").
  const detaliu = ai ? (o.numarat ? '1 întrebare' : '') : (o.propunere ? 'propunere' : (o.numarat ? '1 răspuns' : (o.live ? 'din datele de acum' : 'din rapoarte')));
  return { fel: ai ? 'ai' : 'instant', nume: INSIGNA.nume, eticheta: eticheta, detaliu: detaliu,
    text: INSIGNA.nume + ' · ' + eticheta + (detaliu ? ' · ' + detaliu : '') };
}
// Mesajele salvate pe 19.10 înainte de antet au doar { fel, text } („Analiză RA Insight · 1 întrebare", „Răspuns instant · din
// rapoarte"). La citirea conversației le completăm din textul lor (scris tot de regula de mai sus), ca pagina să aibă o singură formă.
function insignaCompleta(x) {
  if (!x || typeof x !== 'object' || !x.fel || x.eticheta) return x;
  const det = String(x.text || '').split(' · ').slice(1).join(' · ');
  return insigna(x.fel, { numarat: det === '1 întrebare' || det === '1 răspuns', live: det === 'din datele de acum', propunere: det === 'propunere' });
}

module.exports = {
  INSIGNA, insigna, insignaCompleta,
  PACHETE, CODURI, PLASA, ROLURI_ADMIN, REZERVA_APROFUNDAT_LEI, DESCRIERE, IN_TOATE,
  dupaCod, pachetFirma, curataPachet, plafonLei, esteAdmin, refuzLoc, refuzLimita, stare, alegeModel,
  reincarcare, textBlocat, textDoarButoane, textRamase, textScurt, textOm, textReincarcare, ramaseAfisate, publice, deNr,
  cartonaseConturi, rezumatConturi, textFolositeOm, notaConturi,
  COST_INTREBARE_LEI, CLAUZA_TRECERE, CHEI_PRET, eticheta, descriere, marja, preturiLista,
  ORDINE, FINAL_CONFIRMARE, ziuaRo, ziRo, zileLuna, inceputZi, inceputLunaUrm, dataScurta, dataLunga,
  istoricFirma, adaugaIstoric, consolideaza, pretLa, bucatiLuna, liniiFactura, trecere, textDupaTrecere, butonTrecere, rezumatTrecere,
};
