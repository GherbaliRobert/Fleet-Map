// sold_ai.js — banii pentru AI, la zi, pentru NOI (fondatorii). Alin, 04.11: „aveți sold de x bani, la zi, cât avem și când ajung
// clienții să consume 80% din plafon… să avem control total pe tokeni și bani, după ce schimbă Robert cheile" + „1. da" (anunțurile la
// 14 / 7 / 3 zile, alarma pe loc, un singur loc pentru sold) + „2. da" (reîncărcarea automată la Anthropic).
//
// Trei lucruri:
//   1. SOLDUL de la Anthropic, scris de noi într-un singur loc („RA Insight · control"; Anthropic nu-l dă printr-o cerere). Aplicația
//      scade singură ce s-a cheltuit de atunci: pe fiecare zi încheiată, cea mai mare dintre cifra Anthropic (cheia de administrare) și
//      socoteala aplicației — soldul nu iese niciodată mai mare decât e —, iar azi socoteala aplicației (Anthropic dă cifra doar pe zile
//      încheiate). Cu reîncărcarea automată pornită la Anthropic („sub 5 $ cumpără 20 $"), aplicația pune și ea cei 20 $ când soldul ar
//      trece sub 5 $, ca să nu ne sperie degeaba.
//   2. ANUNȚURILE dinainte, pentru noi (în aplicație și pe telefon): soldul la 14, 7 și 3 zile, soldul terminat; firma care trece de 80%
//      și de 100% din întrebările lunii.
//   3. ALARMA pe loc: Anthropic refuză cererile (creditul terminat, limita de cheltuieli, cheia respinsă, contul oprit). Noi aflăm în
//      aceeași clipă; clientul primește răspunsuri pe butoane, cu un text fără cauză (nu-i spunem că s-a terminat creditul).
//
// Curat: primește cifrele adunate de server și întoarce textele gata scrise. Nu citește baza, nu cheamă nimic.
'use strict';
const { numar } = require('./contracts');
const { lei, dolari, ora, zz } = require('./azi_la_noi');

const PRAGURI_ZILE = [14, 7, 3];      // anunțul dinainte: când soldul mai ajunge atâtea zile (o dată pe prag și pe soldul scris)
const ZILE_ROSU = 3;                  // de la 3 zile în jos, roșu; până la 14, portocaliu
const PROCENT_INTREBARI = 80;         // firma care a folosit atât din întrebările lunii ne anunță (și la 100%)
const PAUZA_ALARMA_MS = 6 * 3600000;  // „Anthropic refuză": cel mult un anunț la 6 ore pe același fel
const RITM_ZILE = 7;                  // cheltuiala pe zi = media ultimelor 7 zile
const ZI_MS = 86400000;

// ─── Refuzul: ce a spus Anthropic ─────────────────────────────────────────────────────────────────────────────────────
// Felul refuzului, după răspunsul API-ului (codul + textul). null = altceva (prea multe cereri, serverul lor ocupat, o cerere
// greșită) — astea trec singure și nu ne anunță. Creditul terminat vine ca 400 „Your credit balance is too low…", limita de
// cheltuieli ca „You have reached your specified API usage limits…", cheia greșită ca 401.
function felRefuz(status, text) {
  const t = String(text || '');
  if (/credit balance (is )?too low|insufficient (credit|balance|funds)|purchase (more )?credits/i.test(t)) return 'credit';
  if (/usage limits?|spend(ing)? limit|reached your (specified|monthly)/i.test(t)) return 'limita';
  if (Number(status) === 401 || /authentication_error|invalid x-api-key|invalid api key/i.test(t)) return 'cheie';
  if (/(organization|account) (has been |is )?(disabled|suspended|deactivated)/i.test(t)) return 'cont';
  return null;
}
const REFUZ = {
  credit: { titlu: 'Anthropic refuză întrebările: creditul s-a terminat', scurt: 'Anthropic refuză întrebările: creditul s-a terminat.',
    ceFaci: 'Cumpărați credite din contul Anthropic (Settings → Billing), apoi scrieți soldul nou în RA Insight · control.' },
  limita: { titlu: 'Anthropic refuză întrebările: limita de cheltuieli', scurt: 'Anthropic refuză întrebările: s-a atins limita de cheltuieli pusă în contul Anthropic.',
    ceFaci: 'Ridicați limita din contul Anthropic (Settings → Limits).' },
  cheie: { titlu: 'Anthropic nu primește cheia aplicației', scurt: 'Anthropic nu primește cheia aplicației.',
    ceFaci: 'Puneți în Railway cheia bună (ANTHROPIC_API_KEY). După o schimbare de chei, cea veche nu mai merge.' },
  cont: { titlu: 'Anthropic a oprit contul', scurt: 'Anthropic a oprit contul.',
    ceFaci: 'Intrați în contul Anthropic și vedeți de ce (Settings → Billing).' },
};
const PE_BUTOANE = 'Până se rezolvă, clienții primesc răspunsuri pe butoane.';
function textRefuz(fel) { return REFUZ[fel] || REFUZ.credit; }

