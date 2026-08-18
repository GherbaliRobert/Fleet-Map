// docscan.js — de la fișierul încărcat (poză sau PDF) la propuneri de câmpuri.
//
// Lanțul, în ordinea costului:
//   1. PDF cu strat de text  → textul se extrage local  → 0 lei, cel mai exact
//   2. imagine / PDF scanat  → modelul TRANSCRIE textul → cost mic, o dată per act
//   3. în ambele cazuri      → docparse.js scoate câmpurile, PE REGULI → 0 lei
//
// Modelul nu completează câmpuri. El doar transcrie ce vede — sarcina la care greșește cel mai
// puțin. Extragerea rămâne în docparse.js, unde e testată (test_docparse.js) și unde o greșeală
// se repară cu o regulă, nu cu „poate merge mai bine promptul".
//
// Nimic de aici nu scrie în baza de date. Ieșirea e o PROPUNERE; omul confirmă în interfață.

const ai = require('./ai');
const docparse = require('./docparse');

const MAX_OCTETI = 4 * 1024 * 1024;   // aliniat cu limita globală de corp (6 MB JSON ≈ 4,5 MB binar)

// Instrucțiunea de transcriere. Scurtă intenționat: cerem TOT textul, nu interpretări.
const PROMPT_TRANSCRIE =
  'Transcrie TOT textul vizibil de pe acest document auto românesc (talon, carte de identitate a ' +
  'vehiculului, poliță RCA, ITP sau rovinietă). Păstrează codurile de câmp exact cum apar (A, B, ' +
  'D.1, E, F.1, P.3 etc.), fiecare pe rândul lui, urmate de valoarea lor. Nu comenta, nu rezuma, ' +
  'nu traduce — doar textul, rând cu rând.';

// Reconstruiește textul din PDF PĂSTRÂND rândurile și cuvintele.
//
// Varianta naivă — `items.map(it => it.str).join(' ')` — pare rezonabilă și e greșită în două feluri,
// amândouă văzute pe o poliță RCA adevărată:
//   • Un PDF poate emite fiecare LITERĂ ca element separat (titluri cu spațiere mărită). Lipite cu
//     spațiu, „ORIGINAL" devine „O R I G I N A L" — nepotrivibil cu orice regulă.
//   • Rândurile dispar, iar coloanele unui tabel se amestecă: eticheta unui câmp ajunge lipită de
//     valoarea altuia. De acolo veneau emitenți de forma „9. NUMELE SI ADRESA".
//
// Corect: grupăm elementele pe RÂND (după coordonata verticală), le ordonăm pe orizontală, și punem
// spațiu doar unde există o distanță reală între ele.
async function _textDinPdf(buf) {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
  const d = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const randuriTot = [];
  const pagini = Math.min(d.numPages, 8);   // un act are 1-2 pagini; 8 e plasă, nu invitație
  for (let i = 1; i <= pagini; i++) {
    const p = await d.getPage(i);
    const tc = await p.getTextContent();
    // transform = [a, b, c, d, x, y] — ultimele două sunt poziția în pagină.
    const buc = tc.items
      .filter((it) => it.str != null && String(it.str).length)
      .map((it) => ({ s: String(it.str), x: it.transform[4], y: it.transform[5], w: it.width || 0 }));
    // Grupare pe rând: elementele de pe același rând au aproximativ același y (toleranță 2.5 pt,
    // ca să prindem și indicii/exponenții care sar puțin).
    const randuri = [];
    for (const b of buc) {
      const r = randuri.find((rr) => Math.abs(rr.y - b.y) < 2.5);
      if (r) r.buc.push(b); else randuri.push({ y: b.y, buc: [b] });
    }
    randuri.sort((a, b) => b.y - a.y);                    // de sus în jos
    for (const r of randuri) {
      r.buc.sort((a, b) => a.x - b.x);                    // de la stânga la dreapta
      let linie = '';
      let capat = null;                                   // unde s-a terminat bucata anterioară
      for (const b of r.buc) {
        // Spațiu doar dacă există o distanță reală. Sub prag, bucățile fac parte din același cuvânt
        // — exact cazul titlurilor cu litere spațiate.
        if (capat != null && b.x - capat > 1.2) linie += ' ';
        linie += b.s;
        capat = b.x + b.w;
      }
      const curat = linie.replace(/\s+/g, ' ').trim();
      if (curat) randuriTot.push(curat);
    }
  }
  try { await d.destroy(); } catch (e) {}
  return randuriTot.join('\n');
}

// Un PDF „are text" dacă extragerea produce destul conținut cât să merite parsarea. Un scan pur
// întoarce câteva caractere rătăcite — acela merge la model, ca imagine… doar că modelul nostru
// primește imagini, nu PDF-uri, deci scanul-PDF rămâne deocamdată refuzat politicos (vezi scan()).
const PRAG_TEXT_UTIL = 80;

// mime → ce știe modelul să primească
const MIME_IMAGINE = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Punctul de intrare. { b64, mime, tip } → { sursa, campuri, incredere, cost, text }
 *   sursa: 'pdf-text' (gratuit) | 'ai-vision' (plătit, o dată)
 *   tip:   'auto' | 'talon' | 'civ' | 'rca' | 'itp'  (auto = decide singur din conținut)
 * onUsage e transmis mai departe la model, ca apelantul să scrie consumul în ai_usage.
 */
