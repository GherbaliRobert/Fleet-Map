'use strict';
// cont_demo.js — textele CONTULUI DEMO (19.11; Alin: „după ce îi dăm cont demo… să vadă cum funcționează RA Insight… cel de pe
// Start”; „1. varianta 2”; „3. cele găsite pe drum rezolvă acum”). CURAT: fără bază, fără ceas propriu.
// Aici stau: emailul cu linkul de parolă (spune că e un cont demo, cât ține și ce poate încerca), banda din aplicație
// („Cont demo · îl ai până pe…”, cu „Cere ofertă”), emailul prelungirii și cifrele cu „de” („30 de zile”, „1 cont demo activ”).
// Paginile și serverul doar le folosesc — NU scrie texte de-ale contului demo în altă parte.

const prenume = require('./prenume');
const flota = require('./demo_flota');

const MIN = 60000, ORA = 3600000, ZI = 86400000;
// Linkul de parolă ține cât contul, dar cel mult 7 zile (ca orice link de parolă din aplicație).
const LINK_MAX_ORE = 7 * 24;
// Unde duce „Cere ofertă”: formularul de pe site, cu bifa de cont demo scoasă (omul are deja cont).
const LINK_OFERTA = '/?oferta=1#contact';
// Contul demo expirat se mai ține atâtea zile (cât să-l putem prelungi), apoi se șterge singur (20.11; Alin: „3. da”). Pagina de
// confidențialitate spune aceeași cifră (legată prin verify_demo.js).
const ZILE_DUPA_EXPIRARE = 30;
// Ce scrie pe ecranul nostru când contul adevărat ia locul unui cont demo pe aceeași adresă (20.11; Alin: „4. o rezolvăm acum”).
const TEXT_INLOCUIT = 'Pe adresa asta era un cont demo: l-am înlocuit cu contul nou.';

// „20 de zile”, dar „12 zile”: numerele care se termină în 1–19 merg fără „de” (ca _rDe din pagină).
function de(n) { const x = Math.abs(Math.round(Number(n) || 0)); if (x === 0) return ''; const r = x % 100; return (r >= 1 && r <= 19) ? '' : 'de '; }
function cate(n, unu, multe) { const x = Math.round(Number(n) || 0); return x === 1 ? '1 ' + unu : x.toLocaleString('ro-RO') + ' ' + de(x) + multe; }
// Durata unui cont demo, din ore: „2 ore”, „24 de ore”, „7 zile”, „30 de zile”, „2 zile și 6 ore”.
function durata(ore) {
  const h = Math.max(1, Math.round(Number(ore) || 0));
  const d = Math.floor(h / 24), r = h % 24;
  if (!d) return cate(h, 'oră', 'ore');
  if (!r) return cate(d, 'zi', 'zile');
  return cate(d, 'zi', 'zile') + ' și ' + cate(r, 'oră', 'ore');
}
// Starea simulatorului, pe ecranul nostru („Cereri demo”).
function conturiActive(n) { const x = Math.round(Number(n) || 0); return x === 1 ? '1 cont demo activ' : cate(x, 'cont demo activ', 'conturi demo active'); }