// Ce vede CLIENTUL când Anthropic refuză: fără cauză (nu-i spunem că s-a terminat creditul) și fără să-l trimitem undeva.
const TEXT_CLIENT = 'Întrebările libere nu merg acum; echipa RA Track a fost anunțată și se ocupă. ' +
  'Până atunci răspund la întrebările de pe butoane: unde e o mașină, km, staționări, rapoarte.';
const TEXT_REZUMAT = 'Rezumatul cu RA Insight nu merge acum; echipa RA Track a fost anunțată. Iată cifrele de bază ale raportului:';
const TEXT_POZA = 'Citirea pozelor nu merge acum; echipa RA Track a fost anunțată. Completează câmpurile de mână sau încarcă actul ca PDF cu text.';

// „azi, 14:20" / „3 noiembrie, 14:20": când a început ceva, pe ora României (formatatoarele ținute minte de azi_la_noi).
function _cand(ms, acum) { return (zz(ms) === zz(acum) ? 'azi' : zz(ms)) + ', ' + ora(ms); }
// „~5 zile" / „mai puțin de o zi".
function _catZile(z) { return Number(z) > 0 ? '~' + numar(z, 'zi', 'zile') : 'mai puțin de o zi'; }

// ─── Soldul: ce s-a cheltuit de la scrierea lui ───────────────────────────────────────────────────────────────────────
// Zilele sunt pe UTC ('AAAA-LL-ZZ'), ca la Anthropic. `noi` / `real` = { zi: usd } — socoteala aplicației (de la clipa scrierii, deci
// prima zi e doar partea de după scriere) și cifra Anthropic (zilele încheiate; null = n-o avem). Ziua scrierii și azi: socoteala
// aplicației. O zi încheiată: cea mai mare dintre cele două (Anthropic întârzie uneori cu o zi; contul poate fi folosit și din afară).
function ziUtc(ms) { return new Date(Number(ms) || 0).toISOString().slice(0, 10); }
function cheltuitDeLa(o) {
  const ziLa = ziUtc(o.la), azi = ziUtc(o.acum), noi = o.noi || {}, real = o.real || null;
  const zile = Array.from(new Set(Object.keys(noi).concat(real ? Object.keys(real) : []))).filter(function (z) { return z >= ziLa && z <= azi; });
  let usd = 0, dinAnthropic = false;
  zile.forEach(function (z) {
    const n = Number(noi[z]) || 0;
    if (z === ziLa || z === azi || !real || !(z in real)) { usd += n; return; }
    dinAnthropic = true;
    usd += Math.max(n, Number(real[z]) || 0);
  });
  return { usd: usd, dinAnthropic: dinAnthropic };
}
// Cheltuiala pe zi: media ultimelor 7 zile — cea mai mare dintre socoteala aplicației (7 × 24 de ore până acum) și cifra Anthropic
// pe ultimele 7 zile încheiate.
function ritmPeZi(o) {
  const noi = Math.max(0, Number(o.noi7) || 0) / RITM_ZILE;
  if (!o.real) return noi;
  const azi = ziUtc(o.acum), de = ziUtc(Number(o.acum) - RITM_ZILE * ZI_MS);
  const real = Object.keys(o.real).filter(function (z) { return z >= de && z < azi; }).reduce(function (s, z) { return s + (Number(o.real[z]) || 0); }, 0) / RITM_ZILE;
  return Math.max(noi, real);
}
// Soldul de acum, din ce s-a scris și ce s-a cheltuit de atunci. Cu reîncărcarea automată (`reinc` = { sub, cumpara }): de câte ori
// soldul ar fi trecut sub `sub`, Anthropic a cumpărat `cumpara` — aplicația le pune și ea, ca să nu anunțe un sold terminat.
// Întoarce { usd, scris, la, cheltuit, dinAnthropic, peZi, zile, ritmZile, reincarcari, reincarcare } — zile = null fără cheltuieli
// (sau cu reîncărcarea pornită: nu se termină).
function sold(o) {
  const scris = Math.max(0, Number(o.scris) || 0), la = Number(o.la) || 0;
  const ch = cheltuitDeLa({ la: la, acum: o.acum, noi: o.noiPeZi, real: o.realPeZi });
  const r = o.reincarcare && Number(o.reincarcare.cumpara) > 0 ? { sub: Math.max(0, Number(o.reincarcare.sub) || 0), cumpara: Number(o.reincarcare.cumpara) } : null;
  let ramas = scris - ch.usd, n = 0;
  if (r && ramas < r.sub) { n = Math.ceil((r.sub - ramas) / r.cumpara); ramas += n * r.cumpara; }
  ramas = Math.max(0, ramas);
  const peZi = ritmPeZi({ acum: o.acum, noi7: o.noi7, real: o.realPeZi });
  const doi = function (x) { return Math.round(x * 100) / 100; };
  return {
    usd: doi(ramas), scris: doi(scris), la: la || null, cheltuit: doi(ch.usd), dinAnthropic: ch.dinAnthropic,
    peZi: Math.round(peZi * 10000) / 10000, zile: !r && peZi > 0 ? Math.floor(ramas / peZi) : null, ritmZile: RITM_ZILE,
    reincarcari: n, reincarcare: r,
  };
}

