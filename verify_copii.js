// verify_copii.js — copiile zilnice: CÂND rulează și CUM sunt construite. Fără server, fără bază.
//
//   node verify_copii.js
//
// Ce prinde:
//   1. backup-ul complet pornit din nou la fiecare repornire a serverului — cu deploy-urile dese rula de câteva
//      ori pe zi, exact după valul de reconectare al aparatelor;
//   2. o copie eșuată reîncercată la nesfârșit (un dump complet în memorie la fiecare verificare);
//   3. revenirea la textul uriaș (limita V8) sau la comprimarea sincronă, care îngheață serverul;
//   4. arhiva de poziții strânsă iar pe zile întregi în memorie.
const fs = require('fs');
const path = require('path');
delete process.env.BACKUP_HOUR;
const backup = require('./backup');
const bkSrc = fs.readFileSync(path.join(__dirname, 'backup.js'), 'utf8');
const svSrc = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const dbSrc = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');

let ok = 0, rele = 0;
function T(nume, cond, detaliu) {
  if (cond) { ok++; console.log('  ✓ ' + nume); }
  else { rele++; console.log('  ✗ ' + nume + (detaliu !== undefined ? ' → ' + JSON.stringify(detaliu) : '')); }
}
function functia(src, antet) {
  const a = src.indexOf(antet);
  if (a < 0) return '';
  const urm = [src.indexOf('\nasync function ', a + 10), src.indexOf('\nfunction ', a + 10)].filter((x) => x > 0);
  return src.slice(a, urm.length ? Math.min.apply(null, urm) : src.length);
}
const RO = (zi, ora, min) => Date.parse(zi + 'T' + String(ora).padStart(2, '0') + ':' + String(min || 0).padStart(2, '0') + ':00+03:00');
const iso = (ms) => new Date(ms).toISOString();

console.log('\n1. Ceasul după care se programează');
{
  const v = backup.localRO(Date.parse('2026-09-12T00:30:00Z'));
  T('vara: 00:30 UTC e 03:30 în România, aceeași zi', v.zi === '2026-09-12' && v.ora === 3, v);
  const i = backup.localRO(Date.parse('2026-01-15T23:30:00Z'));
  T('iarna: 23:30 UTC e deja a doua zi, 01:30', i.zi === '2026-01-16' && i.ora === 1, i);
}

console.log('\n2. Backup-ul de business: o dată pe zi, noaptea');
{
  T('la 02:00 nu rulează, chiar dacă n-a rulat niciodată', !backup.backupDue(RO('2026-09-12', 2), { at: null }));
  T('la 03:10 rulează, dacă ultima copie e de ieri', backup.backupDue(RO('2026-09-12', 3, 10), { at: iso(RO('2026-09-11', 3, 5)), ok: true }));
  const reusit = { at: iso(RO('2026-09-12', 3, 5)), ok: true, day: '2026-09-12', tries: 1 };
  T('un deploy la prânz NU mai pornește încă un backup complet', !backup.backupDue(RO('2026-09-12', 12), reusit));
  T('nici trei deploy-uri seara', ![18, 20, 23].some((h) => backup.backupDue(RO('2026-09-12', h), reusit)));
  T('serverul oprit la 3 noaptea: copia se face când revine, în aceeași zi', backup.backupDue(RO('2026-09-12', 10), { at: iso(RO('2026-09-11', 3, 5)), ok: true, day: '2026-09-11' }));
  const esec = { at: iso(RO('2026-09-12', 3, 5)), ok: false, target: 'none', day: '2026-09-12', tries: 1 };
  T('după un eșec, nu reîncearcă imediat', !backup.backupDue(RO('2026-09-12', 3, 40), esec));
  T('după un eșec, reîncearcă după o oră', backup.backupDue(RO('2026-09-12', 4, 10), esec));
  T('dar nu de mai mult de 3 ori pe zi', !backup.backupDue(RO('2026-09-12', 9), Object.assign({}, esec, { tries: 3 })));
  T('refuzul de a urca necriptat nu se reia la fiecare oră', !backup.backupDue(RO('2026-09-12', 9), Object.assign({}, esec, { target: 'refuzat' })));
  T('a doua zi, după refuz, încearcă din nou', backup.backupDue(RO('2026-09-13', 3, 10), Object.assign({}, esec, { target: 'refuzat' })));
  T('starea salvată de versiunea veche (fără „day") e înțeleasă', !backup.backupDue(RO('2026-09-12', 15), { at: iso(RO('2026-09-12', 3, 5)), ok: true }));
  T('după un refuz ieri, o eroare azi se reîncearcă (nu rămâne blocată pe „refuzat")', backup.backupDue(RO('2026-09-13', 6), { at: iso(RO('2026-09-13', 3, 5)), ok: false, target: 'eroare', day: '2026-09-13', tries: 1 }));
  T('un proces oprit în timpul copiei contează ca încercare', !backup.backupDue(RO('2026-09-12', 3, 30), { at: iso(RO('2026-09-12', 3, 5)), ok: false, target: 'în curs', day: '2026-09-12', tries: 1 }));
}