async function scan({ b64, mime, tip = 'auto', onUsage }) {
  if (!b64) throw new Error('Lipsește fișierul.');
  const buf = Buffer.from(String(b64), 'base64');
  if (!buf.length) throw new Error('Fișier gol sau base64 stricat.');
  if (buf.length > MAX_OCTETI) {
    throw new Error('Fișierul are ' + (buf.length / 1024 / 1024).toFixed(1) + ' MB — peste limita de 4 MB. Fă poza la rezoluție mai mică.');
  }

  let text = null;
  let sursa = null;

  if (mime === 'application/pdf' || buf.slice(0, 5).toString('ascii') === '%PDF-') {
    text = await _textDinPdf(buf).catch((e) => { throw new Error('PDF necitibil: ' + e.message); });
    if (text.replace(/\s+/g, '').length >= PRAG_TEXT_UTIL) {
      sursa = 'pdf-text';   // drumul gratuit
    } else {
      // PDF scanat = imagine împachetată în PDF. Modelul primește imagini; conversia PDF→imagine pe
      // server ar cere dependințe native (canvas). Decizie deliberată: cerem poza direct, nu
      // construim un lanț fragil. Mesajul îi spune omului exact ce să facă.
      throw new Error('PDF-ul e o scanare fără text. Fă o poză direct documentului (sau exportă-l ca imagine) și încarcă poza.');
    }
  } else if (MIME_IMAGINE.has(mime)) {
    if (!ai.aiEnabled()) throw new Error('Citirea pozelor cere cheia AI (nesetată). PDF-urile cu text merg și fără ea.');
    text = await ai.readImage({ b64: String(b64), mediaType: mime, prompt: PROMPT_TRANSCRIE, maxTokens: 2000, onUsage });
    sursa = 'ai-vision';
  } else {
    throw new Error('Format neacceptat: ' + (mime || 'necunoscut') + '. Merg: JPEG, PNG, WebP sau PDF.');
  }

  const rezultat = docparse.parse(text, tip);

  // ─── Plasa de siguranță: modelul, pe TEXT ────────────────────────────────────────────────────
  // Regulile acoperă talonul foarte bine (are coduri tipărite), dar o poliță RCA e liber
  // formatată: fiecare asigurător își pune datele altfel. Când regulile ratează tocmai câmpul
  // care contează — DATA EXPIRĂRII, cea care pornește alertele — întrebăm modelul.
  //
  // Costă neglijabil, pentru că trimitem TEXTUL deja extras, nu imaginea: ~1-2 mii de tokeni,
  // adică fracțiuni de ban, și doar când regulile n-au reușit. Un act citit pe jumătate e mai
  // rău decât unul necitit: omul vede câmpuri completate, crede că e gata, și pleacă fără dată
  // de expirare — adică fără alerte, exact ce venise să obțină.
  const lipsesc = ['expiry_date', 'issue_date', 'issuer'].filter((k) => rezultat.campuri[k] == null);
  if (lipsesc.length && rezultat.tip === 'document' && ai.aiEnabled() && String(text).trim().length > 40) {
    try {
      const raspuns = await ai.callClaude({
        system: 'Ești un extractor de date din acte auto românești. Răspunzi NUMAI cu JSON, fără explicații.',
        messages: [{
          role: 'user',
          content:
            'Din textul de mai jos (act auto românesc: RCA, ITP, CASCO sau rovinietă) extrage EXACT aceste câmpuri:\n' +
            '- "issuer": denumirea firmei care a emis actul (asigurător / stație ITP / CNAIR)\n' +
            '- "issue_date": data de la care e valabil, format AAAA-LL-ZZ\n' +
            '- "expiry_date": data până la care e valabil, format AAAA-LL-ZZ\n' +
            '- "number": seria și numărul actului\n\n' +
            'Reguli: dacă un câmp nu apare în text, pune null. NU inventa. Datele românești sunt zi.lună.an — ' +
            'convertește-le. Dacă vezi un interval („valabil de la X până la Y"), X e issue_date și Y e expiry_date.\n\n' +
            'TEXT:\n' + String(text).slice(0, 6000) + '\n\nRăspunde doar cu obiectul JSON.',
        }],
        maxTokens: 300,
        onUsage,
      });
      const brut = String(raspuns || '').match(/\{[\s\S]*\}/);
      if (brut) {
        const j = JSON.parse(brut[0]);
        for (const k of lipsesc) {
          let v = j[k];
          if (v == null || v === '') continue;
          // Datele trec prin ACELAȘI validator ca restul — modelul poate întoarce o dată imposibilă,
          // iar o dată greșită de expirare e mai rea decât una lipsă.
          if (k.endsWith('_date')) {
            const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!m) continue;
            const iso = docparse.ziLunaAn(m[3], m[2], m[1]);
            if (!iso) continue;
            v = iso;
          }
          rezultat.campuri[k] = String(v).slice(0, 120);
          rezultat.incredere[k] = 0.8;   // citit de model, verificat de om în ecranul de confirmare
        }
        if (sursa === 'pdf-text') sursa = 'pdf-text+ai';
      }
    } catch (e) {
      // Plasa e opțională: dacă modelul nu răspunde, rămân câmpurile găsite pe reguli.
      console.warn('[DOCSCAN] completarea cu modelul a eșuat:', e.message);
    }
  }

  return {
    sursa,
    tipDetectat: rezultat.tip,
    campuri: rezultat.campuri,
    incredere: rezultat.incredere,
    // textul transcris se întoarce ca omul să poată verifica „de unde a luat asta" în ecranul
    // de confirmare — trunchiat, nu e nevoie de tot pentru context
    text: String(text).slice(0, 4000),
  };
}

module.exports = { scan, PROMPT_TRANSCRIE, MAX_OCTETI };
