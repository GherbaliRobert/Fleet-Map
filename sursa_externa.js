'use strict';
// sursa_externa.js — „Sursă externă" în RA Insight (28.10; Alin, la propunerea „Internetul în RA Insight": „da — dar nu-l
// numim internet, îl numim sursă externă, și explicăm că caută pe internet"). RA Insight răspunde din aplicație; cu butonul
// „Sursă externă" pornit, caută și pe internet ce nu e în aplicație: prețuri, reguli, legi, informații generale.
// Regulile și TEXTELE stau aici, curate (fără bază de date, fără rețea): cine vede butonul, ce n-are voie să plece în căutare,
// câte întrebări cu sursă externă are fiecare pachet, ce scrie pe buton, sub casetă și sub răspuns. Serverul adună cifrele și
// face apelul SEPARAT (ai.cautaExtern — primește doar textul căutării, nimic din flotă); ecranele doar arată.

const NUME = 'Sursă externă';
const EXPLICATIE = 'Caută pe internet ce nu e în aplicație: prețuri, reguli, legi, informații generale. Datele firmei nu pleacă în căutare.';
const CAUTARI_MAX = 3;                                              // căutări pe internet la o întrebare (max_uses)
const PE_PACHET = { start: 0, basic: 10, pro: 30, business: 50 };   // întrebări cu sursă externă pe lună, pe firmă (Alin, 27.10)
const STARI = ['oprita', 'noi', 'firme'];                           // comutatorul nostru, pe toată platforma
const TEXT_STARI = { oprita: 'Oprită', noi: 'Doar pentru noi', firme: 'Pornită pentru firme' };
const DESCRIERE_STARI = {
  oprita: 'Butonul nu apare nimănui.',
  noi: 'Doar noi, fondatorii, vedem butonul, ca să-l încercăm.',
  firme: 'Butonul apare la noi și la firmele cu Basic, Pro sau Business, dacă administratorul firmei nu l-a oprit.',
};
const LUNGIME_MAX = 200;   // caractere într-o căutare
const SURSE_MAX = 5;       // surse arătate sub răspuns
const REFUZATE_MAX = 2;    // căutări refuzate la o întrebare, după care unealta nu mai încearcă

function _de(n) { const r = Math.abs(Math.round(Number(n) || 0)) % 100; return (r >= 1 && r <= 19) ? ' ' : ' de '; }
function cant(n, unu, multe) { return Math.round(n) === 1 ? '1 ' + unu : Math.round(n) + _de(n) + multe; }
const LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const _fmtZi = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'numeric', year: 'numeric' });
const _fmtOra = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' });
function _zi(ms) { const p = {}; _fmtZi.formatToParts(new Date(ms)).forEach(function (x) { p[x.type] = Number(x.value); }); return p; }
function _ziText(ms) { const p = _zi(ms); return p.day + ' ' + LUNI[p.month - 1] + ' ' + p.year; }
// „pe 1 noiembrie" — ziua în care se reîncarcă întrebările (prima a lunii următoare, pe ora României).
function reincarcare(acum) { const p = _zi(acum); return 'pe 1 ' + LUNI[p.month % 12]; }

function starePlatforma(v) { return STARI.indexOf(v) >= 0 ? v : 'oprita'; }
// Câte întrebări cu sursă externă are pachetul pe lună (Start și regula veche: niciuna).
function peLuna(pachet) {
  const cod = pachet && typeof pachet === 'object' ? (pachet.ai ? pachet.cod : null) : pachet;
  return PE_PACHET[String(cod || '').toLowerCase()] || 0;
}

