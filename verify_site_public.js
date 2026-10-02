// verify_site_public.js — site-ul public de pe ratrack.ro: ce citește Google și ce vede un vizitator (02.10).
//
// Fără server: citește paginile din public/ și lista lor din server.js (PAGINI_PUBLICE, singura listă).
// Cu server (BASE, cum îl pornește ci-smoke.js): harta site-ului, adresele „frumoase", redirecționările
// de la vechile adrese cu „.html" și robots.txt.
//
// Ce păzește, pe scurt:
//  - fiecare pagină are titlu, descriere, adresă canonică, un singur titlu mare (h1), fontul casei (Nunito),
//    iconiță și bannerul de cookie-uri;
//  - data din harta site-ului (`modificat`) se schimbă când se schimbă TEXTUL paginii (prin `amprenta`);
//  - întrebările din datele pentru Google sunt IDENTICE cu cele de pe pagină (un răspuns „pentru Google"
//    diferit de cel pentru om e exact ce se sancționează);
//  - nicio pagină nu mai trimite la adresa veche cu „.html", iar pagina principală le leagă pe toate;
//  - textele au diacritice (titlurile paginii principale erau „Monitorizeaza-ti flota in timp real");
//  - cifra rapoartelor de pe pagina principală se NUMĂRĂ din catalog, ca pe hârtia ofertei.
'use strict';
const fs = require('fs');
const crypto = require('crypto');
const vm = require('vm');

const BASE = (process.env.BASE || '').replace(/\/+$/, '');
const SITE = 'https://ratrack.ro';
let trecute = 0, picate = 0;
function check(cond, msg) { if (cond) trecute++; else { picate++; console.log('  ✗ ' + msg); } }
const citeste = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

// ── Lista paginilor, din server.js ──────────────────────────────────────────────────────────────────
const SRV = citeste('server.js');
const mLista = SRV.match(/\nconst PAGINI_PUBLICE = (\[[\s\S]*?\n\]);/);
check(!!mLista, 'server.js: nu găsesc lista PAGINI_PUBLICE');
const PAGINI = mLista ? vm.runInNewContext(mLista[1]) : [];
check(PAGINI.length >= 7, 'PAGINI_PUBLICE are ' + PAGINI.length + ' pagini (așteptam cel puțin 7)');
check(new Set(PAGINI.map(p => p.cale)).size === PAGINI.length, 'PAGINI_PUBLICE: o adresă apare de două ori');

// ── Unelte de citit HTML ────────────────────────────────────────────────────────────────────────────
const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', copy: '©', hellip: '…', ndash: '–', mdash: '—', laquo: '«', raquo: '»', rarr: '→', larr: '←' };
function decodeaza(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (t, e) => {
    if (e[0] === '#') return String.fromCodePoint(/^#x/i.test(e) ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    const v = ENT[e.toLowerCase()];
    return v != null ? v : t;
  });
}
// Textul pe care-l vede omul. Etichetele din interiorul rândului (b, a, span…) se scot fără spațiu, ca
// „(<a>politica</a>)" să rămână „(politica)"; celelalte despart cuvinte.
function faraMarcaj(html) {
  return decodeaza(String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/?(?:b|i|a|span|strong|em|time|abbr|small|code|sup|sub|mark)\b[^>]*>/gi, '')
    .replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}
const corpul = (html) => (html.match(/<body\b[^>]*>([\s\S]*)<\/body>/i) || [null, ''])[1];
const titlul = (html) => decodeaza((html.match(/<title>([\s\S]*?)<\/title>/i) || [null, ''])[1]).trim();
const meta = (html, nume) => {
  const m = html.match(new RegExp('<meta (?:name|property)="' + nume + '" content="([^"]*)"', 'i'));
  return m ? decodeaza(m[1]) : null;
};
const canonica = (html) => (html.match(/<link rel="canonical" href="([^"]*)"/i) || [null, null])[1];
// Amprenta textului: titlul, descrierea și ce se vede pe pagină. Marcajul și stilurile nu contează —
// o culoare schimbată nu e „o pagină actualizată".
const amprenta = (html) => crypto.createHash('sha1')
  .update(titlul(html) + '\n' + (meta(html, 'description') || '') + '\n' + faraMarcaj(corpul(html)))
  .digest('hex').slice(0, 12);
