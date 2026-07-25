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
];

const MAGIC = 'RATBK1'; // antet fișier criptat: MAGIC | salt(16) | iv(12) | tag(16) | ciphertext

// `ok` = dump-ul s-a generat fără eroare. NU înseamnă că datele sunt în siguranță!
// `offsite` = dump-ul a ajuns EFECTIV în afara containerului (S3/R2). Fără S3 configurat, dump-ul se
// generează și se ARUNCĂ — pe Railway filesystemul e efemer, deci un „ok" fără „offsite" = zero protecție.
// Le ținem separate ca UI-ul să nu mai poată raporta „backup rulat ✓" pentru o rulare care n-a salvat nimic.
let _last = { at: null, ok: null, offsite: false, target: null, sizeBytes: 0, tables: null, error: null, encrypted: false, warning: null };
function passphraseSet() { return !!process.env.BACKUP_PASSPHRASE; }
function getStatus() {
  const ageH = _last.at ? (Date.now() - new Date(_last.at).getTime()) / 3600000 : null;
  return Object.assign({}, _last, {
    s3Configured: s3Configured(),
    passphraseSet: passphraseSet(),
    ageHours: ageH == null ? null : Math.round(ageH * 10) / 10,
    stale: ageH == null ? true : ageH > 48,      // backup zilnic → peste 48h înseamnă că workerul n-a mai rulat
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
    if (!offsite) console.warn('[BACKUP] ⚠ dump generat (' + b.rows + ' rânduri, ' + Math.round(b.buf.length / 1024) + ' KB) dar NU s-a salvat nicăieri: ' + warning);
    else console.log('[BACKUP] ' + target + ' (' + b.rows + ' rânduri, ' + Math.round(b.buf.length / 1024) + ' KB, ' + (b.encrypted ? 'criptat' : 'NECRIPTAT ⚠') + ')');
    return getStatus();
  } catch (e) {
    _last = Object.assign({}, _last, { at: new Date().toISOString(), ok: false, offsite: false, error: e.message, warning: null });
    console.error('[BACKUP] eșuat:', e.message);
    return getStatus();
  }
}

module.exports = { BUSINESS_TABLES, buildDump, serialize, deserialize, makeBackup, runScheduledBackup, getStatus, s3Configured, passphraseSet, configWarning };
