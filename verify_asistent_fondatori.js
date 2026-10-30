// verify_asistent_fondatori.js — asistentul fondatorilor, etapa 1, pasul 1 (macheta „tot un chat", Alin, 30.10: „1. da, 2. da,
// 3. da"): pe verticala Fondator, „Acasă" e chatul asistentului; primul mesaj = salutul, cele 4 cifre de azi (aceleași ca pe
// cartonașele vechi) și „Azi la noi" (pe reguli, cel mult 5 rânduri, în ordinea hotărâtă). Bula verde de pe verticala Fondator
// duce acolo. Clientul nu vede nimic nou.
//
//   node verify_asistent_fondatori.js                 (regula + pagina + culorile + serverul pornit)
//   node verify_asistent_fondatori.js --fara-server
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

// Pregătirea: o factură ÎNTÂRZIATĂ, pusă direct în baza probei ÎNAINTE de pornirea serverului — pe ușa de azi scadența o pune
// serverul (azi + termenul firmei), deci una trecută nu se poate face, iar serverul nu are (și nu trebuie să aibă) o ușă pentru
// asta. Rulată de proba însăși, ca proces separat, pe același dosar de bază (ca verify_reparatii_lista.js).
if (process.argv.indexOf('--faza=seed') >= 0) {
  process.env.TZ = 'UTC';
  (async () => {
    const db = require('./db');
    await db.initDb();
    const co = (await db.pool.query("INSERT INTO companies (name, slug) VALUES ('Trans Expres SRL', 'trans-expres') RETURNING id")).rows[0].id;
    const acum = Date.now(), ZI = 86400000, scadenta = acum - 12 * ZI - 3600000, an = new Date(acum).getUTCFullYear();
    await db.createInvoice({ companyId: co, series: 'RAT', number: 950, year: an, fullNumber: 'RAT-' + an + '-00950', type: 'invoice', status: 'issued',
      issueDate: scadenta - 15 * ZI, dueDate: scadenta, periodStart: scadenta - 45 * ZI, periodEnd: scadenta - 15 * ZI,
      subtotal: 1025.49, vatAmount: 215.35, total: 1240.84, lines: [{ desc: 'Abonament monitorizare GPS', qty: 1, unitPrice: 1025.49, net: 1025.49 }] });
    // Soldul Anthropic (30.10, Alin: „da acum"): 20 $ scriși acum 20 de zile. Cheltuieli pe Haiku 4.5 (1 $ la un milion de
    // tokeni intrați): 5 $ ÎNAINTE de scriere (nu se scad), 3 $ acum 15 zile și 3,5 $ acum 3 zile (se scad) → rămân 13,50 $;
    // ritmul ultimelor 7 zile = 3,5 $ ÷ 7 = 0,50 $ pe zi → 27 de zile. Socoteala veche spunea 20 $.
    await db.setSetting('anthropic_sold', JSON.stringify({ usd: 20, la: acum - 20 * ZI }));
    for (const [zile, tokeni] of [[25, 5000000], [15, 3000000], [3, 3500000]]) {
      await db.pool.query("INSERT INTO ai_usage (company_id, kind, model, input_tokens, output_tokens, created_at) VALUES (NULL, 'proba_modele', 'claude-haiku-4-5', $1, 0, NOW() - make_interval(days => $2))", [tokeni, zile]);
    }
    console.log('SEED ' + JSON.stringify({ co, an }));
    await db.closeDb();
    process.exit(0);
  })().catch((e) => { console.log('SEED-EROARE ' + ((e && e.stack) || e)); process.exit(1); });
  return;
}

const A = require('./azi_la_noi');
let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + String(d).slice(0, 500) : '')); } };
const sect = (s) => console.log('\n' + s);
const P = (f) => path.join(__dirname, f);
const citeste = (f) => fs.readFileSync(P(f), 'utf8').replace(/\r\n/g, '\n');

sect('1. Regula „Azi la noi" (azi_la_noi.js)');
const ACUM = Date.parse('2026-10-30T06:05:00Z');   // vineri, 08:05 pe ora României
const ZI = 86400000, ORA = 3600000;
const F = (o) => Object.assign({ companyId: 3, firma: 'Trans Expres', numar: 'RAT-2026-0142', totalRon: 1240, zileIntarziere: 12, zilePanaLaOprire: 3 }, o || {});
let r = A.randuri({ acum: ACUM, nume: 'Alin Tilvar' });
T('fără nimic de văzut: zero rânduri și „totul e în regulă"', r.randuri.length === 0 && r.deVazut === 0 && r.deVazutText === 'totul e în regulă', JSON.stringify(r));
T('ziua din bara de sus, pe ora României', r.zi === 'Vineri, 30 octombrie', r.zi);
T('ora din antet', r.ora === '08:05', r.ora);
T('salutul cu prenumele, după ora României', r.salut === '**Bună dimineața, Alin!** Iată cum stăm azi.', r.salut);
T('seara: „Bună seara", fără prenume dacă lipsește', A.salut('', Date.parse('2026-10-30T17:30:00Z')) === '**Bună seara!** Iată cum stăm azi.');
T('la prânz: „Bună ziua"', /^\*\*Bună ziua, Robert!/.test(A.salut('Robert Gherbali', Date.parse('2026-10-30T10:00:00Z'))));

r = A.randuri({ acum: ACUM, facturi: [F()] });
T('o factură întârziată: rândul roșu, cu firma, numărul, suma, zilele și oprirea', r.randuri.length === 1 && r.randuri[0].nivel === 'r' &&
  r.randuri[0].text === '**Trans Expres**: factura RAT-2026-0142 (1.240 lei) e întârziată de 12 zile; accesul se oprește în 3 zile.', JSON.stringify(r.randuri[0]));