function dateGoogle(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)].map(x => {
    try { return JSON.parse(x[1]); } catch (e) { return { _eroare: e.message }; }
  });
}
function cautaTip(obiecte, tip) {
  const rez = [];
  for (const o of obiecte) {
    if (!o || typeof o !== 'object') continue;
    if (o['@type'] === tip) rez.push(o);
    if (Array.isArray(o['@graph'])) rez.push(...cautaTip(o['@graph'], tip));
  }
  return rez;
}
// Întrebările de pe pagină: <details><summary><h2|h3>Întrebarea</h2></summary><p>…</p>…</details>
function intrebariPePagina(body) {
  const rez = [];
  const re = /<details\b[^>]*>\s*<summary>\s*<h([23])\b[^>]*>([\s\S]*?)<\/h\1>\s*<\/summary>([\s\S]*?)<\/details>/gi;
  let m;
  while ((m = re.exec(body))) {
    const p = [...m[3].matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)].map(x => faraMarcaj(x[1]));
    rez.push({ q: faraMarcaj(m[2]), a: p.join(' ') });
  }
  return rez;
}

// Cuvinte care, scrise fără diacritice, sunt greșite oricum le-ai citi. NU sunt aici cele care pot fi
// corecte și fără (flota = „the fleet", sa = „his/her", oferta = „the offer", a intra, a verifica,
// o notificare, pana de curent).
// ⚠ Granița de cuvânt e scrisă de mână, cu litere Unicode: `\b` din JavaScript socotește „ș" și „ă"
// semne de punctuație, deci ar fi găsit „in" în mijlocul lui „mașină".
const LIT = '[\\p{L}\\p{N}_]';
const cuvinte = (lista) => new RegExp('(?<!' + LIT + ')(' + lista + ')(?!' + LIT + ')', 'iu');
const FARA_DIACRITICE = cuvinte('si|in|iti|intr|cand|fara|dupa|asa|cateva|catre|masina|masini|masinile|masinii|sofer|soferi|soferul|soferii|soferilor|aplicatie|aplicatia|aplicatii|functii|functie|agenti|agentii|notificari|integrari|alimentari|estimari|locatie|romania|mentenanta|evidenta|interfata|confidentialitate|detectie|tau|esti|primesti|urmareste|actualizeaza|saptamana|fisa|incarci|citeste|monitorizeaza|supravegheaza|lucreaza|conteaza|intrebi|raspunde|asteapta|livreaza|calculeaza|detecteaza|anunta|urmeaza|depasirile|bifeaza|incearca|intrerupta|verificam|contactam');
const CUVANTUL_IN = cuvinte('in');
const atribute = (html) => [...html.matchAll(/\s(?:alt|placeholder|aria-label|title)="([^"]*)"/gi)].map(x => decodeaza(x[1]));
// Șirurile omenești din scripturile paginii (mesajele formularului): cel puțin două cuvinte.
function siruriDinScripturi(html) {
  const rez = [];
  for (const s of html.matchAll(/<script(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const m of s[1].matchAll(/'((?:[^'\\\n]|\\.)*)'/g)) if (/[a-zăâîșț]{2,}\s+[a-zăâîșț]{2,}/i.test(m[1])) rez.push(m[1]);
  }
  return rez;
}

// ── Găsite pe 02.10, în afara lucrului cerut, și NEREPARATE încă ────────────────────────────────────
// Regula casei (Alin, 01.10): ce găsesc pe drum NU repar pe tăcute și NU las deoparte pe tăcute — întreb.
// Corecturile sunt gata, pe ramura locală `seo-corecturi`. Cât un rând stă aici, verificarea lui doarme,
// iar proba îl tipărește la fiecare rulare. Când se hotărăște, scoate rândul: verificarea pornește.
const DE_HOTARAT = {};
for (const t of Object.values(DE_HOTARAT)) console.log('  ⓘ de hotărât (02.10): ' + t);

