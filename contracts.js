// contracts.js — dosarul juridic al unei firme client: ce e complet, ce lipsește, până când ține.
//
// Tot ce e aici e CURAT: primește date, întoarce un răspuns, nu atinge baza și nu cere nimic de
// nicăieri. De asta se poate proba bucată cu bucată (verify_contracte.js) și de asta aceleași
// reguli merg și pe server, și în interfață, fără să fie scrise de două ori.
//
// De ce contează: până acum o firmă se năștea cu un buton, iar dacă cineva uita contractul sau
// acordul GDPR nu se vedea nicăieri. Un client fără acord de prelucrare nu e o scăpare de birou —
// noi ținem datele de localizare ale șoferilor lui, deci fără actul ăla suntem amândoi în neregulă.

const ZI = 24 * 60 * 60 * 1000;

// Ce lipsește din dosar, în ordinea în care se completează firesc.
// Fiecare intrare: [cheie, ce-i spunem omului]
const LIPSURI = [
  ['cui', 'CUI-ul firmei'],
  ['sediu', 'sediul firmei'],
  ['reprezentant', 'reprezentantul legal'],
  ['contract', 'contractul'],
  ['semnatura', 'data semnării'],
  ['actul', 'contractul semnat (PDF)'],
  ['gdpr', 'acordul GDPR']
];
const ETICHETE = {};
LIPSURI.forEach(function (l) { ETICHETE[l[0]] = l[1]; });

// Câte zile înainte de expirare începem să atragem atenția.
const PRAG_EXPIRA_ZILE = 60;

// Cât mai ținem datele unui client după încetare: 30 de zile, în care el poate cere să le primească
// înapoi; apoi se șterg. Așa scrie în Anexa GDPR a contractului, și așa face aplicația (arhivarea unui
// aparat = încetarea pentru el). O SINGURĂ cifră, citită și de hârtie, și de ștergerea automată, și de
// ecran — hotărât cu Alin pe 24.09 („exact așa facem"), după ce aplicația ținea istoricul 2 ani.
// GDPR, art. 28: la încetare, împuternicitul șterge sau returnează datele; nicio lege nu ne obligă să
// păstrăm pozițiile GPS ale clientului. NU o face variabilă de mediu: e o promisiune semnată.
const ZILE_DATE_DUPA_INCETARE = 30;

// Cât se păstrează ISTORICUL (poziții, curse, alerte) cât contractul e în vigoare — decizie Alin,
// 24.09, după ce am măsurat costul pe aplicația pornită: 12 luni pentru TOȚI, incluse în abonament.
// Mai mult (24 sau 36 de luni, ori alt număr) se vinde în ofertă, se scrie pe firmă și se facturează:
// `settings.pastrare = { luni, pretRON }`. Aplicația șterge după regula firmei, nu după o cifră globală.
// Până pe 24.09 ținea 6 luni pentru toți, iar 24/36 de luni se vindeau și se semnau fără să se livreze.
// NU o face variabilă de mediu: e o promisiune semnată (vezi `POSITION_RETENTION_DAYS`, retrasă).
const LUNI_ISTORIC_INCLUSE = 12;
// Plafon de bun-simț pentru „alt număr de luni": o greșeală de tastare (360 în loc de 36) n-ar trebui
// să țină datele de localizare ale unor oameni 30 de ani.
const LUNI_ISTORIC_MAX = 60;

