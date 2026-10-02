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
// `transmite` = aparatul are IMEI și se conectează singur la server (trackerele). Modulul LV-CAN nu transmite:
// stă lângă tracker și are doar o serie.
const ECHIPAMENTE = [
  { k: 'fmc130', et: 'Teltonika FMC130',  oferta: 'dFmc130', ofertaQ: 'd130',  chirie: 'chFmc130', transmite: true },
  { k: 'fmc150', et: 'Teltonika FMC150',  oferta: 'dFmc150', ofertaQ: 'd150',  chirie: 'chFmc150', transmite: true },
  { k: 'fmc650', et: 'Teltonika FMC650',  oferta: 'dFmc650', ofertaQ: 'd650',  chirie: 'chFmc650', transmite: true },
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
  facturat_clientului: 'facturat clientului',
  // O zi programată care n-a mai avut loc (01.10). NU e în STARI: nu se alege din formularul lucrării, ci doar din
  // „Anulează" (cu motiv), ca să rămână în istoric cine, când și de ce.
  anulat: 'anulată'
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

// ─── Zilele, fără ceasul serverului ──────────────────────────────────────────────────────────────
// Regulile de mai jos lucrează pe ZILE scrise 'AAAA-LL-ZZ' (ziua din calendarul României, pe care o dă serverul),
// ca să nu depindă de fusul orar al mașinii pe care rulează: 22.09 e 22.09 și la 23:30, și la 00:30.
const ZI_MS = 86400000;
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
function _ziMs(zi) { const p = String(zi || '').split('-').map(Number); return Date.UTC(p[0], (p[1] || 1) - 1, p[2] || 1); }
function _zi(ms) { const d = new Date(ms); return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0'); }
function _zileIntre(de, pana) { return Math.round((_ziMs(pana) - _ziMs(de)) / ZI_MS); }
function _zzll(ms) { const d = new Date(ms); return String(d.getUTCDate()).padStart(2, '0') + '.' + String(d.getUTCMonth() + 1).padStart(2, '0'); }
function _zzllaa(ms) { return _zzll(ms) + '.' + new Date(ms).getUTCFullYear(); }
function _bani(n) { return (Number(n) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// ─── Aparatele GPS intră o singură dată: în Stoc, cu IMEI-ul (Alin, 30.09: „da") ───────────────────
// Doar trackerele TRANSMIT, deci doar ele au IMEI. Un GPS trecut în Stoc cu IMEI-ul e primit la conectare fără să
// mai fie scris și în Dispozitive, iar când transmite prima dată apare singur la Dispozitive → Neasignate. La un
// tracker, seria din stoc ESTE IMEI-ul (15 cifre, pe eticheta aparatului): altă serie n-ar putea fi recunoscută
// niciodată la conectare, deci se refuză la intrare, nu se descoperă peste o lună.
function transmite(tipEchip) { const e = echipament(tipEchip); return !!(e && e.transmite); }
function esteImei(s) { return /^\d{10,20}$/.test(String(s == null ? '' : s)); }
function seriiFaraImei(tipEchip, serii) {
  return transmite(tipEchip) ? (serii || []).filter(function (s) { return !esteImei(s); }) : [];
}

// ─── „Aparate noi transmit" (Alin, 30.09: „pregătește-l ca notificare, să fie funcțional atunci când face Robert") ───
// Un aparat din „Neasignate" care începe să transmită e, aproape sigur, unul abia montat. Dacă uiți să-l treci pe firmă,
// clientul nu-și vede mașina, iar abonamentul ei nu pornește. Anunțul îți propune și firma: montajul din calendar din
// ziua aceea sau din cele DOUĂ dinainte (instalatorul poate întârzia), la instalatorul la care stă aparatul în stoc.
// Propunerea e doar o bifă pusă pe ecran; trecerea pe firmă o faci tu, în Dispozitive → Neasignate.
const ZILE_POTRIVIRE_MONTAJ = 2;
// Montajul la care se potrivește un aparat, sau null când nu se poate spune sigur.
//   aparat = { imei, zi }          — ziua în care a început să transmită;
//   stoc   = { stare, partener_id } — unde e în stocul nostru (null dacă nu e acolo);
//   lucrari = [{ id, company_id, company_name, partener_id, partener_nume, zi, status, masini }].
// Mai bine nicio propunere decât una greșită: la două firme posibile, sau când stocul spune alt instalator decât cel
// din calendar, nu se propune nimic.
function propuneFirma(aparat, stoc, lucrari) {
  const cu = function (l) { return _zileIntre(l.zi, aparat.zi); };
  const aproape = (lucrari || []).filter(function (l) {
    if (!l || l.company_id == null || !l.zi) return false;
    // O lucrare „de programat" n-are încă o zi hotărâtă: nu spune unde s-a montat ceva.
    if (l.status !== 'programat' && STARI_MONTATE.indexOf(l.status) < 0) return false;
    const z = cu(l);
    return z >= 0 && z <= ZILE_POTRIVIRE_MONTAJ;
  });
  const alese = (stoc && stoc.partener_id != null)
    ? aproape.filter(function (l) { return l.partener_id === stoc.partener_id; })
    : aproape;
  const firme = {};
  alese.forEach(function (l) { firme[l.company_id] = true; });
  if (Object.keys(firme).length !== 1) return null;
  return alese.slice().sort(function (a, b) { return cu(a) - cu(b) || (Number(b.masini) || 0) - (Number(a.masini) || 0); })[0];
}
// Aparatele noi, pe loturi: unul pe fiecare firmă propusă, plus unul „fără firmă", la urmă.
function grupeazaAparateNoi(aparate, stocDupaImei, lucrari) {
  const grupuri = {}, ordine = [];
  (aparate || []).forEach(function (a) {
    const l = propuneFirma(a, (stocDupaImei || {})[a.imei] || null, lucrari);
    const k = l ? 'c' + l.company_id : 'fara';
    if (!grupuri[k]) {
      grupuri[k] = {
        company_id: l ? l.company_id : null, company_name: l ? (l.company_name || null) : null,
        partener_id: l && l.partener_id != null ? l.partener_id : null, partener_nume: l ? (l.partener_nume || null) : null,
        lucrare_id: l ? l.id : null, zi_lucrare: l ? l.zi : null, masini: l ? (Number(l.masini) || 0) : 0, imeis: []
      };
      ordine.push(k);
    }
    grupuri[k].imeis.push(a.imei);
  });
  return ordine.sort(function (x, y) { return (x === 'fara') - (y === 'fara'); }).map(function (k) { return grupuri[k]; });
}
// Textul anunțului. o = { n, firma, instalator, ziLucrare, azi, sursa, nuTransmit }:
//   sursa 'semnal'     — aplicația a văzut aparatele transmițând (azi);
//   sursa 'instalator' — raportul instalatorului (partea lui Robert): firma și instalatorul sunt știute.
function anuntAparateNoi(o) {
  const n = Math.max(0, Math.floor(Number(o && o.n) || 0));
  const nu = Math.max(0, Math.floor(Number(o && o.nuTransmit) || 0));
  const firma = (o && o.firma) || null, inst = (o && o.instalator) || null;
  const unu = n === 1;
  const gasesti = n
    ? (unu ? 'Îl găsești la Dispozitive → Neasignate: apasă aici și e deja bifat' : 'Le găsești la Dispozitive → Neasignate: apasă aici și sunt deja bifate') +
      (firma ? ', cu firma aleasă. Verifici și apeși „Trece pe firmă".' : '. Alegi firma și apeși „Trece pe firmă".')
    : '';
  const deCe = n ? (unu ? ' Până atunci clientul nu-l vede, iar abonamentul lui nu pornește.' : ' Până atunci clientul nu le vede, iar abonamentul lor nu pornește.') : '';
  if (o && o.sursa === 'instalator') {
    const tot = n + nu;
    const titlu = (inst || 'Instalatorul') + ' a montat ' + _cate(tot, 'aparat', 'aparate') + (firma ? ' la ' + firma : '');
    const lipsa = !nu ? '' : !n
      ? 'Niciunul nu transmite încă: apar la Dispozitive → Neasignate când pornesc, și atunci primești alt anunț.'
      : ' ' + (nu === 1 ? 'Unul nu transmite încă: apare acolo când pornește.' : _cate(nu, 'aparat', 'aparate') + ' nu transmit încă: apar acolo când pornesc.');
    return { titlu: titlu, corp: (gasesti + deCe + lipsa).trim() };
  }
  const titlu = (unu ? 'Un aparat nou transmite' : _cate(n, 'aparat nou', 'aparate noi') + ' transmit') + (firma ? ' — ' + firma : '');
  let unde = '';
  if (firma) {
    const z = (o.ziLucrare && o.azi) ? _zileIntre(o.ziLucrare, o.azi) : 0;
    const cand = z <= 0 ? 'Azi e programat' : z === 1 ? 'Ieri a fost programat' : 'Pe ' + _zzll(_ziMs(o.ziLucrare)) + ' a fost programat';
    unde = cand + ' montajul la ' + firma + (inst ? ' (' + inst + ')' : '') + '. ';
  } else {
    unde = 'Nu e niciun montaj în calendar, azi sau în ultimele ' + _cate(ZILE_POTRIVIRE_MONTAJ, 'zi', 'zile') + ', care să ' + (unu ? 'i se potrivească' : 'li se potrivească') + '. ';
  }
  return { titlu: titlu, corp: unde + gasesti + deCe };
}

// ─── Factura montajului, în ritmul instalatorului (Alin, 30.09) ──────────────────────────────────
// „Dacă instalatorul ne facturează săptămânal, automat și noi tot săptămânal… dacă ne facturează la lună, facturăm și
// noi la lună — ca să nu fim pe pierdere. Depinde mult de instalator." DOAR la montaj: abonamentul rămâne lunar.
// Ritmul stă pe fișa instalatorului (implicit lunar). O lucrare montată devine „de facturat" când se ÎNCHEIE perioada
// ei — săptămâna (luni–duminică) sau luna calendaristică —, iar lucrările unui client din perioadele încheiate merg pe
// o singură factură. Lucrările fără instalator (făcute de noi) merg lunar.
const RITMURI = { lunar: 'lunar', saptamanal: 'săptămânal' };
const FACTURARE_RITM = { lunar: 'facturare lunară', saptamanal: 'facturare săptămânală' };
function ritmFacturare(v) { return v === 'saptamanal' ? 'saptamanal' : 'lunar'; }
// Perioada în care cade ziua `zi`: { ritm, de, pana (inclusiv), gataDin (ziua de după), eticheta }.
function perioadaFacturare(zi, ritm) {
  const t = _ziMs(zi);
  if (ritmFacturare(ritm) === 'saptamanal') {
    const de = t - ((new Date(t).getUTCDay() + 6) % 7) * ZI_MS;   // lunea
    const pana = de + 6 * ZI_MS;                                  // duminica
    const eticheta = new Date(de).getUTCFullYear() !== new Date(pana).getUTCFullYear() ? _zzllaa(de) + '–' + _zzllaa(pana)
      : new Date(de).getUTCMonth() !== new Date(pana).getUTCMonth() ? _zzll(de) + '–' + _zzllaa(pana)
        : String(new Date(de).getUTCDate()).padStart(2, '0') + '–' + _zzllaa(pana);
    return { ritm: 'saptamanal', de: _zi(de), pana: _zi(pana), gataDin: _zi(pana + ZI_MS), eticheta: eticheta };
  }
  const d = new Date(t), y = d.getUTCFullYear(), m = d.getUTCMonth();
  const de = Date.UTC(y, m, 1), urm = Date.UTC(y, m + 1, 1);
  return { ritm: 'lunar', de: _zi(de), pana: _zi(urm - ZI_MS), gataDin: _zi(urm), eticheta: LUNI[m] + ' ' + y };
}
// Ce e de facturat clientului din montaj, în ziua `azi`. `lucrari` = cele MONTATE și încă nefacturate clientului,
// cu prețul lor și ritmul instalatorului: [{ id, company_id, company_name, partener_nume, ritm, zi, total_client, masini }].
// → { gata: [pe firmă], inCurs: [pe firmă] }; o firmă = { company_id, company_name, lucrari: [id], total, masini,
//    perioade: [{ de, pana, eticheta, ritm, instalator }], gataDin, ultimaPerioada, text }.
function deFacturatMontaj(lucrari, azi) {
  const gata = {}, inCurs = {};
  (lucrari || []).forEach(function (l) {
    if (!l || l.company_id == null || !l.zi || !(Number(l.total_client) > 0)) return;
    const p = perioadaFacturare(l.zi, l.ritm);
    const tinta = String(azi) >= p.gataDin ? gata : inCurs;
    const k = String(l.company_id);
    const g = tinta[k] || (tinta[k] = { company_id: l.company_id, company_name: l.company_name || null, lucrari: [], total: 0, masini: 0, perioade: [], gataDin: null, ultimaPerioada: null });
    g.lucrari.push(l.id);
    g.total = Math.round((g.total + Number(l.total_client)) * 100) / 100;
    g.masini += Math.floor(Number(l.masini) || 0);
    const inst = l.partener_nume || null;
    if (!g.perioade.some(function (x) { return x.de === p.de && x.ritm === p.ritm && x.instalator === inst; })) {
      g.perioade.push({ de: p.de, pana: p.pana, eticheta: p.eticheta, ritm: p.ritm, instalator: inst });
    }
    if (!g.gataDin || p.gataDin < g.gataDin) g.gataDin = p.gataDin;
    if (!g.ultimaPerioada || p.pana > g.ultimaPerioada) g.ultimaPerioada = p.pana;
  });
  const lista = function (o, inLucru) {
    return Object.keys(o).map(function (k) { return o[k]; }).map(function (g) {
      g.perioade.sort(function (a, b) { return a.de < b.de ? -1 : a.de > b.de ? 1 : 0; });
      g.lucrari.sort(function (a, b) { return a - b; });
      const cine = g.masini ? _cate(g.masini, 'mașină montată', 'mașini montate') : 'Lucrări de montaj';
      const cand = g.perioade.map(function (p) { return p.eticheta + ' (' + [p.instalator, FACTURARE_RITM[p.ritm]].filter(Boolean).join(' · ') + ')'; });
      g.text = cine + ' în ' + (cand.length === 1 ? cand[0] : cand.slice(0, -1).join(', ') + ' și ' + cand[cand.length - 1]) +
        (inLucru ? ' — se facturează de pe ' + _zzllaa(_ziMs(g.gataDin)) : '');
      return g;
    }).sort(function (a, b) { return String(a.company_name || '').localeCompare(String(b.company_name || ''), 'ro'); });
  };
  return { gata: lista(gata, false), inCurs: lista(inCurs, true) };
}
// Anunțul către noi: o firmă are montaj de facturat. Aceleași cuvinte ca rândul din Facturare.
function anuntMontajDeFacturat(g) {
  return { titlu: 'Montaj de facturat: ' + (g.company_name || ('firma #' + g.company_id)),
    corp: g.text + ' — ' + _bani(g.total) + ' lei fără TVA. Apasă aici: factura e pregătită, cu lucrările puse. O verifici („Previzualizează") și apeși „Emite factura".' };
}

// ─── Calendarul, refăcut (Alin, 01.10: „când selectăm o zi aș vrea să se deschidă un meniu… cum mă înțeleg cu
//     instalatorul că poate instala în ziua respectivă, să știm și noi dacă are disponibilitate clientul") ───
// O zi programată poartă două confirmări, vorbite la telefon: a instalatorului și a clientului. Până face Robert contul
// instalatorului le bifăm noi; după, „Accept" din contul lui o bifează pe a lui, iar „Refuz" anulează lucrarea cu
// motivul „instalatorul nu poate". O lucrare ANULATĂ nu dispare: rămâne în istoric, cu motivul, iar mașinile ei se
// întorc singure la „de programat" (deProgramat nu numără starea `anulat`).
const STARE_ANULAT = 'anulat';
// Doar două motive (Alin, 01.10: „ajung cele două"). Amănuntele se scriu alături, ca text.
const MOTIVE_ANULARE = { instalator: 'Instalatorul nu poate', client: 'Clientul nu poate (mașinile nu sunt disponibile)' };
function _ts(v) { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null; }
// Culoarea zilei în calendar: verde = au confirmat amândoi, galben = mai lipsește cel puțin o confirmare. Doar pentru
// o lucrare încă programată; una montată sau anulată n-are ce confirma.
function stareConfirmare(l) {
  if (!l || l.status !== 'programat') return null;
  return _ts(l.confirmat_instalator_la) && _ts(l.confirmat_client_la) ? 'confirmat' : 'de_confirmat';
}
function textConfirmare(l) {
  const i = !!_ts(l && l.confirmat_instalator_la), c = !!_ts(l && l.confirmat_client_la);
  if (i && c) return 'confirmat de instalator și de client';
  if (i) return 'lipsește confirmarea clientului';
  if (c) return 'lipsește confirmarea instalatorului';
  return 'neconfirmat încă';
}
// Cât are deja fiecare instalator în fiecare zi (lucrările programate sau montate; cele anulate nu țin pe nimeni ocupat).
// lucrari = [{ zi, partener_id, status, masini, company_name }] → { 'AAAA-LL-ZZ': { '<partener_id>': { masini, clienti } } }
function incarcarePeZile(lucrari) {
  const out = {};
  (lucrari || []).forEach(function (l) {
    if (!l || !l.zi || l.partener_id == null) return;
    if (l.status !== 'programat' && STARI_MONTATE.indexOf(l.status) < 0) return;
    const z = out[l.zi] || (out[l.zi] = {});
    const p = z[l.partener_id] || (z[l.partener_id] = { masini: 0, clienti: [] });
    p.masini += _n(l.masini);
    if (l.company_name && p.clienti.indexOf(l.company_name) < 0) p.clienti.push(l.company_name);
  });
  return out;
}
// „liber în ziua asta" / „are deja 6 mașini (Logistic Nord SRL)" — lângă numele instalatorului, în fereastra zilei.
function textIncarcare(x) {
  if (!x || !(x.masini > 0)) return 'liber în ziua asta';
  return 'are deja ' + _cate(x.masini, 'mașină', 'mașini') + (x.clienti && x.clienti.length ? ' (' + x.clienti.join(', ') + ')' : '');
}
// Numele scurt al unui aparat, cum îl spune instalatorul: „FMC130", „LV-CAN200".
function numeScurt(k) { const e = echipament(k); return e ? e.et.replace(/^(Teltonika|Modul)\s+/, '') : String(k || ''); }
// Ce aparate ale contractului merg la fiecare fel de lucrare pe mașină: la „gps" trackerele din contract (vândute în
// Anexa nr. 2 sau închiriate), la „lvcan" modulul LV-CAN200. CAN-ul încorporat și priza FMS nu cer un aparat în plus.
function aparatePeTip(anexa2, annex) {
  const a2 = _obj(anexa2) || {}, an = _obj(annex) || {};
  const are = {};
  ((a2.echipamente || {}).items || []).forEach(function (r) { if (r && _n(r.buc) > 0) are[r.tip] = true; });
  (((an.chirie || {}).aparate) || []).forEach(function (r) { if (r && _n(r.cant || r.buc) > 0) are[r.tip] = true; });
  return {
    gps: ECHIPAMENTE.filter(function (e) { return e.transmite && are[e.k]; }).map(function (e) { return e.k; }),
    lvcan: are.lvcan200 ? ['lvcan200'] : [], caninc: [], fms: []
  };
}
function _lista(bucati) { return bucati.length <= 1 ? (bucati[0] || '') : bucati.slice(0, -1).join(', ') + ' și ' + bucati[bucati.length - 1]; }
// Nota de stoc din fereastra zilei: ce are instalatorul la el și ce trebuie să-i mai duci pentru ziua aleasă.
//   cate   = { gps: 6, lvcan: 6 } (ce se montează în ziua aceea);
//   aparate = aparatePeTip(...) (ce aparate merg la fiecare fel);
//   stoc   = { fmc130: 6, lvcan200: 4 } (bucățile din stoc aflate „la instalator", la el).
// La mai multe modele de tracker în același contract (FMC130 și FMC650) nu se știe care mașină ce primește: se
// numără trackerele lor împreună.
function notaStoc(cate, aparate, stoc, arePartener) {
  if (!arePartener) return { text: 'Alege instalatorul ca să vezi ce aparate are la el din stoc.', lipsa: [] };
  const s = stoc || {}, c = cate || {}, ap = aparate || {};
  const areTxt = Object.keys(s).filter(function (k) { return _n(s[k]) > 0; }).sort().map(function (k) { return _n(s[k]) + ' × ' + numeScurt(k); });
  const lipsa = [];
  ['gps', 'lvcan'].forEach(function (t) {
    const modele = ap[t] || [], trebuie = Math.floor(_n(c[t]));
    if (!modele.length || !trebuie) return;
    const are = modele.reduce(function (x, k) { return x + _n(s[k]); }, 0);
    if (are < trebuie) lipsa.push({ tip: t, modele: modele, n: trebuie - are, text: (trebuie - are) + ' × ' + modele.map(numeScurt).join(' / ') });
  });
  const are = areTxt.length ? 'Are la el din stoc ' + _lista(areTxt) : 'N-are la el niciun aparat din stoc';
  if (lipsa.length) return { text: are + (areTxt.length ? ': mai trebuie să-i duci ' : ': trebuie să-i duci ') + _lista(lipsa.map(function (x) { return x.text; })) + '.', lipsa: lipsa };
  if (!['gps', 'lvcan'].some(function (t) { return (ap[t] || []).length && Math.floor(_n(c[t])) > 0; })) return { text: are + '.', lipsa: [] };
  return { text: are + ': ajunge pentru ziua asta.', lipsa: [] };
}
// Rândul din istoric: ce s-a întâmplat cu o zi de montaj. l = lucrarea (cu `anulat_de_nume`, `reprogramat_zi` 'AAAA-LL-ZZ').
function textIstoric(l) {
  if (!l) return { text: '', detaliu: '' };
  if (l.status === STARE_ANULAT) {
    const m = MOTIVE_ANULARE[l.motiv_anulare];
    const bucati = [];
    if (l.detalii_anulare) bucati.push('„' + String(l.detalii_anulare).trim() + '”');
    // `anulat_zi` = ziua anulării pe ora României ('AAAA-LL-ZZ'), pusă de server; regula nu știe de fusuri orare.
    const cand = l.anulat_zi ? _zzll(_ziMs(l.anulat_zi)) : null;
    bucati.push('anulată' + (l.anulat_de_nume ? ' de ' + l.anulat_de_nume : '') + (cand ? ', pe ' + cand : ''));
    if (l.reprogramat_zi) bucati.push('reprogramată pe ' + _zzll(_ziMs(l.reprogramat_zi)));
    return { text: 'Anulată — ' + (m ? m.charAt(0).toLowerCase() + m.slice(1).replace(/ \(.*\)$/, '') : 'fără motiv'), detaliu: bucati.join(' · '), anulata: true };
  }
  if (STARI_MONTATE.indexOf(l.status) >= 0) {
    return { text: 'Montată — ' + _cate(_n(l.masini), 'mașină', 'mașini'), detaliu: ETICHETE_STARE[l.status] && l.status !== 'executat' ? ETICHETE_STARE[l.status] : '', anulata: false };
  }
  return { text: ETICHETE_STARE[l.status] || String(l.status || ''), detaliu: '', anulata: false };
}

module.exports = {
  STARE_ANULAT, MOTIVE_ANULARE, stareConfirmare, textConfirmare, incarcarePeZile, textIncarcare, numeScurt, aparatePeTip, notaStoc, textIstoric,
  TIPURI, CHEI, STARI, ETICHETE_STARE, ECHIPAMENTE, CHEI_ECHIP,
  tip, echipament, randuri, randuriEchip, calc,
  facAnexaMontaj, facAnexaEchip, facAnexaCosturiUnice, pretDinOferta,
  PE_MASINA, STARI_PROGRAMATE, STARI_MONTATE, deProgramat, lucrareaZilei, scaleazaLaMontate,
  transmite, esteImei, seriiFaraImei,
  ZILE_POTRIVIRE_MONTAJ, propuneFirma, grupeazaAparateNoi, anuntAparateNoi,
  RITMURI, FACTURARE_RITM, ritmFacturare, perioadaFacturare, deFacturatMontaj, anuntMontajDeFacturat
};