console.log('\n3. Arhiva de poziții');
{
  T('la 02:00 nu rulează', !backup.positionsExportDue(RO('2026-09-12', 2), null));
  T('la 03:10 rulează', backup.positionsExportDue(RO('2026-09-12', 3, 10), null));
  T('o singură dată pe zi', !backup.positionsExportDue(RO('2026-09-12', 20), '2026-09-12'));
}

console.log('\n4. Cum sunt construite (fără text uriaș, fără comprimare care blochează)');
{
  const mk = functia(bkSrc, 'async function makeBackup(');
  T('backup-ul nu mai lipește toată baza într-un singur text', mk.length > 0 && !/JSON\.stringify\(dump\)/.test(mk) && !/buildDump\(/.test(mk));
  T('și nu comprimă sincron', !/gzipSync/.test(mk) && /_gzipCollector/.test(mk));
  T('citește tabelele pe loturi, după id', /WHERE id > \$1 ORDER BY id LIMIT/.test(mk));
  T('și pune un marcaj de sfârșit', /_end:/.test(mk));
  const ex = functia(bkSrc, 'async function exportPositionsRange(');
  T('arhiva de poziții nu comprimă sincron', ex.length > 0 && !/gzipSync/.test(ex) && /_gzipCollector/.test(ex));
  T('și lucrează pe ore, nu pe zi întreagă', /for \(let h = 0; h < 24; h\+\+\)/.test(ex));
  T('fișierele poartă ziua și ora în nume', /prefix \+ '\/' \+ day \+ '\/' \+ hh \+ '\.'/.test(ex));
  T('restaurarea refuză un fișier tăiat', /Backup incomplet/.test(bkSrc));
  const col = functia(bkSrc, 'function _gzipCollector(');
  T('nici comprimarea însăși nu e sincronă', col.length > 0 && /createGzip/.test(col) && !/gzipSync/.test(col));
  T('criptarea se face pe măsură, bucată cu bucată', /cipher\.update\(c\)/.test(col));
  T('nu mai există criptarea pe tot fișierul lipit (_encrypt)', !/function _encrypt\(/.test(bkSrc));
  T('arhiva așteaptă să treacă o zi întreagă (poziții descărcate târziu)', /POSITIONS_EXPORT_LAG_DAYS/.test(ex));
  const run = functia(bkSrc, 'async function runScheduledBackup(');
  T('încercarea se notează ÎNAINTE de copie (un proces oprit nu reia copia la fiecare pornire)', run.indexOf('saveState(db)') > -1 && run.indexOf('saveState(db)') < run.indexOf('makeBackup(db'));
  T('un tabel citit pe jumătate nu face copia „reușită"', /incomplete\.length === 0/.test(run));
}

console.log('\n4b. Ce intră în copie');
{
  // Orice tabel creat în cod trebuie să fie ori în backup, ori exclus cu motiv. Exact așa lipseau contractele semnate.
  const tabele = new Set();
  for (const src of [dbSrc, svSrc]) for (const m of src.matchAll(/CREATE TABLE IF NOT EXISTS ([a-z_0-9]+)/g)) tabele.add(m[1]);
  const neclasificate = Array.from(tabele).filter((t) => !backup.BUSINESS_TABLES.includes(t) && !Object.prototype.hasOwnProperty.call(backup.BACKUP_EXCLUDED, t));
  T('fiecare tabel din cod e ori în backup, ori exclus cu motiv (' + tabele.size + ' tabele)', tabele.size > 30 && neclasificate.length === 0, neclasificate);
  T('contractele semnate, actele adiționale, rolurile și agenda firmelor intră în backup', ['contracts', 'acte_aditionale', 'montaje', 'montaj_parteneri', 'company_roles', 'company_emails'].every((t) => backup.BUSINESS_TABLES.includes(t)));
  T('fiecare excludere are un motiv scris', Object.values(backup.BACKUP_EXCLUDED).every((v) => typeof v === 'string' && v.length > 15));
  T('nimic nu e și în backup, și exclus', backup.BUSINESS_TABLES.every((t) => !Object.prototype.hasOwnProperty.call(backup.BACKUP_EXCLUDED, t)));
}

console.log('\n5. Serverul nu mai pornește copiile după fiecare repornire');
{
  T('nu mai există backup-ul la 5 minute după pornire', !/setTimeout\(\(\) => backup\.runScheduledBackup/.test(svSrc));
  T('nici arhiva de poziții la 8 minute după pornire', !/setTimeout\(\(\) => backup\.runPositionsExport/.test(svSrc));
  T('planificatorul întreabă backupDue și positionsExportDue', /backup\.backupDue\(Date\.now\(\)\)/.test(svSrc) && /backup\.positionsExportDue\(Date\.now\(\)\)/.test(svSrc));
  T('și nu pornește o copie peste una în curs', /if \(_copieInCurs\) return;/.test(svSrc));
}

console.log('\n6. Planificatorul REAL din server.js chiar pornește copiile');
(async () => {
  // Decupăm blocul din server.js și îl rulăm cu un setInterval fals (ține minte funcția, nu așteaptă 10 minute) și cu
  // un „backup" fals care numără ce i se cere. Așa se vede cablajul, nu doar logica lui backupDue.
  const a = svSrc.indexOf('  let _copieInCurs = false;');
  const b = svSrc.indexOf('}, 10 * 60 * 1000).unref();', a);
  T('blocul planificatorului se găsește în server.js', a > 0 && b > a);
  if (a > 0 && b > a) {
    const cod = svSrc.slice(a, b + '}, 10 * 60 * 1000).unref();'.length);
    let tic = null, interval = null;
    const setIntervalFals = (fn, ms) => { tic = fn; interval = ms; return { unref() {} }; };
    const stare = { due: true, posDue: true, s3: true, copii: 0, arhive: 0, inCurs: 0, maxInCurs: 0 };
    const backupFals = {
      backupDue: () => stare.due,
      positionsExportDue: () => stare.posDue,
      s3Configured: () => stare.s3,
      runScheduledBackup: async () => { stare.copii++; stare.inCurs++; stare.maxInCurs = Math.max(stare.maxInCurs, stare.inCurs); await new Promise((r) => setTimeout(r, 50)); stare.inCurs--; },
      runPositionsExport: async () => { stare.arhive++; },
    };
    new Function('backup', 'db', 'COMMIT_VER', 'setInterval', cod)(backupFals, {}, 'proba', setIntervalFals);
    T('se verifică din 10 în 10 minute', interval === 10 * 60 * 1000, interval);
    await Promise.all([tic(), tic(), tic()]);           // trei verificări suprapuse
    T('când e momentul, pornește backup-ul', stare.copii === 1, stare.copii);
    T('și nu pornește o copie peste una în curs', stare.maxInCurs === 1, stare.maxInCurs);
    T('arhiva de poziții pornește și ea, cu bucket configurat', stare.arhive === 1, stare.arhive);
    stare.due = false; stare.posDue = false;
    await tic();
    T('când nu e momentul, nu pornește nimic', stare.copii === 1 && stare.arhive === 1);
    stare.posDue = true; stare.s3 = false;
    await tic();
    T('fără bucket configurat, arhiva de poziții nu pornește', stare.arhive === 1, stare.arhive);
  }

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
})().catch((e) => { console.error('EROARE în probă:', e); process.exit(1); });
