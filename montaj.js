// montaj.js — montajul la client: ce-i facturăm lui și cât ne costă pe noi.
//
// Cum merge afacerea (Alin, 09.09): clientul cere GPS cu montaj. Montajul îl vindem NOI, ca RA
// Tracks. Îl execută un partener (firma X). Partenerul ne facturează pe noi, noi facturăm clientul.
// Clientul nu știe de firma X și nici nu trebuie să știe.
//
// De aici ies DOUĂ prețuri pe aceeași lucrare, și doar unul are voie să ajungă pe hârtia clientului:
//   • prețul către client  → contract (Anexa nr. 2), factură;
//   • costul de la partener → doar la noi, ca să vedem marja.
// Regula asta e scrisă aici o dată, ca să n-o uite nimeni într-un colț de ecran.
//
// Montajul e COST UNIC: nu se adaugă niciodată la abonamentul lunar și se facturează separat.

// Tipurile de lucrare, în ordinea în care se întâmplă la o montare adevărată. Cheile („gps",
// „lvcan"…) sunt cele care se salvează; etichetele se pot schimba fără să strice datele vechi.
// `oferta` e cheia aceleiași lucrări din Ofertare Live, ca prețurile să se poată prelua de acolo.
const TIPURI = [
  { k: 'gps',       et: 'Instalare dispozitiv GPS',   um: 'buc', oferta: 'mGps' },
  { k: 'lvcan',     et: 'Instalare modul LV-CAN',     um: 'buc', oferta: 'mLvCan' },
  { k: 'caninc',    et: 'Instalare CAN încorporat',   um: 'buc', oferta: 'mCanInc' },
  { k: 'fms',       et: 'Instalare FMS (tahograf)',   um: 'buc', oferta: 'mFms' },
  { k: 'demontare', et: 'Dezinstalare echipament',    um: 'buc', oferta: 'mUninstall' },
  { k: 'inlocuire', et: 'Înlocuire echipament',       um: 'buc', oferta: 'mReplace' },
  { k: 'deplasare', et: 'Deplasare',                  um: 'km',  oferta: 'mTravel' }
];
const CHEI = TIPURI.map(function (t) { return t.k; });
function tip(k) { return TIPURI.filter(function (t) { return t.k === k; })[0] || null; }

// Stările unei lucrări, în ordinea în care se întâmplă.
const STARI = ['de_programat', 'programat', 'executat', 'facturat_de_partener', 'facturat_clientului'];
const ETICHETE_STARE = {
  de_programat: 'de programat',
  programat: 'programat',
  executat: 'executat',
  facturat_de_partener: 'partenerul ne-a facturat',
  facturat_clientului: 'facturat clientului'
};

function _n(v) { const x = Number(v); return Number.isFinite(x) && x >= 0 ? x : 0; }

// Curăță rândurile venite din ecran: doar tipuri cunoscute, doar numere pozitive, fără rânduri goale.
function randuri(brute) {
  const out = [];
  for (const r of (brute || [])) {
    if (!r || CHEI.indexOf(r.tip) < 0) continue;
    const buc = _n(r.buc);
    if (buc <= 0) continue;
    out.push({
      tip: r.tip,
      buc: buc,
      pretClient: r.pretClient == null || r.pretClient === '' ? null : _n(r.pretClient),
      costPartener: r.costPartener == null || r.costPartener === '' ? null : _n(r.costPartener)
    });
  }
  return out;
}

// Socoteala: cât încasăm, cât plătim, cât rămâne. Marja se calculează, NU se scrie de mână —
// altfel ar exista două adevăruri și cel scris ar fi mereu cel vechi.
function calc(rd) {
  let totalClient = 0, totalPartener = 0;
  for (const r of (rd || [])) {
    totalClient += _n(r.buc) * _n(r.pretClient);
    totalPartener += _n(r.buc) * _n(r.costPartener);
  }
  totalClient = Math.round(totalClient * 100) / 100;
  totalPartener = Math.round(totalPartener * 100) / 100;
  const marja = Math.round((totalClient - totalPartener) * 100) / 100;
  return {
    totalClient: totalClient,
    totalPartener: totalPartener,
    marja: marja,
    // Procentul din prețul cerut clientului care ne rămâne. Fără preț de client nu există procent
    // (împărțirea la zero nu e „0%", e „nu se poate spune").
    marjaProc: totalClient > 0 ? Math.round((marja / totalClient) * 1000) / 10 : null
  };
}

// Anexa nr. 2 din contract: DOAR partea clientului. Costul partenerului nu are ce căuta aici —
// funcția asta e singurul drum către hârtia semnată, tocmai ca să nu se scurgă din greșeală.
function facAnexaMontaj(rd, moneda) {
  const lista = (rd || []).map(function (r) {
    const t = tip(r.tip);
    return {
      tip: r.tip,
      eticheta: t ? t.et : r.tip,
      um: t ? t.um : 'buc',
      buc: _n(r.buc),
      pretClient: r.pretClient == null ? null : _n(r.pretClient),
      total: Math.round(_n(r.buc) * _n(r.pretClient) * 100) / 100
    };
  });
  const total = lista.reduce(function (s, r) { return s + r.total; }, 0);
  return { items: lista, totalClient: Math.round(total * 100) / 100, currency: moneda || 'RON' };
}

// Prețurile propuse pentru client, luate din tarifele de montaj ale ofertei (Ofertare Live).
// Așa nu se retastează nimic și oferta și contractul spun același lucru.
function pretDinOferta(tarife) {
  const out = {};
  for (const t of TIPURI) {
    const v = tarife && tarife[t.oferta];
    if (v != null && v !== '') out[t.k] = _n(v);
  }
  return out;
}

module.exports = {
  TIPURI, CHEI, STARI, ETICHETE_STARE,
  tip, randuri, calc, facAnexaMontaj, pretDinOferta
};
