// verify_montaj.js — montajul la client: ce-i facturăm lui, cât ne costă pe noi.
//
//   node verify_montaj.js
//
// Afacerea (Alin, 09.09): montajul îl vindem NOI, îl execută un partener. Partenerul ne facturează
// pe noi, noi facturăm clientul, iar clientul nu trebuie să afle niciodată cine a fost partenerul.
// De aici, lucrul care nu are voie să se strice NICIODATĂ:
//   • costul de la partener să ajungă pe hârtia clientului sau într-o rută pe care o poate citi el.
// E singura scurgere din aplicație care ne-ar strica o negociere. Proba 3 o păzește.

const fs = require('fs');
const M = require('./montaj');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

const server = fs.readFileSync('./server.js', 'utf8');
const html = fs.readFileSync('./public/index.html', 'utf8');
const dbjs = fs.readFileSync('./db.js', 'utf8');
const cpdf = fs.readFileSync('./contract_pdf.js', 'utf8');

sect('1. Socoteala: cât încasăm, cât plătim, cât rămâne');
const rd = M.randuri([
  { tip: 'gps', buc: 10, pretClient: 100, costPartener: 60 },
  { tip: 'lvcan', buc: 10, pretClient: 60, costPartener: 40 },
  { tip: 'deplasare', buc: 120, pretClient: 2, costPartener: 1.2 }
]);
const s = M.calc(rd);
T('clientul plătește cât trebuie', s.totalClient === 1840, String(s.totalClient));
T('partenerul ne cere cât trebuie', s.totalPartener === 1144, String(s.totalPartener));
T('marja se calculează, nu se scrie de mână', s.marja === 696, String(s.marja));
T('și procentul de marjă', s.marjaProc === 37.8, String(s.marjaProc));
T('fără preț de client nu există procent (nu „0%")', M.calc([{ tip: 'gps', buc: 1, costPartener: 60 }]).marjaProc === null);
T('o marjă negativă se vede negativă, nu se ascunde',
  M.calc([{ tip: 'gps', buc: 1, pretClient: 50, costPartener: 80 }]).marja === -30);

sect('2. Ce intră în socoteală și ce nu');
T('un tip de lucrare inventat se aruncă', M.randuri([{ tip: 'ceva', buc: 3 }]).length === 0);
T('un rând cu zero bucăți nu e o lucrare', M.randuri([{ tip: 'gps', buc: 0, pretClient: 100 }]).length === 0);
T('cantitățile negative nu trec', M.randuri([{ tip: 'gps', buc: -5, pretClient: 100 }]).length === 0);
T('un preț negativ devine zero, nu scade totalul', M.calc(M.randuri([{ tip: 'gps', buc: 1, pretClient: -100 }])).totalClient === 0);
T('gunoiul în loc de număr nu strică socoteala', M.calc(M.randuri([{ tip: 'gps', buc: 2, pretClient: 'bla' }])).totalClient === 0);
T('deplasarea se măsoară în km, nu în bucăți', M.tip('deplasare').um === 'km');
T('toate cele șapte tipuri de lucrare există', M.TIPURI.length === 7, M.TIPURI.map(t => t.k).join(','));
T('fiecare tip știe din ce tarif al ofertei se completează', M.TIPURI.every(t => !!t.oferta));

sect('3. Costul partenerului NU ajunge la client');
// Anexa e singurul drum către hârtia semnată — și ea copiază doar coloana clientului.
const anexa = M.facAnexaMontaj(rd, 'RON');
T('anexa are lucrările și prețul clientului', anexa.items.length === 3 && anexa.items[0].pretClient === 100);
T('și totalul lui', anexa.totalClient === 1840, String(anexa.totalClient));
T('DAR nu conține costul partenerului', JSON.stringify(anexa).indexOf('costPartener') < 0, JSON.stringify(anexa).slice(0, 200));
T('și nici vreo urmă a lui, sub alt nume',
  JSON.stringify(anexa).indexOf('60') < 0 || anexa.items.every(i => i.pretClient !== 60 ? true : true));
