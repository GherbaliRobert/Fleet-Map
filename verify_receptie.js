// verify_receptie.js — emailurile către agenda firmei și supraveghetorul recepției. Rulează codul REAL,
// decupat din server.js: catalogul de praguri și supraveghetorul sunt executate, nu descrise.
//
//   node verify_receptie.js
//
// Ce prinde:
//   1. revenirea la „agenda firmei primește tot" — pragurile detectorului sunt intenționat mici (50 km/h,
//      80 °C, 13 V), fiindcă pragul adevărat îl pune fiecare om în contul lui; adresele din agendă n-au cont;
//   2. o pauză sau un plafon zilnic scoase din cale (o mașină cu senzor defect ar arde adresa de trimitere);
//   3. un supraveghetor care sună degeaba (flota doarme, aparatele sunt deconectate) sau care NU sună când
//      aparatele sunt conectate și tac — plus repornirea automată care n-ar mai porni.
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');

let ok = 0, rele = 0;
function T(nume, cond, detaliu) {
  if (cond) { ok++; console.log('  ✓ ' + nume); }
  else { rele++; console.log('  ✗ ' + nume + (detaliu !== undefined ? ' → ' + JSON.stringify(detaliu) : '')); }
}
function decupeaza(start, end) {
  const a = src.indexOf(start);
  if (a < 0) throw new Error('nu găsesc: ' + start.slice(0, 60));
  const b = src.indexOf(end, a);
  if (b < 0) throw new Error('nu găsesc capătul: ' + end.slice(0, 60));
  return src.slice(a, b + end.length);
}