T('și duce în fișa firmei, pe fila Facturi', JSON.stringify(r.randuri[0].tinta) === JSON.stringify({ fel: 'firma', id: 3, fila: 'facturi' }));
T('„azi" și „oprit" se spun pe față', /accesul se oprește azi\.$/.test(A.randuri({ acum: ACUM, facturi: [F({ zilePanaLaOprire: 0 })] }).randuri[0].text) &&
  /accesul e oprit\.$/.test(A.randuri({ acum: ACUM, facturi: [F({ zilePanaLaOprire: -1 })] }).randuri[0].text));
T('o factură în euro își poartă moneda', /\(500 EUR\)/.test(A.randuri({ acum: ACUM, facturi: [F({ totalRon: 500, moneda: 'EUR' })] }).randuri[0].text));
r = A.randuri({ acum: ACUM, facturi: [F({ zilePanaLaOprire: 8 }), F({ companyId: 4, firma: 'Logistic Est', totalRon: 1025, zilePanaLaOprire: 1 }), F({ companyId: 5, firma: 'Agro Nord', totalRon: 650.4, zilePanaLaOprire: 12 })] });
T('mai multe: UN rând strâns, cu totalul și cea mai urgentă', r.randuri.length === 1 &&
  r.randuri[0].text === '3 facturi trecute de scadență, 2.915 lei, la 3 firme. Cea mai urgentă: **Logistic Est**; accesul se oprește în 1 zi.', r.randuri[0].text);
T('și duce în Companii', JSON.stringify(r.randuri[0].tinta) === JSON.stringify({ fel: 'sectiune', tab: 'companies' }));

r = A.randuri({ acum: ACUM, cereri: [{ nr: 14, firma: 'Cargo Vest', titlu: 'Nu transmite', la: ACUM - 5 * ORA }] });
T('o cerere nepreluată: cu numărul, firma, problema și de cât așteaptă', r.randuri[0].text === 'Cererea nr. 14 de la **Cargo Vest** („Nu transmite”) așteaptă de 5 ore.', r.randuri[0].text);
T('… spre „Cereri de la clienți"', r.randuri[0].buton === 'Cereri de la clienți' && r.randuri[0].tinta.tab === 'cereri');
T('„40 de minute", „2 zile", „1 zi" — cu „de" unde trebuie', A.deCand(ACUM - 40 * 60000, ACUM) === '40 de minute' && A.deCand(ACUM - 50 * ORA, ACUM) === '2 zile' && A.deCand(ACUM - 25 * ORA, ACUM) === '1 zi');
r = A.randuri({ acum: ACUM, demo: [{ nume: 'Ion Pop SRL', la: ACUM - 2 * ORA }] });
T('o cerere de cont demo nouă (doar firma, fără date personale), spre „Cereri demo"', r.randuri[0].text === 'O cerere de cont demo nouă, de la **Ion Pop SRL**, de 2 ore.' && r.randuri[0].tinta.tab === 'demoreq', r.randuri[0].text);

const sf = Date.parse('2026-11-30T10:00:00Z'), pv = Date.parse('2026-10-31T10:00:00Z');
r = A.randuri({ acum: ACUM, contracteExpira: [{ companyId: 5, firma: 'Agro Nord', sfarsit: sf, ultimaZiPreaviz: pv }] });
T('contractul care expiră: capătul și ultima zi de preaviz', r.randuri[0].text === 'Contractul cu **Agro Nord** expiră pe 30 noiembrie; preavizul se termină pe 31 octombrie.', r.randuri[0].text);
T('… spre fila Contract a firmei', JSON.stringify(r.randuri[0].tinta) === JSON.stringify({ fel: 'firma', id: 5, fila: 'contract' }));
T('preavizul trecut și contractul expirat se spun altfel (expiratul e roșu)',
  /preavizul s-a încheiat pe 31 octombrie\.$/.test(A.randuri({ acum: ACUM, contracteExpira: [{ companyId: 5, firma: 'Agro Nord', sfarsit: sf, ultimaZiPreaviz: pv, preavizTrecut: true }] }).randuri[0].text) &&
  A.randuri({ acum: ACUM, contracteExpira: [{ companyId: 5, firma: 'Agro Nord', sfarsit: pv, trecut: true }] }).randuri[0].text === 'Contractul cu **Agro Nord** a expirat pe 31 octombrie.' &&
  A.randuri({ acum: ACUM, contracteExpira: [{ companyId: 5, firma: 'Agro Nord', sfarsit: pv, trecut: true }] }).randuri[0].nivel === 'r');
r = A.randuri({ acum: ACUM, contracteTrimise: [{ companyId: 6, firma: 'Fresh Food', trimisLa: ACUM - 6 * ZI }] });
T('trimis la semnat de 6 zile: încă nu e de văzut (pragul e 7)', r.randuri.length === 0 && A.ZILE_LA_SEMNAT === 7);
r = A.randuri({ acum: ACUM, contracteTrimise: [{ companyId: 6, firma: 'Fresh Food', trimisLa: ACUM - 9 * ZI }] });
T('de 9 zile: „așteaptă semnătura de 9 zile"', r.randuri[0] && r.randuri[0].text === 'Contractul cu **Fresh Food** așteaptă semnătura de 9 zile.', JSON.stringify(r.randuri));

r = A.randuri({ acum: ACUM, montajMaine: [{ firma: 'Cargo Vest', instalator: 'Ion', masini: 10, lipsa: ['client'] }] });
T('montajul de mâine neconfirmat: cine nu l-a confirmat', r.randuri[0].text === 'Montajul de mâine la **Cargo Vest** (Ion, 10 mașini) nu e confirmat de client.', r.randuri[0].text);
T('… spre Calendarul de montaj', r.randuri[0].tinta.tab === 'montaj');
r = A.randuri({ acum: ACUM, termenMontaj: [{ firma: 'Logistic Est', text: 'mai sunt 5 zile (10 din 50 de mașini montate)', depasit: false }] });
T('termenul de montaj: textul vine gata de la server', r.randuri[0].text === 'Montajul la **Logistic Est**: mai sunt 5 zile (10 din 50 de mașini montate).' && r.randuri[0].nivel === 'w', r.randuri[0].text);

