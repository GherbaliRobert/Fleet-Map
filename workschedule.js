// workschedule.js — program de lucru + „e ora curentă în program?". Logică pură (testabilă), fără DB.
// Structură: { enabled, tz, tolerance_min, days:{mon:[{from,to}],...}, holidays:['YYYY-MM-DD'] }.
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
function _hmOk(s) { return /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(s || '')); }
function _hm(s) { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '')); return m ? (parseInt(m[1]) * 60 + parseInt(m[2])) : null; }

// Curăță/validează un program primit de la UI → obiect sigur de stocat (sau null dacă gunoi).
function sanitize(input) {
  if (!input || typeof input !== 'object') return null;
  const out = {
    enabled: !!input.enabled,
    tz: (typeof input.tz === 'string' && input.tz) ? input.tz.slice(0, 40) : 'Europe/Bucharest',
    tolerance_min: Math.max(0, Math.min(parseInt(input.tolerance_min) || 0, 240)),
    days: {}, holidays: [],
  };
  const din = input.days || {};
  DAYS.forEach(function (d) {
    const arr = Array.isArray(din[d]) ? din[d] : [];
    out.days[d] = arr.filter(function (it) { return it && _hmOk(it.from) && _hmOk(it.to) && _hm(it.from) < _hm(it.to); }).slice(0, 6).map(function (it) { return { from: it.from, to: it.to }; });
  });
  if (Array.isArray(input.holidays)) out.holidays = input.holidays.filter(function (h) { return /^\d{4}-\d{2}-\d{2}$/.test(String(h)); }).slice(0, 80);
  return out;
}

// Componentele locale (fus orar) ale unui moment: ziua săptămânii (mon..sun), minutele din zi, data YYYY-MM-DD.
function _tzParts(nowMs, tz) {
  const d = new Date(nowMs);
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  const parts = f.formatToParts(d);
  const get = function (t) { const p = parts.find(function (x) { return x.type === t; }); return p ? p.value : ''; };
  const wd = get('weekday').toLowerCase().slice(0, 3);
  const minutes = (parseInt(get('hour')) || 0) * 60 + (parseInt(get('minute')) || 0);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d); // YYYY-MM-DD
  return { wd: wd, minutes: minutes, ymd: ymd };
}

// true = momentul e ÎN programul de lucru (→ nu alertăm). false = în AFARA (→ alertăm dacă se mișcă).
// Fără program / program dezactivat → true (nu alertăm). Sărbătoare sau zi fără interval → false.
function isWithin(sched, nowMs) {
  if (!sched || !sched.enabled) return true;
  const tz = sched.tz || 'Europe/Bucharest';
  let p; try { p = _tzParts(nowMs, tz); } catch (e) { return true; } // fus invalid → nu bloca (fail-safe)
  if (Array.isArray(sched.holidays) && sched.holidays.indexOf(p.ymd) >= 0) return false; // zi liberă → orice mișcare e „în afara"
  const intervals = (sched.days && sched.days[p.wd]) || [];
  if (!intervals.length) return false;                       // ziua nu are program
  const tol = Math.max(0, parseInt(sched.tolerance_min) || 0);
  for (let i = 0; i < intervals.length; i++) {
    const from = _hm(intervals[i].from), to = _hm(intervals[i].to);
    if (from == null || to == null) continue;
    if (p.minutes >= (from - tol) && p.minutes <= (to + tol)) return true;
  }
  return false;
}

module.exports = { sanitize, isWithin, DAYS };