// Regula de păstrare a unei firme, din setările ei. Întoarce `null` dacă setările NU se pot citi:
// ștergerea automată sare atunci peste firmă, în loc s-o coboare pe tăcute la 12 luni — o firmă care
// a plătit 36 de luni și-ar pierde istoricul din cauza unui rând stricat în bază, și nu mai există cale
// de întoarcere. Fără nimic scris = cele 12 luni incluse.
function pastrareFirma(settings) {
  let s = settings;
  if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { return null; } }
  if (s != null && typeof s !== 'object') return null;
  const p = (s && s.pastrare) || null;
  const luni = p ? Math.round(Number(p.luni)) : NaN;
  if (!Number.isFinite(luni) || luni <= LUNI_ISTORIC_INCLUSE) {
    return { luni: LUNI_ISTORIC_INCLUSE, pretRON: 0, platita: false };
  }
  const pret = Number(p.pretRON);
  return {
    luni: Math.min(luni, LUNI_ISTORIC_MAX),
    pretRON: Number.isFinite(pret) && pret > 0 ? Math.round(pret * 100) / 100 : 0,
    platita: true
  };
}
// Ce se scrie pe firmă, din ce trimite ecranul „Abonament & plăți" sau din oferta acceptată.
// `null` = înapoi la cele 12 luni incluse (cheia se scoate). Orice nu e un număr de luni valid → `undefined`
// (cererea se refuză, nu se ghicește).
function curataPastrare(b) {
  if (b === null) return null;
  if (!b || typeof b !== 'object') return undefined;
  const luni = Math.round(Number(b.luni));
  if (!Number.isFinite(luni) || luni < 1) return undefined;
  if (luni <= LUNI_ISTORIC_INCLUSE) return null;
  if (luni > LUNI_ISTORIC_MAX) return undefined;
  const pret = Number(b.pretRON);
  return { luni: luni, pretRON: Number.isFinite(pret) && pret >= 0 ? Math.round(pret * 100) / 100 : 0 };
}

// Cât se ține JURNALUL DE AUDIT (cine a făcut ce în aplicație): 12 luni, apoi se șterge singur. Decizie
// Alin, 24.09: „șterge-l la 12 luni dacă nu avem restricții legale". Nu avem: nicio lege nu cere o
// durată pentru jurnalul unei aplicații (GDPR cere doar să nu ținem date mai mult decât e nevoie).
// Documentele cu termen legal stau în tabelele LOR și nu sunt atinse: facturile (legea contabilității)
// și contractele. Cifra e scrisă și pe pagina publică de confidențialitate — legată printr-o probă.
const LUNI_JURNAL_AUDIT = 12;

// Drumul unui contract, pe românește. Numele stărilor rămân scurte în bază (ciorna, aprobat,
// trimis, activ, incheiat), dar OMUL nu vede niciodată cuvintele astea — vede rândul de aici.
// Sursa e una singură: și serverul, și interfața, și pastila de pe listă citesc de aici.
const ETICHETE_STARE = {
  ciorna: 'în lucru',
  aprobat: 'aprobat — gata de semnat',
  trimis: 'trimis la client',
  activ: 'semnat, în vigoare',
  incheiat: 'încheiat'
};
// Ce urmează firesc după fiecare stare: [starea următoare, ce scrie pe buton].
// „aprobat" e treapta pe care o cerea Alin: din clipa aia hârtia nu mai e ciornă, se printează.
const URMATORUL_PAS = {
  ciorna: ['aprobat', 'Aprobă contractul'],
  aprobat: ['trimis', 'Am trimis contractul la client'],
  trimis: ['activ', 'Contractul e semnat de amândoi'],
  activ: ['incheiat', 'Încheie contractul'],
  incheiat: null
};

// Un număr cu cuvântul lui, pe românește: „1 lună", „12 luni", dar „24 DE luni", „100 DE întrebări".
// Numerele care se termină în 1–19 merg fără „de", restul cu. Pe o hârtie semnată greșeala asta se
// vede (până pe 23.09 contractul scria „100 de întrebări", dar și „15 de întrebări").
function numar(n, unu, multe) {
  const x = Math.abs(Math.round(Number(n) || 0));
  if (x === 1) return '1 ' + unu;
  const r = x % 100;
  return x + ((r >= 1 && r <= 19) ? ' ' : ' de ') + multe;
}

// Sfârșitul contractului, din start + durată. Durata lipsă = perioadă nedeterminată → fără sfârșit.
function calcSfarsit(startAt, luni) {
  if (!startAt || !luni) return null;
  const d = new Date(Number(startAt));
  if (isNaN(d.getTime())) return null;
  const zi = d.getDate();
  d.setMonth(d.getMonth() + Number(luni));
  // 31 ianuarie + 1 lună = 28/29 februarie, nu 2/3 martie.
  if (d.getDate() < zi) d.setDate(0);
  return d.getTime();
}

