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
// Desface un fișier de copie (criptat sau nu) până la conținutul necomprimat, ca Buffer.
function _decodeBlob(buf, passphrase) {
  let gz = buf;
  if (buf.slice(0, MAGIC.length).toString() === MAGIC) {
    if (!passphrase) throw new Error('Fișier criptat: lipsește BACKUP_PASSPHRASE');
    let o = MAGIC.length;
    const salt = buf.slice(o, o += 16), iv = buf.slice(o, o += 12), tag = buf.slice(o, o += 16), ct = buf.slice(o);
    const key = crypto.scryptSync(passphrase, salt, 32);
    const dec = crypto.createDecipheriv('aes-256-gcm', key, iv);
    dec.setAuthTag(tag);
    gz = Buffer.concat([dec.update(ct), dec.final()]);
  }
  return zlib.gunzipSync(gz);
}
// Liniile unui Buffer NDJSON, una câte una, fără să-l transforme într-un singur text (aceeași limită V8).
function* ndjsonLines(raw) {
  let start = 0;
  while (start < raw.length) {
    let i = raw.indexOf(10, start);
    if (i === -1) i = raw.length;
    if (i > start) { const line = raw.toString('utf8', start, i).trim(); if (line) yield line; }
    start = i + 1;
  }
}
function deserialize(buf, passphrase) {
  const raw = _decodeBlob(buf, passphrase);
  const nl = raw.indexOf(10);
  const first = raw.toString('utf8', 0, nl === -1 ? Math.min(raw.length, 4096) : nl);
  if (first.indexOf('"format":"ndjson-v2"') === -1) return JSON.parse(raw.toString('utf8')); // formatul vechi: un singur JSON
  const dump = { _meta: null, data: {} };
  let sfarsit = false;
  for (const line of ndjsonLines(raw)) {
    const o = JSON.parse(line);
    if (o._meta) dump._meta = o._meta;
    else if (o._end) { sfarsit = true; dump._meta = Object.assign({}, dump._meta, { tables: o._end.tables }); }
    else if (o.t) (dump.data[o.t] = dump.data[o.t] || []).push(o.r);
  }
  if (!sfarsit) throw new Error('Backup incomplet: fișierul se termină înainte de marcajul de sfârșit (upload întrerupt?).');
  return dump;
}

// ── Restaurare: ordinea o dau legăturile REALE din bază, nu o listă scrisă de mână ──
// BUSINESS_TABLES spune CE intră în backup. Ordinea în care se pun la loc trebuie să respecte cheile străine:
// un vehicul trimite la grupul și la șoferul lui, un drept de acces trimite la grup, un istoric de alertă
// trimite la alertă. Lista punea vehiculele ÎNAINTEA grupurilor — pe o bază goală, fiecare vehicul dintr-un
// grup și fiecare drept pe grup picau la restaurare. Citim legăturile din catalogul bazei, ca o cheie străină
// adăugată mâine să fie respectată fără ca cineva să-și amintească de lista asta.
async function restoreOrder(db, tables) {
  const list = (tables || BUSINESS_TABLES).slice();
  const inList = new Set(list);
  const parents = new Map(list.map(function (t) { return [t, new Set()]; }));
  try {
    const r = await db.pool.query(
      "SELECT tc.relname AS child, tp.relname AS parent FROM pg_constraint c " +
      "JOIN pg_class tc ON tc.oid = c.conrelid JOIN pg_class tp ON tp.oid = c.confrelid " +
      "JOIN pg_namespace n ON n.oid = tc.relnamespace WHERE c.contype = 'f' AND n.nspname = current_schema()");
    for (const e of r.rows) {
      if (inList.has(e.child) && inList.has(e.parent) && e.child !== e.parent) parents.get(e.child).add(e.parent);
    }
  } catch (e) { /* fără acces la catalog: rămâne ordinea din listă */ }
  // Sortare topologică STABILĂ: între tabele fără legătură se păstrează ordinea din listă.
  const order = [], placed = new Set();
  while (order.length < list.length) {
    const next = list.find(function (t) { return !placed.has(t) && Array.from(parents.get(t)).every(function (p) { return placed.has(p); }); });
    if (!next) { for (const t of list) if (!placed.has(t)) { order.push(t); placed.add(t); } break; } // ciclu: restul în ordinea listei
    order.push(next); placed.add(next);
  }
  return order;
}

