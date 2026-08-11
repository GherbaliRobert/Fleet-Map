// backup.js — backup logic al datelor de business (off-site, fără dependențe noi).
//
// DE CE: pe Railway filesystem-ul containerului e efemer (se pierde la redeploy). Datele de business
// (companii, useri, vehicule, șoferi, plăți, setări, documente…) sunt CATASTROFAL de pierdut, spre deosebire
// de telemetria `positions` (uriașă, append-only, mai puțin critică — aia se acoperă cu backup-ul nativ Railway).
// Aici facem un dump LOGIC compact al tabelelor de business → gzip → (opțional) criptat AES-256-GCM →
// livrat off-box: descărcare manuală (super-admin) ȘI/SAU upload automat zilnic la un bucket S3-compatibil (R2/B2/S3).
//
// CONFIG (toate în env, opționale):
//   BACKUP_PASSPHRASE      — dacă e setat, dump-ul e criptat AES-256-GCM (recomandat: conține hash-uri parole + chei API)
//   BACKUP_S3_ENDPOINT     — ex. https://<accountid>.r2.cloudflarestorage.com  (R2) sau https://s3.<region>.amazonaws.com
//   BACKUP_S3_BUCKET       — numele bucket-ului
//   BACKUP_S3_KEY_ID       — access key id
//   BACKUP_S3_SECRET       — secret access key
//   BACKUP_S3_REGION       — implicit 'auto' (R2) / pune regiunea la AWS
//   BACKUP_S3_PREFIX       — prefix cheie, implicit 'ratracks-backup'
// Retenție: setează o regulă de lifecycle pe bucket (ex. „șterge după 30 zile") — nu o gestionăm noi.

const zlib = require('zlib');
const crypto = require('crypto');

// Tabele de business (NU positions/positions_archive = telemetrie; NU error_log = regenerabil/voluminos).
const BUSINESS_TABLES = [
  'companies', 'users', 'user_device_access', 'user_group_access', 'drivers',
  'devices', 'device_groups', 'geofences', 'alerts', 'alert_history', 'maintenance',
  'vehicle_documents', 'fuel_transactions', 'notifications', 'notification_prefs', 'push_subscriptions', 'device_tokens',
  'payments', 'platform_costs', 'costs_payments', 'offers', 'agent_findings',
  'weekly_reports', 'report_schedules', 'report_history', 'api_keys', 'webhooks',
  'tacho_files', 'etransport', 'settings', 'ai_usage', 'ui_prefs', 'trips', 'audit_log',
  // Lipseau, deși sunt exact genul de date care nu se pot reconstrui:
  //  · `invoices` + `invoice_counters` — facturile emise și CONTORUL de numerotare fiscală. O restaurare
  //    fără contor repornește seria de facturi de la 1, ceea ce e o problemă fiscală, nu una tehnică.
  //  · `demo_requests` — datele solicitanților (și singurul loc unde stau; notificarea e fără PII).
  //  · `fuel_price_history` — istoricul prețurilor pe care se calculează retroactiv costurile din rapoarte.
  'invoices', 'invoice_counters', 'demo_requests', 'fuel_price_history',
];

const MAGIC = 'RATBK1'; // antet fișier criptat: MAGIC | salt(16) | iv(12) | tag(16) | ciphertext

// `ok` = dump-ul s-a generat fără eroare. NU înseamnă că datele sunt în siguranță!
// `offsite` = dump-ul a ajuns EFECTIV în afara containerului (S3/R2). Fără S3 configurat, dump-ul se
// generează și se ARUNCĂ — pe Railway filesystemul e efemer, deci un „ok" fără „offsite" = zero protecție.
// Le ținem separate ca UI-ul să nu mai poată raporta „backup rulat ✓" pentru o rulare care n-a salvat nimic.
let _last = { at: null, ok: null, offsite: false, target: null, sizeBytes: 0, tables: null, error: null, encrypted: false, warning: null };
let _loaded = false;   // starea a fost citită din bază (altfel „nicio rulare" poate însemna doar „server repornit")