// Pragul de anunț atins acum: 14 / 7 / 3 (zile rămase), 0 (terminat) sau null. Cu reîncărcarea automată: niciunul (se reîncarcă singur;
// dacă plata pică, ne anunță alarma refuzului).
function pragSold(s) {
  if (!s || s.reincarcare) return null;
  if (!(Number(s.usd) > 0)) return 0;
  if (s.zile == null) return null;
  for (let i = PRAGURI_ZILE.length - 1; i >= 0; i--) if (s.zile <= PRAGURI_ZILE[i]) return PRAGURI_ZILE[i];
  return null;
}
// Cheile anunțurilor deja trimise pentru soldul scris acum (`la`): pragul atins și cele de deasupra lui (o scădere direct la 3 zile
// nu mai anunță după aceea „14 zile", când cheltuiala scade).
function cheiSold(s, prag) {
  const toate = [0].concat(PRAGURI_ZILE.slice().reverse());   // 0, 3, 7, 14
  return toate.filter(function (p) { return prag === 0 ? true : (p >= prag); }).map(function (p) { return s.la + '|' + p; });
}
function anuntSold(s, prag, leiPeDolar) {
  const cum = ' Cumpărați credite din contul Anthropic (Settings → Billing), apoi scrieți soldul nou în RA Insight · control.';
  if (prag === 0) return { nivel: 'critical', titlu: 'Creditul Anthropic s-a terminat',
    text: 'După socoteala aplicației, din ' + dolari(s.scris) + ' scriși pe ' + zz(s.la) + ' nu a mai rămas nimic. Când Anthropic începe să refuze, RA Insight răspunde clienților doar pe butoane.' + cum };
  return { nivel: prag <= ZILE_ROSU ? 'critical' : 'warning', titlu: 'Creditul Anthropic mai ajunge ' + _catZile(s.zile),
    text: 'Mai sunt ~' + dolari(s.usd) + _inLei(s.usd, leiPeDolar) + ', la cheltuiala de acum (~' + dolari(s.peZi) + ' pe zi).' + cum };
}
function _inLei(usd, k) { return Number(k) > 0 ? ' (≈ ' + lei(Number(usd) * k) + ')' : ''; }