// Pune la loc un dump (forma { _meta, data: { tabel: [rânduri] } }). `wipe` golește întâi tabelele din dump,
// în ordine INVERSĂ (întâi cine trimite, apoi la cine se trimite) — altfel golirea pica pe chei străine.
async function restoreDump(db, dump, opts) {
  const wipe = !!(opts && opts.wipe);
  const log = (opts && opts.log) || function () {};
  const data = (dump && dump.data) || {};
  const order = await restoreOrder(db, BUSINESS_TABLES);
  const out = { order: order, tables: {}, inserted: 0, skipped: 0, errors: 0 };
  if (wipe) {
    for (const t of order.slice().reverse()) {
      if (!Array.isArray(data[t]) || !data[t].length) continue;
      try { await db.pool.query('DELETE FROM ' + t); } catch (e) { log('  [' + t + '] golire eșuată: ' + e.message.slice(0, 120)); }
    }
  }
  for (const t of order) {
    const rows = Array.isArray(data[t]) ? data[t] : [];
    if (!rows.length) continue;
    let ins = 0, skip = 0, err = 0;
    for (const row of rows) {
      const cols = Object.keys(row);
      const vals = cols.map(function (c) { const v = row[c]; return (v !== null && typeof v === 'object') ? JSON.stringify(v) : v; });
      const ph = cols.map(function (_, i) { return '$' + (i + 1); }).join(',');
      const sql = 'INSERT INTO ' + t + ' (' + cols.map(function (c) { return '"' + c + '"'; }).join(',') + ') VALUES (' + ph + ') ON CONFLICT DO NOTHING';
      try { const r = await db.pool.query(sql, vals); if (r.rowCount > 0) ins++; else skip++; }
      catch (e) { err++; if (err <= 3) log('  [' + t + '] rând eșuat: ' + e.message.slice(0, 160)); }
    }
    out.tables[t] = { inserted: ins, skipped: skip, errors: err, total: rows.length };
    log('  ' + t + ': +' + ins + ' inserate · ' + skip + ' existau · ' + err + ' erori  (din ' + rows.length + ')');
    out.inserted += ins; out.skipped += skip; out.errors += err;
  }
  // Secvențele id (Postgres), ca următorul INSERT să nu se ciocnească de un id restaurat.
  for (const t of order) {
    try { await db.pool.query("SELECT setval(pg_get_serial_sequence('" + t + "','id'), GREATEST((SELECT COALESCE(MAX(id),0) FROM " + t + "), 1))"); } catch (e) { /* tabel fără id serial */ }
  }
  return out;
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
// ── Dump v2 (ndjson): rând cu rând, comprimat în afara firului principal ──
// Varianta veche citea TOATE tabelele în memorie, le lipea într-un singur text JSON și îl comprima cu
// gzipSync la nivel 9. Trei probleme la o flotă mare: textul unic are o limită fixă în V8 (~512 MB) peste care
// backup-ul pică; memoria se dublează (rândurile + textul); iar comprimarea sincronă îngheață serverul
// (recepția, paginile) cât durează. Acum fiecare rând devine o linie, citită pe loturi, iar comprimarea
// rulează pe firele de lucru ale Node. Memoria ține un lot + fișierul comprimat, nu toată baza de două ori.
// `buildDump` și `serialize` de mai sus rămân doar ca să se poată citi și scrie formatul vechi (probe, compatibilitate).
const DUMP_BATCH = Math.max(100, Math.min(10000, parseInt(process.env.BACKUP_BATCH, 10) || 1000));
function _gzipCollector(level) {
  const gz = zlib.createGzip({ level: level == null ? 6 : level });
  const chunks = [];
  let size = 0;
  gz.on('data', function (c) { chunks.push(c); size += c.length; });
  const done = new Promise(function (res, rej) { gz.on('end', res); gz.on('error', rej); });
  return {
    write: function (s) { return new Promise(function (res) { if (gz.write(s)) res(); else gz.once('drain', res); }); },
    end: async function () { gz.end(); await done; return Buffer.concat(chunks, size); },
  };
}
// Criptare AES-256-GCM cu același antet ca până acum: MAGIC | salt(16) | iv(12) | tag(16) | ciphertext.
function _encrypt(gz, passphrase) {
  if (!passphrase) return { buf: gz, encrypted: false };
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(passphrase, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(gz), cipher.final()]);
  return { buf: Buffer.concat([Buffer.from(MAGIC), salt, iv, cipher.getAuthTag(), ct]), encrypted: true };
}
async function _tablesWithId(db) {
  try {
    const r = await db.pool.query("SELECT table_name FROM information_schema.columns WHERE column_name = 'id' AND table_schema = current_schema()");
    return new Set(r.rows.map(function (x) { return x.table_name; }));
  } catch (e) { return new Set(); }
}
async function makeBackup(db, commit) {
  const meta = { at: new Date().toISOString(), version: commit || null, mode: process.env.DATABASE_URL ? 'postgres' : 'pglite', format: 'ndjson-v2', tables: {} };
  const out = _gzipCollector(6);
  await out.write(JSON.stringify({ _meta: { at: meta.at, version: meta.version, mode: meta.mode, format: meta.format } }) + '\n');
  const cuId = await _tablesWithId(db);
  let rows = 0;
  for (const t of BUSINESS_TABLES) {
    let n = 0;
    try {
      if (cuId.has(t)) {
        // Pe loturi, după id: nu ține tot tabelul în memorie și nu încetinește spre final, cum face OFFSET.
        let last = null;
        for (;;) {
          const r = last == null
            ? await db.pool.query('SELECT * FROM ' + t + ' ORDER BY id LIMIT ' + DUMP_BATCH)
            : await db.pool.query('SELECT * FROM ' + t + ' WHERE id > $1 ORDER BY id LIMIT ' + DUMP_BATCH, [last]);
          for (const row of r.rows) { await out.write(JSON.stringify({ t: t, r: row }) + '\n'); n++; }
          if (r.rows.length < DUMP_BATCH) break;
          last = r.rows[r.rows.length - 1].id;
          await new Promise(function (res) { setImmediate(res); }); // recepția are prioritate între loturi
        }
      } else {
        const r = await db.pool.query('SELECT * FROM ' + t); // tabele fără id: mici (setări, contoare, preferințe)
        for (const row of r.rows) { await out.write(JSON.stringify({ t: t, r: row }) + '\n'); n++; }
      }
      meta.tables[t] = n;
      rows += n;
    } catch (e) {
      // Tabelul a căzut la jumătate: rândurile deja scrise rămân în fișier, iar _meta îl marchează.
      meta.tables[t] = 'skip: ' + (e.code || e.message);
    }
  }
  // Marcajul de sfârșit: fără el, un fișier tăiat (upload întrerupt, disc plin) ar arăta ca un backup valid.
  await out.write(JSON.stringify({ _end: { tables: meta.tables, rows: rows } }) + '\n');
  const gz = await out.end();
  const enc = _encrypt(gz, process.env.BACKUP_PASSPHRASE || null);
  return { buf: enc.buf, ext: enc.encrypted ? 'ndjson.gz.enc' : 'ndjson.gz', encrypted: enc.encrypted, meta: meta, rows: rows };
}

