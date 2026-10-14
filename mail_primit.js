// mail_primit.js — emailurile PRIMITE din panoul Mail, etapa 2 (Robert, 12.10: „hai cu etapa 2").
// Drumul: cineva scrie pe contact@ratrack.ro (sau pe adresa unui fondator) → Cloudflare Email Routing → un Email Worker
// mic (tools/mail-worker.js) → POST /api/mail/primeste, cu emailul ÎNTREG (MIME) și parola comună → aici se citește.
// Curat: fără bază și fără rețea — serverul îl cheamă, proba îl rulează pe aceleași cazuri. Regulile stau O DATĂ aici:
// ce se păstrează (corpul, atașamentele, cât de mari), pe ce adresă a venit, dacă expeditorul pare fals, subiectul și
// citatul răspunsului, anunțul. Ecranele (web, telefon) doar arată ce le dă serverul.
'use strict';
let simpleParser = null; try { ({ simpleParser } = require('mailparser')); } catch (e) { /* fără el, ruta răspunde 500 */ }
// Textul unui email scris doar în HTML (pentru căutare, citat și pentru telefonul fără HTML). mailparser îl face singur
// doar când HTML-ul stă la suprafață; într-un email cu imagini în corp (multipart/related) nu-l face. Unealta e chiar cea
// a lui mailparser (html-to-text), luată din dependențele LUI, ca să nu ținem două versiuni.
let _inText = null;
try { _inText = require(require.resolve('html-to-text', { paths: [require('path').dirname(require.resolve('mailparser'))] })).convert; } catch (e) { /* rezerva de mai jos */ }
function textDinHtml(h) {
  if (!h) return null;
  if (_inText) { try { return _inText(String(h), { wordwrap: false, selectors: [{ selector: 'img', format: 'skip' }]
    .concat(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'th'].map(function (t) { return { selector: t, options: { uppercase: false } }; })) }); } catch (e) { /* rezerva */ } }
  return String(h).replace(/<(style|script)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n').trim();
}

const EMAIL_MAX = 30 * 1024 * 1024;        // Cloudflare primește cel mult 25 MiB; restul e rezervă pentru antete
const TEXT_MAX = 200000;                   // ca la „Trimise"
const HTML_MAX = 500000;                   // un buletin lung tot încape; peste, se păstrează doar textul (nu un HTML tăiat)
const ATAS_PASTRAT_MAX = 10 * 1024 * 1024; // atașamentele păstrate pe un email, adunate; peste, rămâne doar numele
// O imagine din corp (cid:) se arată până la cât se păstrează pe un email (14.10, Robert: „nu pot să văd imaginile din
// mailuri"): era 2 MB, iar o poză de telefon are 3–5 MB — rămânea „cid:", adică o imagine ruptă.
const IMAGINE_IN_CORP_MAX = ATAS_PASTRAT_MAX;
// Pozele care se pot arăta în pagină: doar imagini „de pixeli". SVG NU (poate purta scripturi).
const IMAGINE_ARATATA = /^image\/(png|jpe?g|gif|webp|bmp)$/i;
const CITAT_MAX = 4000;                    // cât din mesajul primit se citează în răspuns

function _taie(s, n) { return s == null ? null : String(s).slice(0, n); }
function _email(s) { return String(s || '').trim().toLowerCase(); }

// Ce spune serverul care a primit emailul despre expeditor (antetul pus deasupra de Cloudflare — de aceea se citește
// PRIMUL găsit, cel mai de sus). 'picat' = expeditorul nu s-a putut dovedi (DMARC picat, sau SPF picat fără semnătură
// bună): adresa poate fi falsă. 'trecut' = dovedit. null = nu știm (antetul lipsește) — atunci nu se scrie nimic pe ecran.
// Un antet „trecut" scris de mâna expeditorului nu câștigă nimic: fără antet, tot nimic nu se scria.
function verificare(headerLines) {
  const l = (headerLines || []).filter(function (h) { return h && (h.key === 'arc-authentication-results' || h.key === 'authentication-results'); })[0];
  if (!l) return null;
  const s = String(l.line || '').toLowerCase();
  const are = function (cheie, val) { return new RegExp('\\b' + cheie + '\\s*=\\s*' + val + '\\b').test(s); };
  if (are('dmarc', 'fail')) return 'picat';
  if ((are('spf', 'fail') || are('spf', 'softfail')) && !are('dkim', 'pass')) return 'picat';
  if (are('dmarc', 'pass') || are('dkim', 'pass')) return 'trecut';
  return null;
}