// ── 1. Fiecare pagină ───────────────────────────────────────────────────────────────────────────────
const azi = new Date().toISOString().slice(0, 10);
const HTML = {};
for (const p of PAGINI) {
  const f = 'public/' + p.fisier;
  const exista = fs.existsSync(f);
  check(exista, p.cale + ': lipsește fișierul ' + f);
  if (!exista) continue;
  const html = HTML[p.cale] = citeste(f);
  const body = corpul(html);
  const canon = SITE + (p.cale === '/' ? '/' : p.cale);

  check(/<html lang="ro">/.test(html), p.cale + ': lipsește <html lang="ro">');
  const t = titlul(html);
  check(t.length >= 20 && t.length <= 70, p.cale + ': titlul are ' + t.length + ' caractere (20–70): „' + t + '"');
  const d = meta(html, 'description') || '';
  check(d.length >= 70 && d.length <= 230, p.cale + ': descrierea are ' + d.length + ' caractere (70–230)');
  check(canonica(html) === canon, p.cale + ': adresa canonică e ' + canonica(html) + ', nu ' + canon);
  const og = meta(html, 'og:url');
  check(og == null || og === canon, p.cale + ': og:url (' + og + ') diferă de adresa canonică');
  check(!/<meta name="robots" content="[^"]*noindex/i.test(html), p.cale + ': pagina e marcată noindex');
  const h1 = (body.match(/<h1\b/gi) || []).length;
  check(h1 === 1, p.cale + ': are ' + h1 + ' titluri <h1> (trebuie exact unul)');
  check(html.includes('https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800'), p.cale + ': nu încarcă fontul Nunito (regula casei)');
  check(/<link rel="icon"[^>]*href="\/icon\.svg"/.test(html), p.cale + ': lipsește iconița (/icon.svg)');
  if (!(p.cale === '/intrebari-frecvente' && DE_HOTARAT.faqBanner)) {
    check(html.includes('<script src="/js/consent.js"></script>'), p.cale + ': lipsește bannerul de cookie-uri (/js/consent.js) — e pe toate paginile publice');
  }

  // Data din harta site-ului urmează textul.
  check(/^\d{4}-\d{2}-\d{2}$/.test(p.modificat || '') && !isNaN(Date.parse(p.modificat)), p.cale + ': `modificat` nu e o dată AAAA-LL-ZZ');
  check((p.modificat || '') <= azi, p.cale + ': `modificat` (' + p.modificat + ') e în viitor');
  const a = amprenta(html);
  check(p.amprenta === a, p.cale + ': textul paginii s-a schimbat. În PAGINI_PUBLICE (server.js) pune modificat: \'' + azi +
    '\' și amprenta: \'' + a + '\'' + (/Ultima actualizare/.test(html) && !DE_HOTARAT.dataLegala ? ', iar pe pagină „Ultima actualizare" cu aceeași zi' : '') + '.');
  const ua = html.match(/Ultima actualizare: <time datetime="(\d{4}-\d{2}-\d{2})">(\d{2})\.(\d{2})\.(\d{4})<\/time>/);
  if (/Ultima actualizare/.test(html) && !DE_HOTARAT.dataLegala) {
    check(!!ua, p.cale + ': „Ultima actualizare" trebuie scrisă ca <time datetime="AAAA-LL-ZZ">ZZ.LL.AAAA</time> — nu ziua de azi, din browser');
    if (ua) {
      check(ua[1] === p.modificat, p.cale + ': „Ultima actualizare" (' + ua[1] + ') diferă de `modificat` din PAGINI_PUBLICE (' + p.modificat + ')');
      check(ua[4] + '-' + ua[3] + '-' + ua[2] === ua[1], p.cale + ': data scrisă pe pagină diferă de cea din datetime');
    }
  }

  // Datele pentru Google: JSON valid; întrebările, identice cu pagina.
  const dg = dateGoogle(html);
  dg.forEach((o, i) => check(!o._eroare, p.cale + ': datele structurate nr. ' + (i + 1) + ' nu sunt JSON valid (' + o._eroare + ')'));
  const peP = intrebariPePagina(body);
  const faq = cautaTip(dg, 'FAQPage');
  if (p.cale === '/intrebari-frecvente' && DE_HOTARAT.faqDateGoogle) {
    // Până se hotărăște: măcar fiecare întrebare din date să fie, cuvânt cu cuvânt, pe pagină.
    const lista = faq[0] && Array.isArray(faq[0].mainEntity) ? faq[0].mainEntity : [];
    check(faq.length === 1 && lista.length > 0, p.cale + ': lipsesc datele întrebărilor pentru Google');
    lista.forEach((q) => check(peP.some(x => x.q === q.name), p.cale + ': întrebarea „' + q.name + '" din datele pentru Google nu e pe pagină'));
  } else if (peP.length || faq.length) {
    check(faq.length === 1, p.cale + ': are întrebări pe pagină, dar ' + faq.length + ' blocuri FAQPage (trebuie unul)');
    const lista = faq[0] && Array.isArray(faq[0].mainEntity) ? faq[0].mainEntity : [];
    check(lista.length === peP.length, p.cale + ': ' + peP.length + ' întrebări pe pagină, ' + lista.length + ' în datele pentru Google');
    lista.forEach((q, i) => {
      const pe = peP[i] || {};
      check(q.name === pe.q, p.cale + ': întrebarea ' + (i + 1) + ' diferă: „' + q.name + '" ≠ „' + pe.q + '"');
      const r = q.acceptedAnswer && q.acceptedAnswer.text;
      check(r === pe.a, p.cale + ': răspunsul ' + (i + 1) + ' („' + String(pe.q).slice(0, 40) + '…") diferă de cel de pe pagină');
    });
  }

  // Diacriticele.
  const vazut = faraMarcaj(body) + ' ' + t + ' ' + d + ' ' + atribute(html).join(' ');
  const g = vazut.match(FARA_DIACRITICE);
  check(!g, p.cale + ': text fără diacritice („' + (g && g[0]) + '"): …' + (g ? vazut.slice(Math.max(0, g.index - 40), g.index + 40) : '') + '…');
  for (const s of siruriDinScripturi(html)) {
    // „in" e și cuvânt de JavaScript; în șirurile din scripturi nu-l căutăm.
    const gs = s.replace(new RegExp(CUVANTUL_IN.source, 'giu'), '').match(FARA_DIACRITICE);
    check(!gs, p.cale + ': mesaj fără diacritice într-un script: „' + s + '"');
  }

  // Legăturile: înapoi la pagina principală.
  if (p.cale !== '/') check(/href="\/"/.test(html), p.cale + ': nu are legătură înapoi la pagina principală');
}

