// ci-smoke.js — pornește serverul (PGlite embedded, SEED_TEST) și rulează suitele de smoke.
// Folosit de `npm test` și de CI. Nu necesită servicii externe (baza e embedded).
const { spawn } = require('child_process');
const fs = require('fs');

const PORT = 3199, TCP = 5199, DIR = '.ci-db';
const env = {
  ...process.env,
  SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_secret_smoke',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR + '/pgdata'
};
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}

const srv = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'ignore', 'inherit'] });
let finished = false;
function finish(code) {
  if (finished) return; finished = true;
  try { srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  process.exit(code);
}
srv.on('exit', (c) => { if (!finished) { console.error('[ci] serverul s-a oprit neașteptat (cod ' + c + ')'); finish(1); } });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitUp() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch('http://localhost:' + PORT + '/api'); if (r.ok) return true; } catch (e) {}
    await sleep(500);
  }
  return false;
}
function runSmoke(script) {
  return new Promise((res) => {
    const c = spawn(process.execPath, [script], { env: { ...env, BASE: 'http://localhost:' + PORT }, stdio: 'inherit' });
    c.on('exit', (code) => res(code || 0));
  });
}
(async () => {
  if (!await waitUp()) { console.error('[ci] serverul nu a pornit la timp'); return finish(1); }
  let fail = 0;
  // verify_can_flags.js nu are nevoie de server (verifică fișierele), dar stă aici ca să prindem
  // la fiecare `npm test` un steag CAN rămas fără nume — altfel dispare tăcut din panou.
  for (const s of ['tenant_smoke.js', 'rbac_smoke.js', 'catalog_smoke.js', 'verify_can_flags.js', 'verify_io_modal.js', 'verify_io_format.js', 'verify_consum.js', 'verify_tacho.js', 'verify_tacho_api.js', 'verify_mobile_tacho.js', 'verify_etransport.js', 'verify_tollro.js', 'verify_tollro_flota.js', 'verify_setari.js', 'verify_aparate.js', 'verify_istoric.js', 'verify_adrese.js', 'verify_roluri.js', 'verify_preferinte.js']) {
    console.log('\n=== ' + s + ' ===');
    if (await runSmoke(s)) fail++;
  }
  console.log('\n[ci] ' + (fail ? (fail + ' suită(e) au picat') : 'toate suitele au trecut ✓'));
  finish(fail ? 1 : 0);
})();