// ── Planificarea copiilor: o dată pe zi, noaptea, după ceasul din România ──
// Până acum backup-ul complet pornea la 5 minute după FIECARE pornire a serverului și apoi la 24 de ore de la
// ea. Cu deploy-urile dese, rula de câteva ori pe zi — exact după valul de reconectare al aparatelor.
const _bh = parseInt(process.env.BACKUP_HOUR, 10);
const BACKUP_HOUR = Number.isFinite(_bh) ? Math.max(0, Math.min(23, _bh)) : 3;
function localRO(ms) {
  try {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
    const g = function (k) { const x = p.find(function (y) { return y.type === k; }); return x ? x.value : ''; };
    return { zi: g('year') + '-' + g('month') + '-' + g('day'), ora: parseInt(g('hour'), 10) };
  } catch (e) { const d = new Date(ms); return { zi: d.toISOString().slice(0, 10), ora: d.getUTCHours() }; }
}
// E momentul copiei de business? O dată pe zi, după BACKUP_HOUR. O încercare eșuată din motive trecătoare (S3
// căzut) se reia după cel puțin o oră, de cel mult 3 ori pe zi. Refuzul de a urca necriptat NU se reia: nu se
// schimbă nimic până nu se pune parola, iar un dump complet în memorie la fiecare oră ar fi degeaba.
function backupDue(nowMs, stare) {
  const s = stare || _last;
  const acum = localRO(nowMs);
  if (acum.ora < BACKUP_HOUR) return false;
  const ziUltima = s.day || (s.at ? localRO(new Date(s.at).getTime()).zi : null);
  if (ziUltima !== acum.zi) return true;
  if (s.ok || s.target === 'refuzat') return false;
  if ((s.tries || 0) >= 3) return false;
  return !s.at || (nowMs - new Date(s.at).getTime()) >= 3600000;
}
// Arhiva de poziții: o dată pe zi pe proces, după BACKUP_HOUR. După o repornire rulează din nou, dar e ieftin:
// marca din `settings` o face să sară peste zilele deja urcate.
let _posDay = null;
function positionsExportDue(nowMs, ziUltima) {
  const acum = localRO(nowMs);
  const z = arguments.length > 1 ? ziUltima : _posDay;
  return acum.ora >= BACKUP_HOUR && z !== acum.zi;
}
function _incercare(prev, nowMs) {
  const zi = localRO(nowMs).zi;
  const ziPrev = prev.day || (prev.at ? localRO(new Date(prev.at).getTime()).zi : null);
  return { day: zi, tries: (ziPrev === zi ? (prev.tries || 0) : 0) + 1 };
}

