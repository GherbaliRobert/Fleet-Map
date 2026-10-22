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
  } else if (s.company_id != null) {
    imeis = await db.getCompanyActiveImeis(s.company_id);
  } else {
    // Super-admin (company_id NULL) → „Toată flota" = TOATE dispozitivele nearhivate, MAI PUȚIN cele DEMO.
    // getCompanyActiveImeis(null) ar întoarce [] fiindcă „company_id = NULL" nu se potrivește cu nimic în SQL
    // → programarea genera raport GOL (0 rânduri) și nu se salva în Istoric. (mirror al resolveReportImeis pt. super-admin)
    // Vehiculele companiei DEMO NU intră în rapoartele flotei reale (altfel apar „DEMO-1..5" în rapoarte).
    try {
      const all = await db.getDevices();
      const demoCoIds = new Set();
      try { for (const co of (await db.getCompanies())) if (co && co.is_demo) demoCoIds.add(co.id); } catch (e) {}
      imeis = (all || []).filter(d => d && d.status !== 'archived' && !demoCoIds.has(d.company_id)).map(d => d.imei);
    } catch (e) { imeis = []; }
  }
  if (!imeis || !imeis.length) return { ok: false, reason: 'fără vehicule accesibile', rows: 0, emailSent: false };

  const { from, to } = resolvePeriod(s.period, now);
  let opts = s.opts || {};
  if (typeof opts === 'string') { try { opts = JSON.parse(opts); } catch (e) { opts = {}; } }

  const report = await reports.runReport(db, s.report_type, imeis, from, to, opts, s.company_id);
  const fmt = (s.format === 'xlsx') ? 'xlsx' : 'pdf';
  const buf = fmt === 'xlsx' ? await reportExport.toXlsx(report) : await reportExport.toPdf(report);
  // Numele casei, ca la descărcarea din platformă (Robert, 14.10): „RA-Track - Raport Utilizare flotă - 14.10.2026.xlsx".
  const filename = reportExport.numeRaport(report) + '.' + fmt;

  // Salvează în Istoric rapoarte → apare automat, descărcabil (Excel/PDF), pe user-ul programării.
  let historyId = null, historyError = null;
  try {
    let uname = null;
    try { if (s.user_id) { const u = await db.getUserById(s.user_id); if (u) uname = u.username; } } catch (e) {}
    const sig = ['sched', s.report_type, s.imei || 'all', from, to].join('|').slice(0, 200);
    const saved = await db.saveReportHistory({
      company_id: s.company_id != null ? s.company_id : null, user_id: s.user_id != null ? s.user_id : null, username: uname,
      report_type: s.report_type, label: report.label || s.report_type, imei: s.imei || null,
      vehicle_count: imeis.length, period_from: from, period_to: to, opts, data: report, signature: sig,
      expires_at: new Date(now.getTime() + 7 * 24 * 3600 * 1000).toISOString()
    });
    historyId = saved && saved.id;
  } catch (e) { historyError = (e && e.message) || String(e); try { console.warn('[PROGRAMĂRI] salvare în Istoric eșuată (schedule ' + s.id + '):', historyError); } catch (_) {} }

  const recips = await destinatari(s, db);
  const rowsN = (report.rows && report.rows.length) || 0;
  const em = await trimite(s, report, buf, filename, from, to, recips, channels);
  // Notificare „raport gata" (clopoțel + push) → duce direct la Istoric. Emailul care n-a plecat se spune tot aici.
  if (deps.notify && historyId) {
    try {
      await deps.notify({ type: 'report_ready', severity: 'info', title: 'Raport programat gata',
        body: '„' + (report.label || s.report_type) + '" e disponibil în Istoric rapoarte.' + (recips.length && !em.emailSent ? ' Emailul n-a plecat; încercăm din nou.' : ''),
        data: { historyId, reportType: s.report_type, key: 'report_' + historyId }, userId: s.user_id, companyId: s.company_id });
    } catch (e) {}
  }
  return { ok: true, rows: rowsN, recipients: recips, emailSent: em.emailSent, emailError: em.emailError, bytes: buf.length, format: fmt, historyId, historyError };
}