r = A.randuri({ acum: ACUM, montajDeFacturat: [{ firma: 'Logistic Est', masini: 18, perioada: '20–26.10' }] });
T('montaj gata de facturat, spre „Montaj de facturat"', r.randuri[0].text === 'Montaj gata de facturat: **Logistic Est**, 18 mașini (20–26.10).' && r.randuri[0].tinta.fel === 'facturare' && r.randuri[0].tinta.sectiune === 'montaj', JSON.stringify(r.randuri[0]));
r = A.randuri({ acum: ACUM, luna: 'octombrie', abonamentNeemis: [{ firma: 'Agro Nord' }] });
T('abonamentul neemis după 1', r.randuri[0].text === 'Abonamentul pe octombrie nu e emis încă la **Agro Nord**.', r.randuri[0].text);

r = A.randuri({ acum: ACUM, aparateNoi: { n: 3, firma: { id: 9, nume: 'Cargo Vest' }, imeis: ['1', '2', '3'] } });
T('aparatele care transmit fără firmă, cu firma propusă', r.randuri[0].text === '**3 aparate** transmit și n-au firmă; propunerea: **Cargo Vest**.' && r.randuri[0].tinta.fel === 'neasignate' && r.randuri[0].tinta.firma === 9, JSON.stringify(r.randuri[0]));
r = A.randuri({ acum: ACUM, stocSubPrag: [{ model: 'Teltonika FMC130', buc: 2, prag: 5 }] });
T('stocul sub prag', r.randuri[0].text === 'Stocul de **Teltonika FMC130** a scăzut la 2 bucăți (pragul: 5).' && r.randuri[0].tinta.tab === 'stoc', r.randuri[0].text);

r = A.randuri({ acum: ACUM, firma: { emailEroare: 'Brevo refuză adresa serverului nostru.', emitentLipsa: ['numele firmei', 'CUI-ul'], soldUsd: 4.1, soldZile: 12.4 } });
T('firma noastră: emailul, „Date emitent" și soldul, pe rând', r.randuri.length === 3 &&
  r.randuri[0].text === 'Emailurile nu pleacă. Brevo refuză adresa serverului nostru.' &&
  r.randuri[1].text === '„Date emitent” incomplete: lipsesc numele firmei și CUI-ul. Fără ele nu pleacă nicio factură.' &&
  r.randuri[2].text === 'Soldul Anthropic: mai sunt cam 4,10 $, cât pentru 12 zile la cheltuiala de acum.', JSON.stringify(r.randuri.map((x) => x.text)));
T('… spre Stare producție, Date emitent, RA Insight · control', r.randuri[0].tinta.tab === 'dashboard' && r.randuri[1].tinta.fel === 'emitent' && r.randuri[2].tinta.tab === 'agents');
T('soldul de 20 de zile nu e de văzut (pragul e 14)', A.randuri({ acum: ACUM, firma: { soldUsd: 9, soldZile: 20 } }).randuri.length === 0 && A.ZILE_SOLD === 14);

// Ordinea și tăietura: firma noastră (pusă prima în date) iese ultima; peste 5, „N de văzut · primele 5".
r = A.randuri({ acum: ACUM, firma: { emitentLipsa: ['CUI-ul'] }, stocSubPrag: [{ model: 'FMC130', buc: 1, prag: 3 }], montajDeFacturat: [{ firma: 'X', masini: 2 }],
  montajMaine: [{ firma: 'Y', lipsa: ['instalator'] }], contracteExpira: [{ companyId: 1, firma: 'Z', sfarsit: sf, ultimaZiPreaviz: pv }],
  cereri: [{ nr: 1, firma: 'W', titlu: 'Altceva', la: ACUM - ORA }], facturi: [F()] });
