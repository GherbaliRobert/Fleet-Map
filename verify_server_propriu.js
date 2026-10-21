// verify_server_propriu.js — instalarea pentru server propriu să NU mai rămână în urmă.
//
//   node verify_server_propriu.js
//
// Găsit pe 20.10, când Robert a întrebat dacă putem ține toată aplicația pe un server al nostru:
// `docker-compose.prod.yml` dădea aplicației o listă de variabile scrisă de mână, de dinainte de
// RA Insight, Brevo și panoul Mail. Pornită așa, aplicația mergea — dar fără AI, fără emailuri trimise
// sau primite, fără ANAF și fără notificări pe telefon: cheile lor nu ajungeau la ea. Pe deasupra,
// exemplul de `.env` punea `POSITION_RETENTION_DAYS=180` (variabila retrasă pe 24.09) și domeniul
// `app.ratrack.ro`, pe care nu-l folosește nimeni (telefonul și emailurile merg la ratrack.ro).
//
// Ce apără proba:
//   1. aplicația primește TOT `.env`-ul (`env_file`), iar ce ține de mașină (baza, porturile) îl bate;
//   2. nicio listă de copiat pe mână nu se mai strecoare înapoi;
//   3. exemplul de `.env` numește doar variabile pe care codul chiar le citește, cu cheile serviciilor;
//   4. ghidul pornește cu versiunea (GIT_SHA), ca `/api/health` să nu scrie „dev";
//   5. dacă e `docker compose` pe mașină: configurația REZOLVATĂ, cu un `.env` ca cel copiat din Railway.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const P = (f) => path.join(__dirname, f);
const citeste = (f) => (fs.existsSync(P(f)) ? fs.readFileSync(P(f), 'utf8') : '');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

