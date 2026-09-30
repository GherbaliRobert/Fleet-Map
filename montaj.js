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
// `oferta` = cheia PREȚULUI din Ofertare Live; `ofertaQ` = cheia CANTITĂȚII de acolo. Amândouă,
// ca o ofertă să se poată transforma în anexă de contract fără să retasteze nimeni nimic.
const TIPURI = [
  { k: 'gps',       et: 'Instalare dispozitiv GPS',   um: 'buc', oferta: 'mGps',       ofertaQ: 'qGps' },
  { k: 'lvcan',     et: 'Instalare modul LV-CAN',     um: 'buc', oferta: 'mLvCan',     ofertaQ: 'qLvCan' },
  { k: 'caninc',    et: 'Instalare CAN încorporat',   um: 'buc', oferta: 'mCanInc',    ofertaQ: 'qCanInc' },
  { k: 'fms',       et: 'Instalare FMS (tahograf)',   um: 'buc', oferta: 'mFms',       ofertaQ: 'qFms' },
  { k: 'demontare', et: 'Dezinstalare echipament',    um: 'buc', oferta: 'mUninstall', ofertaQ: 'qUninstall' },
  { k: 'inlocuire', et: 'Înlocuire echipament',       um: 'buc', oferta: 'mReplace',   ofertaQ: 'qReplace' },
  { k: 'deplasare', et: 'Deplasare',                  um: 'km',  oferta: 'mTravel',    ofertaQ: 'kmTravel' }
];
// Echipamentele VÂNDUTE clientului (cost unic, în EURO — așa le cumpărăm și noi). Sunt un lucru
// diferit de montaj: aparatul e marfă, montajul e manoperă. Pe hârtie stau în aceeași anexă de
// costuri unice, dar în două tabele, ca să se vadă ce e marfă și ce e muncă.
// `chirie` = cheia CHIRIEI lunare a aparatului în ofertă (lei/lună/buc), când clientul închiriază (25.09).
const ECHIPAMENTE = [
  { k: 'fmc130', et: 'Teltonika FMC130',  oferta: 'dFmc130', ofertaQ: 'd130',  chirie: 'chFmc130' },
  { k: 'fmc150', et: 'Teltonika FMC150',  oferta: 'dFmc150', ofertaQ: 'd150',  chirie: 'chFmc150' },
  { k: 'fmc650', et: 'Teltonika FMC650',  oferta: 'dFmc650', ofertaQ: 'd650',  chirie: 'chFmc650' },
  { k: 'lvcan200', et: 'Modul LV-CAN200', oferta: 'dLvCan',  ofertaQ: 'lvcan', chirie: 'chLvCan' }
];
const CHEI_ECHIP = ECHIPAMENTE.map(function (e) { return e.k; });
function echipament(k) { return ECHIPAMENTE.filter(function (e) { return e.k === k; })[0] || null; }
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

// ─── Echipamentele vândute ───────────────────────────────────────────────────────────────────
// Aceleași reguli ca la montaj: doar tipuri cunoscute, doar numere pozitive, fără rânduri goale.
function randuriEchip(brute) {
  const out = [];
  for (const r of (brute || [])) {
    if (!r || CHEI_ECHIP.indexOf(r.tip) < 0) continue;
    const buc = _n(r.buc);
    if (buc <= 0) continue;
    out.push({ tip: r.tip, buc: buc, pretEur: r.pretEur == null || r.pretEur === '' ? null : _n(r.pretEur) });
  }
  return out;
}
// Anexa de echipamente: preț în euro (așa se negociază), cu echivalentul în lei la cursul zilei.
// Cursul se ÎNGHEAȚĂ în anexă — altfel hârtia semnată ar spune altă sumă peste o lună.
function facAnexaEchip(rd, curs) {
  const c = _n(curs) > 0 ? _n(curs) : 5;
  const lista = (rd || []).map(function (r) {
    const e = echipament(r.tip);
    const total = Math.round(_n(r.buc) * _n(r.pretEur) * 100) / 100;
    return {
      tip: r.tip, eticheta: e ? e.et : r.tip, buc: _n(r.buc),
      pretEur: r.pretEur == null ? null : _n(r.pretEur),
      totalEur: total, totalLei: Math.round(total * c * 100) / 100
    };
  });
  const totalEur = Math.round(lista.reduce(function (s, r) { return s + r.totalEur; }, 0) * 100) / 100;
  return { items: lista, totalEur: totalEur, totalLei: Math.round(totalEur * c * 100) / 100, curs: c };
}