// Cui pleacă raportul: lista scrisă în programare, altfel emailul celui care a făcut-o, plus agenda firmei.
async function destinatari(s, db) {
  let recips = (s.recipients || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
  if (!recips.length && s.user_id) {
    try { const u = await db.getUserById(s.user_id); if (u && u.email) recips = [u.email]; } catch (e) {}
  }
  // Agenda firmei (Setări → Adrese de email): adresele CONFIRMATE, bifate pentru rapoarte, primesc și
  // ele. Bifa de pe ecran trebuie să însemne ceva — o bifă care nu face nimic e mai rea decât lipsa ei.
  // Neconfirmatele nu intră: getConfirmedCompanyEmails le lasă afară.
  if (s.company_id != null && db.getConfirmedCompanyEmails) {
    try {
      const agenda = await db.getConfirmedCompanyEmails(s.company_id, 'rapoarte');
      const vazute = new Set(recips.map(x => String(x).toLowerCase()));
      for (const a of agenda) if (!vazute.has(String(a).toLowerCase())) { recips.push(a); vazute.add(String(a).toLowerCase()); }
    } catch (e) { /* dacă agenda nu se poate citi, raportul pleacă oricum către lista scrisă de mână */ }
  }
  return recips;
}
// Emailul cu raportul. Eroarea NU se mai înghite (22.10): prima e întoarsă, ca programarea să știe de ce n-a plecat.
async function trimite(s, report, buf, filename, from, to, recips, channels) {
  const rowsN = (report.rows && report.rows.length) || 0;
  const subject = '[RA Track] ' + (report.label || s.report_type) + ' — ' + from.slice(0, 10) + ' … ' + to.slice(0, 10);
  const text = 'Raport „' + (report.label || s.report_type) + '" pentru perioada ' + from.slice(0, 10) + ' — ' + to.slice(0, 10) +
    '.\nRânduri: ' + rowsN + '.\n\n— RA Track (raport automat)';
  let emailSent = false, emailError = null;
  if (recips.length) {
    const attachments = [{ filename, content: buf }];
    for (const rcp of recips) {
      try {
        const ok = await channels.sendEmailTo(rcp, subject, text, attachments);
        if (ok) emailSent = true; else if (!emailError) emailError = 'Serverul nu are email configurat';
      } catch (e) { if (!emailError) emailError = (e && e.message) || String(e); }
    }
  }
  return { emailSent, emailError };
}
// O reîncercare trimite DOAR emailul, cu raportul păstrat deja în Istoric (nu-l mai face o dată: ar apărea de două ori acolo).
// Raportul șters între timp din Istoric → se face din nou.
async function retrimite(s, deps, now) {
  const { db, reportExport, channels } = deps;
  let h = null;
  try { if (s.email_raport_id && s.user_id != null) h = await db.getReportHistoryById(s.email_raport_id, s.user_id); } catch (e) { h = null; }
  let report = h && h.data;
  if (typeof report === 'string') { try { report = JSON.parse(report); } catch (e) { report = null; } }
  if (!report || !Array.isArray(report.columns)) return runSchedule(s, deps, now);
  const fmt = (s.format === 'xlsx') ? 'xlsx' : 'pdf';
  const buf = fmt === 'xlsx' ? await reportExport.toXlsx(report) : await reportExport.toPdf(report);
  const filename = reportExport.numeRaport(report) + '.' + fmt;
  const from = new Date(h.period_from).toISOString(), to = new Date(h.period_to).toISOString();
  const recips = await destinatari(s, db);
  const em = await trimite(s, report, buf, filename, from, to, recips, channels);
  return { ok: true, rows: (report.rows || []).length, recipients: recips, emailSent: em.emailSent, emailError: em.emailError, format: fmt, historyId: h.id, reincercare: true };
}

// ─── Starea ultimei trimiteri (22.10) ───
// Un email care n-a plecat se reîncearcă de 3 ori, după 30, 60 și 120 de minute (raportul de dimineață tot ajunge dimineața);
// apoi se renunță până la rularea următoare. Starea se scrie pe programare, iar textul pentru ecran îl face `textStare`.
const REINCERCARI_MIN = [30, 60, 120];
function stareDupa(res, reincercare, now, s) {
  const cuDest = !!(res.recipients && res.recipients.length);
  if (res.ok && cuDest && !res.emailSent) {
    if (reincercare < REINCERCARI_MIN.length) {
      return { stare: 'reincercare', eroare: res.emailError || null, reincercari: reincercare + 1, raportId: res.historyId || s.email_raport_id || null,
        next: new Date(now.getTime() + REINCERCARI_MIN[reincercare] * 60000) };
    }
    return { stare: 'esuat', eroare: res.emailError || null, reincercari: 0, raportId: null, next: computeNextRun(s.frequency, s.hour, now), renunta: true };
  }
  const stare = !res.ok ? (res.reason ? 'fara_vehicule' : 'eroare') : (cuDest ? 'trimis' : 'fara_destinatar');
  return { stare, eroare: !res.ok ? (res.error || res.reason || null) : null, reincercari: 0, raportId: null, next: computeNextRun(s.frequency, s.hour, now) };
}
function _cand(t) {
  return t ? new Date(t).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
}
function _ora(t) { return t ? new Date(t).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }) : ''; }
// Textul de pe ecran pentru ultima trimitere. Amănuntul erorii doar la noi (`cuEroare`); clientul află că noi am fost anunțați.
function textStare(s, cuEroare) {
  if (!s || !s.ultima_stare) return null;
  const cand = _cand(s.last_run) ? _cand(s.last_run) + ' — ' : '';
  const am = cuEroare && s.ultima_eroare ? ' (' + String(s.ultima_eroare).slice(0, 220) + ')' : '';
  switch (s.ultima_stare) {
    case 'trimis': return cand + 'a plecat pe email.';
    case 'reincercare': return cand + 'emailul n-a plecat; încercăm din nou la ' + _ora(s.next_run) + '. Raportul e deja în Istoric rapoarte.' + am;
    case 'esuat': return cand + 'emailul n-a putut pleca; raportul e în Istoric rapoarte. Echipa RA Track a fost anunțată.' + am;
    case 'fara_destinatar': return cand + 'nicio adresă de email: raportul e doar în Istoric rapoarte.';
    case 'fara_vehicule': return cand + 'nu s-a făcut: nicio mașină la care programarea să aibă acces.';
    default: return cand + 'raportul nu s-a putut face.' + am;
  }
}