// Capătul contractului, CU prelungirile semnate. Un act adițional de prelungire nu atinge rândul
// contractului (ce s-a semnat rămâne), deci capătul adevărat se socotește: `luni_prelungite` e suma
// lunilor din actele adiționale SEMNATE și vine din bază, lângă contract.
// Durată lipsă = nedeterminat → null.
function sfarsitContract(c) {
  if (!c) return null;
  const baza = c.end_at ? Number(c.end_at) : calcSfarsit(c.start_at, c.months);
  if (!baza) return null;
  const plus = Math.max(0, Math.round(Number(c.luni_prelungite) || 0));
  if (!plus) return baza;
  // De la ÎNCEPUT (start + luni + prelungiri), nu adunat peste capăt: 31 ianuarie + 1 lună + 1 lună
  // trebuie să dea 31 martie, nu 28 martie.
  return (c.start_at && c.months) ? calcSfarsit(c.start_at, Number(c.months) + plus) : calcSfarsit(baza, plus);
}

// Termenul CURENT. Un contract care se reînnoiește singur continuă „pe perioade succesive egale",
// cum scrie în el — deci după primul termen urmează altul la fel de lung. Fără asta, în anul doi
// ecranul arăta un capăt și o „ultimă zi de preaviz" din trecut (găsit 23.09: „13.09.2025", azi
// fiind 23.09.2026). La un contract care NU se reînnoiește, termenul e cel scris, chiar dacă a trecut.
function sfarsitCurent(c, acum) {
  const s = sfarsitContract(c);
  if (!s || !c || c.auto_renew === false) return s;
  const luni = Number(c.months) || 0;
  const now = acum || Date.now();
  if (!luni || s >= now) return s;
  let t = s;
  for (let k = 1; t < now && k <= 1200; k++) t = calcSfarsit(s, luni * k);
  return t;
}

// Are firma acordul GDPR? Fie e anexă la contract și s-a semnat odată cu el, fie e act separat
// urcat ca fișier. Bifa singură, fără dată și fără fișier, NU se pune la socoteală.
function areGdpr(contract) {
  if (!contract) return false;
  const g = contract.gdpr || {};
  if (contract.has_gdpr_file) return true;
  return !!(g.kind === 'anexa' && (g.signed_at || contract.signed_at));
}