// ─── Întrebările clienților: firmele aproape de capătul lunii ─────────────────────────────────────────────────────────
// `lista` = firmele cu pachet cu AI: { id, name, nume (pachetul), folosite, intrebari }. Procentul, rotunjit ca bara din tabel.
function firmeAproape(lista) {
  return (lista || []).filter(function (f) { return f && Number(f.intrebari) > 0; })
    .map(function (f) { return Object.assign({}, f, { pct: Math.round((Number(f.folosite) || 0) / Number(f.intrebari) * 100) }); })
    .filter(function (f) { return f.pct >= PROCENT_INTREBARI; })
    .sort(function (a, b) { return b.pct - a.pct || String(a.name).localeCompare(String(b.name), 'ro'); });
}
function pragIntrebari(f) { return f.pct >= 100 ? 100 : (f.pct >= PROCENT_INTREBARI ? PROCENT_INTREBARI : null); }
function _dinCate(f) { return (Number(f.folosite) || 0) + ' din ' + numar(f.intrebari, 'întrebare', 'întrebări'); }
function anuntIntrebari(f) {
  if (pragIntrebari(f) === 100) return { nivel: 'warning', titlu: 'RA Insight: ' + f.name + ' și-a terminat întrebările lunii',
    text: _dinCate(f) + ' (pachet ' + f.nume + '). Până pe 1 răspunde doar pe butoane.' };
  return { nivel: 'info', titlu: 'RA Insight: ' + f.name + ' a folosit ' + f.pct + '% din întrebările lunii',
    text: _dinCate(f) + ' (pachet ' + f.nume + '). La 100%, RA Insight trece pe butoane până pe 1.' };
}
// Rândurile din „Ce cere atenție" (RA Insight · control): firmele între 80% și 99% (cele de la 100% le arată deja rândul „întrebările
// lunii s-au terminat").
function atentieIntrebari(lista) {
  return firmeAproape(lista).filter(function (f) { return f.pct < 100; }).map(function (f) {
    return { ton: 'warn', id: f.id, t: '**' + f.name + '** a folosit ' + f.pct + '% din întrebările lunii (' + _dinCate(f) + ', pachet ' + f.nume + '). La 100% trece pe butoane până pe 1.' };
  });
}

// ─── Alarma refuzului: anunțul și închiderea ei ───────────────────────────────────────────────────────────────────────
// `r` = { fel, la, ultimaLa, refuzate } (starea ținută de server).
function anuntRefuz(r, acum) {
  const t = textRefuz(r.fel);
  return { nivel: 'critical', titlu: t.titlu, text: t.scurt + ' De la ' + _cand(r.la, acum) + '. ' + t.ceFaci + ' ' + PE_BUTOANE };
}
function anuntRevenire(r, acum) {
  return { nivel: 'info', titlu: 'RA Insight răspunde din nou cu AI',
    text: 'Anthropic primește iar cererile (de la ' + _cand(acum, acum) + '). Refuzate între timp: ' + numar(r.refuzate || 0, 'cerere', 'cereri') + ', de la ' + _cand(r.la, acum) + '.' };
}

