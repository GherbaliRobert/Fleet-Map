'use strict';
// ═══ Fișa lui RA Insight despre fiecare om (11.11) ═══
// Alin: „mă interesează ca RA Insight să memoreze cam ce discută fiecare user cu el… să-și facă o idee ce i se potrivește"
// și „ne complicăm… RA Insight este despre simplificare". Apoi: fișa rămâne cât omul are cont (nu pleacă odată cu conversațiile
// șterse la 12 luni); ștergerea totală doar din Setări → Preferințe, cu confirmare; în discuție doar lucruri anume („uită că…").
//
// Cum merge: noaptea, RA Insight citește discuțiile din ziua aceea ale omului și își completează fișa (câteva rânduri + cum numește
// el mașinile). La fiecare întrebare o citește. Omul nu face nimic; nimic nou pe ecran, în afară de butonul din Preferințe.
// Regulile și TEXTELE stau aici (curat: fără bază, fără rețea); serverul adună datele și cheamă modelul.

const MAX_RANDURI = 15;          // fișa rămâne mică: ce nu mai contează iese, ca să facă loc
const MAX_CARACTERE = 160;       // un rând = o propoziție scurtă
const MAX_NUME = 20;             // cum numește omul mașinile („Loganul" = B 204 UIP)
const MAX_MESAJE_NOAPTE = 60;    // cele mai noi mesaje ale perioadei, citite noaptea
const MAX_TEXT_MESAJ = 600;      // un răspuns lung se taie: fișa ține ce întreabă omul și cum, nu răspunsurile întregi

// Ce nu intră niciodată în fișă, chiar dacă modelul l-ar scrie: date personale și ce n-are ce căuta acolo.
const SENSIBIL = [
  /\b[1-8]\d{12}\b/,                                   // CNP
  /(\+?40|\b0)\s?7\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/,    // telefon mobil
  /[\w.+-]+@[\w-]+\.[\w.-]+/,                          // email
  /\bRO\d{2}\s?[A-Z]{4}/i,                             // IBAN
  /\bparol/i,
  /\b(s[aă]n[aă]tat|boal[aă]|bolnav|spital|medic|diagnostic|tratament)/i,
  /\b(religi|politic|sindicat)/i
];

