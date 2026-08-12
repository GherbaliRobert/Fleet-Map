// verify_push_viteza.js — comutatorul stins trebuie să stingă.
//
// Reclamația (Robert, 12.08): „am dezactivat alertele (push) pentru limita de viteză, dar tot le primesc".
//
// Cauza: sunt DOUĂ motoare care produc o notificare de viteză, iar ele se uită la rânduri DIFERITE
// din aceeași listă de preferințe:
//   1. evaluateUserEvents (evenimente automate) → type='overspeed' → rândul „Depășire viteză"   ✔ respecta
//   2. evaluateAlerts (regulile din secțiunea „Alerte") → type='alert' → rândul „Reguli de alertă" ✘ nu
// Tipul REAL al regulii ('overspeed') călătorea doar în data.alertType, unde nimeni nu-l citea la
// filtrare. Deci stingeai un întrerupător, iar becul era pe celălalt.
//
// Testul verifică decizia de trimitere, nu rețeaua: apelează direct funcția care hotărăște.
const path = require('path');
let ok = 0, fail = 0;
const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };

// Reimplementăm EXACT logica din server.js (aceleași linii), ca testul să pice dacă ea se schimbă.
// Extragem sursa reală din fișier — nu o copiem de mână, ca să nu testăm o copie învechită.
const src = require('fs').readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const bucata = src.match(/const ALERT_TIP_EVENIMENT = \{[\s\S]*?\n\}/);
const fnSrc = src.match(/function tipulReguliiStins\(prefsMap, userId, data\) \{[\s\S]*?\n\}/);
if (!bucata || !fnSrc) { console.error('  ❌ nu găsesc logica în server.js — a fost redenumită?'); process.exit(1); }
const tipulReguliiStins = new Function(bucata[0] + '\n' + fnSrc[0] + '\nreturn tipulReguliiStins;')();

// Reproducem și condiția de trimitere din _notifyPush, pe aceleași reguli.
function seTrimitePush(prefsMap, userId, n, userTypePref) {
  const up = userTypePref(prefsMap, userId, n.type);
  if (n.type === 'alert' && tipulReguliiStins(prefsMap, userId, n.data)) return false;
  return !!(up && (up.push || (up.push == null && n.severity === 'critical')));
}
// userTypePref, tot din sursa reală
const upSrc = src.match(/function userTypePref\(prefsMap, userId, type\) \{[\s\S]*?\n\}/);
const evSrc = src.match(/const EVENT_TYPES = \[[\s\S]*?\n\];/);
const userTypePref = new Function(
  evSrc[0] + "\nconst PUSH_DEFAULT_TYPES = new Set(EVENT_TYPES.filter(e => e.pushDefault).map(e => e.key));\n"
  + upSrc[0] + '\nreturn userTypePref;')();

console.log('\n══ Push de viteză: comutatorul stins chiar stinge ══\n');

const U = 7;
// Notificarea produsă de o REGULĂ de viteză din secțiunea „Alerte"
const regulaViteza = { type: 'alert', severity: 'warning', data: { alertId: 3, alertType: 'overspeed', speed: 118 } };
// Notificarea produsă de motorul de evenimente automate
const evenimentViteza = { type: 'overspeed', severity: 'warning', data: { eventType: 'overspeed' } };

// ── 1. Situația reclamată: „Depășire viteză" stinsă explicit pentru push ──
let prefs = { [U]: { types: { overspeed: { enabled: true, push: false } } } };
t('regula de viteză NU mai trimite push când „Depășire viteză" e stinsă',
  seTrimitePush(prefs, U, regulaViteza, userTypePref) === false);
t('evenimentul automat de viteză tăcea deja corect',
  seTrimitePush(prefs, U, evenimentViteza, userTypePref) === false);

// ── 2. Stins de tot (nici măcar în clopoțel) ──
prefs = { [U]: { types: { overspeed: { enabled: false } } } };
t('„Depășire viteză" oprită complet → regula tot nu sună',
  seTrimitePush(prefs, U, regulaViteza, userTypePref) === false);

// ── 3. NU am stricat cazul normal: cine n-a atins nimic primește în continuare ──
prefs = { [U]: { types: {} } };
t('fără nicio preferință atinsă, regula de viteză sună (ca înainte)',
  seTrimitePush(prefs, U, regulaViteza, userTypePref) === true);
prefs = {};
t('utilizator complet nou → regula sună',
  seTrimitePush(prefs, U, regulaViteza, userTypePref) === true);

// ── 4. Stingerea e ȚINTITĂ: alte reguli nu amuțesc odată cu viteza ──
prefs = { [U]: { types: { overspeed: { enabled: true, push: false } } } };
t('o regulă de COMBUSTIBIL sună în continuare',
  seTrimitePush(prefs, U, { type: 'alert', severity: 'warning', data: { alertType: 'fuel_drop' } }, userTypePref) === true);
t('o regulă de ZONĂ (fără rând propriu în preferințe) sună în continuare',
  seTrimitePush(prefs, U, { type: 'alert', severity: 'warning', data: { alertType: 'geofence_exit' } }, userTypePref) === true);

// ── 5. Tipuri care NU se numesc la fel — capcana echivalențelor ──
prefs = { [U]: { types: { idling: { enabled: true, push: false } } } };
t('regula „idle_engine" respectă rândul „Idling prelungit"',
  seTrimitePush(prefs, U, { type: 'alert', severity: 'warning', data: { alertType: 'idle_engine' } }, userTypePref) === false);
prefs = { [U]: { types: { overload: { enabled: true, push: false } } } };
t('regula „overload_legal" respectă rândul „Supraîncărcare"',
  seTrimitePush(prefs, U, { type: 'alert', severity: 'warning', data: { alertType: 'overload_legal' } }, userTypePref) === false);
t('și „axle_overload" la fel',
  seTrimitePush(prefs, U, { type: 'alert', severity: 'warning', data: { alertType: 'axle_overload' } }, userTypePref) === false);

// ── 6. Rândul general rămâne funcțional pentru cine vrea liniște totală ──
prefs = { [U]: { types: { alert: { enabled: true, push: false } } } };
t('stingând rândul „Reguli de alertă", TOATE regulile tac',
  seTrimitePush(prefs, U, regulaViteza, userTypePref) === false
  && seTrimitePush(prefs, U, { type: 'alert', severity: 'warning', data: { alertType: 'fuel_drop' } }, userTypePref) === false);

// ── 7. O notificare fără alertType nu se blochează din greșeală ──
t('notificare de alertă fără tip concret → comportament neschimbat',
  seTrimitePush({ [U]: { types: { overspeed: { push: false } } } }, U,
    { type: 'alert', severity: 'warning', data: {} }, userTypePref) === true);

console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
process.exit(fail ? 1 : 0);