// Starea dosarului. Întoarce mereu același fel de obiect, ca interfața să nu aibă de gândit:
//   { nivel, eticheta, lipsuri: ['cui', …], text: 'CUI-ul firmei, acordul GDPR', zileRamase }
// Nivelurile, de la rău la bine: 'lipsa' → 'nesemnat' → 'incomplet' → 'expira' → 'ok'
// plus 'incheiat' (relația s-a terminat) și 'demo' (nu se aplică).
function stareDosar(firma, contract, acum) {
  const now = acum || Date.now();
  firma = firma || {};
  if (firma.is_demo) return { nivel: 'demo', eticheta: '—', lipsuri: [], text: '', zileRamase: null };

  const lipsuri = [];
  if (!firma.cui) lipsuri.push('cui');
  if (!firma.address) lipsuri.push('sediu');
  const rep = firma.legal_rep || (contract && contract.client_rep) || null;
  if (!rep || !rep.name) lipsuri.push('reprezentant');

  if (!contract) {
    lipsuri.push('contract');
    return { nivel: 'lipsa', eticheta: 'fără contract', lipsuri: lipsuri, text: _text(lipsuri), zileRamase: null };
  }
  if (contract.status === 'incheiat') {
    return { nivel: 'incheiat', eticheta: 'contract încheiat', lipsuri: [], text: '', zileRamase: null };
  }
  if (contract.status !== 'activ') {
    // Aici NU trecem „data semnării" la lipsuri, chiar dacă e goală: eticheta spune deja unde e
    // contractul pe drum, iar a scrie „lipsește data semnării" lângă un câmp completat era pur și
    // simplu fals. Rămân doar lipsurile adevărate ale firmei (CUI, sediu, reprezentant).
    const et = ETICHETE_STARE[contract.status] || ETICHETE_STARE.ciorna;
    return { nivel: 'nesemnat', eticheta: et, lipsuri: lipsuri, text: _text(lipsuri), zileRamase: null };
  }

  // De aici încolo contractul e ACTIV. Ce mai poate lipsi din dosar:
  if (!contract.signed_at) lipsuri.push('semnatura');
  if (!contract.has_file) lipsuri.push('actul');
  if (!areGdpr(contract)) lipsuri.push('gdpr');

  const sfarsit = sfarsitCurent(contract, now);
  const zileRamase = sfarsit ? Math.ceil((Number(sfarsit) - now) / ZI) : null;

  if (lipsuri.length) {
    return { nivel: 'incomplet', eticheta: 'dosar incomplet', lipsuri: lipsuri, text: _text(lipsuri), zileRamase: zileRamase };
  }
  if (zileRamase != null && zileRamase < 0) {
    // Trecut de termen. Dacă se reînnoiește singur, nu e o problemă — doar de știut.
    return contract.auto_renew
      ? { nivel: 'ok', eticheta: 'se reînnoiește singur', lipsuri: [], text: '', zileRamase: zileRamase }
      : { nivel: 'expira', eticheta: 'termen depășit', lipsuri: [], text: '', zileRamase: zileRamase };
  }
  if (zileRamase != null && zileRamase <= PRAG_EXPIRA_ZILE && !contract.auto_renew) {
    return { nivel: 'expira', eticheta: 'expiră în ' + zileRamase + ' zile', lipsuri: [], text: '', zileRamase: zileRamase };
  }
  return { nivel: 'ok', eticheta: 'în regulă', lipsuri: [], text: '', zileRamase: zileRamase };
}

function _text(lipsuri) {
  return lipsuri.map(function (k) { return ETICHETE[k] || k; }).join(', ');
}

// Până când se mai poate anunța rezilierea, ca să prindă termenul. Contract pe 12 luni cu 30 de zile
// preaviz: dacă expiră pe 1 iunie, ultima zi în care se poate denunța e 2 mai. La unul care se
// reînnoiește singur, contează termenul CURENT (vezi `sfarsitCurent`), nu primul.
function ultimaZiDePreaviz(contract, acum) {
  if (!contract) return null;
  const now = acum || Date.now();
  const sfarsit = sfarsitCurent(contract, now);
  if (!sfarsit) return null;
  const zile = contract.notice_days == null ? 30 : Number(contract.notice_days);
  const p = Number(sfarsit) - zile * ZI;
  // La unul care se reînnoiește singur: dacă preavizul pentru termenul de acum a trecut, contractul se
  // prelungește oricum, iar următoarea ocazie de a-l opri e înaintea termenului URMĂTOR. Altfel
  // ecranul ar arăta o zi din trecut, adică o ocazie pierdută, nu una de prins.
  if (contract.auto_renew !== false && p < now && Number(contract.months) > 0) {
    return Number(calcSfarsit(sfarsit, Number(contract.months))) - zile * ZI;
  }
  return p;
}

