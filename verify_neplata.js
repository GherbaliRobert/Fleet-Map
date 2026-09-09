// verify_neplata.js — ce se întâmplă când un client nu plătește la termen.
//
//   node verify_neplata.js
//
// Regula, hotărâtă de Alin (09.09): scadență depășită → 15 zile de grație cu avertismente → în
// ziua a 16-a accesul se taie → când plătește, revine. Lucrurile care nu au voie să se strice:
//   • un client SUSPENDAT să poată totuși intra (ar face suspendarea decorativă) — proba 3;
//   • un client care a plătit să rămână blocat (l-am pedepsi degeaba) — proba 2;
//   • ceasul să bată zilnic la aceeași ușă, până când omul nu mai citește nimic — proba 4;
//   • suspendarea să se întâmple fără să scrie nicăieri de ce — proba 5.

const fs = require('fs');
const N = require('./neplata');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

const server = fs.readFileSync('./server.js', 'utf8');
const html = fs.readFileSync('./public/index.html', 'utf8');
const dbjs = fs.readFileSync('./db.js', 'utf8');

const ZI = 24 * 60 * 60 * 1000;
const ACUM = Date.parse('2026-09-09T12:00:00Z');
// O factură emisă, scadentă acum N zile.
const fact = (zileTrecute, extra) => Object.assign({
  id: 7, company_id: 1, full_number: 'RAT-2026-00042', type: 'invoice', status: 'issued',
  due_date: ACUM - zileTrecute * ZI, total: 1234.5, currency: 'RON'
}, extra || {});
const st = (zileTrecute, extra) => N.stareNeplata([fact(zileTrecute, extra)], ACUM);

sect('1. Numărătoarea de la scadență');
T('înainte de scadență nu e nicio restanță', N.stareNeplata([fact(-3)], ACUM).faza === 'ok');
T('chiar în ziua scadenței încă e în regulă', N.stareNeplata([fact(0, { due_date: ACUM })], ACUM).faza === 'ok');
T('a doua zi după scadență începe numărătoarea', st(1).faza === 'avertisment', JSON.stringify(st(1)));
T('și spune de câte zile e restanța', st(7).zile === 7, String(st(7).zile));
T('spune și în câte zile se taie accesul', st(7).zilePanaLaSuspendare === 9, String(st(7).zilePanaLaSuspendare));
T('în ziua 15 tot e doar avertisment', st(15).faza === 'avertisment', st(15).faza);
T('în ziua 16 se suspendă', st(16).faza === 'suspendat', st(16).faza);
T('și rămâne suspendat și mai târziu', st(60).faza === 'suspendat');
T('data suspendării se poate spune dinainte',
  new Date(st(1).suspendareLa).toISOString().slice(0, 10) === new Date(ACUM + 15 * ZI).toISOString().slice(0, 10),
  new Date(st(1).suspendareLa).toISOString());
T('cele 15 zile de grație sunt scrise într-un singur loc', N.ZILE_GRATIE === 15 && N.ZI_SUSPENDARE === 16);

sect('2. Ce facturi contează (și care nu)');
T('o ciornă nu obligă pe nimeni', N.stareNeplata([fact(30, { status: 'draft' })], ACUM).faza === 'ok');
T('o factură plătită nu mai trage', N.stareNeplata([fact(30, { status: 'paid' })], ACUM).faza === 'ok');
T('o factură anulată nu mai trage', N.stareNeplata([fact(30, { status: 'canceled' })], ACUM).faza === 'ok');
T('o proformă nu e o obligație de plată', N.stareNeplata([fact(30, { type: 'proforma' })], ACUM).faza === 'ok');
T('un storno nu se cere la plată', N.stareNeplata([fact(30, { type: 'credit_note' })], ACUM).faza === 'ok');
T('o factură fără scadență nu poate porni ceasul', N.stareNeplata([fact(30, { due_date: null })], ACUM).faza === 'ok');
T('„trimisă" și „restantă" se cer la plată la fel ca „emisă"',
  N.stareNeplata([fact(20, { status: 'sent' })], ACUM).faza === 'suspendat' &&
  N.stareNeplata([fact(20, { status: 'overdue' })], ACUM).faza === 'suspendat');
// Miezul: dacă mai vine o factură, ceasul NU se resetează. Altfel un rău-platnic ar câștiga
// alte 15 zile la fiecare factură nouă și n-ar fi suspendat niciodată.
const doua = N.stareNeplata([fact(3, { id: 9, full_number: 'RAT-2026-00050' }), fact(40, { id: 7 })], ACUM);
T('contează cea mai VECHE restanță, nu ultima', doua.factura.id === 7, JSON.stringify(doua.factura));
T('deci o factură nouă nu mai dă 15 zile în plus', doua.faza === 'suspendat', doua.faza);
T('fără nicio factură, nimic de făcut', N.stareNeplata([], ACUM).faza === 'ok' && N.stareNeplata(null, ACUM).faza === 'ok');