// Starea trăia DOAR în memoria procesului. Pe Railway, orice redeploy o resetează: ecranul spunea „nicio
// rulare de la pornirea serverului" și `backup_offsite` cădea din verde în galben, deși bucket-ul era plin.
// Invers, un backup mort de șase luni arăta identic cu un server repornit acum — adică nu se putea distinge
// „nu știu" de „e rău". O persistăm în `settings`.
const STATE_KEY = 'backup_last_state';
async function loadState(db) {
  try {
    const raw = await db.getSetting(STATE_KEY);
    if (raw) { const s = JSON.parse(raw); if (s && s.at) { _last = Object.assign(_last, s); } }
  } catch (e) { /* prima pornire / tabelă lipsă */ }
  _loaded = true;
  return _last;
}
async function saveState(db) {
  try { await db.setSetting(STATE_KEY, JSON.stringify(_last)); } catch (e) { /* nu bloca backup-ul pt. starea lui */ }
}

function passphraseSet() { return !!process.env.BACKUP_PASSPHRASE; }
function getStatus() {
  const ageH = _last.at ? (Date.now() - new Date(_last.at).getTime()) / 3600000 : null;
  return Object.assign({}, _last, {
    s3Configured: s3Configured(),
    passphraseSet: passphraseSet(),
    stateLoaded: _loaded,
    ageHours: ageH == null ? null : Math.round(ageH * 10) / 10,
    stale: ageH == null ? true : ageH > 48,      // backup zilnic → peste 48h înseamnă că workerul n-a mai rulat
    // „foarte vechi" e altceva decât „nu s-a rulat încă": primul e o pană, al doilea doar o necunoscută.
    dead: ageH != null && ageH > 96,
    never: ageH == null,
    protected: !!(_last.ok && _last.offsite)     // singurul indicator care chiar înseamnă „datele sunt în siguranță"
  });
}
function s3Configured() { return !!(process.env.BACKUP_S3_ENDPOINT && process.env.BACKUP_S3_BUCKET && process.env.BACKUP_S3_KEY_ID && process.env.BACKUP_S3_SECRET); }
// Avertismentul de configurare — același text pe web, pe APK și în log (o singură sursă de adevăr).
function configWarning(uploaded) {
  if (!s3Configured()) return 'BACKUP_S3_* nu e configurat → dump-ul NU a fost salvat în afara serverului. Pe Railway filesystemul containerului se pierde la redeploy: în acest moment singura copie e cea descărcată manual.';
  if (uploaded && !passphraseSet()) return 'BACKUP_PASSPHRASE nu e setat → backup-ul a fost urcat NECRIPTAT, deși conține hash-uri de parole, chei API și date de clienți.';
  return null;
}

// ── Dump logic ──
async function buildDump(db, commit) {
  const meta = { at: new Date().toISOString(), version: commit || null, mode: process.env.DATABASE_URL ? 'postgres' : 'pglite', tables: {} };
  const data = {};
  for (const t of BUSINESS_TABLES) {
    try {
      const r = await db.pool.query('SELECT * FROM ' + t);
      data[t] = r.rows || [];
      meta.tables[t] = data[t].length;
    } catch (e) { meta.tables[t] = 'skip: ' + (e.code || e.message); }
  }
  return { _meta: meta, data: data };
}

// ── Serializare: JSON → gzip → (opțional) AES-256-GCM ──
function serialize(dump, passphrase) {
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(dump), 'utf8'), { level: 9 });
  if (!passphrase) return { buf: gz, encrypted: false, ext: 'json.gz' };
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(gz), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { buf: Buffer.concat([Buffer.from(MAGIC), salt, iv, tag, ct]), encrypted: true, ext: 'json.gz.enc' };
}
function deserialize(buf, passphrase) {
  if (buf.slice(0, MAGIC.length).toString() === MAGIC) {
    if (!passphrase) throw new Error('Fișier criptat: lipsește BACKUP_PASSPHRASE');
    let o = MAGIC.length;
    const salt = buf.slice(o, o += 16), iv = buf.slice(o, o += 12), tag = buf.slice(o, o += 16), ct = buf.slice(o);
    const key = crypto.scryptSync(passphrase, salt, 32);
    const dec = crypto.createDecipheriv('aes-256-gcm', key, iv);
    dec.setAuthTag(tag);
    const gz = Buffer.concat([dec.update(ct), dec.final()]);
    return JSON.parse(zlib.gunzipSync(gz).toString('utf8'));
  }
  return JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
}