// Trebuie anunțat cineva că un contract se apropie de capăt?
//
// DA doar pentru contractele care sunt în vigoare, au un termen și NU se reînnoiesc singure — alea
// se opresc pur și simplu la data respectivă, iar dacă nimeni nu bagă de seamă, rămâi cu un client
// care folosește platforma fără act. Cele care se prelungesc automat nu sunt un eveniment: acolo nu
// e nimic de făcut, deci n-are rost să sune ceasul.
//
// Întoarce null (nimic de anunțat) sau datele anunțului. Funcție curată: nu știe de notificări.
function deAnuntat(contract, acum, pragZile) {
  if (!contract || contract.status !== 'activ') return null;
  if (contract.auto_renew !== false) return null;
  // Cu prelungirile semnate: după ce se semnează actul de prelungire, ceasul tace pentru termenul
  // vechi și se rearmează singur pentru cel nou (cheia notificării are capătul în ea).
  const sfarsit = sfarsitContract(contract);
  if (!sfarsit) return null;                       // durată nedeterminată → n-are capăt
  const now = acum || Date.now();
  const prag = pragZile == null ? PRAG_EXPIRA_ZILE : pragZile;
  const zileRamase = Math.ceil((Number(sfarsit) - now) / ZI);
  if (zileRamase > prag) return null;              // încă departe
  const preavizPana = ultimaZiDePreaviz(contract, now);
  return {
    sfarsit: Number(sfarsit),
    zileRamase: zileRamase,
    trecut: zileRamase < 0,
    preavizPana: preavizPana,
    preavizTrecut: preavizPana != null && now > preavizPana
  };
}

// Un rând de preț lunar care NU ține de o mașină anume (RA Insight, păstrarea datelor, agenții
// incluși) sau compoziția pe feluri de mașini din ofertă, cât încă n-au fost bifate aparatele.
function _randLunar(r) {
  const n = function (v) { const x = Number(v); return Number.isFinite(x) && x >= 0 ? Math.round(x * 100) / 100 : null; };
  const cant = n(r && r.cant);
  const pret = n(r && r.pret);
  const total = n(r && r.total);
  return {
    nume: String((r && r.nume) || '').trim().slice(0, 160),
    detaliu: r && r.detaliu ? String(r.detaliu).trim().slice(0, 200) : null,
    cant: cant && cant > 0 ? cant : 1,
    pret: pret,
    total: total != null ? total : Math.round((pret || 0) * (cant && cant > 0 ? cant : 1) * 100) / 100,
    inclus: !!(r && r.inclus),
    // Felul rândului (plain / can / fms / ai / ret / agenti), cum îl scrie oferta. Nu apare pe hârtie;
    // ajută doar la comparația contract ↔ factură (RA Insight se facturează după conturile folosite).
    fel: r && r.fel ? String(r.fel).replace(/[^a-z]/g, '').slice(0, 12) || null : null
  };
}
function _randuriLunare(lista) {
  return (Array.isArray(lista) ? lista : []).map(_randLunar).filter(function (r) { return r.nume; }).slice(0, 30);
}
const _suma = function (l, k) { return l.reduce(function (s, x) { return s + (Number(x[k]) || 0); }, 0); };