// Anexa de COSTURI UNICE a contractului: echipamentele livrate + montajul. Un singur loc, ca omul
// să vadă dintr-o privire cât plătește o dată, la început, pe lângă abonamentul lunar.
function facAnexaCosturiUnice(rdMontaj, rdEchip, curs, moneda) {
  const m = facAnexaMontaj(rdMontaj, moneda || 'RON');
  const e = facAnexaEchip(rdEchip, curs);
  return {
    items: m.items, totalClient: m.totalClient, currency: m.currency,   // montajul, ca până acum
    echipamente: e,
    // Cât plătește clientul O SINGURĂ DATĂ, în lei: marfa (convertită) + manopera.
    totalUnicLei: Math.round((m.totalClient + e.totalLei) * 100) / 100
  };
}

// ─── Calendarul de montaj (Alin, 30.09: „calendar de programare… să pot selecta eu ziua, și să-mi arate
//     ce am de instalat") ───
// Se programează pe MAȘINI: la fiecare mașină merg aparatul GPS și ce se mai montează pe ea (adaptorul LV-CAN,
// CAN-ul încorporat, priza FMS). Deplasarea, demontarea și înlocuirea nu se împart pe zile: se pun de mână pe
// lucrare, din fișa clientului.
const PE_MASINA = ['gps', 'lvcan', 'caninc', 'fms'];
const STARI_PROGRAMATE = ['de_programat', 'programat'];
// Aceleași stări ca `contracts.MONTAJ_EXECUTAT` (drumul clientului, termenul) — legate printr-o probă.
const STARI_MONTATE = ['executat', 'facturat_de_partener', 'facturat_clientului'];
function _obj(v) { if (v && typeof v === 'object') return v; if (typeof v === 'string' && v) { try { return JSON.parse(v); } catch (e) {} } return null; }
// „1 mașină", „5 mașini", „20 de mașini" (fără „de" când ultimele două cifre sunt între 1 și 19).
function _cate(n, unu, multe) { const r = n % 100; return n + ' ' + (n === 1 ? unu : ((r >= 1 && r <= 19) ? '' : 'de ') + multe); }

// Ce mai e de programat dintr-un contract SEMNAT: Anexa nr. 2 minus lucrările lui (programate + montate), pe
// tipuri. `masini` = aparatele GPS (unul pe mașină); `peMasina` = câte bucăți din tipul ăla merg pe o mașină,
// ca ecranul să propună, la 10 mașini, 10 adaptoare când toate au, și mai puține când doar unele au.
function deProgramat(anexa, lucrari) {
  const a = _obj(anexa) || {};
  const inAnexa = {};
  (a.items || []).forEach(function (r) {
    if (!r || PE_MASINA.indexOf(r.tip) < 0) return;
    const x = inAnexa[r.tip] || (inAnexa[r.tip] = { buc: 0, pretClient: null });
    x.buc += _n(r.buc);
    if (x.pretClient == null && r.pretClient != null) x.pretClient = _n(r.pretClient);
  });
  const prog = {}, mont = {};
  (lucrari || []).forEach(function (l) {
    const tinta = STARI_PROGRAMATE.indexOf(l && l.status) >= 0 ? prog : STARI_MONTATE.indexOf(l && l.status) >= 0 ? mont : null;
    if (!tinta) return;
    const items = _obj(l.items);
    (Array.isArray(items) ? items : []).forEach(function (r) {
      if (r && PE_MASINA.indexOf(r.tip) >= 0) tinta[r.tip] = (tinta[r.tip] || 0) + _n(r.buc);
    });
  });
  const masini = inAnexa.gps ? inAnexa.gps.buc : 0;
  const tipuri = PE_MASINA.filter(function (k) { return inAnexa[k] && inAnexa[k].buc > 0; }).map(function (k) {
    const t = tip(k), n = inAnexa[k].buc, p = prog[k] || 0, m = mont[k] || 0;
    return { tip: k, eticheta: t ? t.et : k, inAnexa: n, programate: p, montate: m, ramase: Math.max(0, n - p - m),
      pretClient: inAnexa[k].pretClient, peMasina: masini > 0 ? Math.round(n / masini * 1000) / 1000 : 0 };
  });
  const g = tipuri.filter(function (r) { return r.tip === 'gps'; })[0] || { programate: 0, montate: 0, ramase: 0 };
  return { masini: masini, programate: g.programate, montate: g.montate, ramase: g.ramase, tipuri: tipuri };
}