// Litere fără diacritice, mici, aceeași lungime ca textul (un caracter pe caracter) — ca pozițiile să se potrivească la înlocuire.
function _pliat(s) {
  let o = '';
  for (const c of String(s || '')) o += (c.normalize('NFD')[0] || c).toLowerCase();
  return o;
}
function norm(s) { return _pliat(s).replace(/[^a-z0-9]+/g, ' ').trim(); }
function normNr(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
// Rădăcina unui cuvânt românesc, pentru „Loganul" / „Loganului" / „Loganu'": fără articol și terminații.
const TERMINATII = ['ului', 'ilor', 'elor', 'ul', 'ele', 'ei', 'ii', 'ua', 'le', 'a', 'u', 'l', 'e', 'i'];
function radacina(w) {
  w = norm(w).replace(/\s+/g, '');
  for (const t of TERMINATII) if (w.length - t.length >= 3 && w.endsWith(t)) return w.slice(0, -t.length);
  return w;
}

// ── Ce se păstrează ─────────────────────────────────────────────────────────────────────────────────
// `j` = ce a scris modelul ({ randuri, nume }); `numere` = numerele de înmatriculare ale firmei (doar cu ele un nume e bun).
function curata(j, numere) {
  j = j && typeof j === 'object' ? j : {};
  const peNr = {};
  (numere || []).forEach(function (n) { if (n) peNr[normNr(n)] = String(n).trim(); });
  const randuri = [], vazute = new Set();
  (Array.isArray(j.randuri) ? j.randuri : []).forEach(function (r) {
    let t = String(r == null ? '' : r).replace(/^[\s\-–•*·]+/, '').replace(/\s+/g, ' ').trim();
    if (!t || t.length > MAX_CARACTERE) return;
    if (SENSIBIL.some(function (re) { return re.test(t); })) return;
    const k = norm(t);
    if (!k || vazute.has(k)) return;
    vazute.add(k); randuri.push(t);
  });
  const nume = [], vazuteN = new Set();
  (Array.isArray(j.nume) ? j.nume : []).forEach(function (x) {
    if (!x || typeof x !== 'object') return;
    const spune = String(x.spune || '').replace(/[„"”'`]/g, '').replace(/\s+/g, ' ').trim();
    const nr = peNr[normNr(x.numar)];
    if (!nr || spune.length < 3 || spune.length > 30 || !/[a-zA-ZăâîșțĂÂÎȘȚşţ]/.test(spune)) return;
    if (normNr(spune) === normNr(nr)) return;   // numărul nu e un „nume"
    const k = norm(spune);
    if (vazuteN.has(k)) return;
    vazuteN.add(k); nume.push({ spune: spune, numar: nr });
  });
  return { randuri: randuri.slice(0, MAX_RANDURI), nume: nume.slice(0, MAX_NUME) };
}
function goala(f) { return !f || (!(f.randuri || []).length && !(f.nume || []).length); }

// Răspunsul modelului: JSON-ul din text (poate veni cu un rând în plus înainte sau după).
function dinRaspuns(text) {
  const s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { const j = JSON.parse(s.slice(a, b + 1)); return j && typeof j === 'object' ? j : null; } catch (e) { return null; }
}

// ── Scrierea de noapte ──────────────────────────────────────────────────────────────────────────────
function instructiuni() {
  return [
    'Ești RA Insight, asistentul platformei RA Track (monitorizare GPS pentru flote). Îți ții o fișă scurtă despre omul cu care vorbești, ' +
      'ca să-l înțelegi mai bine data viitoare. Primești fișa de până acum, mașinile firmei lui și discuțiile lui recente cu tine. Scrie fișa nouă.',
    'CE ȚII: cum numește el mașinile, oamenii și locurile („Loganul" = B 204 UIP); ce urmărește (consum, costuri, anumite mașini, anumiți șoferi); ' +
      'cum vrea răspunsurile (scurt, cu tabel, lei pe km); unde te-a corectat; ce întreabă des și când (zilele, orele).',
    'CE NU ȚII: cifrele flotei (km, litri, lei, poziții, ore — se schimbă și le citești mereu din aplicație); parole, CNP, telefoane, emailuri, ' +
      'adrese de acasă; sănătatea, religia, politica, viața personală; păreri despre colegi.',
    'CUM: păstrezi ce era în fișă și e încă adevărat; schimbi ce te-a corectat; scoți ce nu mai e adevărat sau nu mai contează. Dacă omul ' +
      'ți-a cerut să uiți ceva, nu-l pune înapoi. Cel mult ' + MAX_RANDURI + ' rânduri scurte, în română, despre el la persoana a treia ' +
      '(„Întreabă des de consumul lui B 77 TIR."). Dacă fișa e plină, păstrezi ce contează mai mult.',
    'RĂSPUNZI DOAR cu JSON, fără alt text: {"randuri": ["…"], "nume": [{"spune": "Loganul", "numar": "B 204 UIP"}]}. La „nume" pui doar mașinile ' +
      'pe care omul le numește altfel decât prin număr, și doar cu numere din lista de mașini.'
  ].join('\n\n');
}
// Ce primește modelul noaptea: fișa veche, mașinile (număr — nume) și mesajele, cele mai vechi întâi.
function cerereNoapte(fisaVeche, masini, mesaje) {
  const f = fisaVeche || {};
  const parti = [];
  parti.push('FIȘA DE PÂNĂ ACUM:\n' + ((f.randuri || []).length ? f.randuri.map(function (r) { return '- ' + r; }).join('\n') : '(goală)') +
    ((f.nume || []).length ? '\nNume: ' + f.nume.map(function (x) { return '„' + x.spune + '" = ' + x.numar; }).join('; ') : ''));
  parti.push('MAȘINILE FIRMEI (număr — nume):\n' + ((masini || []).slice(0, 200).map(function (m) { return (m.nr || '?') + ' — ' + (m.nume || ''); }).join('\n') || '(niciuna)'));
  parti.push('DISCUȚIILE:\n' + (mesaje || []).map(function (m) {
    const cine = m.rol === 'user' ? 'Omul' : 'RA Insight';
    let t = String(m.text || '').replace(/\s+/g, ' ').trim();
    if (t.length > MAX_TEXT_MESAJ) t = t.slice(0, MAX_TEXT_MESAJ) + '…';
    return cine + ': ' + t;
  }).join('\n'));
  return parti.join('\n\n');
}

// ── La fiecare întrebare ────────────────────────────────────────────────────────────────────────────
// Partea din contextul lui RA Insight (nu din partea fixă, păstrată în cache: fișa e a fiecărui om).
function pentruModel(f) {
  if (goala(f)) return '';
  const r = ['FIȘA OMULUI (ce știi despre el din discuțiile trecute — ca să-l înțelegi, nu ca sursă de cifre; cifrele le iei mereu din unelte, ' +
    'iar dacă fișa nu se potrivește cu ce arată uneltele, au dreptate uneltele):'];
  (f.randuri || []).forEach(function (x) { r.push('- ' + x); });
  if ((f.nume || []).length) r.push('Cum numește mașinile: ' + f.nume.map(function (x) { return '„' + x.spune + '" = ' + x.numar; }).join('; ') + '.');
  return r.join('\n');
}

// Numerele de înmatriculare scrise în text, cu sau fără spații („B 154 UIP", „b154uip").
function _areNumar(text, flota) {
  const t = normNr(text);
  return (flota || []).some(function (v) { const n = normNr(v.nr); return n.length >= 4 && t.indexOf(n) >= 0; });
}
// Cum numește omul mașinile, pus în text înainte ca aplicația să caute mașina: „Unde e Loganul?" → „Unde e B 204 UIP?".
// Doar când textul NU numește deja limpede o mașină (`gasite` = ce a găsit aplicația în textul omului): un nume dat întreg
// („Dacia Logan 3") sau un număr scris câștigă. Doar mașinile la care omul are acces (`flota`).
function aplicaNume(text, f, flota, gasite) {
  const out = { text: String(text || ''), schimbat: false, folosite: [] };
  if (goala(f) || !(f.nume || []).length) return out;
  if (gasite && (gasite.masini || []).length && !(gasite.ambigue || []).length) return out;
  if (_areNumar(out.text, flota)) return out;
  const peNr = {};
  (flota || []).forEach(function (v) { if (v.nr) peNr[normNr(v.nr)] = v.nr; });
  let t = out.text;
  // Cele mai lungi întâi: „camionul mare" înaintea lui „camionul".
  const nume = f.nume.slice().sort(function (a, b) { return String(b.spune).length - String(a.spune).length; });
  for (const x of nume) {
    const nr = peNr[normNr(x.numar)];
    if (!nr) continue;
    const parti = norm(x.spune).split(' ').filter(Boolean).map(radacina).filter(function (p) { return p.length >= 3; });
    if (!parti.length) continue;
    const re = new RegExp('(^|[^a-z0-9])(' + parti.map(function (p) { return p.replace(/[^a-z0-9]/g, '') + "[a-z]{0,4}'?"; }).join('\\s+') + ')(?=$|[^a-z0-9])');
    const m = re.exec(_pliat(t));
    if (!m) continue;
    const start = m.index + m[1].length, lung = m[2].length;
    t = t.slice(0, start) + nr + t.slice(start + lung);
    out.folosite.push({ spune: x.spune, numar: nr });
  }
  if (out.folosite.length) { out.text = t; out.schimbat = true; }
  return out;
}

// ── Ce poate cere omul în discuție (pe reguli, pe loc, nu se numără) ────────────────────────────────
// „ce știi despre mine?" → îi arată fișa; „uită că …" → scoate doar ce se potrivește; „uită tot" → NU șterge nimic:
// ștergerea totală se face doar din Setări → Preferințe (Alin, 11.11: cineva se poate referi doar la discuția de acum).
// „Uită-te la…" (= „privește") nu e o cerere de uitare.
function cerere(text) {
  const t = norm(text).replace(/^(te rog|te rog frumos|hai|deci|bine|ok|okay)\s+/, '');
  if (/^(ce|cat|cate)\s+(mai\s+)?(stii|tii minte|ai retinut|cunosti|ai memorat|ai invatat)\s+(tu\s+)?(despre|de)\s+mine\b/.test(t) ||
      /^ce\s+(stii|tii minte)\s+despre\s+mine$/.test(t)) return { fel: 'ce_stii' };
  if (/^sterge (discutia|conversatia)( asta| aceasta| de acum)?$/.test(t)) return { fel: 'uita_discutia' };
  const m = /^(?:vreau\s+)?(?:sa\s+)?(?:uita|uiti|uitati|nu mai tine minte|sterge din memorie|sterge din fisa)\s+(.*)$/.exec(t);
  if (!m) return null;
  let rest = m[1].trim();
  if (/^te\b|^va\b/.test(rest)) return null;                                   // „uită-te la…" = privește
  // „uită asta", „uită discuția asta": omul vorbește de discuția de acum, nu de tot ce știe RA Insight — îi spunem cum o șterge.
  if (/^(asta|aia|aceasta|ce ti am (spus|zis)|ce am (spus|zis|vorbit)|(discutia|conversatia)( asta| aceasta| de acum)?)$/.test(rest)) return { fel: 'uita_discutia' };
  if (/^(tot|toate|totul)\b/.test(rest) || /^(ce stii|ce ai retinut|ce tii minte)\s+(despre|de)\s+mine\b/.test(rest)) return { fel: 'uita_tot' };
  rest = rest.replace(/^(ca|de|ce|cum|asta|acest lucru)\s+/, '').trim();
  if (!rest) return { fel: 'uita_tot' };
  return { fel: 'uita', ce: rest };
}

const CUVINTE_GOALE = new Set(['ca', 'de', 'despre', 'mine', 'ce', 'la', 'pe', 'si', 'este', 'e', 'sunt', 'cu', 'din', 'in', 'un', 'o', 'al', 'ale', 'lui', 'mi', 'ma', 'eu', 'tu', 'imi', 'place', 'vreau', 'inseamna', 'adica', 'cand', 'zic', 'spun']);
function _cuvinte(ce) {
  return norm(ce).split(' ').filter(function (w) { return w && !CUVINTE_GOALE.has(w) && (w.length >= 3 || /^\d{2,}$/.test(w)); }).map(radacina);
}
function _sePotriveste(cuv, text) {
  const t = norm(text), tz = t.replace(/\s+/g, '');
  return cuv.length > 0 && cuv.every(function (w) { return t.indexOf(w) >= 0 || tz.indexOf(w) >= 0; });
}
// „uită că Loganul e B 204": scoate rândurile și numele în care se găsesc toate cuvintele care contează. Mai mult de 3 → întreabă.
function uita(f, ce) {
  const cuv = _cuvinte(ce);
  const r = { fisa: { randuri: ((f && f.randuri) || []).slice(), nume: ((f && f.nume) || []).slice() }, scoase: [], prea: false };
  if (!cuv.length || goala(f)) return r;
  const rIdx = [], nIdx = [];
  r.fisa.randuri.forEach(function (x, i) { if (_sePotriveste(cuv, x)) rIdx.push(i); });
  r.fisa.nume.forEach(function (x, i) { if (_sePotriveste(cuv, x.spune + ' ' + x.numar)) nIdx.push(i); });
  if (rIdx.length + nIdx.length > 3) { r.prea = true; r.variante = rIdx.map(function (i) { return r.fisa.randuri[i]; }); return r; }
  r.scoase = rIdx.map(function (i) { return r.fisa.randuri[i]; }).concat(nIdx.map(function (i) { const x = r.fisa.nume[i]; return '„' + x.spune + '" = ' + x.numar; }));
  r.fisa.randuri = r.fisa.randuri.filter(function (x, i) { return rIdx.indexOf(i) < 0; });
  r.fisa.nume = r.fisa.nume.filter(function (x, i) { return nIdx.indexOf(i) < 0; });
  return r;
}

const UNDE_STERGI = 'Setări → Preferințe → „Șterge tot ce știe despre mine"';
const TEXTE = {
  goala: 'Încă nu știu nimic despre tine. Îmi fac singur, peste noapte, o fișă scurtă din discuțiile noastre (ce mașini te interesează, cum îți place răspunsul), ca să te înțeleg mai bine data viitoare.',
  dupaFisa: 'Ca să uit ceva anume, scrie-mi „uită că …". Ca să uit tot, apasă ' + UNDE_STERGI + '.',
  uitaTot: 'Ca să uit tot ce știu despre tine, apasă ' + UNDE_STERGI + '. Discuțiile tale rămân. Dacă vrei să uit doar ceva anume, scrie-mi „uită că …".',
  negasit: 'Nu găsesc asta în ce știu despre tine. Scrie „ce știi despre mine?" ca să vezi tot.',
  discutia: 'Ca să ștergi discuția asta, apasă coșul de lângă ea, în lista din stânga (sau „⋯" → „Șterge conversația"). Ce ștergi în aceeași zi nu ajunge în ce știu despre tine. Dacă vrei să uit ceva anume, scrie-mi „uită că …".',
  prea: 'Se potrivesc mai multe lucruri. Spune-mi mai exact ce să uit:',
  sters: 'Gata: RA Insight a uitat tot ce știa despre tine. Discuțiile tale rămân. Din discuțiile următoare începe iar să te cunoască.',
  nimicDeSters: 'Nu era nimic de șters: RA Insight încă nu știa nimic despre tine.',
  confirmare: 'RA Insight uită tot ce a învățat despre tine din toate discuțiile: mașinile, ce urmărești, cum îți place răspunsul. Discuțiile tale rămân. Din discuțiile următoare începe iar să te cunoască.',
  explicatie: 'RA Insight își face singur o fișă scurtă din discuțiile tale (ce mașini te interesează, cum îți place răspunsul), ca să te înțeleagă mai bine. O vede doar el. Ce ai șters din discuții în aceeași zi nu intră în ea.'
};
function textCeStii(f) {
  if (goala(f)) return TEXTE.goala;
  const r = ['**Ce știu despre tine**, din discuțiile noastre:'];
  (f.randuri || []).forEach(function (x) { r.push('• ' + x); });
  (f.nume || []).forEach(function (x) { r.push('• Când spui „' + x.spune + '", te referi la ' + x.numar + '.'); });
  r.push('', TEXTE.dupaFisa);
  return r.join('\n');
}
function textUitat(rez) {
  if (rez.prea) return TEXTE.prea + '\n' + (rez.variante || []).map(function (x) { return '• ' + x; }).join('\n');
  if (!rez.scoase.length) return TEXTE.negasit;
  return 'Am uitat:\n' + rez.scoase.map(function (x) { return '• ' + x; }).join('\n');
}

module.exports = {
  MAX_RANDURI, MAX_CARACTERE, MAX_NUME, MAX_MESAJE_NOAPTE, MAX_TEXT_MESAJ, SENSIBIL, UNDE_STERGI, TEXTE,
  norm, normNr, radacina, curata, goala, dinRaspuns, instructiuni, cerereNoapte, pentruModel, aplicaNume,
  cerere, uita, textCeStii, textUitat, _pliat
};
