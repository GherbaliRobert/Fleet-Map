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

  const sfarsit = contract.end_at || calcSfarsit(contract.start_at, contract.months);
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
// preaviz: dacă expiră pe 1 iunie, ultima zi în care se poate denunța e 2 mai.
function ultimaZiDePreaviz(contract) {
  if (!contract) return null;
  const sfarsit = contract.end_at || calcSfarsit(contract.start_at, contract.months);
  if (!sfarsit) return null;
  const zile = contract.notice_days == null ? 30 : Number(contract.notice_days);
  return Number(sfarsit) - zile * ZI;
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
  const sfarsit = contract.end_at || calcSfarsit(contract.start_at, contract.months);
  if (!sfarsit) return null;                       // durată nedeterminată → n-are capăt
  const now = acum || Date.now();
  const prag = pragZile == null ? PRAG_EXPIRA_ZILE : pragZile;
  const zileRamase = Math.ceil((Number(sfarsit) - now) / ZI);
  if (zileRamase > prag) return null;              // încă departe
  const preavizPana = ultimaZiDePreaviz(contract);
  return {
    sfarsit: Number(sfarsit),
    zileRamase: zileRamase,
    trecut: zileRamase < 0,
    preavizPana: preavizPana,
    preavizTrecut: preavizPana != null && now > preavizPana
  };
}

// Anexa: fotografia aparatelor contractate și a prețurilor, la momentul semnării. NU e o legătură
// vie cu flota — dacă mâine clientul mai pune un vehicul, anexa semnată rămâne ce s-a semnat.
function facAnexa(vehicule, pret) {
  const lista = (vehicule || []).map(function (v) {
    return {
      imei: v.imei, name: v.name || v.imei, plate: v.plate || null,
      monthlyRON: v.monthlyRON == null ? null : Number(v.monthlyRON)
    };
  });
  const total = lista.reduce(function (s, v) { return s + (Number(v.monthlyRON) || 0); }, 0);
  return {
    vehicles: lista,
    monthlyTotal: (pret && pret.monthlyTotal != null) ? Number(pret.monthlyTotal) : total,
    currency: (pret && pret.currency) || 'RON'
  };
}

module.exports = {
  ZI, LIPSURI, ETICHETE, PRAG_EXPIRA_ZILE, ETICHETE_STARE, URMATORUL_PAS,
  calcSfarsit, areGdpr, stareDosar, ultimaZiDePreaviz, deAnuntat, facAnexa
};