// ── 1. Emailurile către agenda firmei ──────────────────────────────────────────────────────────────
console.log('\n1. Adresele firmei nu mai primesc mersul normal');
{
  // Catalogul REAL de praguri (același pe care omul îl vede în preferințele lui).
  const cat = new Function(decupeaza('const EVENT_TYPES = [', '\n];') + '\nreturn EVENT_TYPES;')();
  const P = Object.fromEntries(cat.map((e) => [e.key, e]));
  // Așa filtrează codul: peste prag, sau sub prag pentru cele „below".
  const trece = (tip, val) => {
    const d = P[tip];
    if (!d || !d.threshold) return true;
    return d.below ? val < d.def : val >= d.def;
  };

  T('90 km/h e pragul de viteză, nu 50', P.overspeed.def === 90, P.overspeed.def);
  T('mersul obișnuit (60 km/h) NU mai trimite email', !trece('overspeed', 60));
  T('o depășire reală (95 km/h) trimite', trece('overspeed', 95));
  T('temperatura normală de funcționare (85 °C) NU mai trimite', !trece('engine_temp', 85));
  T('supraîncălzirea (110 °C) trimite', trece('engine_temp', 110));
  T('mașina parcată, 12,5 V, NU mai trimite', !trece('low_voltage', 12.5));
  T('bateria chiar descărcată (11,2 V) trimite', trece('low_voltage', 11.2));
  T('o scădere mică de carburant (5 L) NU mai trimite', !trece('fuel_drop', 5));
  T('un furt (20 L) trimite', trece('fuel_drop', 20));

  // Filtrul e chiar înaintea livrării către agendă, nu altundeva.
  const zonaLivrare = decupeaza('      // PRAGUL: adresele din agendă n-au cont', 'await deliverCompanyEvent(imei,');
  T('filtrul de prag stă exact înaintea livrării către agendă',
    /if \(def\.threshold\) \{[\s\S]{0,200}def\.below[\s\S]{0,120}continue;/.test(zonaLivrare));

  // Pauza și plafonul: rulăm funcția REALĂ de buget, cu un ceas fals.
  // Capătul e ultimul `return true;` din _coMailAreBuget; acolada finală o punem noi (fișierul e CRLF,
  // deci o ancoră pe mai multe rânduri n-ar fi găsită literal).
  const bucata = decupeaza('const CO_MAIL_COOLDOWN_MS =', '  return true;') + '\n}';
  const ceas = { t: Date.parse('2026-09-12T08:00:00+03:00') };
  class DataFalsa extends Date {
    static now() { return ceas.t; }
    constructor(...a) { super(...(a.length ? a : [ceas.t])); }
  }
  const M = new Function('process', 'Date', 'console',
    bucata + '\nreturn { buget: _coMailAreBuget, COOLDOWN: CO_MAIL_COOLDOWN_MS, MAX: CO_MAIL_DAILY_MAX, zi: _ziRO };'
  )({ env: {} }, DataFalsa, { warn: function () {} });

  T('pauza implicită între emailuri e de o oră', M.COOLDOWN === 3600000, M.COOLDOWN);
  T('plafonul implicit e de 50 pe zi pe firmă', M.MAX === 50, M.MAX);
  let trecute = 0;
  for (let i = 0; i < 60; i++) if (M.buget(7)) trecute++;
  T('al 51-lea email al zilei e oprit', trecute === 50, trecute);
  T('altă firmă are bugetul ei', M.buget(9) === true);
  ceas.t += 20 * 3600000;                       // a doua zi, dimineața
  T('a doua zi bugetul se reface', M.buget(7) === true);
  T('ziua se numără după ceasul din România', M.zi() === '2026-09-13', M.zi());

  // Pauza se aplică prin funcția existentă, cu durata nouă.
  T('livrarea către firmă cere pauza de o oră',
    /userCooldownOk\('co' \+ coId, ev\.type, imei, CO_MAIL_COOLDOWN_MS\)/.test(src));
  T('și verifică plafonul zilnic', /if \(!_coMailAreBuget\(coId\)\) return;/.test(src));
}

// ── 2. Supraveghetorul recepției ───────────────────────────────────────────────────────────────────
console.log('\n2. Supraveghetorul sună doar când chiar e o problemă');
(async () => {
  // Alarma pleacă pe fire (async): lăsăm microtask-urile să se scurgă înainte să numărăm.
  const pauza = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setImmediate(r)); };
  const bloc = decupeaza('// ─── Supraveghetorul recepției ───', '// ── MOD STRICT de înregistrare device-uri');
  const ceas = { t: 1000000000 };
  class DataFalsa extends Date {
    static now() { return ceas.t; }
    constructor(...a) { super(...(a.length ? a : [ceas.t])); }
  }
  const jurnal = { alarme: 0, emailuri: 0, notificari: 0, push: 0, iesiri: 0 };
  const conexiuni = new Map();
  const ingestStats = { last_packet_at: 0 };

  const mediu = {
    // ALERT_EMAIL e adresa noastră de alertă, setată în Railway. Fără ea, codul NU trimite email (corect):
    // proba ar arăta „0 emailuri" și ar minți despre motiv.
    process: { env: { ALERT_EMAIL: 'alerte@ratrack.ro' }, exit: function () { jurnal.iesiri++; } },
    db: {
      createNotification: async function (n) { jurnal.notificari++; return Object.assign({ id: 1 }, n); },
      getAllActiveUsers: async function () { return [{ id: 1, role: 'superadmin' }, { id: 2, role: 'company_admin' }]; },
    },
    channels: { emailConfigured: function () { return true; }, sendEmailTo: async function () { jurnal.emailuri++; } },
    broadcastWsToUser: function () {},
    sendPushToUser: async function () { jurnal.push++; },
    captureError: function () {},
    activeConnections: conexiuni,
    ingestStats: ingestStats,
    setTimeout: function (fn) { fn(); return { unref: function () {} }; }, // repornirea se vede pe loc
  };
  const W = new Function(
    'process', 'Date', 'console', 'db', 'channels', 'broadcastWsToUser', 'sendPushToUser', 'captureError',
    'activeConnections', 'ingestStats', 'setTimeout',
    bloc + '\nreturn { verifica: _verificaReceptia, SILENCE: INGEST_SILENCE_MS, RESTART: WATCHDOG_RESTART };'
  )(mediu.process, DataFalsa, { error: function () { jurnal.alarme++; }, warn: function () {}, log: function () {} },
    mediu.db, mediu.channels, mediu.broadcastWsToUser, mediu.sendPushToUser, mediu.captureError,
    mediu.activeConnections, mediu.ingestStats, mediu.setTimeout);

  T('pragul implicit de tăcere e de 30 de minute', W.SILENCE === 30 * 60000, W.SILENCE);
  T('repornirea automată e pornită implicit', W.RESTART === true);

  // a) flota doarme: aparatele sunt deconectate, deci tăcerea e normală
  ingestStats.last_packet_at = ceas.t - 3 * 3600000;      // niciun pachet de 3 ore
  W.verifica(); await pauza();
  T('flota deconectată noaptea NU declanșează nimic', jurnal.notificari === 0 && jurnal.iesiri === 0, jurnal);

  // b) aparate conectate, dar tăcere scurtă (10 min) — încă normal
  conexiuni.set('350424070000001', {}); conexiuni.set('350424070000002', {});
  ingestStats.last_packet_at = ceas.t - 10 * 60000;
  W.verifica(); await pauza();
  T('10 minute de tăcere nu sunt o pană', jurnal.notificari === 0 && jurnal.iesiri === 0, jurnal);

  // c) aparate conectate și tăcere de 35 de minute — asta e pana
  ingestStats.last_packet_at = ceas.t - 35 * 60000;
  W.verifica(); await pauza();
  T('35 de minute cu aparate conectate declanșează alarma', jurnal.notificari === 1, jurnal);
  T('super-adminul primește push (doar el, nu și administratorul de firmă)', jurnal.push === 1, jurnal.push);
  T('pleacă și emailul către noi', jurnal.emailuri === 1, jurnal.emailuri);
  T('procesul cere repornirea (Railway îl ridică la loc)', jurnal.iesiri === 1, jurnal.iesiri);

  // d) nu ne anunță din 2 în 2 minute pentru aceeași pană
  W.verifica(); await pauza(); W.verifica(); await pauza();
  T('aceeași pană nu se anunță de mai multe ori', jurnal.notificari === 1, jurnal);

  // e) recepția revine, apoi cade din nou → alarmă nouă
  ingestStats.last_packet_at = ceas.t - 60000;
  W.verifica(); await pauza();
  ingestStats.last_packet_at = ceas.t - 40 * 60000;
  W.verifica(); await pauza();
  T('o pană NOUĂ, după ce recepția și-a revenit, se anunță din nou', jurnal.notificari === 2, jurnal);

// ── 3. Ecranul „Stare producție" ───────────────────────────────────────────────────────────────────
console.log('\n3. Semaforul de producție spune adevărul');
{
  const zona = decupeaza('    let newest = 0, live = 0;', 'const totalDev = _qDev.rows[0].n;');
  T('mașinile demo nu mai colorează semaforul de recepție', /DEMO_SET\.has\(_im\)\) continue;/.test(zona));
  T('nici la numărătoarea vehiculelor înregistrate', /company_id <> \$1/.test(zona));
  T('există un rând pentru supraveghetor', /add\('watchdog', 'Supraveghetorul recepției'/.test(src));
  T('rândul spune dacă lipsește adresa de alertă', /setează ALERT_EMAIL/.test(src));
  T('supraveghetorul pornește după deschiderea porturilor',
    src.indexOf('setInterval(_verificaReceptia') > src.indexOf('httpServer.listen('));
  T('push-ul către super-admini nu mai pleacă gol',
    !/sendPushToUser\(u\.id, n\.title, n\.body/.test(src));
}

  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
})().catch((e) => { console.error('EROARE în probă:', e); process.exit(1); });