// Cine vede butonul și dacă se poate căuta acum. Trei niveluri, fiecare îl oprește pe cel de sub el: noi (pe toată platforma),
// administratorul firmei (pentru toată firma), omul (pentru discuția lui — asta o ține pagina). Plus modelul: dacă Anthropic spune
// că nu primește căutarea, butonul nu apare nimănui. o = { platforma, isSuper, pachet: { cod, ai } | null, firmaOprita, model: { ok },
// folosite } → { vede, poate, fondator, motiv, total, folosite, ramase }.
function stare(o) {
  o = o || {};
  const p = starePlatforma(o.platforma);
  const nu = function (motiv) { return { vede: false, poate: false, fondator: false, motiv: motiv, total: 0, folosite: 0, ramase: 0 }; };
  if (p === 'oprita') return nu('platforma');
  if (o.model && o.model.ok === false) return nu('model');
  if (o.isSuper) return { vede: true, poate: true, fondator: true, motiv: null, total: null, folosite: 0, ramase: null };
  if (p === 'noi') return nu('doar_noi');
  const total = peLuna(o.pachet);
  if (!total) return nu('pachet');
  if (o.firmaOprita) return nu('firma');
  const folosite = Math.max(0, Math.round(Number(o.folosite) || 0));
  const ramase = Math.max(0, total - folosite);
  return { vede: true, poate: ramase > 0, fondator: false, motiv: ramase > 0 ? null : 'terminate', total: total, folosite: folosite, ramase: ramase };
}
// Ce scrie pe buton: „Sursă externă · 7 din 10" (rămase din pachet); la noi, doar numele.
function textButon(st) {
  if (!st || !st.vede) return '';
  return st.fondator || st.total == null ? NUME : NUME + ' · ' + st.ramase + ' din ' + st.total;
}
// Fraza de sub casetă, cu butonul pornit: ce face și câte au rămas firmei luna asta.
function textNota(st, acum) {
  if (!st || !st.vede) return '';
  if (st.fondator || st.total == null) return EXPLICATIE;
  if (!st.ramase) return textTerminate(acum);
  return EXPLICATIE + ' Firma mai are ' + cant(st.ramase, 'întrebare', 'întrebări') + ' cu sursă externă luna asta.';
}
function textTerminate(acum) {
  return 'S-au terminat întrebările cu sursă externă ale lunii. RA Insight răspunde mai departe din aplicație; se reîncarcă ' + reincarcare(acum) + '.';
}
// Pentru ecran: tot ce trebuie ca să deseneze butonul (fără bani, fără motivele noastre interne). `contor` = „7 din 10" (pe telefon
// butonul se strânge la atât).
function pentruPagina(st, acum) {
  const cuCota = !!(st && st.vede && !st.fondator && st.total != null);
  return { vede: !!(st && st.vede), poate: !!(st && st.poate), nume: NUME, buton: textButon(st), contor: cuCota ? st.ramase + ' din ' + st.total : '',
    nota: textNota(st, acum), explicatie: EXPLICATIE, total: cuCota ? st.total : null, ramase: cuCota ? st.ramase : null };
}