// Anexa: fotografia aparatelor contractate și a prețurilor, la momentul semnării. NU e o legătură
// vie cu flota — dacă mâine clientul mai pune un vehicul, anexa semnată rămâne ce s-a semnat.
//
// Prețul lunar are DOUĂ părți, și amândouă se semnează:
//   • `vehicles` — aparatele adevărate, bifate după adopție, fiecare cu abonamentul lui;
//     cât timp lista e goală, ține loc `vehiculeOferta`: câte mașini de fiecare fel s-au vândut.
//   • `servicii` — ce se plătește lunar fără să țină de o mașină: conturile RA Insight, păstrarea
//     datelor, agenții (incluși, 0 lei).
// Până pe 23.09 anexa avea doar mașinile: la bifarea aparatelor, totalul cădea de la 271 la 193 de
// lei și dispăreau în tăcere RA Insight și păstrarea datelor — de pe hârtie ȘI din contract.
function facAnexa(vehicule, pret) {
  const lista = (vehicule || []).map(function (v) {
    return {
      imei: v.imei, name: v.name || v.imei, plate: v.plate || null,
      // Modelul aparatului și dacă citește date din motor (CAN) fac parte din ÎNȚELEGERE, nu din
      // starea de azi a flotei: prețul e mai mare tocmai fiindcă e cu CAN, deci anexa semnată
      // trebuie să spună asta. Se îngheață aici, odată cu prețul.
      gpsModel: v.gpsModel || v.gps_model || null,
      can: v.can === true || v.can === false ? v.can : (v.bill_can === true),
      monthlyRON: v.monthlyRON == null ? null : Number(v.monthlyRON)
    };
  });
  const servicii = _randuriLunare(pret && pret.servicii);
  const vehOferta = _randuriLunare(pret && pret.vehiculeOferta);
  let total;
  if (lista.length) total = _suma(lista, 'monthlyRON') + _suma(servicii, 'total');
  else if (vehOferta.length || servicii.length) total = _suma(vehOferta, 'total') + _suma(servicii, 'total');
  // Formă veche (fără rânduri): suma scrisă de-a gata, cum venea din ofertă.
  else total = (pret && pret.monthlyTotal != null) ? Number(pret.monthlyTotal) : 0;
  const out = {
    vehicles: lista,
    monthlyTotal: Math.round((Number(total) || 0) * 100) / 100,
    currency: (pret && pret.currency) || 'RON'
  };
  if (servicii.length) out.servicii = servicii;
  if (vehOferta.length) out.vehiculeOferta = vehOferta;
  // RA Insight se vinde pe CONT, iar clientul își schimbă singur numărul de conturi. Prețul unui
  // cont și câte întrebări aduce se ÎNGHEAȚĂ aici, ca să ajungă negru pe alb în contract — altfel
  // factura s-ar putea schimba de la o lună la alta fără nimic semnat în spate.
  if (pret && Number(pret.aiSeatPriceRON) > 0) {
    out.aiSeatPriceRON = Math.round(Number(pret.aiSeatPriceRON) * 100) / 100;
    // 0 = NELIMITAT, exact ca pe firmă. Până pe 23.09 un 0 devenea „50 de întrebări pe cont" (o
    // rezervă din vremea pachetului de 50): hârtia promitea 50, iar firma primea nelimitat.
    out.aiQuestionsPerSeat = Math.max(0, Math.round(Number(pret.aiQuestionsPerSeat) || 0));
  }
  // Câte luni se păstrează istoricul intră în ce se SEMNEAZĂ: hârtia o spune, iar peste un an cifra
  // din contract nu trebuie să depindă de ce scrie azi pe firmă. Doar peste cele 12 incluse.
  const pl = Math.round(Number(pret && pret.pastrareLuni));
  if (Number.isFinite(pl) && pl > LUNI_ISTORIC_INCLUSE) out.pastrareLuni = Math.min(pl, LUNI_ISTORIC_MAX);
  return out;
}