T('ordinea hotărâtă: bani, clienți, contracte, montaj, de facturat, aparate, firma', r.randuri.map((x) => x.fel).join(',') === 'bani,clienti,contracte,montaj,facturat', r.randuri.map((x) => x.fel).join(','));
T('lista ordinii e cea din machetă', A.ORDINEA.join(',') === 'bani,clienti,contracte,montaj,facturat,aparate,firma');
T('cel mult 5 rânduri; câte sunt în total se spune', r.randuri.length === A.MAX_RANDURI && A.MAX_RANDURI === 5 && r.deVazut === 7 && r.deVazutText === '7 de văzut · primele 5', r.deVazutText);
T('fiecare rând are un buton și unde duce', r.randuri.every((x) => x.buton && x.tinta && x.tinta.fel));
T('nivelurile sunt doar r / w / b / n (culorile paginii)', r.randuri.every((x) => /^[rwbn]$/.test(x.nivel)));
T('sumele: 1.240 lei, 12.345 lei, 4,10 $, 0,05 $', A.lei(1240) === '1.240 lei' && A.lei(12345.4) === '12.345 lei' && A.dolari(4.1) === '4,10 $' && A.dolari(0.049) === '0,05 $');
const sursaRegula = citeste('azi_la_noi.js');
T('regula e curată: fără bază de date, fără server, fără model', !/require\('\.\/(db|server|ai)'\)/.test(sursaRegula) && !/fetch\(|pool\./.test(sursaRegula));

sect('2. Pagina: „Acasă" = chatul asistentului (verticala Fondator)');
const html = citeste('public/index.html');
const i0 = html.indexOf('// ── începe „asistentul fondatorilor" ──'), i1 = html.indexOf('// ── sfârșit „asistentul fondatorilor" ──');
const bloc = i0 > 0 && i1 > i0 ? html.slice(i0, i1) : '';
T('blocul paginii se găsește, între repere', !!bloc);
T('pagina are locul ei (#asistent-view) și e legată ca RA Insight', /<div id="asistent-view" class="modal-overlay"><\/div>/.test(html) &&
  /asistent: 'asistent-view'/.test(html) && /asistent: 'renderAsistentPage'/.test(html));
const acasa = (html.match(/<button class="nav-item nav-sub"[^>]*>(?:(?!<\/button>)[\s\S])*?<span>Acasă<\/span><\/button>/) || [])[0] || '';
T('„Acasă" din meniul nostru deschide chatul (și se aprinde prin data-view)', /data-view="asistent"/.test(acasa) && /navGo\(this, function\(\)\{ showView\('asistent'\); \}\)/.test(acasa), acasa);
const gestiune = html.slice(html.indexOf('data-group="gestiune"') - 80, html.indexOf('data-group="module"'));
T('… și stă în grupa „Gestiune" de pe verticala Fondator (clientul n-o vede)', /data-vert="fondator" data-group="gestiune"/.test(gestiune) && gestiune.indexOf(acasa) > 0);
T('după autentificare, fondatorul aterizează în chat', /if \(vertCurenta\(suntemNoi, setOchiCitit\(window\.localStorage\)\) === 'fondator'\) \{\s*try \{ showView\('asistent'\); \} catch/.test(html));
T('trecerea pe verticala Fondator duce tot acolo', /showView\(ochi === 'firma' \? 'localizare' : 'asistent'\)/.test(html));
T('bula verde: pe verticala Fondator → chatul asistentului, altfel RA Insight', /window\.raxToggleAI = function \(\) \{ showView\(window\._asfVerticalaNoastra && window\._asfVerticalaNoastra\(\) \? 'asistent' : 'insight'\); \};/.test(html));
T('… iar „verticala noastră" = super-admin pe verticala Fondator', /window\._asfVerticalaNoastra = function \(\) \{\s*return !!\(window\.currentUser && currentUser\.isSuper\) && vertCurenta\(true, setOchiCitit\(window\.localStorage\)\) === 'fondator';/.test(html));
T('bula se ascunde cât stai în chat, ca în RA Insight', /currentView === 'insight' \|\| currentView === 'asistent'\)\) \$\('rax-fabs'\)\.style\.display = 'none'/.test(html) &&
  /if \(name !== 'insight' && name !== 'asistent' && window\._raxUpdateFabs\)/.test(html) && /fb\.style\.display = 'none'/.test(bloc));
T('pagina cere „Azi la noi" de la server și cifrele din aceeași socoteală ca cartonașele', /fetch\('\/api\/admin\/azi-la-noi'/.test(bloc) && /window\._acasaCifre\(\)/.test(bloc));
T('stilurile sunt ale chatului RA Insight (insp / azi / chat)', /class="insp st-ascuns asf"/.test(bloc) && /'insp-a'/.test(bloc) && /'azi-r apas'/.test(bloc) && /window\._chatInsigna\(/.test(bloc));
// Textele de la server se pun ca TEXT: ce primește innerHTML e doar scris în pagină (iconițe, scheletul) — o iconiță venită din
// date trece întâi prin /^fa-[a-z-]+$/.
const dreapta = []; bloc.replace(/\.innerHTML\s*=\s*([^;]+);/g, (_, x) => { dreapta.push(x.trim()); return _; });
const curat = (x) => /^'/.test(x) && !/\b(j|r|c|p|d|t|x|rd|b)\.(text|salut|l|t|buton|zi|gol|deVazutText|nume|firma)\b/.test(x.replace(/\/\^fa-\[a-z-\]\+\$\/\.test\(c\.ic \|\| ''\) \? c\.ic : /, ''));
T('innerHTML doar cu bucăți scrise în pagină, niciodată cu text de la server', dreapta.length >= 5 && dreapta.every(curat), dreapta.filter((x) => !curat(x)).join(' | ') || String(dreapta.length));
T('îngroșatul din text se face cu noduri <b>, fără innerHTML', /function textGros\(t\)[\s\S]{0,400}el\('b', null, m\[1\]\)/.test(bloc));
T('un singur loc pentru „unde duce un clic" (firma, neasignate, facturare, emitent, secțiune)', /window\._asfDu = function \(t\)/.test(bloc) &&
  ['firma', 'neasignate', 'facturare', 'emitent', 'sectiune'].every((f) => bloc.indexOf("t.fel === '" + f + "'") > 0));
T('rândurile și cifrele trec prin el', (bloc.match(/window\._asfDu\(/g) || []).length >= 2);
T('o eroare de server nu lasă pagina goală: mesaj + „Reîncarcă"', /Nu am putut încărca „Azi la noi”/.test(bloc) && /'Reîncarcă'/.test(bloc));
T('o cerere veche întârziată nu suprascrie una nouă (tura)', /if \(tura !== _tura\) return;/.test(bloc));

// Cele 4 cifre: ACEEAȘI socoteală ca pe cartonașe — funcțiile comune, rulate, dau exact ce scriau cartonașele înainte.
function taieBucata(src, start, capat) { const a = src.indexOf(start); if (a < 0) return ''; const b = src.indexOf(capat, a + start.length); return b < 0 ? '' : src.slice(a, b + capat.length); }
function taieFunctia(src, nume) {
  const i = src.indexOf('function ' + nume + '(');
  if (i < 0) return '';
  let k = src.indexOf('{', i), n = 0;
  for (let j = k; j < src.length; j++) { if (src[j] === '{') n++; else if (src[j] === '}') { n--; if (!n) return src.slice(i, j + 1); } }
  return '';
}
const NUME = ['_adashStareCompanii', '_adashStareHtml', '_usrStareAcasa', '_adashStareArhiva', '_arhZile', '_arhTermen', '_usrNiciodata', '_usrFaraAcces'];
const bucati = NUME.map((n) => taieFunctia(html, n));
T('funcțiile comune se găsesc în pagină', bucati.every(Boolean), NUME.filter((n, i) => !bucati[i]).join(', '));
const prag = (html.match(/(?:var|const|let) ARH_PRAG_ZILE = (\d+);/) || [])[1];
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const lume = { esc, ARH_PRAG_ZILE: Number(prag) || 7 };
try { vm.runInNewContext(bucati.join('\n') + '\nthis.f = { _adashStareCompanii, _adashStareHtml, _usrStareAcasa, _adashStareArhiva };', lume); } catch (e) { T('funcțiile comune rulează', false, e.message); }
const f = lume.f || {};
// Ce scriau cartonașele ÎNAINTE de 30.10 (copiat întocmai din codul vechi), pe aceleași cazuri.
const vechiCompanii = (c) => { const fc = Number(c.companies_fara_contract) || 0, rs = Number(c.companies_restante) || 0; return (fc || rs) ? '<span style="color:' + (fc ? 'var(--red)' : 'var(--text-muted)') + ';">' + fc + ' fără contract</span>' + ' · <span style="color:' + (rs ? 'var(--orange)' : 'var(--text-muted)') + ';">' + rs + (rs === 1 ? ' restanță' : ' restanțe') + '</span>' : 'toate în regulă'; };
const cazuri = [[0, 0], [2, 0], [0, 1], [3, 5], [1, 1]].map(([a, b]) => ({ companies_fara_contract: a, companies_restante: b }));
T('Companii: aceeași scriere ca înainte, pe 5 cazuri', f._adashStareCompanii && cazuri.every((c) => f._adashStareHtml(f._adashStareCompanii(c)) === vechiCompanii(c)),
  f._adashStareCompanii ? cazuri.map((c) => f._adashStareHtml(f._adashStareCompanii(c))).join(' | ') : 'lipsește');
const vechiUseri = (toti) => { const nic = toti.filter((u) => !u.last_login).length; const parti = []; if (nic) parti.push('<span style="color:var(--orange);">' + nic + (nic === 1 ? ' n-a intrat niciodată' : ' n-au intrat niciodată') + '</span>'); return parti.length ? parti.join(' · ') : (toti.length ? 'toți au intrat' : ''); };
const useri = [[], [{ last_login: 1 }], [{ last_login: null }, { last_login: 2 }], [{}, {}, { last_login: 3 }]];
T('Utilizatori (la noi): aceeași scriere ca înainte, pe 4 cazuri', f._usrStareAcasa && useri.every((l) => f._adashStareHtml(f._usrStareAcasa(l, false)) === vechiUseri(l)),
  f._usrStareAcasa ? useri.map((l) => f._adashStareHtml(f._usrStareAcasa(l, false))).join(' | ') : 'lipsește');
const vizibil = (h) => String(h).replace(/<[^>]+>/g, '');
// 30.10 (Alin: „da acum"): firmele suspendate se spun SEPARAT — una suspendată de noi, fără nicio factură neplătită, nu e „restanță".
const scrieCo = (fc, rs, su) => f._adashStareCompanii ? vizibil(f._adashStareHtml(f._adashStareCompanii({ companies_fara_contract: fc, companies_restante: rs, companies_suspendate: su }))) : '';
T('Companii: suspendatele separat — „1 suspendată", „2 suspendate", „20 de suspendate"; fără ele, scrierea de dinainte',
  scrieCo(0, 0, 1) === '0 fără contract · 0 restanțe · 1 suspendată' && scrieCo(1, 2, 2) === '1 fără contract · 2 restanțe · 2 suspendate' &&
  scrieCo(0, 0, 20) === '0 fără contract · 0 restanțe · 20 de suspendate' && scrieCo(0, 0, 0) === 'toate în regulă' && scrieCo(2, 0, 0) === '2 fără contract · 0 restanțe',
  [scrieCo(0, 0, 1), scrieCo(1, 2, 2), scrieCo(0, 0, 20), scrieCo(0, 0, 0), scrieCo(2, 0, 0)].join(' | '));
T('… iar suspendata e roșie', f._adashStareCompanii && /<span style="color:var\(--red\);">1 suspendată<\/span>$/.test(f._adashStareHtml(f._adashStareCompanii({ companies_suspendate: 1 }))));
const arhive = [[{ purge_zile: 3, purge_total_zile: 30 }, { purge_zile: 20, purge_total_zile: 30 }], [{ istoric_sters: true }], [{ istoric_sters: true }, { istoric_sters: true }], [{ purge_zile: 25, purge_total_zile: 30 }]];
T('Arhivate: „pe ducă" (portocaliu), „s-a șters", „păstrat 30 de zile"', f._adashStareArhiva && (function () {
  const a = arhive.map((rows) => f._adashStareArhiva(rows));
  return a[0].warn && vizibil(f._adashStareHtml(a[0].parti)) === '1 cu istoricul pe ducă' && !a[1].warn && vizibil(f._adashStareHtml(a[1].parti)) === 'istoricul s-a șters' &&
    vizibil(f._adashStareHtml(a[2].parti)) === 'istoricul lor s-a șters' && vizibil(f._adashStareHtml(a[3].parti)) === 'istoric păstrat 30 de zile de la arhivare';
})(), f._adashStareArhiva ? arhive.map((rows) => JSON.stringify(f._adashStareArhiva(rows))).join(' | ') : 'lipsește');
T('cartonașele vechi folosesc aceleași funcții', /sub\.innerHTML = _adashStareHtml\(_adashStareCompanii\(c\)\)/.test(html) &&
  /sub\.innerHTML = _adashStareHtml\(_usrStareAcasa\(toti, eClient\)\)/.test(html) && /var st = _adashStareArhiva\(rows\);/.test(html));
const ac = html.indexOf('window._acasaCifre = async function') > 0 ? html.slice(html.indexOf('window._acasaCifre = async function'), html.indexOf('window.loadAdminDash = loadAdminDash;')) : '';
T('… și cifrele din chat (`_acasaCifre`) tot pe ele, din aceleași surse', /\/api\/admin\/counts/.test(ac) && /_adashStareCompanii\(c\)/.test(ac) && /_usrStareAcasa\(/.test(ac) && /_adashStareArhiva\(/.test(ac));
T('… cu aceleași nume ca pe cartonașe', ['Companii', 'Utilizatori', 'Dispozitive active', 'Arhivate'].every((n) => ac.indexOf("l: '" + n + "'") > 0));
T('cartonașele vechi rămân (pentru `showView(\'administrare\')` fără secțiune)', /<div id="admin-dash">/.test(html) && /window\.raxAdminHome = function/.test(html));

// Bulina „Cereri demo" (30.10, Alin: „da acum"): o numără serverul, de la pornire și la fiecare cerere nouă — nu din lista filtrată.
{
  const numara = taieBucata(html, 'window._demoReqNumara = async function () {', '\n    };');
  T('bulina „Cereri demo": `_demoReqNumara` cere numărul cererilor noi de la server și îl pune în ambele locuri',
    /fetch\('\/api\/admin\/demo-requests\/numar'/.test(numara) && /\['rax-demoreq-badge', 'nav-demoreq-badge'\]/.test(numara), numara.slice(0, 300));
  T('… o cere de la pornire (doar la fondatori), apoi la 2 minute',
    /if \(currentUser\.role === 'superadmin' && window\._demoReqNumara\) \{ window\._demoReqNumara\(\); setInterval\(window\._demoReqNumara, 120000\); \}/.test(html));
  T('… și la fiecare anunț de cerere nouă (cu lista reîncărcată dacă e deschisă)',
    /notif\.type === 'demo_request' && window\._demoReqNumara\) \{\s*window\._demoReqNumara\(\);/.test(html));
  const lista = taieBucata(html, 'window.raxLoadDemoReq = async function () {', 'var tabs = ');
  T('… iar lista paginii NU mai numără bulina din ce arată fila aleasă', /window\._demoReqNumara\(\);/.test(lista) && !/status === 'new'; \}\)\.length/.test(lista), lista.slice(0, 400));
}

sect('3. Culorile, pe ambele teme (contrast ≥ 4,5 pentru text)');
const css = citeste('public/css/app.css');
function lum(hex) { const c = hex.replace('#', ''); const v = [0, 2, 4].map((i) => parseInt(c.substr(i, 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4))); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; }
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const tok = (nume, care) => { const l = []; css.replace(new RegExp('--' + nume + ':\\s*(#[0-9a-fA-F]{6})', 'g'), (_, v) => { l.push(v); return _; }); return l[care]; };
const culoare = (sel) => { const m = new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*?color:\\s*(#[0-9a-fA-F]{6})').exec(css); return m ? m[1] : null; };
const fondDes = tok('bg-panel', 0), fondInt = tok('bg-panel', 1);
const perechi = [
  ['roșul din cifre, tema deschisă', culoare('.asf-cif .s .r'), fondDes], ['portocaliul din cifre, tema deschisă', culoare('.asf-cif .s .w'), fondDes],
  ['roșul din cifre, tema întunecată', culoare('body.dark .asf-cif .s .r'), fondInt], ['portocaliul din cifre, tema întunecată', culoare('body.dark .asf-cif .s .w'), fondInt],
  ['rândul de stare (text-secondary), tema deschisă', tok('text-secondary', 0), fondDes], ['rândul de stare, tema întunecată', tok('text-secondary', 1), fondInt],
];
perechi.forEach(([n, a, b]) => T(n + (a && b ? ' (' + contrast(a, b).toFixed(2) + ')' : ''), !!(a && b) && contrast(a, b) >= 4.5, a + ' pe ' + b));
T('avatarul asistentului e verde (al casei), pe ambele teme — nu mov ca RA Insight', /\.insp-a \.av\.asf-av \{ color: #166534;/.test(css) && /body\.dark \.insp-a \.av\.asf-av \{ color: #3FE07D;/.test(css));
T('pagina e întinsă pe tot ecranul, ca RA Insight', /#asistent-view\.as-view \{ padding: 0; align-items: stretch; overflow: hidden; \}/.test(css));
T('pe telefon: cifrele pe două coloane, butonul fiecărui rând sub text', /@media \(max-width: 600px\) \{\s*\.asf-cif \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/.test(css) && /\.asf \.bub \.azi-r \.azi-prop \{ grid-column: 2;/.test(css));
T('regulile noi nu ating „Azi la tine" al clienților (toate sub .asf)', !/^\.insp-a \.bub \.azi-r/m.test(css) && /^\.asf \.azi-st\.n/m.test(css));

async function peServer() {
  const os = require('os');
  const { spawn, spawnSync } = require('child_process');
  const { puneParola } = require('./test_parola');
  const PORT = 3617, TCP = 5617, B = 'http://127.0.0.1:' + PORT;
  const DIR = path.join(os.tmpdir(), 'rax_asistent_' + process.pid + '_' + Date.now());
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'asistent-fondatori-proba',
    DEMO_DISABLED: 'true', PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, RATE_LIMIT_ENABLED: 'false', EUR_RON_RATE: '5' });
  ['DATABASE_URL', 'BREVO_API_KEY', 'SMTP_HOST', 'SMTP_USER', 'ANTHROPIC_API_KEY', 'AI_AGENT_MODEL', 'AI_MODEL'].forEach((k) => delete env[k]);
  const seed = spawnSync(process.execPath, [__filename, '--faza=seed'], { cwd: __dirname, env, encoding: 'utf8', timeout: 240000 });
  const ms = /SEED (\{.*\})/.exec(seed.stdout || '');
  T('pregătirea: factura întârziată e în baza probei', !!ms, String(seed.stdout || '').slice(-400) + String(seed.stderr || '').slice(-400));
  if (!ms) return;
  const seedR = JSON.parse(ms[1]);
  const srv = spawn(process.execPath, ['server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = ''; srv.stderr.on('data', (d) => { err += d; });
  const sleep = (t) => new Promise((res) => setTimeout(res, t));
  const cere = async (m, u, ck, body) => { const res = await fetch(B + u, { method: m, headers: Object.assign({ 'Content-Type': 'application/json' }, ck ? { Cookie: ck } : {}), body: body ? JSON.stringify(body) : undefined }); let j = {}; try { j = await res.json(); } catch (e) {} return { s: res.status, j }; };
  const login = async (u, p) => { const res = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) }); return res.ok ? res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ') : null; };
  try {
    let gata = false;
    for (let i = 0; i < 360 && !gata; i++) { try { gata = (await fetch(B + '/api')).ok; } catch (e) {} if (!gata) await sleep(500); }
    T('serverul pornește', gata, err.slice(-600));
    if (!gata) return;
    const S = await login('admin', 'test1234');
    T('fondatorul intră', !!S);
    let r = await cere('GET', '/api/admin/azi-la-noi?proaspat=1', S);
    T('ruta răspunde fondatorului', r.s === 200 && Array.isArray(r.j.randuri), JSON.stringify(r.j).slice(0, 300));
    const j = r.j || {};
    T('cu ziua, ora și salutul', /^[A-ZȘȚĂÎÂ][a-zăâîșț]+, \d{1,2} [a-zăâîșț]+$/.test(j.zi || '') && /^\d{2}:\d{2}$/.test(j.ora || '') && /^\*\*Bun[ăa] [a-zăâîșț]+[^*]*!\*\* Iată cum stăm azi\.$/.test(j.salut || ''), JSON.stringify([j.zi, j.ora, j.salut]));
    const rb = (j.randuri || []).find((x) => x.fel === 'bani');
    T('factura întârziată: rândul „bani", întâiul', rb && j.randuri[0] === rb && /^\*\*Trans Expres SRL\*\*: factura RAT-\d{4}-00950 \(1\.241 lei\) e întârziată de 12 zile; accesul se oprește în 4 zile\.$/.test(rb.text), JSON.stringify(j.randuri));
    T('… și duce în fișa ei, pe fila Facturi', rb && rb.tinta.fel === 'firma' && Number(rb.tinta.id) === Number(seedR.co) && rb.tinta.fila === 'facturi');
    const fe = (j.randuri || []).filter((x) => x.fel === 'firma').map((x) => x.text);
    T('emailul nepus se spune (aceeași socoteală ca „Stare producție")', fe.indexOf('Emailurile nu pleacă. Serverul n-are Brevo sau SMTP pus.') >= 0, JSON.stringify(fe));
    T('„Date emitent" goale se spun (regula facturii automate: numele + CUI-ul)', fe.indexOf('„Date emitent” incomplete: lipsesc numele firmei și CUI-ul. Fără ele nu pleacă nicio factură.') >= 0, JSON.stringify(fe));
    // Soldul Anthropic: ce s-a cheltuit DE LA scrierea lui se scade; zilele, la ritmul ultimelor 7 zile (pregătirea: 20 $ acum 20 de zile).
    const usage = await cere('GET', '/api/admin/ai-usage', S);
    const sold = ((usage.j || {}).pachete || {}).sold || {};
    T('soldul: din 20 $ scriși acum 20 de zile s-au scăzut cei 6,50 $ cheltuiți de atunci (nu și cei 5 $ de dinainte) → 13,50 $',
      sold.scris === 20 && Math.abs(sold.cheltuit - 6.5) < 0.005 && Math.abs(sold.usd - 13.5) < 0.005, JSON.stringify(sold));
    T('… iar zilele = ce a rămas ÷ cheltuiala pe zi a ultimelor 7 zile (0,50 $) = 27', sold.zile === 27 && Math.abs(sold.peZi - 0.5) < 0.0001 && sold.ritmZile === 7, JSON.stringify(sold));
    T('27 de zile nu sunt de văzut în „Azi la noi" (pragul e 14): nicio grijă inventată', !(j.randuri || []).some((x) => /Anthropic/.test(x.text)));
    // Clientul
    const co = await cere('POST', '/api/companies', S, { name: 'Firma Client SRL' });
    const u = await cere('POST', '/api/users', S, { username: 'client.admin@proba.ro', full_name: 'Ion Client', role: 'company_admin', company_id: co.j.id });
    await puneParola(u.j, 'Str4da-Verde-2026', B);
    const C = await login('client.admin@proba.ro', 'Str4da-Verde-2026');
    T('clientul NU primește „Azi la noi" (doar fondatorii)', !!C && (await cere('GET', '/api/admin/azi-la-noi', C)).s === 403);
    T('fără cont, nimic', (await cere('GET', '/api/admin/azi-la-noi', null)).s === 401);
    const sup = await cere('POST', '/api/support', C, { message: 'Nu merge aplicația pe telefon.' });
    T('clientul trimite o cerere', sup.s === 200, JSON.stringify(sup.j));
    r = await cere('GET', '/api/admin/azi-la-noi', S);
    T('fără „proaspăt", memoria de 2 minute (cererea nouă încă nu apare)', r.s === 200 && !(r.j.randuri || []).some((x) => x.fel === 'clienti'));
    r = await cere('GET', '/api/admin/azi-la-noi?proaspat=1', S);
    const rc = (r.j.randuri || []).find((x) => x.fel === 'clienti');
    // Modul de probă (SEED_TEST) pune la pornire două aparate fără firmă care „transmit" (TEST111, TEST222): rândul lor e corect.
    T('cererea nepreluată apare după bani; aparatele fără firmă, înaintea firmei noastre', rc && r.j.randuri.map((x) => x.fel).join(',') === 'bani,clienti,aparate,firma,firma', JSON.stringify((r.j.randuri || []).map((x) => x.fel + ': ' + x.text)));
    T('… cu numărul, firma, problema și de cât așteaptă', rc && /^Cererea nr\. \d+ de la \*\*Firma Client SRL\*\* \(„[^”]+”\) așteaptă de 1 minut\.$/.test(rc.text) && rc.tinta.tab === 'cereri', rc && rc.text);
    const ra = (r.j.randuri || []).find((x) => x.fel === 'aparate');
    T('aparatele care transmit fără firmă: câte, spre „Neasignate", cu IMEI-urile', ra && ra.text === '**2 aparate** transmit și n-au firmă.' && ra.tinta.fel === 'neasignate' &&
      ra.tinta.imeis.indexOf('TEST111') >= 0 && ra.tinta.imeis.indexOf('TEST222') >= 0 && ra.tinta.firma === null, JSON.stringify(ra));
    T('„5 de văzut"', r.j.deVazut === 5 && r.j.deVazutText === '5 de văzut', r.j.deVazutText);
    // Cifrele de sub „Companii" (30.10, Alin: „da acum"): regulile filtrelor din Companii. Trans Expres (factura întârziată) e
    // restanță; o firmă suspendată de NOI, fără nicio factură, e „suspendată" — nu și restanță; o firmă fără contract e „fără contract".
    const c0 = (await cere('GET', '/api/admin/counts', S)).j || {};
    T('/api/admin/counts: factura întârziată = o restanță; nimic suspendat încă', Number(c0.companies_restante) === 1 && Number(c0.companies_suspendate) === 0 &&
      Number(c0.companies_fara_contract) >= 2, JSON.stringify(c0));
    const sus = await cere('PUT', '/api/companies/' + co.j.id + '/suspend', S, { suspend: true, reason: 'Probă: suspendată de noi' });
    T('fondatorul suspendă de mână firma clientului (fără nicio factură)', sus.s === 200, JSON.stringify(sus.j).slice(0, 200));
    const c1 = (await cere('GET', '/api/admin/counts', S)).j || {};
    T('… ea apare la „suspendate", NU la „restanțe" (până pe 30.10 restanțele le numărau și pe ele)', Number(c1.companies_suspendate) === 1 &&
      Number(c1.companies_restante) === Number(c0.companies_restante) && Number(c1.companies_fara_contract) === Number(c0.companies_fara_contract), JSON.stringify(c1));
    // Ce am scos în funcții comune merge ca înainte.
    const h = await cere('GET', '/api/admin/health', S);
    T('„Stare producție" merge (verdictul emailului e acum `_emailVerdict`)', h.s === 200 && JSON.stringify(h.j).indexOf('"smtp"') >= 0, JSON.stringify(h.j).slice(0, 200));
    const ce = await cere('POST', '/api/admin/contracts/check-expiry', S, {});
    T('anunțul zilnic al contractelor merge (termenele de montaj sunt acum `_termeneMontaj`)', ce.s === 200, JSON.stringify(ce.j).slice(0, 200));
    // Bulina „Cereri demo" (30.10): o cerere nouă de pe site se numără oricare ar fi fila deschisă; după respingere, dispare.
    let nd = await cere('GET', '/api/admin/demo-requests/numar', S);
    T('bulina „Cereri demo": zero cereri noi la început', nd.s === 200 && nd.j.noi === 0, JSON.stringify(nd.j));
    const dr = await cere('POST', '/api/public/demo-request', null, { name: 'Maria Pop', company: 'Logistic Sud SRL', email: 'maria.pop@proba.ro', wants_demo: true, consent: true, ts: Date.now() - 20000 });
    T('o cerere de cont demo vine de pe site', dr.s === 200 && dr.j.ok === true, JSON.stringify(dr.j));
    nd = await cere('GET', '/api/admin/demo-requests/numar', S);
    const aprobate = await cere('GET', '/api/admin/demo-requests?status=approved', S);
    T('… bulina o numără (1), chiar dacă pagina stă pe fila „Aprobate", unde lista e goală', nd.j.noi === 1 && Array.isArray(aprobate.j) && aprobate.j.length === 0, JSON.stringify([nd.j, aprobate.j && aprobate.j.length]));
    const noua = ((await cere('GET', '/api/admin/demo-requests?status=new', S)).j || [])[0];
    const rj = noua ? await cere('POST', '/api/admin/demo-requests/' + noua.id + '/reject', S, {}) : { s: 0 };
    nd = await cere('GET', '/api/admin/demo-requests/numar', S);
    T('… iar după „Respinge", bulina se stinge (0)', rj.s === 200 && nd.j.noi === 0, JSON.stringify([rj.s, nd.j]));
    const ndC = await cere('GET', '/api/admin/demo-requests/numar', C);
    T('numărul cererilor demo e doar pentru fondatori (clientul, aici cu firma suspendată de noi, nu-l primește)', ndC.s >= 400 && ndC.j.noi === undefined, ndC.s + ' ' + JSON.stringify(ndC.j));
  } finally {
    srv.kill();
    await sleep(400);
    try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  }
}

(async () => {
  if (process.argv.indexOf('--fara-server') < 0) { sect('4. Pe serverul pornit'); try { await peServer(); } catch (e) { T('proba pe server rulează până la capăt', false, (e && e.stack) || e); } }
  console.log('\n' + (rele ? '✗' : '✓') + ' verify_asistent_fondatori: ' + ok + ' trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
})();