// ── 2. Legăturile între pagini ──────────────────────────────────────────────────────────────────────
const acasa = HTML['/'] || '';
for (const p of PAGINI) if (p.cale !== '/') check(acasa.includes('href="' + p.cale + '"'), 'pagina principală nu are legătură spre ' + p.cale + ' (Google o găsește mai greu, omul deloc)');
// Nicio legătură nu mai duce la adresa veche cu „.html" (merge, dar prin redirecționare).
const UNDE = ['public/js/consent.js', 'public/index.html', 'mobile/src/screens/Menu.tsx'].concat(PAGINI.map(p => 'public/' + p.fisier));
for (const f of UNDE) {
  if (!fs.existsSync(f)) continue;
  const s = citeste(f);
  for (const p of PAGINI) {
    const re = new RegExp('["\'/]' + p.fisier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\'?#]');
    const vechi = '/' + p.fisier;
    check(!(re.test(s) && s.includes(vechi)), f + ': trimite încă la ' + vechi + ' — folosește ' + p.cale);
  }
}

// ── 3. Cifra rapoartelor de pe pagina principală se numără din catalog ──────────────────────────────
// Aceeași regulă ca pe hârtia ofertei (report_export.js → _nRapoarte): rotunjit în JOS la zece. Cât prima
// pagină e „de hotărât" (DE_HOTARAT.primaPagina: scrie „14+" și „32 de tipuri"), se cere doar să nu
// promită mai multe rapoarte decât are catalogul.
const nRap = Object.keys(require('./reports.js').REPORTS || {}).length;
const zeci = Math.floor(nRap / 10) * 10;
const mErou = acasa.match(/<div class="num"><span>(\d+)\+<\/span><\/div>\s*<div class="lbl">tipuri de rapoarte<\/div>/);
check(!!mErou, 'pagina principală: nu găsesc cifra „N+ tipuri de rapoarte"');
const mEticheta = acasa.match(/<span class="tag">(?:Peste )?(\d+) de tipuri<\/span>/);
check(!!mEticheta, 'pagina principală: nu găsesc eticheta „… de tipuri" de la Rapoarte');
if (DE_HOTARAT.primaPagina) {
  if (mErou) check(+mErou[1] <= nRap, 'pagina principală promite „' + mErou[1] + '+ tipuri de rapoarte"; catalogul are doar ' + nRap);
  if (mEticheta) check(+mEticheta[1] <= nRap, 'eticheta de la Rapoarte promite ' + mEticheta[1] + ' de tipuri; catalogul are doar ' + nRap);
} else {
  if (mErou) check(+mErou[1] === zeci, 'pagina principală scrie „' + mErou[1] + '+ tipuri de rapoarte"; catalogul are ' + nRap + ' → scrie „' + zeci + '+"');
  if (mEticheta) check(/Peste \d+ de tipuri/.test(mEticheta[0]) && +mEticheta[1] === zeci, 'eticheta de la Rapoarte: catalogul are ' + nRap + ' → „Peste ' + zeci + ' de tipuri"');
}