// ─── Drumul clientului: de la ofertă la prima factură (Alin, 24.09) ──────────────────────────────
// Alin: „pare alambicat, trec din aia, ies în aia". Drumul avea opt opriri în cinci ecrane și nimic
// nu spunea UNDE ești pe el. Acum e o singură linie de pași, socotită AICI (o singură regulă, pentru
// fișa firmei și pentru lista Contracte), fiecare pas cu butonul lui pe ecran.
//
// Stări: 'gata' · 'acum' (primul pas nefăcut — ăsta are butonul) · 'urmeaza' · 'nu_e_cazul' (ex. un
// contract fără montaj, sau făcut fără ofertă). Un contract încheiat n-are „acum": drumul s-a terminat.
const PASI_DRUM = [
  ['oferta', 'Oferta'], ['trimis', 'Trimis la semnat'], ['semnat', 'Semnat'],
  ['montaj', 'Montajul'], ['aparate', 'Aparatele la firmă'], ['factura', 'Prima factură']
];
const MONTAJ_EXECUTAT = ['executat', 'facturat_de_partener', 'facturat_clientului'];
// d = { contract, areOferta, montaje: { total, executate }, aparate: N, facturi: N }
function drumulClientului(d) {
  const c = d && d.contract;
  if (!c) return null;
  const st = c.status;
  const semnat = st === 'activ' || st === 'incheiat';
  const trimis = semnat || st === 'trimis';
  const mo = d.montaje || { total: 0, executate: 0 };
  const anexa2 = c.montaj || {};
  const cuMontaj = ((anexa2.items || []).length > 0) || (((anexa2.echipamente || {}).items || []).length > 0) || mo.total > 0;
  const nAp = Number(d.aparate) || 0, nFa = Number(d.facturi) || 0;
  const zi = function (ms) { return ms ? new Date(Number(ms)).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' }) : ''; };
  const stari = {
    oferta: d.areOferta ? ['gata', 'din ofertă'] : ['nu_e_cazul', 'fără ofertă'],
    trimis: trimis ? ['gata', c.sent_at ? 'pe ' + zi(c.sent_at) + (c.sent_to ? ', la ' + c.sent_to : '') : ''] : ['urmeaza', st === 'ciorna' ? 'întâi se aprobă' : ''],
    semnat: semnat ? ['gata', c.signed_at ? 'pe ' + zi(c.signed_at) : ''] : ['urmeaza', ''],
    montaj: !cuMontaj ? ['nu_e_cazul', 'fără montaj'] : (mo.executate > 0
      ? ['gata', numar(mo.executate, 'lucrare executată', 'lucrări executate')]
      : ['urmeaza', mo.total ? numar(mo.total, 'lucrare programată', 'lucrări programate') : 'nicio lucrare încă']),
    aparate: nAp > 0 ? ['gata', numar(nAp, 'aparat', 'aparate')] : ['urmeaza', 'niciun aparat încă'],
    factura: nFa > 0 ? ['gata', numar(nFa, 'factură', 'facturi')] : ['urmeaza', '']
  };
  const pasi = PASI_DRUM.map(function (p) { return { cheie: p[0], eticheta: p[1], stare: stari[p[0]][0], detaliu: stari[p[0]][1] }; });
  let urmatorul = null;
  if (st !== 'incheiat') {
    const p = pasi.filter(function (x) { return x.stare === 'urmeaza'; })[0];
    if (p) { p.stare = 'acum'; urmatorul = p.cheie; }
  }
  const socotiti = pasi.filter(function (x) { return x.stare !== 'nu_e_cazul'; });
  return { pasi: pasi, urmatorul: urmatorul, gata: socotiti.filter(function (x) { return x.stare === 'gata'; }).length, din: socotiti.length };
}

// Ce trebuie păstrat dintr-o anexă când se re-salvează DOAR lista de aparate: serviciile lunare,
// compoziția din ofertă și regula RA Insight. Ecranul trimite doar aparatele — fără asta, fiecare
// „Salvează anexa" ștergea restul.
function dinAnexaDePastrat(anexa) {
  const a = anexa || {};
  const out = {};
  ['servicii', 'vehiculeOferta', 'aiSeatPriceRON', 'aiQuestionsPerSeat', 'pastrareLuni', 'currency'].forEach(function (k) {
    if (a[k] != null) out[k] = a[k];
  });
  return out;
}

// Anexa care e în vigoare ACUM: a ultimului act adițional SEMNAT care a schimbat lista de aparate,
// altfel cea din contract. Contractul și actele sunt fotografii; asta e doar „care fotografie contează".
function anexaInVigoare(contract, acte) {
  const semnate = (acte || []).filter(function (a) {
    return a && a.status === 'activ' && a.annex && (a.annex.vehicles || []).length;
  }).sort(function (x, y) { return (Number(x.nr_ordine) || 0) - (Number(y.nr_ordine) || 0); });
  return semnate.length ? semnate[semnate.length - 1].annex : ((contract && contract.annex) || null);
}

module.exports = {
  ZI, LIPSURI, ETICHETE, PRAG_EXPIRA_ZILE, ZILE_DATE_DUPA_INCETARE, ETICHETE_STARE, URMATORUL_PAS, numar,
  LUNI_ISTORIC_INCLUSE, LUNI_ISTORIC_MAX, pastrareFirma, curataPastrare, LUNI_JURNAL_AUDIT,
  PASI_DRUM, MONTAJ_EXECUTAT, drumulClientului,
  calcSfarsit, sfarsitContract, sfarsitCurent, areGdpr, stareDosar, ultimaZiDePreaviz, deAnuntat,
  facAnexa, dinAnexaDePastrat, anexaInVigoare
};
