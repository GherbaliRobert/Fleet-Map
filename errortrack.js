// errortrack.js — forward opțional al erorilor către Sentry (envelope API), fără SDK / dependențe.
//
// Captura in-house (error_log + handlere de proces + erori client) trăiește în server.js (captureError).
// Aici doar trimitem ACELEAȘI intrări și către Sentry, DACĂ SENTRY_DSN e setat. Best-effort: nu aruncă niciodată.
//
// CONFIG: SENTRY_DSN = https://<public_key>@<host>/<project_id>   (din Sentry → Project → Settings → Client Keys (DSN))

const crypto = require('crypto');

let _dsn = null, _p = null;
function _parse(dsn) {
  const m = /^(https?):\/\/([^@]+)@([^/]+)\/(.+)$/.exec(dsn || '');
  if (!m) return null;
  return { proto: m[1], key: m[2].split(':')[0], host: m[3], project: m[4].replace(/\/+$/, '') };
}
function init() {
  _dsn = process.env.SENTRY_DSN || null;
  _p = _dsn ? _parse(_dsn) : null;
  if (_dsn && !_p) console.warn('[SENTRY] DSN invalid → forward dezactivat');
  else if (_p) console.log('[SENTRY] forward erori activ → ' + _p.host);
}
function enabled() { return !!_p; }
function _lvl(l) { l = String(l || 'error'); if (l === 'critical') return 'fatal'; if (l === 'warn') return 'warning'; return (['fatal', 'error', 'warning', 'info', 'debug'].indexOf(l) >= 0) ? l : 'error'; }

// entry = forma din captureError: { level, message, stack, route, method, status, userId, companyId, context }
async function toSentry(entry) {
  if (!_p || !entry) return;
  try {
    const id = crypto.randomUUID().replace(/-/g, '');
    const ctx = entry.context || {};
    const platform = (ctx.source === 'web' || ctx.source === 'mobile') ? 'javascript' : 'node';
    const ev = {
      event_id: id,
      timestamp: Date.now() / 1000,
      platform: platform,
      level: _lvl(entry.level),
      logger: 'ratracks',
      environment: process.env.NODE_ENV || 'production',
      release: (process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_SHA || 'dev').slice(0, 7),
      exception: { values: [{ type: String(ctx.kind || entry.level || 'Error'), value: String(entry.message || '').slice(0, 800) }] },
      tags: { route: entry.route || undefined, source: ctx.source || 'server', status: entry.status || undefined },
      extra: { stack: entry.stack || undefined, method: entry.method || undefined, userId: entry.userId || undefined, companyId: entry.companyId || undefined, ua: ctx.ua || undefined, url: ctx.url || undefined },
    };
    const body = JSON.stringify({ event_id: id, sent_at: new Date().toISOString(), dsn: _dsn }) + '\n'
      + JSON.stringify({ type: 'event', content_type: 'application/json' }) + '\n'
      + JSON.stringify(ev) + '\n';
    await fetch(_p.proto + '://' + _p.host + '/api/' + _p.project + '/envelope/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-sentry-envelope', 'X-Sentry-Auth': 'Sentry sentry_version=7, sentry_key=' + _p.key + ', sentry_client=ratracks/1.0' },
      body: body,
    });
  } catch (e) { /* best-effort — nu afectăm aplicația */ }
}

module.exports = { init, enabled, toSentry };