// ─── Banda de pe „Acasă" (sub cele patru cifre) ───────────────────────────────────────────────────────────────────────
// o = { cheie: bool, refuz, sold, firme (din firmeAproape), leiPeDolar, acum }. Mereu la vedere; roșie / portocalie când e ceva de
// făcut. Un clic duce în „RA Insight · control".
const _NIV = { ok: 0, b: 1, w: 2, r: 3 };
function _maiRau(a, b) { return (_NIV[b] || 0) > (_NIV[a] || 0) ? b : a; }
function randSold(o) {
  const s = o.sold, k = o.leiPeDolar;
  if (!o.cheie) return { nivel: 'r', text: '**Cheia Anthropic nu e pusă pe server.** RA Insight răspunde clienților doar pe butoane, iar asistentul nostru doar pe loc.' };
  if (o.refuz) {
    const t = textRefuz(o.refuz.fel), n = Number(o.refuz.refuzate) || 0;
    return { nivel: 'r', text: '**' + t.scurt + '** De la ' + _cand(o.refuz.la, o.acum) + (n ? ', ' + numar(n, 'cerere refuzată', 'cereri refuzate') : '') + '. ' + t.ceFaci + ' ' + PE_BUTOANE };
  }
  if (!s) return { nivel: 'w', text: '**Soldul Anthropic nu e scris.** Scrieți-l în RA Insight · control, ca aplicația să vă anunțe înainte să se termine.' };
  if (!(Number(s.usd) > 0)) return { nivel: 'r', text: '**Soldul Anthropic s-a terminat**, după socoteala aplicației (din ' + dolari(s.scris) + ' scriși pe ' + zz(s.la) + '). Dacă ați cumpărat credite, scrieți soldul nou.' };
  let text = '**Sold Anthropic, la zi: ~' + dolari(s.usd) + '**' + _inLei(s.usd, k);
  if (s.reincarcare) return { nivel: 'ok', text: text + ' · se reîncarcă singur, cu ' + dolari(s.reincarcare.cumpara) + ', când scade sub ' + dolari(s.reincarcare.sub) + (Number(s.peZi) > 0 ? ' · cheltuiala de acum: ~' + dolari(s.peZi) + ' pe zi' : '') + '.' };
  if (s.zile == null) return { nivel: 'ok', text: text + ' · fără cheltuieli în ultimele ' + numar(s.ritmZile || RITM_ZILE, 'zi', 'zile') + '.' };
  text += ' · ajunge ' + _catZile(s.zile) + ', la ~' + dolari(s.peZi) + ' pe zi.';
  const p = pragSold(s);
  if (p == null) return { nivel: 'ok', text: text };
  return { nivel: s.zile <= ZILE_ROSU ? 'r' : 'w', text: text + ' Cumpărați credite din contul Anthropic (Settings → Billing).' };
}
function randFirme(firme) {
  const l = firme || [];
  if (!l.length) return null;
  const f = l[0], gata = l.filter(function (x) { return x.pct >= 100; });
  const nivel = gata.length ? 'w' : 'b';
  if (l.length === 1) {
    return { nivel: nivel, text: '**Întrebările clienților:** ' + f.name + (f.pct >= 100 ? ' și-a terminat întrebările lunii (' + _dinCate(f) + ', pachet ' + f.nume + '); până pe 1 răspunde pe butoane.'
      : ' a folosit ' + f.pct + '% din întrebările lunii (' + _dinCate(f) + ', pachet ' + f.nume + ').') };
  }
  return { nivel: nivel, text: '**Întrebările clienților:** ' + numar(l.length, 'firmă', 'firme') + ' au trecut de ' + PROCENT_INTREBARI + '% din întrebările lunii' +
    (gata.length ? ' (' + (gata.length === 1 ? 'una și-a' : gata.length + ' și-au') + ' terminat întrebările)' : '') + '; cea mai aproape: ' + f.name + ' (' + f.pct + '%).' };
}
function banda(o) {
  const r = [randSold(o), randFirme(o.firme)].filter(Boolean);
  const nivel = r.reduce(function (a, x) { return _maiRau(a, x.nivel); }, 'ok');
  return { nivel: nivel, randuri: r, buton: 'RA Insight · control', tinta: { fel: 'sectiune', tab: 'agents' } };
}