// Rulează un backup și, dacă S3 e configurat, îl urcă. Actualizează statusul. Folosit de planificator + endpoint manual.
async function runScheduledBackup(db, commit) {
  const prev = _last;
  const inc = _incercare(prev, Date.now());
  const okAt = prev.okAt || (prev.ok && prev.at) || null;   // ultima copie REUȘITĂ, păstrată și peste un eșec
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
        sizeBytes: b.buf.length, tables: b.meta.tables, error: w, encrypted: false, warning: w, day: inc.day, tries: inc.tries, okAt: okAt };
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
    const at = new Date().toISOString();
    _last = { at: at, ok: true, offsite: offsite, target: target, sizeBytes: b.buf.length, tables: b.meta.tables, error: null, encrypted: b.encrypted, warning: warning, day: inc.day, tries: inc.tries, okAt: at, format: b.meta.format };
    await saveState(db);
    if (!offsite) console.warn('[BACKUP] ⚠ dump generat (' + b.rows + ' rânduri, ' + Math.round(b.buf.length / 1024) + ' KB) dar NU s-a salvat nicăieri: ' + warning);
    else console.log('[BACKUP] ' + target + ' (' + b.rows + ' rânduri, ' + Math.round(b.buf.length / 1024) + ' KB, ' + (b.encrypted ? 'criptat' : 'NECRIPTAT ⚠') + ')');
    return getStatus();
  } catch (e) {
    _last = Object.assign({}, _last, { at: new Date().toISOString(), ok: false, offsite: false, error: e.message, warning: null, day: inc.day, tries: inc.tries, okAt: okAt });
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
  const pass = process.env.BACKUP_PASSPHRASE || null;
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
  let day = from, days = 0, rows = 0, bytes = 0, files = 0, lastDay = null;
  while (day < today && days < maxDays) {
    const next = new Date(Date.parse(day + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10);
    // PE ORE, nu pe zi. Înainte, o zi întreagă (la 1000 de vehicule: ~1,4 mil. de rânduri) se aduna în memorie
    // de două ori și se comprima sincron, blocând serverul. Acum memoria ține cel mult un lot + ora comprimată,
    // iar comprimarea rulează în afara firului principal. Paginarea cu OFFSET rămâne, dar în interiorul unei
    // ore, unde lista e scurtă — pe o zi întreagă fiecare lot o lua de la capăt și rularea încetinea spre final.
    let nZi = 0, fZi = 0;
    for (let h = 0; h < 24; h++) {
      const hh = (h < 10 ? '0' : '') + h;
      const t0 = day + ' ' + hh + ':00:00';
      const t1 = h === 23 ? next + ' 00:00:00' : day + ' ' + ((h + 1) < 10 ? '0' : '') + (h + 1) + ':00:00';
      const out = _gzipCollector(6);
      let n = 0, offset = 0;
      for (;;) {
        const q = await db.pool.query(
          `SELECT imei, timestamp, latitude, longitude, altitude, angle, speed, satellites, priority, io_data, company_id
             FROM positions WHERE timestamp >= $1 AND timestamp < $2 ORDER BY timestamp, imei LIMIT ${POS_EXPORT_BATCH} OFFSET ${offset}`,
          [t0, t1]
        );
        const batch = q.rows || [];
        if (!batch.length) break;
        await out.write(batch.map(function (r) { return JSON.stringify(r); }).join('\n') + '\n');
        n += batch.length; offset += POS_EXPORT_BATCH;
        if (batch.length < POS_EXPORT_BATCH) break;
        await new Promise(function (r) { setTimeout(r, 50); });   // nu monopoliza baza: ingestul are prioritate
      }
      const gz = await out.end();
      if (!n) continue;
      const enc = _encrypt(gz, pass);                           // același format ca dump-ul
      await s3Put(prefix + '/' + day + '/' + hh + '.' + (enc.encrypted ? 'ndjson.gz.enc' : 'ndjson.gz'), enc.buf, 'application/octet-stream');
      bytes += enc.buf.length; rows += n; nZi += n; fZi++; files++;
    }
    if (nZi) console.log('[POZIȚII] ' + day + ': ' + nZi + ' rânduri în ' + fZi + ' fișiere orare' + (pass ? ' (criptat)' : ' ⚠ NECRIPTAT'));
    try { await db.setSetting(marker, day); } catch (e) {}   // marchez ziua ca terminată chiar dacă era goală
    lastDay = day; day = next; days++;
  }
  _posLast = { at: new Date().toISOString(), days, rows, bytes, files, error: null, lastDay: lastDay || _posLast.lastDay };
  return { days, rows, bytes, files, lastDay };
}

// ── Punerea la loc a pozițiilor dintr-un fișier de arhivă (orar, sau pe zi din formatul vechi) ──
// Rulat de două ori pe aceleași fișiere nu dublează nimic: ON CONFLICT pe (imei, timestamp).
async function importPositionsBuffer(db, buf, passphrase, opts) {
  const lot = Math.max(50, Math.min(2000, (opts && opts.batch) || 500));
  const cols = ['imei', 'timestamp', 'latitude', 'longitude', 'altitude', 'angle', 'speed', 'satellites', 'priority', 'io_data', 'company_id'];
  const raw = _decodeBlob(buf, passphrase);
  let batch = [], total = 0, inserted = 0;
  async function flush() {
    if (!batch.length) return;
    const params = [], values = [];
    batch.forEach(function (r, i) {
      const b = i * cols.length;
      values.push('(' + cols.map(function (_, j) { return '$' + (b + j + 1); }).join(',') + ')');
      cols.forEach(function (c) {
        const v = r[c];
        params.push(c === 'io_data' ? (v == null ? null : JSON.stringify(v)) : (v === undefined ? null : v));
      });
    });
    const sql = 'INSERT INTO positions (' + cols.join(', ') + ') VALUES ' + values.join(', ');
    let res;
    try { res = await db.pool.query(sql + ' ON CONFLICT (imei, timestamp) DO NOTHING', params); }
    catch (e) {
      if (!/no unique or exclusion constraint/i.test(e.message)) throw e;
      res = await db.pool.query(sql, params);               // bază fără indexul unic: inserare simplă
    }
    inserted += (res && res.rowCount) || 0;
    batch = [];
  }
  for (const line of ndjsonLines(raw)) {
    batch.push(JSON.parse(line)); total++;
    if (batch.length >= lot) await flush();
  }
  await flush();
  return { rows: total, inserted: inserted };
}

async function runPositionsExport(db) {
  _posDay = localRO(Date.now()).zi; // o dată pe zi pe proces (vezi positionsExportDue)
  try { return await exportPositionsRange(db, { maxDays: parseInt(process.env.POSITIONS_EXPORT_MAX_DAYS) || 7 }); }
  catch (e) {
    _posLast = Object.assign({}, _posLast, { at: new Date().toISOString(), error: e.message });
    console.warn('[POZIȚII] export eșuat:', e.message);
    return { error: e.message };
  }
}

module.exports = { BUSINESS_TABLES, restoreOrder, restoreDump, buildDump, serialize, deserialize, makeBackup, backupDue, positionsExportDue, localRO, importPositionsBuffer, ndjsonLines, runScheduledBackup, getStatus, loadState, s3Configured, passphraseSet, configWarning, exportPositionsRange, runPositionsExport, positionsStatus };
