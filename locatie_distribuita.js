// locatie_distribuita.js — „Distribuie locația" (Robert, 21.10): linkul public al unei mașini, ca locația live de pe WhatsApp.
// Oricine are linkul vede mașina pe hartă până expiră; după aceea linkul nu mai există.
//
// Aici stau DOAR regulile și textele (curat: fără bază, fără server, fără ceas propriu — `acum` vine de la cine cheamă):
// cât poate ține un link, cum arată tokenul, ce se păstrează în bază și ce vede omul pe pagina publică.
'use strict';
const crypto = require('crypto');

// Duratele, ca pe WhatsApp. Ecranele (web, telefon) le iau de la server — NU le scrie a doua oară.
const DURATE = [
  { minute: 15, text: '15 minute' },
  { minute: 60, text: '1 oră' },
  { minute: 480, text: '8 ore' },
];
// Cel mult atâtea linkuri active deodată pe o mașină (plasă împotriva unui buton apăsat la nesfârșit).
const MAX_ACTIVE_PE_MASINA = 10;
// Cât de des își cere pagina publică poziția nouă.
const SECUNDE_REIMPROSPATARE = 5;
// Sub viteza asta mașina e „oprită" — aceeași cifră ca la alerta „mișcare în afara programului".
const VITEZA_MERS = 3;

function durata(minute) { return DURATE.find((d) => d.minute === Number(minute)) || null; }

// Tokenul: 24 de octeți întâmplători (192 de biți) → 32 de caractere care merg într-o adresă. În bază stă doar
// amprenta lui: cine citește baza nu poate deschide linkurile.
function tokenNou() { return crypto.randomBytes(24).toString('base64url'); }
function amprenta(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function tokenBun(t) { return typeof t === 'string' && /^[A-Za-z0-9_-]{32}$/.test(t); }

function activ(link, acum) { return !!link && Number(link.expira_la) > acum; }

// „20 de minute", dar „15 minute": fără „de" când ultimele două cifre sunt între 1 și 19 (regula din pagină, _raxDe).
function _de(n) { const r = n % 100; return (r >= 1 && r <= 19) ? ' ' : ' de '; }
function _cate(n, unu, multe) { return n === 1 ? ('1 ' + unu) : (n + _de(n) + multe); }

const _fmtOra = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' });
function ora(ms) { return _fmtOra.format(new Date(ms)); }

// Cât mai ține linkul: „încă 14 minute", „încă 7 ore și 59 de minute".
function ramas(expiraLa, acum) {
  const min = Math.ceil((Number(expiraLa) - acum) / 60000);
  if (min <= 0) return 's-a încheiat';
  if (min < 60) return 'încă ' + _cate(min, 'minut', 'minute');
  const h = Math.floor(min / 60), m = min % 60;
  return 'încă ' + _cate(h, 'oră', 'ore') + (m ? ' și ' + _cate(m, 'minut', 'minute') : '');
}

// De când e poziția: „acum câteva secunde", „acum 2 minute", „acum 3 ore".
function vechime(ts, acum) {
  const s = Math.max(0, Math.round((acum - new Date(ts).getTime()) / 1000));
  if (s < 60) return 'acum câteva secunde';
  const m = Math.floor(s / 60);
  if (m < 60) return 'acum ' + _cate(m, 'minut', 'minute');
  const h = Math.floor(m / 60);
  if (h < 24) return 'acum ' + _cate(h, 'oră', 'ore');
  const z = Math.floor(h / 24);
  return 'acum ' + _cate(z, 'zi', 'zile');
}

// Numele mașinii pe pagina publică: numele dat de firmă și numărul. Fără IMEI, fără șofer.
function numeMasina(nume, numar) {
  const n = String(nume || '').trim(), p = String(numar || '').trim();
  if (n && p && n.toUpperCase() !== p.toUpperCase()) return n + ' · ' + p;
  return n || p || 'Vehicul';
}

// Ce vede cine deschide un link care nu mai e bun (expirat, oprit, inventat — toate la fel).
const TITLU_INCHEIAT = 'Locația nu mai e distribuită';
const TEXT_INCHEIAT = 'Linkul a expirat sau a fost oprit.';

// Textul care pleacă odată cu linkul (WhatsApp, SMS, email) — îl scrie serverul, ecranele doar îl copiază.
function mesaj(nume, expiraLa, link) { return 'Urmărește live ' + nume + ' pe hartă, până la ' + ora(expiraLa) + ': ' + link; }

// Ce primește pagina publică. `poz` = ultima poziție cunoscută (sau null), `semnal` = cuvintele de vechime ale
// aplicației când mașina tace („fără semnal de 2 ore"), altfel null. Nimic din ce nu e aici nu pleacă spre public.
function pentruPagina({ link, poz, nume, numar, firma, semnal }, acum) {
  const r = {
    activ: true,
    vehicul: numeMasina(nume, numar),
    firma: firma || null,
    expiraLa: Number(link.expira_la),
    pana: ora(Number(link.expira_la)),
    ramas: ramas(link.expira_la, acum),
    reimprospatare: SECUNDE_REIMPROSPATARE,
    pozitie: null,
    stare: 'Mașina n-a transmis încă nicio poziție.',
    actualizat: null,
  };
  if (poz && poz.latitude != null && poz.longitude != null) {
    const viteza = Math.max(0, Math.round(Number(poz.speed) || 0));
    const ts = new Date(poz.timestamp).getTime();
    r.pozitie = { lat: Number(poz.latitude), lng: Number(poz.longitude), unghi: Number(poz.angle) || 0, viteza, ts };
    r.tacut = !!semnal;
    r.inMers = !semnal && viteza > VITEZA_MERS;
    // „tăcut de 45 min" / „fără semnal de 2 ore" (cuvintele Inventarului) → „Fără semnal de 45 min — ultima poziție cunoscută".
    r.stare = semnal ? ('Fără semnal ' + String(semnal).replace(/^(tăcut|fără semnal)\s+/, '') + ' — ultima poziție cunoscută')
      : (r.inMers ? ('În mers · ' + viteza + ' km/h') : 'Oprit');
    r.actualizat = 'Poziție ' + vechime(ts, acum);
  }
  return r;
}

module.exports = {
  DURATE, MAX_ACTIVE_PE_MASINA, SECUNDE_REIMPROSPATARE, VITEZA_MERS, TITLU_INCHEIAT, TEXT_INCHEIAT,
  durata, tokenNou, amprenta, tokenBun, activ, ramas, vechime, ora, numeMasina, mesaj, pentruPagina,
};
