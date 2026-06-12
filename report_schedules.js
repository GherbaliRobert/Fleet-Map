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

// Următoarea rulare strict după 'after' (Date), la ora 'hour' UTC, după frecvență.
function computeNextRun(frequency, hour, after) {
  const h = (hour == null ? 6 : Math.min(23, Math.max(0, hour | 0)));
  let next = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), after.getUTCDate(), h, 0, 0));
  if (next <= after) next = new Date(next.getTime() + 864e5);
  if (frequency === 'weekly') {
    while (next.getUTCDay() !== 1) next = new Date(next.getTime() + 864e5); // luni
  } else if (frequency === 'monthly') {
    let m = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth(), 1, h, 0, 0));
    if (m <= after) m = new Date(Date.UTC(after.getUTCFullYear(), after.getUTCMonth() + 1, 1, h, 0, 0));
    next = m;
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
      const companyImeis = await db.getCompanyImeis(s.company_id);
      imeis = companyImeis.includes(s.imei) ? [s.imei] : [];
    } else {
      imeis = [s.imei];
    }
  } else {
    imeis = await db.getCompanyImeis(s.company_id);
  }
  if (!imeis || !imeis.length) return { ok: false, reason: 'fără vehicule accesibile', rows: 0, emailSent: false };

  const { from, to } = resolvePeriod(s.period, now);
  let opts = s.opts || {};
  if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch (e) { opts = {}; } }

  const report = await reports.runReport(db, s.report_type, imeis, from, to, opts, s.company_id);
  const fmt = (s.format === 'xlsx') ? 'xlsx' : 'pdf';
  const buf = fmt === 'xlsx' ? await reportExport.toXlsx(report) : await reportExport.toPdf(report);
  const filename = (report.type || 'raport') + '_' + from.slice(0, 10) + '.' + fmt;

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
  return { ok: true, rows: rowsN, recipients: recips, emailSent, bytes: buf.length, format: fmt };
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