// Lucrarea unei zile din calendar. `cate` = { gps: 10, lvcan: 10 } (bucăți pe tip). Prețul pentru client vine din
// Anexa nr. 2 (ce s-a semnat), costul din tarifele instalatorului. Niciodată peste ce a rămas de programat.
// → { items } sau { eroare } (în cuvintele ecranului).
function lucrareaZilei(stare, cate, tarifeInstalator) {
  const s = stare || { tipuri: [] };
  const c = cate || {};
  const g = _n(c.gps);
  if (!(g >= 1) || Math.floor(g) !== g) return { eroare: 'Scrie câte mașini se montează în ziua asta.' };
  const tarife = tarifeInstalator || {};
  const items = [];
  for (const r of (s.tipuri || [])) {
    const buc = Math.floor(_n(c[r.tip]));
    if (!buc) continue;
    if (buc > r.ramase) {
      return { eroare: r.tip === 'gps'
        ? (r.ramase ? 'Au mai rămas de programat doar ' + _cate(r.ramase, 'mașină', 'mașini') + '.' : 'Toate mașinile contractului sunt deja programate.')
        : r.eticheta + ': au mai rămas doar ' + _cate(r.ramase, 'bucată', 'bucăți') + '.' };
    }
    items.push({ tip: r.tip, buc: buc, pretClient: r.pretClient == null ? null : r.pretClient,
      costPartener: tarife[r.tip] == null || tarife[r.tip] === '' ? null : _n(tarife[r.tip]) });
  }
  if (!items.some(function (r) { return r.tip === 'gps'; })) return { eroare: 'Contractul n-are montaj de aparat GPS de programat.' };
  return { items: items };
}

// „Montată": lucrarea programată pentru 10 mașini s-a făcut la 8. Tipurile pe mașină scad în aceeași proporție
// (GPS-ul exact la 8); deplasarea și restul rămân. Ce nu s-a montat se întoarce SINGUR la „de programat",
// fiindcă restul se socotește din lucrări (`deProgramat`).
function scaleazaLaMontate(items, masini) {
  const lista = Array.isArray(items) ? items : [];
  const gps = lista.filter(function (r) { return r && r.tip === 'gps'; })[0];
  const inainte = gps ? _n(gps.buc) : 0;
  const acum = Math.max(0, Math.floor(_n(masini)));
  if (!inainte || acum >= inainte) return lista.map(function (r) { return Object.assign({}, r); });
  return lista.map(function (r) {
    if (!r || PE_MASINA.indexOf(r.tip) < 0) return Object.assign({}, r);
    return Object.assign({}, r, { buc: r.tip === 'gps' ? acum : Math.round(_n(r.buc) * acum / inainte) });
  }).filter(function (r) { return !(PE_MASINA.indexOf(r.tip) >= 0 && !(r.buc > 0)); });
}

module.exports = {
  TIPURI, CHEI, STARI, ETICHETE_STARE, ECHIPAMENTE, CHEI_ECHIP,
  tip, echipament, randuri, randuriEchip, calc,
  facAnexaMontaj, facAnexaEchip, facAnexaCosturiUnice, pretDinOferta,
  PE_MASINA, STARI_PROGRAMATE, STARI_MONTATE, deProgramat, lucrareaZilei, scaleazaLaMontate
};