// ─── Ce n-are voie să plece în căutare ─────────────────────────────────────────────────────────────────────────────────
// Căutarea pleacă la Anthropic și la motorul lor de căutare: datele firmei rămân în aplicație. O căutare cu un număr de
// înmatriculare, numele unui om al firmei, o adresă, un telefon, un email, un număr lung (IMEI, CNP, cont) sau o serie de șasiu
// NU pleacă; modelul află de ce și răspunde din aplicație. Nici căutările despre persoane.
// `interzise` = { nume: [numele șoferilor și ale oamenilor firmei], numere: [numerele de înmatriculare ale flotei] }.
function _fara(s) { return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function _cuvinte(s) { return _fara(s).replace(/[^a-z0-9]+/g, ' ').trim(); }
function _compact(s) { return _fara(s).replace(/[^a-z0-9]/g, ''); }
// Numerele românești: județul, 2–3 cifre, 3 litere („B 154 UIP", „CJ-12-ABC").
const RE_NUMAR_RO = /(^|[^a-z0-9])(b|ab|ag|ar|bc|bh|bn|br|bt|bv|bz|cj|cl|cs|ct|cv|db|dj|gj|gl|gr|hd|hr|if|il|is|mh|mm|ms|nt|ot|ph|sb|sj|sm|sv|tl|tm|tr|vl|vn|vs)[ -]?\d{2,3}[ -]?[a-z]{3}([^a-z0-9]|$)/;
const RE_EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/;
// Mobil (07xx…, +40 7xx…) sau fix (021…, 0264…), cu sau fără spații — „700 000 000 lei" nu e telefon (lipsește 0-ul din față).
const RE_TELEFON = /(\+40|0040|(^|[^0-9])0)[ .\-]?7\d{2}[ .\-]?\d{3}[ .\-]?\d{3}([^0-9]|$)|(^|[^0-9])0[23]\d{1,2}[ .\-]?\d{3}[ .\-]?\d{3,4}([^0-9]|$)/;
const RE_NUMAR_LUNG = /\d{9,}/;
const RE_IBAN = /(^|[^a-z])ro\d{2}[ ]?[a-z]{4}/;
// O stradă CU număr (o adresă anume); numele unei străzi singur („Calea Victoriei, restricții de tonaj") rămâne voie.
const RE_ADRESA = /(^|[^a-z])(strada|str\.|bulevardul|bd\.|b-dul|bdul|calea|soseaua|sos\.|aleea|splaiul)\s*[a-z][a-z\-]*( [a-z][a-z\-]*){0,2} (nr\.? ?)?\d{1,4}([^0-9]|$)|(^|[^a-z])(bl\.\s*[a-z0-9]|bloc(ul)?\s+[a-z]?\d|ap\.\s*\d|apartament(ul)?\s+\d|sc\.\s*[a-z0-9]\b)/;
const RE_PERSOANA = /(^|[^a-z])(cnp|telefonul (lui|ei)|numarul de telefon al|adresa (lui|ei)|unde locuieste|profilul (lui|ei)|facebook|linkedin|instagram|tiktok|cazier)([^a-z]|$)/;
function _vin(t) {
  const m = String(t || '').match(/(^|[^a-z0-9])([a-hj-npr-z0-9]{17})([^a-z0-9]|$)/i);
  return !!(m && /\d/.test(m[2]) && /[a-z]/i.test(m[2]));
}
const MOTIVE = {
  goala: 'Căutarea e goală.',
  lunga: 'Căutarea e prea lungă.',
  numar: 'Căutarea are un număr de înmatriculare.',
  nume: 'Căutarea are numele unui om al firmei.',
  persoana: 'Căutarea caută o persoană.',
  adresa: 'Căutarea are o adresă.',
  telefon: 'Căutarea are un număr de telefon.',
  email: 'Căutarea are o adresă de email.',
  numar_lung: 'Căutarea are un număr lung (IMEI, CNP sau cont).',
  vin: 'Căutarea are o serie de șasiu.',
};
function verifica(text, interzise) {
  const z = interzise || {};
  const t = String(text == null ? '' : text).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  const nu = function (motiv) {
    return { ok: false, motiv: motiv, text: MOTIVE[motiv] + ' Sursa externă nu primește datele firmei, deci n-am căutat. Poți încerca o dată o ' +
      'căutare doar cu subiectul general; altfel răspunde din aplicație și spune-i omului pe scurt că pe internet se caută doar informații ' +
      'generale, fără datele firmei.' };
  };
  if (t.length < 3) return nu('goala');
  if (t.length > LUNGIME_MAX) return nu('lunga');
  const f = _fara(t), cuv = ' ' + _cuvinte(t) + ' ', comp = _compact(t);
  if (RE_EMAIL.test(f)) return nu('email');
  if (RE_TELEFON.test(f)) return nu('telefon');
  if (RE_IBAN.test(f)) return nu('numar_lung');
  if (RE_NUMAR_LUNG.test(f)) return nu('numar_lung');
  if (_vin(t)) return nu('vin');
  if (RE_NUMAR_RO.test(f)) return nu('numar');
  for (const nr of (Array.isArray(z.numere) ? z.numere : [])) { const c = _compact(nr); if (c.length >= 5 && comp.indexOf(c) >= 0) return nu('numar'); }
  if (RE_ADRESA.test(f)) return nu('adresa');
  if (RE_PERSOANA.test(f)) return nu('persoana');
  for (const n of (Array.isArray(z.nume) ? z.nume : [])) {
    const parti = _cuvinte(n).split(' ').filter(function (x) { return x.length >= 2; });
    if (parti.length >= 2 && parti.every(function (x) { return cuv.indexOf(' ' + x + ' ') >= 0; })) return nu('nume');
    if (parti.length === 1 && parti[0].length >= 6 && cuv.indexOf(' ' + parti[0] + ' ') >= 0) return nu('nume');
  }
  return { ok: true, cautare: t };
}

// ─── Unealta lui RA Insight și ce i se spune modelului ─────────────────────────────────────────────────────────────────
const UNEALTA = {
  name: 'sursa_externa',
  description: 'Sursa externă: caută pe internet ce NU e în aplicație — prețuri, reguli, legi, informații generale (de pildă consumul ' +
    'obișnuit al unui model de mașină, o taxă, o normă, o lege). Primește doar textul căutării; nimic din flotă nu pleacă. Cel mult o dată ' +
    'pe întrebare, și doar după ce te-ai uitat în uneltele aplicației.',
  input_schema: { type: 'object', properties: { cautare: { type: 'string', description: 'Ce cauți, în cuvinte generale. Fără numere de ' +
    'înmatriculare, nume de oameni sau de firme-client, adrese, telefoane, emailuri sau cifrele firmei.' } }, required: ['cautare'] },
};
// În contextul întrebării (nu în partea fixă din cache), doar când omul a pornit butonul.
const INSTRUCTIUNI = 'SURSĂ EXTERNĂ PORNITĂ: omul a pornit „Sursă externă”, deci poți căuta pe internet cu unealta sursa_externa — doar ce nu e ' +
  'în aplicație (prețuri, reguli, legi, informații generale despre mașini). Întâi uneltele aplicației; pe internet doar dacă răspunsul nu e în ' +
  'ele. „Unde e”, „câți km”, consumul flotei rămân răspunsuri din aplicație. În căutare scrie doar subiectul general: NICIODATĂ numere de ' +
  'înmatriculare, nume de oameni sau de firme-client, adrese, telefoane, emailuri sau cifrele firmei. Nu căuta persoane. Când ai folosit-o, ' +
  'scrie răspunsul în două părți: „**Din flota ta**” (doar din uneltele aplicației; lipsește dacă n-ai folosit niciuna) și „**Din sursă ' +
  'externă**” (doar din ce a găsit căutarea, cu site-ul în paranteză lângă fiecare cifră). Cifrele de pe internet nu se amestecă cu cele ale ' +
  'flotei. Sursele întregi le arată aplicația sub răspuns.';
// Instrucțiunile apelului de căutare (care nu vede nimic din flotă).
function instructiuniCautare(acum) {
  return 'Ești unealta de căutare a lui RA Insight, asistentul unei aplicații românești de monitorizare a flotelor. Primești o căutare. ' +
    'Caută pe internet (cel mult ' + CAUTARI_MAX + ' căutări) și răspunde în română, scurt — cel mult 120 de cuvinte —, doar din ce ai găsit, ' +
    'cu cifrele exact cum apar în surse și cu anul sau data lor, când apar. Dacă rezultatele nu răspund, spune asta într-o propoziție. ' +
    'Nu căuta persoane și nu scrie despre persoane. Nu inventa nimic. Azi e ' + _ziText(acum) + '.';
}

// ─── Răspunsul apelului de căutare (blocurile API-ului Anthropic) → ce s-a căutat, ce s-a găsit, sursele ────────────────────
function _urlBun(u) {
  const s = String(u || '').trim();
  if (!/^https?:\/\//i.test(s) || s.length > 600) return null;
  try { const x = new URL(s); return /^https?:$/.test(x.protocol) ? x.href : null; } catch (e) { return null; }
}
function _site(u) { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } }
function citesteRaspuns(blocks) {
  const l = Array.isArray(blocks) ? blocks : [];
  const cautari = [], rezultate = [], erori = [], citate = [];
  let ultimRezultat = -1;
  l.forEach(function (b, i) { if (b && b.type === 'web_search_tool_result') ultimRezultat = i; });
  const texte = [];
  l.forEach(function (b, i) {
    if (!b || typeof b !== 'object') return;
    if (b.type === 'server_tool_use' && b.name === 'web_search' && b.input && b.input.query) cautari.push(String(b.input.query).slice(0, LUNGIME_MAX));
    else if (b.type === 'web_search_tool_result') {
      if (Array.isArray(b.content)) b.content.forEach(function (r) { if (r && r.type === 'web_search_result' && r.url) rezultate.push({ url: r.url, titlu: r.title || '' }); });
      else if (b.content && b.content.type === 'web_search_tool_result_error') erori.push(String(b.content.error_code || 'eroare').slice(0, 40));
    } else if (b.type === 'text' && b.text && i > ultimRezultat) {
      // Textul de dinaintea căutării („Caut…") nu e răspuns: se ia doar ce vine după ultimele rezultate.
      texte.push(b.text);
      (Array.isArray(b.citations) ? b.citations : []).forEach(function (c) {
        if (c && c.type === 'web_search_result_location' && c.url) citate.push({ url: c.url, titlu: c.title || '', citat: String(c.cited_text || '').slice(0, 200) });
      });
    }
  });
  // Sursele: întâi cele citate în răspuns, apoi celelalte rezultate; fără dubluri, doar http(s), cel mult SURSE_MAX.
  const vazute = new Set(), surse = [];
  citate.concat(rezultate).forEach(function (s) {
    const u = _urlBun(s.url);
    if (!u || vazute.has(u) || surse.length >= SURSE_MAX) return;
    vazute.add(u);
    surse.push({ url: u, titlu: String(s.titlu || '').replace(/\s+/g, ' ').trim().slice(0, 160) || _site(u), site: _site(u) });
  });
  return { text: texte.join('').trim().slice(0, 2500), cautari: cautari, surse: surse, citate: citate.slice(0, 8), erori: erori };
}
// Ce primește RA Insight înapoi (rezultatul uneltei).
function pentruModel(r) {
  if (!r || r.eroare || (!r.cautari.length && !r.text)) {
    return { mesaj: 'Căutarea pe internet n-a mers acum. Răspunde din aplicație și spune-i omului, într-o propoziție, că sursa externă n-a răspuns.' };
  }
  return {
    cautat: r.cautari, gasit: r.text || null,
    surse: r.surse.map(function (s) { return { site: s.site, titlu: s.titlu }; }),
    fragmente: r.citate.map(function (c) { return c.citat; }).filter(Boolean),
    atentie: 'Informația vine de pe internet, nu din aplicație. Scrie-o în partea „Din sursă externă”, cu site-ul lângă fiecare cifră, și nu o ' +
      'amesteca cu cifrele flotei. Dacă nu s-a găsit nimic util, spune asta pe scurt.',
  };
}
// Ce arată pagina sub răspuns (și se păstrează în conversație): ce s-a căutat, sursele, când.
function pentruEcran(r, la) {
  if (!r || !r.cautari || !r.cautari.length) return null;
  const q = r.cautari.slice(0, CAUTARI_MAX);
  return { titlu: 'Din sursă externă', cautari: q, surse: r.surse.slice(0, SURSE_MAX),
    text: 'Căutat pe internet la ' + _fmtOra.format(new Date(la || Date.now())) + ' · ' + cant(q.length, 'căutare', 'căutări'),
    ceAmCautat: 'Ce am căutat: ' + q.map(function (x) { return '„' + x + '”'; }).join(', ') };
}

// ─── Textele pentru noi și pentru administratorul firmei ───────────────────────────────────────────────────────────────
// Modelul primește căutarea? m = { model, nume, ok: true | false | null, la, eroare }.
function textModel(m) {
  if (!m) return 'Modelul nu a fost încă verificat (se verifică la pornire, dacă există cheia Anthropic).';
  const n = m.nume || m.model || 'modelul';
  if (m.ok === true) return n + ' primește căutarea pe internet' + (m.la ? ' (verificat pe ' + _ziText(m.la) + ', ' + _fmtOra.format(new Date(m.la)) + ')' : '') + '.';
  if (m.ok === false) return n + ' NU primește căutarea pe internet, deci butonul nu apare nimănui. Se poate pune alt model doar pentru căutare, ' +
    'din Railway: AI_MODEL_SURSA (de pildă claude-sonnet-5-5 — acolo o căutare costă 15–25 de bani).';
  return 'Nu s-a putut afla dacă ' + n + ' primește căutarea pe internet' + (m.eroare ? ' (' + String(m.eroare).slice(0, 160) + ')' : '') + '. Butonul merge; dacă o căutare dă eroare, se vede aici.';
}
// „Pachet și conturi": rândul firmei. st = stare(...) socotită fără comutatorul firmei; oprita = comutatorul firmei.
function textFirma(st, oprita, acum) {
  if (!st || !st.vede) return '';
  if (oprita) return 'Oprită pentru toată firma: butonul nu apare nimănui.';
  const tot = st.total || 0, fol = st.folosite || 0;
  return 'Pornită: oricine are RA Insight o poate porni într-o discuție. ' + fol + ' din ' + tot + ' întrebări cu sursă externă folosite luna asta; ' +
    'se reîncarcă ' + reincarcare(acum) + '.';
}

module.exports = {
  NUME, EXPLICATIE, CAUTARI_MAX, PE_PACHET, STARI, TEXT_STARI, DESCRIERE_STARI, LUNGIME_MAX, SURSE_MAX, REFUZATE_MAX, MOTIVE,
  UNEALTA, INSTRUCTIUNI, starePlatforma, peLuna, stare, textButon, textNota, textTerminate, pentruPagina, verifica,
  instructiuniCautare, citesteRaspuns, pentruModel, pentruEcran, textModel, textFirma, reincarcare,
};