const compose = citeste('docker-compose.prod.yml');
const exemplu = citeste('.env.prod.exemplu');
const ghid = citeste('DEPLOY-VPS.md');
const faraComentarii = (s) => s.split('\n').filter((r) => !/^\s*#/.test(r)).map((r) => r.replace(/\s+#.*$/, '')).join('\n');

// Cheile serviciilor: fără ele, aplicația pornește, dar lucrul lor se oprește în tăcere.
const CHEI_SERVICII = ['ANTHROPIC_API_KEY', 'BREVO_API_KEY', 'EMAIL_FROM', 'BASE_URL', 'MAIL_INBOUND_SECRET',
  'FIREBASE_SA_JSON', 'ANAF_EFACTURA_TOKEN', 'ANAF_CIF', 'ANAF_ETRANSPORT_TOKEN'];
// Ce ține de mașina asta și trebuie să bată `.env`-ul (copiat din Railway, cu baza și portul lor).
const ALE_MASINII = ['PORT', 'TCP_PORT', 'NODE_ENV', 'DATABASE_URL', 'PGSSL', 'COOKIE_SECURE'];

sect('1. Aplicația primește tot .env-ul');
T('fișierele există', !!compose && !!exemplu && !!ghid);
// Blocul serviciului `app`: de la „  app:" până la următorul serviciu (două spații + nume + „:").
const mApp = faraComentarii(compose).match(/\n  app:\n([\s\S]*?)(?=\n  [a-z][a-z0-9_-]*:\n|\nvolumes:)/);
const app = mApp ? mApp[1] : '';
T('serviciul app există în docker-compose.prod.yml', !!app);
T('app are env_file: .env', /\n    env_file:\s*\n\s+-\s*\.env\s*(\n|$)/.test('\n' + app), app.slice(0, 200));
const env = {};
const mEnv = app.match(/\n    environment:\n((?:      - .*\n?)+)/);
(mEnv ? mEnv[1] : '').split('\n').forEach((r) => { const m = r.match(/^\s+-\s*([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); });
ALE_MASINII.forEach((k) => T(k + ' e scris de compose (bate .env-ul)', k in env && env[k] !== '', env[k]));
T('DATABASE_URL duce la baza din container', /@postgres:5432\//.test(env.DATABASE_URL || ''), env.DATABASE_URL);
T('GIT_SHA vine din comanda de pornire', /^\$\{GIT_SHA(:-)?\}$/.test(env.GIT_SHA || ''), env.GIT_SHA);
// server.js citește RAILWAY_GIT_COMMIT_SHA ÎNAINTEA lui GIT_SHA: copiată din Railway, ar îngheța versiunea.
T('RAILWAY_GIT_COMMIT_SHA e golită', env.RAILWAY_GIT_COMMIT_SHA === '', env.RAILWAY_GIT_COMMIT_SHA);
const server = citeste('server.js');
T('server.js chiar citește RAILWAY_GIT_COMMIT_SHA înaintea lui GIT_SHA (altfel golirea n-are rost)',
  /process\.env\.RAILWAY_GIT_COMMIT_SHA \|\| process\.env\.GIT_SHA/.test(server));

sect('2. Nicio listă de copiat pe mână');
// Un rând `- X=${X:-}` doar copiază din .env — exact lista care a rămas în urmă. GIT_SHA e singura
// excepție: vine din comanda de pornire (shell), pe care env_file n-o vede.
const copii = Object.keys(env).filter((k) => k !== 'GIT_SHA' && new RegExp('^\\$\\{' + k + '(:-)?\\}$').test(env[k]));
T('niciun rând care doar copiază din .env', copii.length === 0, copii.join(', '));

sect('3. Exemplul de .env numește doar ce citește codul');
const fisiereCod = fs.readdirSync(__dirname).filter((f) => f.endsWith('.js') && !/^(verify_|test_|ci-smoke)|_smoke\.js$/.test(f));
const citite = new Set();
fisiereCod.forEach((f) => {
  const s = fs.readFileSync(P(f), 'utf8');
  (s.match(/process\.env\.([A-Z][A-Z0-9_]*)/g) || []).forEach((x) => citite.add(x.slice(12)));
  (s.match(/process\.env\[\s*['"]([A-Z][A-Z0-9_]*)['"]\s*\]/g) || []).forEach((x) => citite.add(x.replace(/.*['"]([A-Z0-9_]+)['"].*/, '$1')));
});
const dinCompose = new Set((compose.match(/\$\{([A-Z][A-Z0-9_]*)/g) || []).map((x) => x.slice(2)));
const numite = [];
exemplu.split('\n').forEach((r) => { const m = r.match(/^#?\s*([A-Z][A-Z0-9_]*)=/); if (m) numite.push(m[1]); });
T('exemplul numește variabile', numite.length >= 20, numite.length);
const moarte = numite.filter((k) => !citite.has(k) && !dinCompose.has(k));
T('fiecare variabilă din exemplu e citită de cod sau de compose', moarte.length === 0, moarte.join(', '));
const scrise = new Set(faraComentarii(exemplu).split('\n').map((r) => (r.match(/^([A-Z][A-Z0-9_]*)=/) || [])[1]).filter(Boolean));
CHEI_SERVICII.forEach((k) => T(k + ' e în exemplu (necomentată) și o citește codul', scrise.has(k) && citite.has(k)));
T('POSITION_RETENTION_DAYS (retrasă) nu e pusă nici în exemplu, nici în compose',
  !/^\s*-?\s*POSITION_RETENTION_DAYS=/m.test(faraComentarii(exemplu) + '\n' + faraComentarii(compose)));
T('compose nu mai promite „180 de zile"', !/180 de zile/.test(compose));
const dom = (faraComentarii(exemplu).match(/^DOMAIN=(.*)$/m) || [])[1];
const baza = (faraComentarii(exemplu).match(/^BASE_URL=(.*)$/m) || [])[1];
T('DOMAIN = gazda din BASE_URL (aplicația, telefonul și emailurile pe același domeniu)',
  !!dom && !!baza && baza.trim() === 'https://' + dom.trim(), dom + ' / ' + baza);
const implicitMailer = (citeste('mailer.js').match(/process\.env\.BASE_URL \|\| '([^']+)'/) || [])[1];
T('BASE_URL din exemplu = adresa de rezervă a emailurilor (mailer.js)', !!implicitMailer && baza === implicitMailer, implicitMailer);

sect('4. Ghidul pornește cu versiunea');
const porniri = (ghid + '\n' + compose).split('\n').filter((r) => /docker compose -f docker-compose\.prod\.yml up\b/.test(r));
T('ghidul are comenzi de pornire', porniri.length >= 2, porniri.length);
const faraVersiune = porniri.filter((r) => !/GIT_SHA=\$\(git rev-parse --short HEAD\) docker compose/.test(r));
T('fiecare pornire dă GIT_SHA', faraVersiune.length === 0, faraVersiune.join(' | '));

sect('5. Configurația rezolvată de docker compose (cu un .env ca cel din Railway)');
const ver = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8', timeout: 20000 });
if (ver.status !== 0) {
  console.log('  (sărit: docker compose nu e pe mașina asta)');
} else {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ra-compose-'));
  try {
    fs.writeFileSync(path.join(dir, 'docker-compose.prod.yml'), compose);
    fs.writeFileSync(path.join(dir, 'Caddyfile'), citeste('Caddyfile'));
    // Cum arată un .env după „Raw Editor" din Railway lipit la capăt: aceleași chei, a doua oară,
    // plus baza, portul și versiunea Railway-ului. Cheia JSON — între apostrofuri, ca în ghid.
    const jsonFcm = '{"type":"service_account","private_key":"-----BEGIN-----\\nAAA\\n-----END-----\\n","x":"a b"}';
    fs.writeFileSync(path.join(dir, '.env'), [
      'DOMAIN=ratrack.ro', 'DB_PASSWORD=parola-bazei', 'SESSION_SECRET=s', 'ADMIN_PASSWORD=a', 'ANTHROPIC_API_KEY=',
      'ANTHROPIC_API_KEY=sk-ant-din-railway', 'BREVO_API_KEY=xkeysib-1', 'MAIL_INBOUND_SECRET=m1',
      'DATABASE_URL=postgres://u:p@x.proxy.rlwy.net:1234/railway', 'PORT=8080', 'RAILWAY_GIT_COMMIT_SHA=abcdef0123',
      'O_VARIABILA_NOUA=da', "FIREBASE_SA_JSON='" + jsonFcm + "'", ''].join('\n'));
    const r = spawnSync('docker', ['compose', '-f', 'docker-compose.prod.yml', 'config', '--format', 'json'],
      { cwd: dir, encoding: 'utf8', timeout: 60000, env: { ...process.env, GIT_SHA: '1234567' } });
    let e = null;
    try { e = JSON.parse(r.stdout).services.app.environment; } catch (x) {}
    T('docker compose citește configurația', !!e, (r.stderr || '').slice(0, 300));
    if (e) {
      T('cheile serviciilor ajung la aplicație (ultima scriere câștigă)',
        e.ANTHROPIC_API_KEY === 'sk-ant-din-railway' && e.BREVO_API_KEY === 'xkeysib-1' && e.MAIL_INBOUND_SECRET === 'm1');
      T('o variabilă nouă ajunge fără să fie scrisă în compose', e.O_VARIABILA_NOUA === 'da');
      T('baza din container bate baza din Railway', e.DATABASE_URL === 'postgres://ratracks:parola-bazei@postgres:5432/ratracks', e.DATABASE_URL);
      T('portul mașinii bate portul din Railway', e.PORT === '3000', e.PORT);
      T('versiunea = GIT_SHA, nu cea din Railway', e.GIT_SHA === '1234567' && e.RAILWAY_GIT_COMMIT_SHA === '', e.GIT_SHA + ' / ' + e.RAILWAY_GIT_COMMIT_SHA);
      let fcm = null; try { fcm = JSON.parse(e.FIREBASE_SA_JSON); } catch (x) {}
      T('cheia Firebase între apostrofuri rămâne JSON bun (cheia privată întreagă)',
        !!fcm && fcm.private_key === '-----BEGIN-----\nAAA\n-----END-----\n' && fcm.x === 'a b');
    }
  } finally { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (x) {} }
}

console.log('\n' + (rele ? '✗ ' + rele + ' picate, ' + ok + ' trecute' : '✓ toate ' + ok + ' trecute'));
process.exit(rele ? 1 : 0);