// Pe care dintre adresele NOASTRE a venit: întâi destinatarul spus de Cloudflare (plicul), apoi To/Cc din email.
// `adrese` = toate adresele noastre (comună + ale fondatorilor), litere mici. null = nu e a noastră.
function adresaNoastra(adrese, plic, catre, cc) {
  const ale = (adrese || []).map(_email);
  const p = _email(plic);
  if (p) return ale.indexOf(p) >= 0 ? p : null;
  const din = [].concat((catre && catre.value) || [], (cc && cc.value) || []).map(function (x) { return _email(x.address); });
  return din.filter(function (x) { return ale.indexOf(x) >= 0; })[0] || null;
}

// Emailul brut → forma din bază. Atașamentele: cele încăpute în ATAS_PASTRAT_MAX (în ordinea din email) se păstrează;
// cele de după, doar cu numele (`pastrat: false`) — `intreg: false`, iar Worker-ul îl trimite atunci și în căsuța de rezervă.
async function citeste(raw) {
  if (!simpleParser) throw new Error('mailparser lipsește');
  const p = await simpleParser(raw, { keepCidLinks: true, skipTextToHtml: true });
  const de = (p.from && p.from.value && p.from.value[0]) || {};
  const rr = (p.replyTo && p.replyTo.value && p.replyTo.value[0]) || null;
  let intreg = true;
  let html = typeof p.html === 'string' ? p.html : null;
  let text = p.text != null ? String(p.text) : (html ? textDinHtml(html) : null);
  if (html && html.length > HTML_MAX) { html = null; intreg = false; }
  if (text && text.length > TEXT_MAX) { text = text.slice(0, TEXT_MAX); intreg = false; }
  let loc = ATAS_PASTRAT_MAX;
  const atasamente = (p.attachments || []).map(function (a, i) {
    const octeti = a.size != null ? a.size : (a.content ? a.content.length : 0);
    const pastrat = !!a.content && octeti <= loc;
    if (pastrat) loc -= octeti; else intreg = false;
    const tip = _taie(String(a.contentType || 'application/octet-stream').toLowerCase(), 120);
    const nume = _taie(String(a.filename || (a.cid ? 'imagine-' + (i + 1) : 'atasament-' + (i + 1))).replace(/[\\/:*?"<>|\r\n\0]+/g, '_'), 200);
    return { nume: nume, tip: tip, octeti: octeti, cid: a.cid ? _taie(a.cid, 300) : null, inCorp: a.contentDisposition === 'inline' && !!a.cid,
      continut: pastrat ? a.content : null, pastrat: pastrat };
  });
  return {
    de_la: _taie(_email(de.address), 320) || null, de_nume: _taie(de.name || '', 200) || null,
    raspuns_catre: rr && rr.address && _email(rr.address) !== _email(de.address) ? _taie(_email(rr.address), 320) : null,
    antet_catre: _taie(p.to && p.to.text, 2000), antet_cc: _taie(p.cc && p.cc.text, 2000),
    _catre: p.to || null, _cc: p.cc || null,
    subiect: _taie(p.subject || '', 500) || null, text: text, html: html,
    mesaj_id: _taie(p.messageId, 500), in_reply_to: _taie(p.inReplyTo, 500),
    referinte: _taie(Array.isArray(p.references) ? p.references.join(' ') : (p.references || null), 4000),
    trimis_la: p.date instanceof Date && !isNaN(p.date) ? p.date : null,
    verificare: verificare(p.headerLines), atasamente: atasamente, intreg: intreg,
  };
}

// ─── Răspunsul ───
// „Re: " o singură dată (și „Răspuns:"/„RE:" puse de alții rămân cum sunt).
function subiectRaspuns(s) {
  const t = String(s || '').trim() || '(fără subiect)';
  return (/^(re|răspuns|raspuns|rasp|răsp|aw|fw|fwd)\s*:/i.test(t) ? t : 'Re: ' + t).slice(0, 200);
}
const _ZI_ORA = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function _cand(d) {
  const x = d instanceof Date ? d : (d ? new Date(d) : null);
  if (!x || isNaN(x)) return null;
  const parti = {}; _ZI_ORA.formatToParts(x).forEach(function (q) { parti[q.type] = q.value; });
  return parti.day + '.' + parti.month + '.' + parti.year + ', la ' + parti.hour + ':' + parti.minute;
}
// Mesajul primit, citat sub răspuns, cu „> " în față — tăiat la CITAT_MAX, ca răspunsul să nu ducă tot buletinul înapoi.
function citat(m) {
  const cine = m.de_nume ? m.de_nume + ' <' + m.de_la + '>' : (m.de_la || 'expeditorul');
  const cand = _cand(m.trimis_la || m.primit_la);
  let t = String(m.text || '').replace(/\r\n/g, '\n').trim();
  if (t.length > CITAT_MAX) t = t.slice(0, CITAT_MAX).replace(/\s+\S*$/, '') + ' […]';
  return '\n\n' + (cand ? 'Pe ' + cand + ', ' : '') + cine + ' a scris:\n' + t.split('\n').map(function (r) { return '> ' + r; }).join('\n');
}
// Ce se pune în fereastra „Răspunde" (le scrie serverul, ecranele doar le pun în casete).
function pentruRaspuns(m) {
  return { de_la: m.catre, catre: m.raspuns_catre || m.de_la || '', subiect: subiectRaspuns(m.subiect), text: citat(m) };
}

// ─── „Răspunde tuturor" și „Redirecționează" (Robert, 13.10: „4. da") ───
// Adresele dintr-un antet („Ion <ion@x.ro>, b@y.ro") → ['ion@x.ro', 'b@y.ro'].
function adreseDin(s) { return (String(s || '').match(/[^\s<>,;"'()]+@[^\s<>,;"'()]+\.[^\s<>,;"'()]+/g) || []).map(_email); }
// La cine merge răspunsul (expeditorul / adresa lui de răspuns) + în Cc toți cei din „Către" și „Cc", fără adresele NOASTRE
// (`ale` = toate: comuna și ale fondatorilor) și fără dubluri. `cc` gol = nu e nimeni în plus (ecranul nu arată butonul).
function pentruRaspunsTuturor(m, ale) {
  const noi = (ale || []).map(_email);
  const r = pentruRaspuns(m);
  const catre = _email(r.catre);
  const cc = [];
  adreseDin(m.antet_catre).concat(adreseDin(m.antet_cc)).forEach(function (a) {
    if (!a || a === catre || noi.indexOf(a) >= 0 || cc.indexOf(a) >= 0) return;
    cc.push(a);
  });
  return Object.assign({}, r, { cc: cc.join(', ') });
}
// „Fwd: " o singură dată.
function subiectRedirectionare(s) {
  const t = String(s || '').trim() || '(fără subiect)';
  return (/^(fwd|fw|tr|redirecționat|redirectionat)\s*:/i.test(t) ? t : 'Fwd: ' + t).slice(0, 200);
}
const REDIR_MAX = 40000;   // textul mesajului redirecționat (un email scris are voie la 50.000 de caractere)
// Mesajul redirecționat, sub ce scrie omul (ca la Gmail): antetul lui și textul întreg.
function blocRedirectionat(o) {
  let t = String(o.text || '').replace(/\r\n/g, '\n').trim();
  if (t.length > REDIR_MAX) t = t.slice(0, REDIR_MAX).replace(/\s+\S*$/, '') + ' […]';
  const cand = _cand(o.cand);
  return '\n\n---------- Mesaj redirecționat ----------\nDe la: ' + (o.de || '—') + (cand ? '\nData: ' + cand : '')
    + '\nSubiect: ' + (o.subiect || '(fără subiect)') + '\nCătre: ' + (o.catre || '—') + (o.cc ? '\nCc: ' + o.cc : '') + '\n\n' + t;
}
// Un email PRIMIT: pleacă implicit de pe adresa pe care a venit; atașamentele păstrate merg și ele (le pune serverul).
function pentruRedirectionare(m) {
  return { de_la: m.catre, catre: '', subiect: subiectRedirectionare(m.subiect),
    text: blocRedirectionat({ de: m.de_nume ? m.de_nume + ' <' + m.de_la + '>' : m.de_la, cand: m.trimis_la || m.primit_la, subiect: m.subiect,
      catre: m.antet_catre || m.catre, cc: m.antet_cc, text: m.text || textDinHtml(m.html) }) };
}
// Un email TRIMIS de noi: doar textul (la „Trimise" atașamentele nu se păstrează, doar numele lor).
function pentruRedirectionareTrimis(t) {
  return { de_la: t.de_la, catre: '', subiect: subiectRedirectionare(t.subiect),
    text: blocRedirectionat({ de: t.de_la, cand: t.creat_la, subiect: t.subiect, catre: t.catre, cc: t.cc, text: t.text || textDinHtml(t.html) }) };
}

// Imaginile din corp (cid:) → date puse în pagină, din atașamentele păstrate. Doar imagini și doar până la
// IMAGINE_IN_CORP_MAX; restul rămân ca link mort (cadrul nu cere nimic din afară).
function cuImagini(html, atasamente) {
  if (!html) return html;
  let h = String(html);
  (atasamente || []).forEach(function (a) {
    if (!a || !a.cid || !a.continut_b64 || !/^image\//.test(a.tip || '') || (a.octeti || 0) > IMAGINE_IN_CORP_MAX) return;
    h = h.split('cid:' + a.cid).join('data:' + a.tip + ';base64,' + a.continut_b64);
  });
  return h;
}

// Pozele atașate care NU sunt deja în corp (iPhone-ul trimite poza ca atașament lângă un text simplu; unele programe pun
// o poză „inline" fără s-o lege de text): se arată sub email, ca imagini — tot din ce s-a păstrat, ca date în pagină.
// `html` = corpul ORIGINAL (cu „cid:"), ca să se știe ce e deja în el.
function imaginiAtasate(html, atasamente) {
  const h = String(html || '');
  return (atasamente || []).filter(function (a) {
    return a && a.continut_b64 && IMAGINE_ARATATA.test(a.tip || '') && (a.octeti || 0) <= IMAGINE_IN_CORP_MAX && !(a.cid && h.indexOf('cid:' + a.cid) >= 0);
  }).map(function (a) { return { id: Number(a.id), nume: a.nume, src: 'data:' + String(a.tip).toLowerCase() + ';base64,' + a.continut_b64 }; });
}

// Anunțul din aplicație: fără nume, fără subiect (ca la cererile demo: datele omului stau doar în panou, nu și în
// telefoanele noastre, prin serverele de notificări).
function anunt(adresa, n) {
  const de = (n % 100 >= 1 && n % 100 <= 19) ? ' ' : ' de ';   // „3 emailuri", „20 de emailuri"
  return { titlu: (n > 1 ? n + de + 'emailuri noi' : 'Email nou') + ' pe ' + adresa,
    corp: n > 1 ? 'Deschide panoul Mail ca să le citești.' : 'Deschide panoul Mail ca să-l citești.' };
}

module.exports = {
  EMAIL_MAX, TEXT_MAX, HTML_MAX, ATAS_PASTRAT_MAX, IMAGINE_IN_CORP_MAX, CITAT_MAX,
  citeste, verificare, adresaNoastra, subiectRaspuns, citat, pentruRaspuns, cuImagini, imaginiAtasate, anunt, textDinHtml, cand: _cand,
  adreseDin, pentruRaspunsTuturor, subiectRedirectionare, blocRedirectionat, pentruRedirectionare, pentruRedirectionareTrimis, REDIR_MAX,
};