// ── S3-compatible PUT (SigV4, fără SDK) ──
function _sha256hex(b) { return crypto.createHash('sha256').update(b).digest('hex'); }
function _hmac(key, s) { return crypto.createHmac('sha256', key).update(s).digest(); }
function _encodeSeg(s) { return encodeURIComponent(s).replace(/[!'()*]/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); }); }

async function s3Put(key, body, contentType) {
  const endpoint = process.env.BACKUP_S3_ENDPOINT.replace(/\/+$/, '');
  const bucket = process.env.BACKUP_S3_BUCKET;
  const region = process.env.BACKUP_S3_REGION || 'auto';
  const accessKey = process.env.BACKUP_S3_KEY_ID, secret = process.env.BACKUP_S3_SECRET;
  const host = new URL(endpoint).host;
  const canonicalUri = '/' + _encodeSeg(bucket) + '/' + key.split('/').map(_encodeSeg).join('/');
  const now = new Date();
  const amzdate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');         // YYYYMMDDTHHMMSSZ
  const datestamp = amzdate.slice(0, 8);
  const payloadHash = _sha256hex(body);
  const canonicalHeaders = 'host:' + host + '\n' + 'x-amz-content-sha256:' + payloadHash + '\n' + 'x-amz-date:' + amzdate + '\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
  const canonicalRequest = ['PUT', canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const scope = datestamp + '/' + region + '/s3/aws4_request';
  const stringToSign = ['AWS4-HMAC-SHA256', amzdate, scope, _sha256hex(Buffer.from(canonicalRequest, 'utf8'))].join('\n');
  const kDate = _hmac('AWS4' + secret, datestamp), kRegion = _hmac(kDate, region), kService = _hmac(kRegion, 's3'), kSigning = _hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
  const authorization = 'AWS4-HMAC-SHA256 Credential=' + accessKey + '/' + scope + ', SignedHeaders=' + signedHeaders + ', Signature=' + signature;
  const res = await fetch(endpoint + canonicalUri, {
    method: 'PUT', body: body,
    headers: { 'Authorization': authorization, 'x-amz-date': amzdate, 'x-amz-content-sha256': payloadHash, 'Content-Type': contentType || 'application/octet-stream', 'Content-Length': String(body.length) },
  });
  if (!res.ok) { const txt = await res.text().catch(function () { return ''; }); throw new Error('S3 PUT ' + res.status + ': ' + txt.slice(0, 300)); }
  return canonicalUri;
}

// ── Orchestrare ──
async function makeBackup(db, commit) {
  const dump = await buildDump(db, commit);
  const s = serialize(dump, process.env.BACKUP_PASSPHRASE || null);
  const rows = Object.values(dump._meta.tables).reduce(function (a, v) { return a + (typeof v === 'number' ? v : 0); }, 0);
  return { buf: s.buf, ext: s.ext, encrypted: s.encrypted, meta: dump._meta, rows: rows };
}

// Rulează un backup și, dacă S3 e configurat, îl urcă. Actualizează statusul. Folosit de cron + endpoint manual.
async function runScheduledBackup(db, commit) {
  try {
    const b = await makeBackup(db, commit);
    let target = 'none';
    // REFUZĂM urcarea necriptată. Dump-ul conține hash-uri de parole, chei API, datele tuturor
    // clienților și pozițiile lor. Un bucket configurat greșit, o cheie scursă sau un angajat al
    // furnizorului de stocare — și totul e citibil. Mai bine niciun backup extern decât unul care,
    // singur, e o breșă. Avertismentul apare în „Stare producție" până se setează parola.
    if (s3Configured() && !passphraseSet()) {
      const w = 'BACKUP_PASSPHRASE nu e setată → REFUZ să urc dump-ul necriptat (conține hash-uri de parole, chei API și datele clienților). Setează variabila și backup-ul extern pornește singur.';
      _last = { at: new Date().toISOString(), ok: false, offsite: false, target: 'refuzat',
        sizeBytes: b.buf.length, tables: b.meta.tables, error: w, encrypted: false, warning: w };
      await saveState(db);
      console.error('[BACKUP] ⛔ ' + w);
      return getStatus();
    }
    if (s3Configured()) {
      const prefix = (process.env.BACKUP_S3_PREFIX || 'ratracks-backup').replace(/^\/+|\/+$/g, '');
      const d = new Date();
      const key = prefix + '/' + d.toISOString().slice(0, 10) + '/dump-' + d.toISOString().replace(/[:.]/g, '-') + '.' + b.ext;
      await s3Put(key, b.buf, 'application/octet-stream');
      target = 'S3:' + key;
    }
    const offsite = target !== 'none';
    const warning = configWarning(offsite);
    _last = { at: new Date().toISOString(), ok: true, offsite: offsite, target: target, sizeBytes: b.buf.length, tables: b.meta.tables, error: null, encrypted: b.encrypted, warning: warning };
    await saveState(db);
    if (!offsite) console.warn('[BACKUP] ⚠ dump generat (' + b.rows + ' rânduri, ' + Math.round(b.buf.length / 1024) + ' KB) dar NU s-a salvat nicăieri: ' + warning);
    else console.log('[BACKUP] ' + target + ' (' + b.rows + ' rânduri, ' + Math.round(b.buf.length / 1024) + ' KB, ' + (b.encrypted ? 'criptat' : 'NECRIPTAT ⚠') + ')');
    return getStatus();
  } catch (e) {
    _last = Object.assign({}, _last, { at: new Date().toISOString(), ok: false, offsite: false, error: e.message, warning: null });
    await saveState(db);
    console.error('[BACKUP] eșuat:', e.message);
    return getStatus();
  }
}

// ── Arhivarea POZIȚIILOR pe S3, înainte ca retenția să le șteargă ──
//
// `positions` e exclusă deliberat din dump-ul logic de mai sus: la 2000 de vehicule înseamnă milioane de
// rânduri pe zi, imposibil de serializat într-un singur JSON în procesul aplicației. Dar asta lăsa o gaură
// reală: retenția șterge la 180 de zile, iar dacă snapshot-urile Railway au o fereastră mai scurtă (de regulă
// zile, nu luni), datele dispăreau DEFINITIV fără nicio copie.
// Aici exportăm ziua-cu-ziua, în NDJSON gzip (+ criptat cu aceeași parolă), citit în loturi ca să nu ținem
// niciodată o zi întreagă în memorie. ~30 B/rând comprimat → o zi de flotă mare intră în zeci de MB.
const POS_EXPORT_BATCH = Math.max(1000, Math.min(50000, parseInt(process.env.POSITIONS_EXPORT_BATCH) || 20000));
let _posLast = { at: null, days: 0, rows: 0, bytes: 0, error: null, lastDay: null };
function positionsStatus() {
  const ageH = _posLast.at ? (Date.now() - new Date(_posLast.at).getTime()) / 3600000 : null;
  return Object.assign({}, _posLast, { enabled: s3Configured(), ageHours: ageH == null ? null : Math.round(ageH * 10) / 10 });
}

// Exportă zilele COMPLETE dintre `fromDay` și `toDay` (exclusiv ziua curentă) care încă n-au fost exportate.
// Idempotent prin marca din `settings`: reluăm de unde am rămas, deci o rulare întreruptă nu pierde nimic.
async function exportPositionsRange(db, opts) {
  if (!s3Configured()) return { skipped: 'BACKUP_S3_* neconfigurat' };
  const maxDays = (opts && opts.maxDays) || 7;              // câte zile pe rulare (recuperare treptată)
  const prefix = (process.env.BACKUP_S3_PREFIX || 'ratracks-backup').replace(/^\/+|\/+$/g, '') + '/positions';
  const marker = 'positions_export_until';                  // ultima zi exportată (YYYY-MM-DD)
  let from = null;
  try { from = await db.getSetting(marker); } catch (e) {}
  // Fără marcă: pornim de la cea mai veche zi care există în tabelă (prima rulare pe o bază existentă).
  if (!from) {
    const r = await db.pool.query("SELECT to_char(MIN(timestamp), 'YYYY-MM-DD') AS d FROM positions");
    from = (r.rows[0] && r.rows[0].d) || null;
    if (!from) return { days: 0, rows: 0, note: 'nicio poziție de exportat' };
  } else {
    from = new Date(Date.parse(from + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10); // ziua următoare
  }
  const today = new Date().toISOString().slice(0, 10);
  let day = from, days = 0, rows = 0, bytes = 0, lastDay = null;
  while (day < today && days < maxDays) {
    const next = new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    const parts = [];
    let n = 0, offset = 0;
    for (;;) {
      const q = await db.pool.query(
        `SELECT imei, timestamp, latitude, longitude, altitude, angle, speed, satellites, priority, io_data, company_id
           FROM positions WHERE timestamp >= $1 AND timestamp < $2 ORDER BY timestamp, imei LIMIT ${POS_EXPORT_BATCH} OFFSET ${offset}`,
        [day, next]
      );
      const batch = q.rows || [];
      if (!batch.length) break;
      parts.push(Buffer.from(batch.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8'));
      n += batch.length; offset += POS_EXPORT_BATCH;
      if (batch.length < POS_EXPORT_BATCH) break;
      await new Promise(r => setTimeout(r, 50));            // nu monopoliza pool-ul: ingestul are prioritate
    }
    if (n) {
      const gz = zlib.gzipSync(Buffer.concat(parts), { level: 9 });
      const pass = process.env.BACKUP_PASSPHRASE || null;
      let body = gz, ext = 'ndjson.gz';
      if (pass) {
        const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
        const key = crypto.scryptSync(pass, salt, 32);
        const c = crypto.createCipheriv('aes-256-gcm', key, iv);
        const ct = Buffer.concat([c.update(gz), c.final()]);
        body = Buffer.concat([Buffer.from(MAGIC), salt, iv, c.getAuthTag(), ct]); // același format ca dump-ul
        ext = 'ndjson.gz.enc';
      }
      await s3Put(prefix + '/' + day + '.' + ext, body, 'application/octet-stream');
      bytes += body.length; rows += n;
      console.log('[POZIȚII] ' + day + ': ' + n + ' rânduri → ' + Math.round(body.length / 1024) + ' KB' + (pass ? ' (criptat)' : ' ⚠ NECRIPTAT'));
    }
    try { await db.setSetting(marker, day); } catch (e) {}   // marchez ziua ca terminată chiar dacă era goală
    lastDay = day; day = next; days++;
  }
  _posLast = { at: new Date().toISOString(), days, rows, bytes, error: null, lastDay: lastDay || _posLast.lastDay };
  return { days, rows, bytes, lastDay };
}
async function runPositionsExport(db) {
  try { return await exportPositionsRange(db, { maxDays: parseInt(process.env.POSITIONS_EXPORT_MAX_DAYS) || 7 }); }
  catch (e) {
    _posLast = Object.assign({}, _posLast, { at: new Date().toISOString(), error: e.message });
    console.warn('[POZIȚII] export eșuat:', e.message);
    return { error: e.message };
  }
}

module.exports = { BUSINESS_TABLES, buildDump, serialize, deserialize, makeBackup, runScheduledBackup, getStatus, loadState, s3Configured, passphraseSet, configWarning, exportPositionsRange, runPositionsExport, positionsStatus };
