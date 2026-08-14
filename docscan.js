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

async function _textDinPdf(buf) {
  const pdfjs = require('pdfjs-dist/legacy/build/pdf.mjs');
  const d = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let text = '';
  const pagini = Math.min(d.numPages, 8);   // un act are 1-2 pagini; 8 e plasă, nu invitație
  for (let i = 1; i <= pagini; i++) {
    const p = await d.getPage(i);
    const tc = await p.getTextContent();
    text += tc.items.map((it) => it.str).join(' ') + '\n';
  }
  try { await d.destroy(); } catch (e) {}
  return text;
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