sect('3. Accesul se taie cu adevărat');
// Verificarea e într-un SINGUR loc și acoperă toate cele trei cauze; altfel ar exista o ușă din dos.
T('verificarea de acces se uită la neplată, nu doar la abonament',
  /const np = neplata\.stareNeplata\(e\.facturi, Date\.now\(\)\);[\s\S]{0,200}if \(np\.faza === 'suspendat'\)/.test(server));
T('și la suspendarea pusă de noi', /if \(e\.susp\) return Object\.assign\(\{\}, baza, \{ status: 'expired', motiv: 'manual'/.test(server));
T('toate trei ies ca „expired", ca restul aplicației să nu aibă de învățat altceva',
  (server.match(/status: 'expired', motiv:/g) || []).length >= 2);
// Login-ul e ușa cea mai importantă: dacă acolo se uită doar la abonament, tot restul e degeaba.
const loginuri = [...server.matchAll(/access = await _accessStatusCached\(co\.id\);/g)];
T('și autentificarea (web + telefon) trece prin aceeași verificare', loginuri.length === 2, loginuri.length + ' locuri');
T('nu mai există o verificare de login care se uită doar la abonament',
  !/access = companyAccessStatus\(co\);\s*\n\s*if \(!isSuper/.test(server));
T('mesajul e cel cerut de Alin, scris o singură dată',
  /const MESAJ_SUSPENDAT = 'Abonament suspendat pentru neplată\. Contactați furnizorul\.';/.test(server));
T('și se folosește peste tot, nu copiat de mână',
  (server.match(/error: MESAJ_SUSPENDAT/g) || []).length >= 4, (server.match(/error: MESAJ_SUSPENDAT/g) || []).length + ' locuri');
T('super-adminii nu se blochează niciodată singuri', /if \(!isSuper\(user\.role\) && access\.status === 'expired'\)/.test(server));
// Plata trebuie să dezlege pe loc: cache-ul de 20 de secunde s-ar putea să țină omul blocat.
T('marcarea facturii ca plătită curăță imediat starea de acces',
  /await db\.updateInvoice\(inv\.id, \{ status: 'paid'[\s\S]{0,120}_invalidateAccessCache\(inv\.company_id\)/.test(server));
T('la fel și suspendarea/reactivarea manuală',
  /await db\.setCompanySuspend\([\s\S]{0,200}_invalidateAccessCache\(id\)/.test(server));

sect('4. Avertismentele: patru, nu mai multe, și nu de două ori');
T('treptele sunt 0, 5, 10 și 13 zile', N.TREPTE.map(t => t.zi).join(',') === '0,5,10,13', N.TREPTE.map(t => t.zi).join(','));
T('ultimul avertisment e cel mai apăsat', N.TREPTE[N.TREPTE.length - 1].fel === 'critical');
T('în ziua 0 sună prima treaptă', N.treaptaDeAnuntat(0).zi === 0);
T('în ziua 4 tot prima rămâne (nu se sare)', N.treaptaDeAnuntat(4).zi === 0);
T('în ziua 5 urcă la a doua', N.treaptaDeAnuntat(5).zi === 5);
T('în ziua 12 e a treia', N.treaptaDeAnuntat(12).zi === 10);
T('în ziua 14 e ultimul avertisment', N.treaptaDeAnuntat(14).zi === 13);
// Dacă serverul stă oprit o săptămână, la repornire NU trebuie să trimită patru anunțuri deodată.
T('după o pauză lungă se trimite un singur anunț, cel potrivit zilei', N.treaptaDeAnuntat(11).zi === 10);
T('înainte de scadență nu sună nimic', N.treaptaDeAnuntat(-1) === null && N.treaptaDeAnuntat(null) === null);
T('fiecare treaptă sună o singură dată (cheia are ziua în ea)',
  /const cheie = 'neplata:' \+ f\.id \+ ':' \+ treapta\.zi;[\s\S]{0,120}notificationKeyExists\(cheie/.test(server));
T('suspendarea se anunță o singură dată per factură',
  /const cheie = 'neplata_suspendat:' \+ f\.id;[\s\S]{0,120}notificationKeyExists\(cheie/.test(server));
T('anunțul merge și pe email, dacă firma are adresă', /mailer\.send\(\{ to: email, subject: 'RA Tracks — ' \+ treapta\.titlu/.test(server));
T('iar noi aflăm separat când s-a suspendat cineva', /_anuntaSuperadmini\(supers, 'neplata_suspendat_intern'/.test(server));
T('companiile demo nu intră în ceas', /AND COALESCE\(c\.is_demo, false\) = false/.test(dbjs));
T('ceasul rulează de mai multe ori pe zi, ca ziua 16 să însemne ziua 16',
  /setInterval\(\(\) => neplataTick\(\)\.catch\(\(\) => \{\}\), 6 \* 60 \* 60 \* 1000\)/.test(server));
T('se poate rula și cu mâna', /app\.post\('\/api\/admin\/billing\/check-neplata', requireAuth, requireSuperadmin/.test(server));

sect('4b. Termenul de plată de ZERO zile („plata la emitere")');
// Defect găsit probând suspendarea: `parseInt(0) || 15` dă 15, fiindcă zero e o valoare FALSĂ în
// JavaScript. Adică o firmă cu „plata la emitere" primea în tăcere 15 zile de termen — și ceasul
// de neplată pornea cu două săptămâni mai târziu decât trebuia. Era în TREI locuri.
T('nu mai există nicăieri capcana `parseInt(...) || 15`',
  !/parseInt\(co\.payment_term_days\) \|\| 15/.test(server) && !/parseInt\(b\.payment_term_days\) \|\| 15/.test(server));
T('termenul se citește ca NUMĂR, nu ca adevărat/fals',
  (server.match(/Number\.isFinite\(_t[a-z]*\) \? _t[a-z]* : 15/g) || []).length >= 2,
  (server.match(/Number\.isFinite\(_t[a-z]*\) \? _t[a-z]* : 15/g) || []).length + ' locuri');
T('și la salvarea configurării de facturare', /Number\.isFinite\(t\) \? t : 15/.test(server));
T('un termen lipsă rămâne 15 zile, ca înainte', /: 15/.test(server));

sect('5. Textele și suspendarea manuală');
const mAvert = N.mesajClient(st(7), N.treaptaDeAnuntat(7));
T('avertismentul spune numărul facturii', /RAT-2026-00042/.test(mAvert), mAvert);
T('spune și suma', /1\.234,50 RON/.test(mAvert), mAvert);
T('spune în câte zile se suspendă', /în 9 zile/.test(mAvert), mAvert);
T('și data exactă', /până la \d{2}\.\d{2}\.\d{4}/.test(mAvert), mAvert);
const mSusp = N.mesajClient(st(20), null);
T('mesajul de suspendare spune că accesul e oprit', /suspendat pentru neplată/.test(mSusp), mSusp);
T('și că se reia imediat ce plătește', /se reia imediat ce plata e înregistrată/.test(mSusp), mSusp);
T('nicăieri nu se cere clientului să sune „furnizorul" în avertisment', !/furnizorul/i.test(mAvert));

T('suspendarea manuală cere OBLIGATORIU un motiv',
  /if \(pornit && !motiv\) return res\.status\(400\)[\s\S]{0,120}Scrie motivul suspendării/.test(server));
T('motivul rămâne scris în dosarul firmei', /ALTER TABLE companies ADD COLUMN IF NOT EXISTS suspend_reason/.test(dbjs));
T('se trece și cine a suspendat', /ALTER TABLE companies ADD COLUMN IF NOT EXISTS suspended_by/.test(dbjs));
T('și în jurnalul de audit', /auditReq\(req, pornit \? 'suspend' : 'unsuspend', 'company'/.test(server));
T('compania demo nu se suspendă de aici', /Compania demo nu se suspendă de aici/.test(server));
T('doar fondatorii pot suspenda', /app\.put\('\/api\/companies\/:id\/suspend', requireAuth, requireSuperadmin/.test(server));

sect('6. Ce se vede pe ecran');
T('rândul firmei arată SUSPENDAT, cu motivul, nu doar „expirat"',
  /oprit de noi/.test(html) && /suspendat — neplată/.test(html) && /suspendat — abonament/.test(html));
T('o restanță în derulare arată numărătoarea inversă', /restanță · ' \+ np\.zilePanaLaSuspendare \+ ' zile/.test(html));
T('în fila „Abonament & plăți" e starea și butonul de suspendare', /function _raxSuspendHtml\(\)/.test(html));
T('motivul se scrie în pagină, nu în fereastra gri a browserului',
  /id="rax-susp-motiv"/.test(html) && !/prompt\('De ce/.test(html));
T('scrie limpede că aparatele transmit mai departe',
  /Aparatele transmit mai departe, datele nu se pierd/.test(html));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