// ── 3b. Cifrele și faptele scrise pe pagini, legate de regula din cod ──────────────────────────────
// Paginile spun DOAR ce face aplicația azi (verificat în cod pe 02.10). Fiecare cifră scrisă de mână are
// aici sursa ei: schimbi regula și uiți pagina → proba pică și spune ce rând să schimbi.
const C = require('./contracts.js');
const AG = citeste('agents.js');
const DBJS = citeste('db.js');
const IX = citeste('public/index.html');
const MT = require('./maint_types.js');
const num = (src, re) => { const m = src.match(re); return m ? +m[1] : NaN; };
const blocAlerte = (IX.match(/const ALERT_TYPES = \[([\s\S]*?)\n\s*\];/) || [null, ''])[1];
const nAlerte = (blocAlerte.match(/\{ v:'/g) || []).length;
const nLucrari = (MT.WORK || []).length;
const watchOrar = /setInterval\(runAgentsWorker, 60 \* 60 \* 1000\)/.test(SRV);
const LEGATE = [
  // [pagina, textul exact de pe pagină, e încă adevărat în cod?, unde se uită, (rândul din DE_HOTARAT care îl ține adormit)]
  ['/', '— 16 tipuri, cu pragurile tale', nAlerte === 16, 'ALERT_TYPES din public/index.html are ' + nAlerte + ' tipuri', 'primaPagina'],
  ['/', 'RA Watch verifică flota în fiecare oră', watchOrar, 'runAgentsWorker din server.js nu mai rulează din oră în oră', 'primaPagina'],
  ['/', '<span class="dot"></span> La fiecare oră</span>', watchOrar, 'runAgentsWorker din server.js nu mai rulează din oră în oră', 'primaPagina'],
  ['/intrebari-frecvente', 'Istoricul pozițiilor se păstrează <b>12 luni</b>', C.LUNI_ISTORIC_INCLUSE === 12, 'LUNI_ISTORIC_INCLUSE din contracts.js e ' + C.LUNI_ISTORIC_INCLUSE, 'faqPastrare'],
  ['/intrebari-frecvente', 'aveți <b>30 de zile</b> să ne cereți datele', C.ZILE_DATE_DUPA_INCETARE === 30, 'ZILE_DATE_DUPA_INCETARE din contracts.js e ' + C.ZILE_DATE_DUPA_INCETARE, 'faqPastrare'],
  ['/alerte-itp-rca-rovinieta', 'implicit cu <b>30 de zile</b> înainte de expirare', num(SRV, /const DOC_DAYS_LEAD = (\d+);/) === 30, 'DOC_DAYS_LEAD din server.js'],
  ['/alerte-itp-rca-rovinieta', 'implicit e de 30 de zile', num(SRV, /const DOC_DAYS_LEAD = (\d+);/) === 30, 'DOC_DAYS_LEAD din server.js'],
  ['/alerte-itp-rca-rovinieta', 'între 1 și 365 de zile', /\{ k: 'docDaysLead', min: 1, max: 365,/.test(SRV), 'limitele docDaysLead din ALERT_THRESHOLD_SPECS (server.js)'],
  ['/alerte-itp-rca-rovinieta', 'cu <b>14 zile</b> înainte la lucrările pe dată', num(SRV, /const MAINT_DAYS_LEAD = (\d+);/) === 14, 'MAINT_DAYS_LEAD din server.js'],
  ['/alerte-itp-rca-rovinieta', 'cu <b>500 km</b> înainte la cele pe kilometri', num(SRV, /const MAINT_KM_LEAD = (\d+);/) === 500, 'MAINT_KM_LEAD din server.js'],
  ['/alerte-itp-rca-rovinieta', '16 tipuri de lucrări', nLucrari === 16, 'maint_types.js are ' + nLucrari + ' lucrări'],
  ['/agenti-ai', 'RA Watch verifică flota singur, în fiecare oră', watchOrar, 'runAgentsWorker din server.js nu mai rulează din oră în oră'],
  ['/agenti-ai', 'nu mai transmit de peste o oră', num(AG, /const OFFLINE_MIN = (\d+);/) === 60, 'OFFLINE_MIN din agents.js'],
  ['/agenti-ai', 'ralantiul de peste două ore', num(AG, /const IDLE_MIN_MINUTES = (\d+);/) === 120, 'IDLE_MIN_MINUTES din agents.js'],
  ['/agenti-ai', 'cel mult 4h30 fără o pauză de 45 de minute și 9 ore pe zi', /CONT_LIMIT_MIN = 270, DAILY_LIMIT_MIN = 540/.test(AG) && /segmentTrack\(pts, 45 \* 60\)/.test(AG), 'limitele din raCompliance (agents.js)'],
  ['/agenti-ai', 'o oprire de cel puțin 45 de minute e socotită pauză', /segmentTrack\(pts, 45 \* 60\)/.test(AG), 'pauza din raCompliance (agents.js)'],
  ['/agenti-ai', 'reapare abia după 12 ore', /if \(ageH < 12\) return null;/.test(DBJS), 'fereastra din createAgentFinding (db.js)'],
];
for (const [cale, t, adevarat, unde, doarme] of LEGATE) {
  if (doarme && DE_HOTARAT[doarme]) continue;
  const html = HTML[cale] || '';
  check(html.includes(t), cale + ': nu mai găsesc pe pagină „' + t + '" — dacă ai schimbat textul, schimbă-l și în verify_site_public.js');
  check(adevarat, cale + ': pagina scrie „' + t.replace(/<[^>]+>/g, '') + '", dar regula din cod s-a schimbat (' + unde + '). Schimbă textul paginii.');
}

// ── 4. Pe serverul pornit ───────────────────────────────────────────────────────────────────────────
(async () => {
  if (!BASE) {
    console.log('  (fără BASE: am sărit verificările pe server)');
  } else {
    for (const p of PAGINI) {
      const r = await fetch(BASE + p.cale, { redirect: 'manual' });
      const txt = await r.text();
      check(r.status === 200, 'GET ' + p.cale + ' → ' + r.status + ' (aștept 200)');
      check(/text\/html/.test(r.headers.get('content-type') || ''), 'GET ' + p.cale + ': nu e HTML');
      check(txt.includes('<link rel="canonical" href="' + SITE + (p.cale === '/' ? '/' : p.cale) + '"'), 'GET ' + p.cale + ': nu e pagina potrivită (altă adresă canonică)');
      const v = await fetch(BASE + '/' + p.fisier + '?din=proba', { redirect: 'manual' });
      check(v.status === 301, 'GET /' + p.fisier + ' → ' + v.status + ' (aștept 301 spre ' + p.cale + ')');
      check(v.headers.get('location') === p.cale + '?din=proba', 'GET /' + p.fisier + ' duce la ' + v.headers.get('location') + ', nu la ' + p.cale + '?din=proba');
    }
    const sm = await (await fetch(BASE + '/sitemap.xml')).text();
    const url = [...sm.matchAll(/<url>\s*<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map(m => ({ loc: m[1], lastmod: m[2] }));
    check(url.length === PAGINI.length, 'sitemap.xml are ' + url.length + ' adrese, lista are ' + PAGINI.length);
    for (const p of PAGINI) {
      const u = url.find(x => x.loc.endsWith(p.cale === '/' ? '/' : p.cale) && new URL(x.loc).pathname === p.cale);
      check(!!u, 'sitemap.xml: lipsește ' + p.cale);
      if (u) check(u.lastmod === p.modificat, 'sitemap.xml: ' + p.cale + ' are lastmod ' + u.lastmod + ', nu ' + p.modificat + ' (data textului)');
    }
    const rb = await (await fetch(BASE + '/robots.txt')).text();
    check(/^Sitemap: \S+\/sitemap\.xml$/m.test(rb), 'robots.txt: lipsește rândul Sitemap');
    check(!/^Disallow: \/\s*$/m.test(rb), 'robots.txt: blochează tot site-ul');
    for (const p of PAGINI) {
      if (p.cale === '/') continue;
      const blocat = [...rb.matchAll(/^Disallow: (\S+)/gm)].some(m => p.cale.startsWith(m[1]));
      check(!blocat, 'robots.txt: ' + p.cale + ' e blocată');
    }
  }
  console.log((picate ? '✗ ' : '✓ ') + 'site public: ' + trecute + ' verificări trecute, ' + picate + ' picate');
  // `exitCode`, nu `process.exit()`: pe Windows, o ieșire forțată cu conexiuni fetch încă deschise
  // crapă în libuv (cod 127) — și o probă trecută ar părea picată. Procesul se închide singur.
  process.exitCode = picate ? 1 : 0;
})().catch(e => { console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); process.exitCode = 1; });