// Rulează toate programările scadente și reprogramează-le.
async function tickDue(deps, now) {
  now = now || new Date();
  const due = await deps.db.getDueReportSchedules(now.toISOString());
  const results = [];
  for (const s of due) {
    const reincercare = Number(s.email_reincercari) || 0;
    let res;
    try { res = reincercare > 0 ? await retrimite(s, deps, now) : await runSchedule(s, deps, now); } catch (e) { res = { ok: false, error: e.message }; }
    const st = stareDupa(res, reincercare, now, s);
    try { await deps.db.setScheduleRun(s.id, now.toISOString(), st.next.toISOString(), st); } catch (e) {}
    if (st.renunta && deps.notify) {
      try {
        await deps.notify({ type: 'report_email_esuat', severity: 'warning', title: 'Emailul cu raportul n-a putut pleca',
          body: '„' + (s.name || s.report_type) + '" e în Istoric rapoarte. Am încercat de ' + (REINCERCARI_MIN.length + 1) + ' ori; echipa RA Track a fost anunțată.',
          data: { reportType: s.report_type, key: 'report_email_' + s.id + '_' + now.toISOString().slice(0, 10) }, userId: s.user_id, companyId: s.company_id });
      } catch (e) {}
    }
    results.push(Object.assign({ id: s.id, next_run: st.next.toISOString(), stare: st.stare }, res));
  }
  return results;
}

module.exports = { resolvePeriod, computeNextRun, runSchedule, tickDue, stareDupa, textStare, REINCERCARI_MIN };