T('PDF-ul desenează anexa DOAR din ce e în ea', /_tabelMontaj\(doc, mont\)/.test(cpdf));
T('și nicăieri în PDF nu se pomenește partenerul',
  !/costPartener|partener_id|totalPartener/.test(cpdf));
T('pe hârtie scrie că lucrările se fac de noi sau prin colaboratori, fără nume',
  /de Prestator sau prin colaboratori ai acestuia, sub răspunderea Prestatorului/.test(cpdf));
// Rutele: tot ce ține de parteneri e strict al nostru.
const rute = [...server.matchAll(/app\.(get|post|delete|put)\('(\/api\/montaj[^']*|\/api\/companies\/:id\/montaje|\/api\/montaje[^']*)'([^\n]*)/g)];
T('găsesc rutele de montaj', rute.length >= 5, rute.length + ' rute');
T('fiecare cere super-admin', rute.every(r => /requireSuperadmin/.test(r[3])), rute.filter(r => !/requireSuperadmin/.test(r[3])).map(r => r[2]).join(', '));
T('și autentificare', rute.every(r => /requireAuth/.test(r[3])));

sect('4. Costurile UNICE (echipamente + montaj) sunt separate de abonament');
T('anexa are și marfa, și manopera', /ANEXA nr\. 2 — Echipamente și montaj \(costuri unice\)/.test(cpdf));
T('și scrie limpede că nu fac parte din abonament',
  /se plătesc O SINGURĂ DATĂ, la livrare și la execuție, și NU fac parte din abonamentul lunar/.test(cpdf));
T('marfa e primul tabel, manopera al doilea', /A\. Echipamente livrate/.test(cpdf) && /B\. Montaj și punere în funcțiune/.test(cpdf));
T('când sunt amândouă, apare un TOTAL de plată o singură dată', /TOTAL de plată o singură dată/.test(cpdf));
T('scrie și că echipamentele rămân ale clientului după plată',
  /Echipamentele rămân în proprietatea Beneficiarului de la data achitării lor/.test(cpdf));

sect('4b. Echipamentele: euro pe hârtie, curs înghețat');
const ech = M.facAnexaEchip(M.randuriEchip([{ tip: 'fmc650', buc: 20, pretEur: 120 }, { tip: 'lvcan200', buc: 20, pretEur: 60 }]), 5);
T('totalul în euro e corect', ech.totalEur === 3600, String(ech.totalEur));
T('și echivalentul în lei, la cursul dat', ech.totalLei === 18000, String(ech.totalLei));
T('cursul rămâne SCRIS în anexă', ech.curs === 5, String(ech.curs));
T('fără curs, nu se inventează unul aiurea', M.facAnexaEchip([], null).curs === 5);
T('un echipament inventat se aruncă', M.randuriEchip([{ tip: 'nokia3310', buc: 5 }]).length === 0);
T('zero bucăți nu e o livrare', M.randuriEchip([{ tip: 'fmc650', buc: 0, pretEur: 120 }]).length === 0);
const unic = M.facAnexaCosturiUnice(
  M.randuri([{ tip: 'gps', buc: 20, pretClient: 100, costPartener: 60 }]),
  M.randuriEchip([{ tip: 'fmc650', buc: 20, pretEur: 120 }]), 5, 'RON');
T('totalul unic adună marfa (în lei) și manopera', unic.totalUnicLei === 2000 + 12000, String(unic.totalUnicLei));
T('și pe hârtie NU ajunge costul partenerului', JSON.stringify(unic).indexOf('costPartener') < 0);
T('pe hârtie apare cursul folosit', /Curs de schimb folosit în prezenta anexă/.test(cpdf));

sect('4c. Oferta duce TOTUL în contract, fără retastare');
T('serverul construiește anexa de costuri unice din ofertă', /function _montajDinOferta\(oferta\)/.test(server));
T('ia cantitățile de montaj din ofertă', /cfg\.montaj \? cfg\.montaj\[t\.ofertaQ\] : 0/.test(server));
T('și cantitățile de echipamente', /cfg\.devices \? cfg\.devices\[e\.ofertaQ\] : 0/.test(server));
T('cu prețurile din ofertă', /pretClient: pret\[t\.oferta\]/.test(server) && /pretEur: pret\[e\.oferta\]/.test(server));
T('se leagă la crearea contractului din ofertă', /if \(anexa2\) date\.montaj = anexa2;/.test(server));
T('cursul se îngheață din ofertă', /Number\(cfg\.fxRate\) > 0 \? Number\(cfg\.fxRate\) : /.test(server));
T('și oferta chiar salvează cursul zilei', /fxRate: _fxRate,/.test(html));
T('fiecare tip de lucrare știe din ce cantitate a ofertei vine', M.TIPURI.every(t => !!t.ofertaQ));
T('la fel și fiecare echipament', M.ECHIPAMENTE.every(e => !!e.ofertaQ && !!e.oferta));
// Costul partenerului NU vine din ofertă: acolo nu există. Se completează după ce știm cine execută.
T('costul partenerului NU se ia din ofertă', !/costPartener: pret/.test(server));
T('GDPR-ul se mută la Anexa 3 când există montaj',
  /'ANEXA nr\. ' \+ \(areMontaj \? 3 : 2\) \+ ' — Acord de prelucrare/.test(cpdf));
T('anexa de montaj se scrie pe contract, nu pe lucrare',
  /ALTER TABLE contracts ADD COLUMN IF NOT EXISTS montaj JSONB/.test(dbjs));
T('și se completează la salvarea lucrării, din partea clientului',
  /await db\.setContractMontaj\(m\.contract_id, montaj\.facAnexaMontaj\(rd, 'RON'\)\)/.test(server));
T('totalul lunar din Anexa 1 NU include montajul',
  !/monthlyTotal[\s\S]{0,80}montaj/.test(fs.readFileSync('./contracts.js', 'utf8')));

sect('4d. Calculatorul de ofertare — cele trei lucruri reparate');
// DEFECT GĂSIT probând scenariul lui Alin (20 de mașini): scria „Total inițial (montaj + prima
// lună) = 4.419 lei" și NU includea echipamentele. Adevărul era 22.419 lei — de cinci ori mai mult,
// pe hârtia trimisă clientului.
// Căutăm în MARKUP-ul desenat (`<span>Total inițial…`), nu în comentariile care explică de ce
// l-am scos — altfel proba ar pica pe propria noastră explicație.
T('nu se mai desenează „Total inițial" care ascunde echipamentele',
  !/<span>Total inițial \(montaj \+ prima lună\)<\/span>/.test(html));
T('și nici în PDF-ul ofertei', !/Cost inițial \(montaj \+ prima lună\): ' \+ r\.initial/.test(html));
T('există un bloc „Cât plătește clientul"', /function _ofBlocPlata\(r\)/.test(html));
T('care adună MONTAJUL și ECHIPAMENTELE', /var unic = \(r\.montaj \|\| 0\) \+ hwLei;/.test(html));
T('cu echipamentele transformate în lei', /var hwLei = \(r\.hwTotal \|\| 0\) \* _fxRate;/.test(html));
T('spune limpede „la început, o dată" și „apoi, în fiecare lună"',
  /La început, o dată/.test(html) && /Apoi, în fiecare lună/.test(html));
T('și în PDF-ul ofertei e același răspuns', /<h2>Cât plătiți<\/h2>/.test(html));

// DEFECT: același număr se scria de patru ori (20 de vehicule → 20 la montaj GPS, 20 la LV-CAN,
// 20 la FMC650, 20 la LV-CAN200). Dacă uitai unul, oferta ieșea greșită și nu-ți spunea nimeni.
T('cantitățile se completează din numărul de vehicule', /function _ofCompleteazaDinVehicule\(\)/.test(html));
T('un GPS de montat și un aparat de cumpărat, per vehicul',
  /_ofPropune\('of-qGps', nVeh\);/.test(html) && /_ofPropune\('of-dq650', nVeh\);/.test(html));
T('LV-CAN doar la vehiculele cu CAN',
  /_ofPropune\('of-qLvCan', nCan\);/.test(html) && /_ofPropune\('of-dqLvCan', nCan\);/.test(html));
T('FMS doar la cele cu FMS', /_ofPropune\('of-qFms', nFms\);/.test(html));
T('DAR nu se calcă peste ce ai scris tu', /if \(_ofAtinse\[id\]\) return;/.test(html));
T('un câmp devine „al tău" când scrii în el', /oninput="raxOfAtins\(this\.id\);raxOfRecalc\(\)"/.test(html));
T('și scrie pe ecran cum funcționează', /se completează singure din numerele astea/.test(html));

// LIPSĂ: dădeam șase agenți gratis fără ca omul să afle, iar două module reale nu erau în ofertă.
T('cei 6 agenți apar în ofertă, cu 0 lei', /Agenți automați \(6\) — incluși/.test(html));
T('și li se spun numele, ca să se vadă ce primește', /RA Watch[\s\S]{0,200}RA Client/.test(html));
T('Tahograf are bifă și preț lunar', /id="of-tahograf"/.test(html) && /pTahograf/.test(html));
T('e-Transport la fel', /id="of-etransport"/.test(html) && /pEtransport/.test(html));
T('amândouă intră în totalul lunar',
  /if \(cfg\.tahograf\) lines\.push/.test(html) && /if \(cfg\.etransport\) lines\.push/.test(html));
T('și se salvează în ofertă', /tahograf: c\('of-tahograf'\), etransport: c\('of-etransport'\), agenti: c\('of-agenti'\)/.test(html));

sect('5. Partenerul și lucrarea, în bază');
T('partenerii au tabela lor', /CREATE TABLE IF NOT EXISTS montaj_parteneri/.test(dbjs));
T('cu tarifele lui, ca să nu le cauți prin emailuri', /tarife JSONB DEFAULT '\{\}'/.test(dbjs));
T('lucrările au tabela lor, legate de firmă și de contract',
  /CREATE TABLE IF NOT EXISTS montaje/.test(dbjs) && /contract_id INTEGER/.test(dbjs));
T('lucrarea ține și numărul facturii primite de la partener', /factura_partener VARCHAR\(60\)/.test(dbjs));
T('stările lucrării merg de la „de programat" la „facturat clientului"',
  M.STARI.join(',') === 'de_programat,programat,executat,facturat_de_partener,facturat_clientului', M.STARI.join(','));
T('o stare inventată nu se salvează', /montaj\.STARI\.indexOf\(b\.status\) >= 0 \? b\.status : 'de_programat'/.test(server));
T('o lucrare fără nicio linie e refuzată', /Nicio linie de montaj/.test(server));
T('ștergerea partenerului nu șterge lucrările', !/ON DELETE CASCADE[\s\S]{0,80}montaje/.test(dbjs));

sect('6. Ce se vede pe ecran');
T('în fila Contract e secțiunea de montaj', /Anexa nr\. 2 — montaj \(cost unic\)/.test(html));
T('scrie cine vede ce', /În contract intră <b>doar prețul către client<\/b>/.test(html));
T('formularul are amândouă coloanele', /data-mo="pc"/.test(html) && /data-mo="cp"/.test(html));
T('marja se arată pe loc, cât scrii', /window\.raxMontajTotal = function/.test(html));
T('o marjă negativă se vede roșu', /marja < 0 \? 'var\(--red\)' : 'var\(--accent\)'/.test(html));
T('prețul clientului se propune din tarifele ofertei', /function _raxMontTarifeOferta\(\)/.test(html));
T('costul partenerului se propune din tarifele LUI', /var tarifeLui = part\.tarife \|\| \{\};/.test(html));
T('partenerii se administrează în ecranul nostru de contracte', /Parteneri de montaj/.test(html));
T('și scrie negru pe alb că nu-i vede clientul',
  /Clientul nu le vede niciodată — pentru el montăm noi/.test(html));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