// Ora și ziua, pe ora României, fără formatatoare noi: ziua din demo_flota (calendarul), ora socotită din începutul zilei.
function _zi(ms) { const idx = flota.ziuaLa(ms); const p = flota.dataZi(idx).split('-'); return { idx: idx, zz: p[2] + '.' + p[1], an: p[0], z0: flota.inceputZi(idx) }; }
function _ora(ms) { const z = _zi(ms); const m = Math.floor((ms - z.z0) / MIN); return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
// „26.11.2026, ora 06:53”
function cand(ms) { const z = _zi(ms); return z.zz + '.' + z.an + ', ora ' + _ora(ms); }
// Cât mai e, la ora întreagă cea mai apropiată și scris ca durata contului: „încă 7 zile” (abia aprobat pe 7 zile),
// „încă 6 zile și 23 de ore”, „încă 20 de ore”; sub 2 ore, în minute („încă 40 de minute”). Până pe 19.11 zilele se tăiau în
// jos: abia aprobat pe 7 zile, banda scria „încă 6 zile” — iar data din fața ei spunea altceva.
function ramas(pana, acum) {
  const ms = Number(pana) - Number(acum);
  if (!(ms > 0)) return null;
  if (ms >= 2 * ORA) return 'încă ' + durata(Math.round(ms / ORA));
  return 'încă ' + cate(Math.max(1, Math.floor(ms / MIN)), 'minut', 'minute');
}

// Banda din aplicație, pentru omul cu cont demo. null = nu se arată.
function banda(pana, acum) {
  const r = ramas(pana, acum);
  if (!r) return null;
  const z = _zi(Number(pana)), azi = _zi(Number(acum));
  const ziua = z.idx === azi.idx ? 'azi' : (z.idx === azi.idx + 1 ? 'mâine' : 'pe ' + z.zz);
  return { text: 'Cont demo · îl ai până ' + ziua + ', ora ' + _ora(Number(pana)) + ' (' + r + ').', buton: 'Cere ofertă', link: LINK_OFERTA };
}

// Ce găsește omul în contul demo — o singură listă, pentru email.
const CE_GASESTI = [
  'harta live și traseele celor ' + flota.MASINI.length + ' mașini de probă, cu ' + flota.ZILE_ISTORIC + ' de zile de istoric;',
  'rapoartele: km, consum, opriri, alimentări;',
  'RA Insight, pe butoane: unde e o mașină, câți km a făcut, ce acte expiră;',
  'agenții AI: ce au găsit azi la mașinile de probă (motorină, ralanti, acte, ore de condus).'
];
// Emailul cu linkul de parolă. `ore` = cât ține contul; `linkOre` = cât ține linkul.
function email(o) {
  const p = prenume.prenumeDin(o.nume, o.email);
  const linkTot = Number(o.linkOre) >= Number(o.ore);
  const text = [
    p ? 'Bună, ' + p + '!' : 'Bună ziua!',
    '',
    'Contul tău demo RA Track e gata. Îl ai ' + durata(o.ore) + ', până pe ' + cand(o.pana) + '.',
    'Utilizator: ' + o.email,
    '',
    'Pune-ți parola aici' + (linkTot ? ':' : ' (linkul e valabil ' + durata(o.linkOre) + '):'),
    o.link,
    '',
    // Adresa la capăt de rând, fără nimic după ea (19.11: „…/app.” intra în link — „Cannot GET /app.”).
    'Apoi intri în aplicație: ' + o.aplicatie,
    '',
    'Ce poți încerca:',
    CE_GASESTI.map(function (x) { return '• ' + x; }).join('\n'),
    '',
    'Pentru o ofertă pe flota ta, răspunde la acest email.',
    '',
    '— Echipa RA Track'
  ].join('\n');
  return { subiect: 'Contul tău demo RA Track', text: text };
}
// Emailul prelungirii.
function emailPrelungire(o) {
  const p = prenume.prenumeDin(o.nume, o.email);
  return { subiect: 'Contul tău demo RA Track a fost prelungit', text: [
    p ? 'Bună, ' + p + '!' : 'Bună ziua!',
    '',
    'Ți-am prelungit contul demo RA Track: îl ai până pe ' + cand(o.pana) + '.',
    'Intri cu aceeași adresă și aceeași parolă: ' + o.aplicatie,
    '',
    'Pentru o ofertă pe flota ta, răspunde la acest email.',
    '',
    '— Echipa RA Track'
  ].join('\n') };
}
// Mesajul de după „Prelungește” (pe ecranul nostru). `linkNou`: omul n-a intrat încă în cont, deci a primit (sau trebuie să
// primească de la noi) un link nou de parolă, nu „aceeași parolă”.
function dupaPrelungire(o) {
  const cine = 'Contul demo al lui ' + (o.nume || o.email) + ' merge până pe ' + cand(o.pana) + '.';
  if (o.linkNou) return cine + ' N-a intrat încă în cont: ' + (o.trimis ? 'i-am trimis pe email un link nou de parolă.' : 'emailul n-a plecat; trimite-i tu linkul nou de parolă.');
  return cine + (o.trimis ? ' I-am scris pe email.' : ' Emailul n-a plecat; spune-i tu.');
}

module.exports = { LINK_MAX_ORE, LINK_OFERTA, ZILE_DUPA_EXPIRARE, TEXT_INLOCUIT, CE_GASESTI, de, cate, durata, conturiActive, cand, ramas, banda, email, emailPrelungire, dupaPrelungire };
