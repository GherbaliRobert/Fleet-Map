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

sect('4. Montajul e cost UNIC, nu abonament');
T('anexa de montaj e separată de anexa de abonament', /ANEXA nr\. 2 — Montaj și punere în funcțiune/.test(cpdf));
T('și scrie limpede că nu e în abonament',
  /se tarifează O SINGURĂ DATĂ, la execuție, și nu face parte din abonamentul lunar/.test(cpdf));
T('GDPR-ul se mută la Anexa 3 când există montaj',
  /'ANEXA nr\. ' \+ \(areMontaj \? 3 : 2\) \+ ' — Acord de prelucrare/.test(cpdf));
T('anexa de montaj se scrie pe contract, nu pe lucrare',
  /ALTER TABLE contracts ADD COLUMN IF NOT EXISTS montaj JSONB/.test(dbjs));
T('și se completează la salvarea lucrării, din partea clientului',
  /await db\.setContractMontaj\(m\.contract_id, montaj\.facAnexaMontaj\(rd, 'RON'\)\)/.test(server));
T('totalul lunar din Anexa 1 NU include montajul',
  !/monthlyTotal[\s\S]{0,80}montaj/.test(fs.readFileSync('./contracts.js', 'utf8')));

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
