// report_schedules.js — rapoarte programate: perioadă relativă, calcul next_run, rulare + trimitere pe email.
// Logica e izolată aici; server.js doar înregistrează tick-ul și expune endpoint-urile.

// Fereastra relativă raportată la 'now' (Date, UTC). Întoarce { from, to } ISO.
function resolvePeriod(period, now) {
  const d = new Date(now.getTime());
  const startOfDay = (x) => new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
  let from, to;
  switch (period) {
    case 'last7':  to = new Date(now); from = new Date(now.getTime() - 7 * 864e5); break;
    case 'last30': to = new Date(now); from = new Date(now.getTime() - 30 * 864e5); break;
    case 'thismonth': from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); to = new Date(now); break;
    case 'lastmonth':
      from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
      to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); break;
    case 'yesterday':
    default: {
      const today = startOfDay(d);
      to = today; from = new Date(today.getTime() - 864e5); break;
    }
  }
  return { from: from.toISOString(), to: to.toISOString() };
}

// ─── Ora e interpretată ca ORA ROMÂNIEI (Europe/Bucharest), nu UTC. DST-safe prin Intl. ───
// Offset România în minute înaintea UTC (120 iarna / 180 vara) la un anumit instant.
function _roOffsetMin(date) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bucharest', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(date).forEach(x => { if (x.type !== 'literal') p[x.type] = +x.value; });
  const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUTC - date.getTime()) / 60000);
}
// Instant UTC a cărui oră „de perete" în România este y-m0-d hh:00.
function _roWallToUtc(y, m0, d, hh) {
  const naive = Date.UTC(y, m0, d, hh, 0, 0);
  return new Date(naive - _roOffsetMin(new Date(naive)) * 60000);
}
// Y/M/D locale (România) pentru un instant UTC.
function _roYMD(date) {
  const p = {};
  new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).forEach(x => { if (x.type !== 'literal') p[x.type] = +x.value; });
  return { y: p.year, m0: p.month - 1, d: p.day };
}
// Ziua săptămânii România (1=Luni..7=Duminică) pentru un instant UTC.
function _roDow(date) {
  return { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }[new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Bucharest', weekday: 'short' }).format(date)] || 1;
}
// Următoarea rulare strict după 'after' (Date), la ora 'hour' ORA ROMÂNIEI, după frecvență.
function computeNextRun(frequency, hour, after) {
  const h = (hour == null ? 6 : Math.min(23, Math.max(0, hour | 0)));
  const DAY = 864e5;
  const p0 = _roYMD(after);
  let next = _roWallToUtc(p0.y, p0.m0, p0.d, h);
  let guard = 0;
  while (guard++ < 400) {
    if (next > after) {
      if (frequency === 'weekly') { if (_roDow(next) === 1) break; }        // luni (RO)
      else if (frequency === 'monthly') { if (_roYMD(next).d === 1) break; } // ziua 1 (RO)
      else break;                                                            // daily
    }
    const p = _roYMD(new Date(next.getTime() + DAY));
    next = _roWallToUtc(p.y, p.m0, p.d, h);
  }
  return next;
}

// Rulează o programare: generează raportul, randează în PDF/Excel, trimite pe email.
async function runSchedule(s, deps, now) {
  const { db, reports, reportExport, channels } = deps;
  now = now || new Date();
  // Tenant defense-in-depth: dacă programarea țintește un imei, acesta TREBUIE să aparțină companiei programării
  // (vehiculul putea fi mutat/retargetat). Super-admin (company_id null) poate orice vehicul.
  let imeis;
  if (s.imei) {
    if (s.company_id != null) {
      const companyImeis = await db.getCompanyActiveImeis(s.company_id); // arhivatele nu mai sunt raportate
      imeis = companyImeis.includes(s.imei) ? [s.imei] : [];
    } else {
      imeis = [s.imei];
    }
  } else {
    imeis = await db.getCompanyActiveImeis(s.company_id);
  }
  if (!imeis || !imeis.length) return { ok: false, reason: 'fără vehicule accesibile', rows: 0, emailSent: false };

  const { from, to } = resolvePeriod(s.period, now);
  let opts = s.opts || {};
  if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch (e) { opts = {}; } }

  const report = await reports.runReport(db, s.report_type, imeis, from, to, opts, s.company_id);
  const fmt = (s.format === 'xlsx') ? 'xlsx' : 'pdf';
  const buf = fmt === 'xlsx' ? await reportExport.toXlsx(report) : await reportExport.toPdf(report);
  const filename = (report.type || 'raport') + '_' + from.slice(0, 10) + '.' + fmt;

  // Salvează în Istoric rapoarte → apare automat, descărcabil (Excel/PDF), pe user-ul programării.
  let historyId = null;
  try {
    let uname = null;
    try { if (s.user_id) { const u = await db.getUserById(s.user_id); if (u) uname = u.username; } } catch (e) {}
    const sig = [s.report_type, s.imei || 'all', from, to, 'sched'].join('|').slice(0, 200);
    const saved = await db.saveReportHistory({
      company_id: s.company_id != null ? s.company_id : null, user_id: s.user_id != null ? s.user_id : null, username: uname,
      report_type: s.report_type, label: report.label || s.report_type, imei: s.imei || null,
      vehicle_count: imeis.length, period_from: from, period_to: to, opts, data: report, signature: sig, status: 'scheduled',
      expires_at: new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString()
    });
    historyId = saved && saved.id;
  } catch (e) { try { console.warn('[PROGRAMĂRI] salvare în Istoric eșuată (schedule ' + s.id + '):', e && e.message); } catch (_) {} }

  let recips = (s.recipients || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
  if (!recips.length && s.user_id) {
    try { const u = await db.getUserById(s.user_id); if (u && u.email) recips = [u.email]; } catch (e) {}
  }
  const rowsN = (report.rows && report.rows.length) || 0;
  const subject = '[RA Track] ' + (report.label || s.report_type) + ' — ' + from.slice(0, 10) + ' … ' + to.slice(0, 10);
  const text = 'Raport „' + (report.label || s.report_type) + '" pentru perioada ' + from.slice(0, 10) + ' — ' + to.slice(0, 10) +
    '.\nRânduri: ' + rowsN + '.\n\n— RA Track (raport automat)';

  let emailSent = false;
  if (recips.length) {
    const attachments = [{ filename, content: buf }];
    for (const rcp of recips) {
      try { const ok = await channels.sendEmailTo(rcp, subject, text, attachments); emailSent = emailSent || ok; } catch (e) {}
    }
  }
  // Notificare „raport gata" (clopoțel + push) → duce direct la Istoric.
  if (deps.notify && historyId) {
    try {
      await deps.notify({ type: 'report_ready', severity: 'info', title: 'Raport programat gata',
        body: '„' + (report.label || s.report_type) + '" e disponibil în Istoric rapoarte.',
        data: { historyId, reportType: s.report_type, key: 'report_' + historyId }, userId: s.user_id, companyId: s.company_id });
    } catch (e) {}
  }
  return { ok: true, rows: rowsN, recipients: recips, emailSent, bytes: buf.length, format: fmt, historyId };
}

// Rulează toate programările scadente și reprogramează-le.
async function tickDue(deps, now) {
  now = now || new Date();
  const due = await deps.db.getDueReportSchedules(now.toISOString());
  const results = [];
  for (const s of due) {
    let res;
    try { res = await runSchedule(s, deps, now); } catch (e) { res = { ok: false, error: e.message }; }
    const next = computeNextRun(s.frequency, s.hour, now);
    try { await deps.db.setScheduleRun(s.id, now.toISOString(), next.toISOString()); } catch (e) {}
    results.push(Object.assign({ id: s.id, next_run: next.toISOString() }, res));
  }
  return results;
}

module.exports = { resolvePeriod, computeNextRun, runSchedule, tickDue };