// ─── „RA Insight · control": cartonașul soldului și blocul „Anthropic, la zi" ─────────────────────────────────────────
function cartonas(s) {
  if (!s) return { cifra: '—', sub: 'nescris' };
  const din = s.la ? 'din ' + dolari(s.scris) + ' scriși pe ' + zz(s.la) : '';
  const cat = s.reincarcare ? 'se reîncarcă singur' : (!(Number(s.usd) > 0) ? 's-a terminat' : (s.zile != null ? 'ajunge ' + _catZile(s.zile) : 'fără cheltuieli în ultimele ' + numar(s.ritmZile || RITM_ZILE, 'zi', 'zile')));
  return { cifra: '~' + dolari(s.usd), sub: [cat, din].filter(Boolean).join(' · ') };
}
// Tokenii: „1,2 mil." / „180.000".
function tokeni(n) {
  const x = Math.max(0, Math.round(Number(n) || 0));
  if (x >= 1e6) return (Math.round(x / 1e5) / 10).toString().replace('.', ',') + ' mil.';
  return String(x).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
// Pe ce s-au dus banii (felurile din ai_usage). Un fel necunoscut își păstrează numele.
const FELURI = {
  insight: 'Întrebările clienților (RA Insight)', chat: 'Întrebările clienților (telefonul vechi)', report: '„Rezumă cu RA Insight”',
  agents: 'Rezumatul agenților', asistent: 'Asistentul nostru', docscan: 'Actele citite din poză', proba_modele: 'Proba modelelor',
  sursa_externa: 'Căutările „Sursă externă”', scrisoare: 'Scrisoarea de luni (scoasă pe 04.11)',
};
// o = { sold, refuz, cheie, okLa, adminCheie, eroareAnthropic, luna: { anthropic, noi }, peFel: [{ kind, calls, input_tokens, output_tokens,
//       cache_read_tokens, cache_write_tokens, cautari, cost_usd }], ultimAnunt: { titlu, la } | null, leiPeDolar, acum }
function panou(o) {
  const s = o.sold, k = o.leiPeDolar, acum = o.acum, R = [];
  let alarma = null;
  if (!o.cheie) alarma = { titlu: 'Cheia Anthropic nu e pusă pe server', text: 'RA Insight răspunde clienților doar pe butoane.', ceFaci: 'Puneți cheia în Railway (ANTHROPIC_API_KEY).' };
  else if (o.refuz) {
    const t = textRefuz(o.refuz.fel);
    alarma = { titlu: t.titlu, text: 'De la ' + _cand(o.refuz.la, acum) + ', ' + numar(o.refuz.refuzate || 0, 'cerere refuzată', 'cereri refuzate') +
      (o.refuz.ultimaLa ? ' (ultima: ' + _cand(o.refuz.ultimaLa, acum) + ')' : '') + '. ' + PE_BUTOANE, ceFaci: t.ceFaci };
  }
  if (s) {
    R.push({ k: 'Sold, la zi', v: '~' + dolari(s.usd) + _inLei(s.usd, k), ton: !(s.usd > 0) || (s.zile != null && s.zile <= ZILE_ROSU) ? 'bad' : (pragSold(s) != null ? 'warn' : ''),
      s: (s.la ? 'din ' + dolari(s.scris) + ' scriși pe ' + zz(s.la) + ', la ' + ora(s.la) + '; ' : '') + 'cheltuit de atunci: ~' + dolari(s.cheltuit) +
        (s.reincarcari ? '; cu ' + numar(s.reincarcari, 'reîncărcare automată', 'reîncărcări automate') + ' de ' + dolari(s.reincarcare.cumpara) : '') });
    R.push({ k: 'Cât mai ajunge', v: s.reincarcare ? 'se reîncarcă singur' : (!(Number(s.usd) > 0) ? 's-a terminat' : (s.zile != null ? _catZile(s.zile) : '—')),
      s: (Number(s.peZi) > 0 ? '~' + dolari(s.peZi) + ' pe zi (media ultimelor ' + numar(s.ritmZile || RITM_ZILE, 'zi', 'zile') + ')' : 'fără cheltuieli în ultimele ' + numar(s.ritmZile || RITM_ZILE, 'zi', 'zile')) +
        (s.reincarcare ? '; Anthropic cumpără ' + dolari(s.reincarcare.cumpara) + ' când soldul scade sub ' + dolari(s.reincarcare.sub) : '') });
  } else R.push({ k: 'Sold, la zi', v: 'nescris', ton: 'warn', s: 'Scrieți soldul din contul Anthropic (Settings → Billing): de acolo încolo aplicația scade singură ce se cheltuie.' });
  R.push({ k: 'De unde vin cifrele', v: o.adminCheie && !o.eroareAnthropic ? 'Anthropic + aplicația' : 'aplicația',
    s: o.adminCheie ? (o.eroareAnthropic ? 'Cifra Anthropic n-a venit (' + String(o.eroareAnthropic).slice(0, 160) + '); până atunci, socoteala aplicației.'
      : 'Pe zilele încheiate, cea mai mare dintre cifra Anthropic și socoteala aplicației; azi, socoteala aplicației (Anthropic dă cifra a doua zi).')
      : 'Socoteala aplicației, după tokenii fiecărei cereri. Cu cheia de administrare Anthropic în Railway (ANTHROPIC_ADMIN_KEY) am vedea și cifra lor.' });
  const lu = o.luna || {};
  R.push({ k: 'Luna asta', v: lu.anthropic != null ? dolari(lu.anthropic) + ' (Anthropic)' : dolari(lu.noi || 0),
    s: lu.anthropic != null ? 'socoteala aplicației: ' + dolari(lu.noi || 0) + (lu.anthropic > (Number(lu.noi) || 0) * 1.1 + 0.5 ? '; diferența poate veni din folosirea contului Anthropic în afara aplicației' : '')
      : 'după socoteala aplicației' + _inLei(lu.noi || 0, k) });
  const t = (o.peFel || []).reduce(function (a, x) {
    a.in += Number(x.input_tokens) || 0; a.out += Number(x.output_tokens) || 0; a.cr += Number(x.cache_read_tokens) || 0; a.cw += Number(x.cache_write_tokens) || 0; a.c += Number(x.cautari) || 0; return a;
  }, { in: 0, out: 0, cr: 0, cw: 0, c: 0 });
  R.push({ k: 'Tokeni luna asta', v: tokeni(t.in) + ' citiți · ' + tokeni(t.out) + ' scriși',
    s: tokeni(t.cr) + ' citiți din cache (de 10 ori mai ieftini) · ' + tokeni(t.cw) + ' puși în cache' + (t.c ? ' · ' + numar(t.c, 'căutare', 'căutări') + ' pe internet' : '') });
  R.push({ k: 'Cheia', v: !o.cheie ? 'lipsește' : (o.refuz ? 'refuzată' : 'merge'), ton: !o.cheie || o.refuz ? 'bad' : '',
    s: !o.cheie ? 'fără cheie, nicio cerere nu pleacă spre Anthropic' : (o.refuz ? textRefuz(o.refuz.fel).scurt : (o.okLa ? 'Anthropic a răspuns ultima dată ' + _cand(o.okLa, acum).replace(/^azi, /, 'azi la ') : 'încă nicio cerere de la pornire')) +
      '; aplicația o verifică la pornire și din oră în oră' });
  R.push({ k: 'Anunțurile', v: 'la 14, 7 și 3 zile', s: 'pe telefon și în aplicație, la fondatori: soldul, firmele la 80% și la 100% din întrebări și, pe loc, orice refuz al lui Anthropic' +
    (o.ultimAnunt ? '. Ultimul: „' + o.ultimAnunt.titlu + '”, ' + _cand(o.ultimAnunt.la, acum) : '') });
  const peFel = (o.peFel || []).filter(function (x) { return Number(x.cost_usd) > 0 || Number(x.calls) > 0; })
    .sort(function (a, b) { return (Number(b.cost_usd) || 0) - (Number(a.cost_usd) || 0); })
    .map(function (x) { return { nume: FELURI[x.kind] || String(x.kind || 'altele'), cost: dolari(x.cost_usd), cereri: numar(x.calls, 'cerere', 'cereri'),
      tokeni: tokeni((Number(x.input_tokens) || 0) + (Number(x.cache_read_tokens) || 0) + (Number(x.cache_write_tokens) || 0)) + ' / ' + tokeni(x.output_tokens) }; });
  return { alarma: alarma, randuri: R, peFel: peFel, titluPeFel: 'Pe ce s-au dus banii luna asta (socoteala aplicației)', reincarcare: s ? s.reincarcare : null,
    nota: 'Soldul se scrie într-un singur loc, aici. Reîncărcarea automată se pornește în contul Anthropic (Settings → Billing → Auto-reload); dacă e pornită, spuneți-o și aici, ca aplicația să nu anunțe degeaba un sold terminat.' };
}

module.exports = {
  PRAGURI_ZILE, ZILE_ROSU, PROCENT_INTREBARI, PAUZA_ALARMA_MS, RITM_ZILE, REFUZ, FELURI,
  TEXT_CLIENT, TEXT_REZUMAT, TEXT_POZA, PE_BUTOANE,
  felRefuz, textRefuz, ziUtc, cheltuitDeLa, ritmPeZi, sold, pragSold, cheiSold, anuntSold,
  firmeAproape, pragIntrebari, anuntIntrebari, atentieIntrebari, anuntRefuz, anuntRevenire,
  randSold, randFirme, banda, cartonas, tokeni, panou,
};
