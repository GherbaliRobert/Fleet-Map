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

function fmtTime(ts) { try { return new Date(ts).toLocaleString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch (e) { return '' + ts; } }
function online(v, now) { return v.ultima_actualizare && (now - new Date(v.ultima_actualizare).getTime()) < 65 * 60000; } // 1h + tampon (parcate care trimit o data/ora = online/oprit)
function moving(v, now) { return online(v, now) && (v.viteza_kmh || 0) > 3; }
function head(v) { return '🚚 **' + (v.nume || '?') + '**' + (v.nr ? ' (' + v.nr + ')' : ''); }
function loc(v) { return '• 📍 ' + (v.locatie || 'locație indisponibilă'); }

function answer(intent, ctx) {
  const snap = ctx.snapshot || [], today = ctx.today || [], now = ctx.now || Date.now();
  if (!snap.length) return { reply: 'Momentan nu am vehicule accesibile în flotă.', source: 'local' };
  let reply;

  if (intent === 'stopped') {
    const l = snap.filter(v => online(v, now) && (v.viteza_kmh || 0) <= 3);
    reply = l.length
      ? '🚦 **Vehicule oprite (' + l.length + ')**\n\n' + l.map(v => head(v) + '\n' + loc(v) + '\n• 🕒 ' + fmtTime(v.ultima_actualizare)).join('\n\n')
      : '🚦 **Vehicule oprite**\n\nNiciun vehicul oprit acum — toate sunt în mișcare sau offline.';
  } else if (intent === 'moving') {
    const l = snap.filter(v => moving(v, now)).sort((a, b) => (b.viteza_kmh || 0) - (a.viteza_kmh || 0));
    reply = l.length
      ? '🟢 **În mișcare acum (' + l.length + ')**\n\n' + l.map(v => head(v) + '\n• 💨 ' + Math.round(v.viteza_kmh) + ' km/h\n' + loc(v)).join('\n\n')
      : '🟢 **În mișcare**\n\nNiciun vehicul nu se mișcă acum.';
  } else if (intent === 'fastest') {
    const on = snap.filter(v => online(v, now));
    if (!on.length) reply = '🏁 **Cel mai rapid**\n\nNiciun vehicul online acum.';
    else {
      const t = on.reduce((a, b) => (b.viteza_kmh || 0) > (a.viteza_kmh || 0) ? b : a);
      reply = (t.viteza_kmh || 0) <= 3
        ? '🏁 **Cel mai rapid**\n\nToate vehiculele sunt oprite momentan (0 km/h).'
        : '🏁 **Cel mai rapid acum**\n\n' + head(t) + '\n• 💨 ' + Math.round(t.viteza_kmh) + ' km/h\n' + loc(t);
    }
  } else if (intent === 'distance') {
    const byImei = {}; snap.forEach(v => { byImei[v.imei] = v; });
    const rows = today.map(t => ({ v: byImei[t.imei], km: parseFloat(t.km) || 0 })).filter(r => r.km > 0.3).sort((a, b) => b.km - a.km);
    const total = today.reduce((s, t) => s + (parseFloat(t.km) || 0), 0);
    reply = rows.length
      ? '📏 **Distanță azi** — total flotă **' + Math.round(total) + ' km**\n\n' + rows.map(r => '🚚 **' + ((r.v && r.v.nume) || '?') + '** · ' + Math.round(r.km) + ' km').join('\n')
      : '📏 **Distanță azi**\n\nNiciun vehicul nu a rulat azi (0 km).';
  } else if (intent === 'where') {
    reply = '📍 **Locația flotei — live**\n\n' + snap.map(v => {
      const st = !online(v, now) ? '• ⚪ Offline (' + fmtTime(v.ultima_actualizare) + ')'
        : ((v.viteza_kmh || 0) > 3 ? '• 🟢 În mișcare · ' + Math.round(v.viteza_kmh) + ' km/h' : '• 🟠 Oprit');
      return head(v) + '\n' + loc(v) + '\n' + st;
    }).join('\n\n');
  } else if (intent === 'status') {
    const on = snap.filter(v => online(v, now)), mv = snap.filter(v => moving(v, now));
    const km = today.reduce((s, t) => s + (parseFloat(t.km) || 0), 0);
    reply = '📊 **Status flotă**\n\n'
      + '• 🚚 Total: **' + snap.length + '** vehicule\n'
      + '• 🟢 În mișcare: ' + mv.length + '\n'
      + '• 🟠 Oprite: ' + (on.length - mv.length) + '\n'
      + '• ⚪ Offline: ' + (snap.length - on.length) + '\n'
      + '• 📏 Km azi: **' + Math.round(km) + ' km**';
  } else {
    reply = 'Reformulează, te rog.';
  }
  return { reply, source: 'local' };
}

module.exports = { detectIntent, answer };
