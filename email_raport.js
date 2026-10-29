'use strict';
// email_raport.js — emailul cu raportul programat (29.10; Alin: „da, e o idee bună"). Până atunci emailul avea două rânduri
// și un Excel atașat — exact forma pe care filtrele de spam o bănuiesc la un expeditor nou (raportul lui Alin ajungea în Spam
// la Yahoo). Acum spune ce raport e, pe ce perioadă și pe ce mașini, cifrele de sus ale raportului (aceleași ca pe cartonașul
// din RA Insight — reports.kpiRaport), are linkul „Deschide raportul în aplicație" (spre Istoric rapoarte) și spune de ce
// primește omul emailul. Fișierul rămâne atașat.
// Regulile și TEXTELE stau aici, curate (fără bază de date, fără rețea); report_schedules.js adună datele, mailer.js pune
// chenarul casei.

const FRECVENTA = { daily: 'zilnic', weekly: 'în fiecare luni', monthly: 'pe 1 ale fiecărei luni' };

function _esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
function _de(n) { const r = Math.abs(Math.round(Number(n) || 0)) % 100; return (r >= 1 && r <= 19) ? ' ' : ' de '; }
function _cant(n, unu, multe) { n = Math.round(Number(n) || 0); return n === 1 ? '1 ' + unu : n + _de(n) + multe; }
function _ora(h) { const x = Math.min(23, Math.max(0, Math.round(Number(h) || 0))); return (x < 10 ? '0' : '') + x + ':00'; }

// Unde duce linkul: raportul din Istoric (îl deschide pagina, după autentificare), altfel aplicația.
function linkRaport(baza, historyId) {
  const b = String(baza || 'https://ratrack.ro').replace(/\/+$/, '');
  const id = Number(historyId);
  return Number.isInteger(id) && id > 0 ? b + '/app?raport=' + id : b + '/app';
}
// Pe ce mașini: una anume („Dacia Logan 3 · B 154 UIP") sau toată flota („Toată flota · 5 mașini").
function textMasini(o) {
  o = o || {};
  if (o.vehicul) return String(o.vehicul);
  return 'Toată flota' + (Number(o.nrMasini) > 0 ? ' · ' + _cant(o.nrMasini, 'mașină', 'mașini') : '');
}
// De ce primește omul emailul (și de unde îl oprește): numele programării, cât de des, la ce oră.
function textDeCe(o) {
  o = o || {};
  const cand = [FRECVENTA[o.frecventa] || '', o.ora != null ? 'la ' + _ora(o.ora) : ''].filter(Boolean).join(', ');
  return 'Primești emailul pentru că raportul e programat în RA Track (Rapoarte › Programări: „' + String(o.numeProgramare || o.label || 'Raport') + '”' +
    (cand ? ', ' + cand : '') + '). Îl poți schimba sau opri de acolo.';
}

// o = { label, perioada, vehicul?, nrMasini, kpi: [{ et, val }], randuri, link, format, numeProgramare, frecventa, ora }
// → { subiect, text, html }. Subiectul rămâne cel de până acum („[RA Track] Foaie de parcurs — 28.10.2026").
function continut(o) {
  o = o || {};
  const label = String(o.label || 'Raport');
  const perioada = String(o.perioada || '');
  const masini = textMasini(o);
  const kpi = (Array.isArray(o.kpi) ? o.kpi : []).filter(function (k) { return k && k.et; }).slice(0, 4);
  const gol = !Number(o.randuri);
  const fisier = o.format === 'xlsx' ? 'Excel' : 'PDF';
  const link = String(o.link || linkRaport());
  const deCe = textDeCe(o);
  const peScurt = kpi.length ? kpi.map(function (k) { return '• ' + k.et + ': ' + k.val; }) : [gol ? '• Nicio înregistrare în perioada asta.' : '• ' + _cant(o.randuri, 'rând', 'rânduri') + ' în raport.'];
  const text = [
    'Raport „' + label + '” · ' + perioada,
    masini,
    '',
    'Pe scurt:',
    peScurt.join('\n'),
    '',
    'Raportul întreg e în fișierul atașat (' + fisier + ') și în aplicație, la Rapoarte › Istoric rapoarte:',
    link,
    '',
    deCe,
  ].join('\n');
  const randKpi = kpi.length
    ? kpi.map(function (k) {
      return '<tr><td style="padding:6px 16px 6px 0;color:#475569;">' + _esc(k.et) + '</td><td style="padding:6px 0;font-weight:700;color:#1a2235;">' + _esc(k.val) + '</td></tr>';
    }).join('')
    : '<tr><td style="padding:6px 0;color:#475569;">' + _esc(gol ? 'Nicio înregistrare în perioada asta.' : _cant(o.randuri, 'rând', 'rânduri') + ' în raport.') + '</td></tr>';
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#1a2235;">'
    + '<p style="margin:0 0 2px;font-size:17px;font-weight:700;">Raport „' + _esc(label) + '”</p>'
    + '<p style="margin:0 0 14px;color:#475569;">' + _esc(perioada) + ' · ' + _esc(masini) + '</p>'
    + '<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 18px;">' + randKpi + '</table>'
    + '<p style="margin:0 0 16px;"><a href="' + _esc(link) + '" style="display:inline-block;background:#3FE07D;color:#06210F;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:8px;">Deschide raportul în aplicație</a></p>'
    + '<p style="margin:0 0 14px;color:#475569;">Raportul întreg e și în fișierul atașat (' + _esc(fisier) + ').</p>'
    + '<p style="margin:0;color:#64748b;font-size:12px;">' + _esc(deCe) + '</p>'
    + '</div>';
  return { subiect: '[RA Track] ' + label + ' — ' + perioada, text: text, html: html };
}

module.exports = { FRECVENTA, linkRaport, textMasini, textDeCe, continut };
