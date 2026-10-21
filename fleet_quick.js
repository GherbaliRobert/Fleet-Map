// fleet_quick.js — răspunsuri LOCALE (euristici) la întrebările frecvente despre flotă.
// ZERO tokeni AI. /api/ai/chat încearcă întâi asta; doar întrebările libere ajung la Claude.
// Funcționează chiar și fără cheie AI configurată.

function norm(s) {
  return (s || '').toString().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
const INTENTS = [
  { key: 'fastest', kw: ['cel mai repede', 'viteza maxima', 'cea mai mare viteza', 'cel mai rapid'] },
  { key: 'stopped', kw: ['oprit', 'stationat', 'parcate', 'opririle', 'stau pe loc'] },
  { key: 'moving', kw: ['in miscare', 'merg acum', 'care merg', 'deplasare', 'ruleaza', 'pe drum'] },
  { key: 'distance', kw: ['cat au mers', 'cat a mers', 'km azi', 'kilometri', 'distanta', 'cati km', 'parcurs azi'] },
  { key: 'where', kw: ['unde sunt', 'unde e', 'unde este', 'unde se afla', 'locatia', 'locatie'] },
  { key: 'status', kw: ['status flota', 'rezumat flota', 'situatia flotei', 'cum sta flota', 'overview', 'sumar', 'pe scurt'] }
];

function detectIntent(message) {
  const m = norm(message); if (!m) return null;
  for (const it of INTENTS) for (const k of it.kw) if (m.indexOf(norm(k)) >= 0) return it.key;
  return null;
}

// Ora pe ora ROMÂNIEI (20.10): serverul merge pe UTC, iar până atunci „ultima poziție" ieșea cu 2–3 ore în urmă.
function fmtTime(ts) { try { return new Date(ts).toLocaleString('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return '' + ts; } }
function online(v, now) { return v.ultima_actualizare && (now - new Date(v.ultima_actualizare).getTime()) < 65 * 60000; } // 1h + tampon (parcate care trimit o data/ora = online/oprit)
function moving(v, now) { return online(v, now) && (v.viteza_kmh || 0) > 3; }
// Fără emoji (Alin, 20.10: răspunsul instant „unde e acum" era plin de 📍 🚚 🟠 și nu arăta profesionist lângă insignele
// RA Insight). Titlu îngroșat, apoi mașina și câte un rând cu „•".
// „19 vehicule", dar „20 de vehicule": de la 20 în sus româna cere „de" (ultimele două cifre între 1 și 19 = fără „de").
function de(n) { const r = Math.abs(Math.round(Number(n) || 0)) % 100; return (r >= 1 && r <= 19) ? ' ' : ' de '; }
function cant(n, unu, multe) { return Number(n) === 1 ? '1 ' + unu : n + de(n) + multe; }
function cine(v) { return '**' + (v.nume || '?') + '**' + (v.nr ? ' (' + v.nr + ')' : ''); }
function unde(v) { return '• ' + (v.locatie || 'locul nu e cunoscut'); }

function answer(intent, ctx) {
  const snap = ctx.snapshot || [], today = ctx.today || [], now = ctx.now || Date.now();
  if (!snap.length) return { reply: 'Momentan nu am vehicule accesibile în flotă.', source: 'local' };
  // Câte vehicule are flota CU ADEVĂRAT. Lista primită poate fi tăiată la un plafon; dacă e, nu
  // avem voie să dăm numere ca și cum ar fi toată flota. Mai bine spunem că am văzut o parte.
  const total = Number(ctx.total) > 0 ? Number(ctx.total) : snap.length;
  const taiate = Math.max(0, total - snap.length);
  const notaTaiere = taiate > 0
    ? '\n\n_Flota are ' + cant(total, 'vehicul', 'vehicule') + '; mai sus sunt primele ' + snap.length + '. Pentru toate, deschide harta sau un raport._'
    : '';
  let reply;

  if (intent === 'stopped') {
    const l = snap.filter(v => online(v, now) && (v.viteza_kmh || 0) <= 3);
    reply = l.length
      ? '**Vehicule oprite acum (' + l.length + ')**\n\n' + l.map(v => cine(v) + '\n' + unde(v) + '\n• Ultima poziție: ' + fmtTime(v.ultima_actualizare)).join('\n\n')
      : '**Vehicule oprite acum**\n\nNiciun vehicul nu e oprit acum: toate sunt în mișcare sau nu transmit.';
  } else if (intent === 'moving') {
    const l = snap.filter(v => moving(v, now)).sort((a, b) => (b.viteza_kmh || 0) - (a.viteza_kmh || 0));
    reply = l.length
      ? '**În mișcare acum (' + l.length + ')**\n\n' + l.map(v => cine(v) + '\n• ' + Math.round(v.viteza_kmh) + ' km/h\n' + unde(v)).join('\n\n')
      : '**În mișcare acum**\n\nNiciun vehicul nu se mișcă acum.';
  } else if (intent === 'fastest') {
    const on = snap.filter(v => online(v, now));
    if (!on.length) reply = '**Cel mai rapid acum**\n\nNiciun vehicul nu transmite acum.';
    else {
      const t = on.reduce((a, b) => (b.viteza_kmh || 0) > (a.viteza_kmh || 0) ? b : a);
      reply = (t.viteza_kmh || 0) <= 3
        ? '**Cel mai rapid acum**\n\nToate vehiculele sunt oprite acum (0 km/h).'
        : '**Cel mai rapid acum**\n\n' + cine(t) + '\n• ' + Math.round(t.viteza_kmh) + ' km/h\n' + unde(t);
    }
  } else if (intent === 'distance') {
    const byImei = {}; snap.forEach(v => { byImei[v.imei] = v; });
    const rows = today.map(t => ({ v: byImei[t.imei], km: parseFloat(t.km) || 0 })).filter(r => r.km > 0.3).sort((a, b) => b.km - a.km);
    const total = today.reduce((s, t) => s + (parseFloat(t.km) || 0), 0);
    reply = rows.length
      ? '**Distanță azi:** total flotă **' + Math.round(total) + ' km**\n\n' + rows.map(r => '• **' + ((r.v && r.v.nume) || '?') + '** · ' + Math.round(r.km) + ' km').join('\n')
      : '**Distanță azi**\n\nNiciun vehicul n-a mers azi (0 km).';
  } else if (intent === 'where') {
    reply = (snap.length === 1 ? '**Unde e acum**' : '**Unde sunt vehiculele acum (' + snap.length + ')**') + '\n\n' + snap.map(v => {
      const st = !online(v, now) ? '• Nu transmite de la ' + fmtTime(v.ultima_actualizare)
        : ((v.viteza_kmh || 0) > 3 ? '• În mișcare, ' + Math.round(v.viteza_kmh) + ' km/h' : '• Oprit');
      return cine(v) + '\n' + unde(v) + '\n' + st;
    }).join('\n\n');
  } else if (intent === 'status') {
    const on = snap.filter(v => online(v, now)), mv = snap.filter(v => moving(v, now));
    const km = today.reduce((s, t) => s + (parseFloat(t.km) || 0), 0);
    reply = '**Situația flotei acum**\n\n'
      // Totalul e numărul ADEVĂRAT al flotei, nu lungimea listei tăiate. Defalcarea de dedesubt
      // se face pe cât am văzut, iar nota de la final spune limpede că e o parte.
      + '• Total: **' + total + '**' + de(total) + 'vehicule' + (taiate > 0 ? ' _(defalcarea de mai jos, pe primele ' + snap.length + ')_' : '') + '\n'
      + '• În mișcare: ' + mv.length + '\n'
      + '• Oprite: ' + (on.length - mv.length) + '\n'
      + '• Nu transmit: ' + (snap.length - on.length) + '\n'
      + '• Km azi: **' + Math.round(km) + ' km**';
  } else {
    reply = 'Reformulează, te rog.';
    return { reply, source: 'local' };
  }
  return { reply: reply + notaTaiere, source: 'local' };
}

module.exports = { detectIntent, answer };
