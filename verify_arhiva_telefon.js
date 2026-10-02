// verify_arhiva_telefon.js — „Dispozitive arhivate" spune pe telefon EXACT ce spune pe web.
//
//   node verify_arhiva_telefon.js
//
// Termenul unui aparat arhivat („istoricul se șterge pe 24.10.2026 (în 30 de zile)", portocaliul din ultima
// săptămână, „pe ducă") are cuvintele și pragul într-un singur loc pe web: `_arhTermen` + `ARH_PRAG_ZILE`.
// Telefonul nu poate chema pagina, deci ține o copie: `termen` + `PRAG_ZILE` din
// mobile/src/screens/AdminArchived.tsx (folosită și de cartonașul „Arhivate" de pe „Acasă", FounderHome.tsx).
// Regula lotului 2: unde telefonul ține o copie, o probă o rulează lângă web, pe aceleași rânduri. Altfel, la
// prima schimbare a pragului sau a cuvintelor pe web, telefonul ar rămâne în urmă fără să pice nimic.
//
// Codul nu se copiază aici: se decupează din sursă și se execută. Nu pornește niciun server și nu are nevoie
// de TypeScript (corpurile funcțiilor sunt JavaScript curat; doar semnătura are tipuri).
// Culoarea diferă dinadins (web: var(--orange), telefon: var(--fd-warn), mai închis pe tema luminoasă),
// deci se compară doar textul și „e rău / nu e rău".
const fs = require('fs');
const path = require('path');
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const J = (x) => JSON.stringify(x);

const html = citeste('public/index.html');
const arh = citeste('mobile/src/screens/AdminArchived.tsx');
const acasa = citeste('mobile/src/screens/FounderHome.tsx');
const numar = citeste('mobile/src/lib/numar.ts');

sect('1. Găsesc cele două scrieri ale termenului');
const pragWeb = /var ARH_PRAG_ZILE = (\d+);/.exec(html);
const zileWeb = /function _arhZile\(n\) \{[^\n]*\}\n/.exec(html);
const termenWeb = /function _arhTermen\(d\) \{\n[\s\S]*?\n    \}\n/.exec(html);
const pragTel = /export const PRAG_ZILE = (\d+);/.exec(arh);
const termenTel = /export function termen\(d: any\)[^\n]*\{\n([\s\S]*?)\n\}\n/.exec(arh);
const deNrTel = /export function deNr\(n: any\): string \{\n([\s\S]*?)\n\}\n/.exec(numar);
const nrDeTel = /export function nrDe\(n: any, unu: string, multe: string\): string \{\n([\s\S]*?)\n\}\n?/.exec(numar);
T('web: ARH_PRAG_ZILE, _arhZile, _arhTermen', !!pragWeb && !!zileWeb && !!termenWeb);
T('telefon: PRAG_ZILE, termen (AdminArchived.tsx), deNr + nrDe (lib/numar.ts)', !!pragTel && !!termenTel && !!deNrTel && !!nrDeTel);

sect('2. Același prag');
if (pragWeb && pragTel) T('pragul „pe ducă" e același (' + pragWeb[1] + ' zile)', pragWeb[1] === pragTel[1], 'web ' + pragWeb[1] + ' ≠ telefon ' + pragTel[1]);

sect('3. Aceleași cuvinte, pe aceleași rânduri');
let web = null, tel = null, telCuPrag = null;
if (pragWeb && zileWeb && termenWeb) {
  try { web = new Function('var ARH_PRAG_ZILE = ' + pragWeb[1] + ';\n' + zileWeb[0] + termenWeb[0] + '\nreturn _arhTermen;')(); }
  catch (e) { T('funcția web se poate rula', false, e.message); }
}
if (pragTel && termenTel && deNrTel && nrDeTel) {
  try {
    const deNr = new Function('n', deNrTel[1]);
    const nrDe = new Function('deNr', 'n', 'unu', 'multe', nrDeTel[1]).bind(null, deNr);
    const f = new Function('PRAG_ZILE', 'nrDe', 'd', termenTel[1]);
    tel = (d) => f(Number(pragTel[1]), nrDe, d);
    telCuPrag = (prag) => (d) => f(prag, nrDe, d);
  } catch (e) { T('funcția de pe telefon se poate rula', false, e.message); }
}
T('amândouă funcțiile se pot rula', !!web && !!tel);

// Grila: fiecare fel de rând pe care îl poate trimite /api/archived-devices — istoric șters, fără ziua arhivării
// (purge_zile null), azi / trecut, în prag, la prag, peste prag, cu și fără ziua ștergerii (purge_la), plus
// cifrele la care se schimbă „de" (19 zile / 20 de zile, 101 / 120).
const cazuri = [];
const ziua = Date.UTC(2026, 9, 24, 10, 0, 0);
[false, true].forEach((sters) => [null, undefined, -40, -1, 0, 1, 2, 5, 6, 7, 8, 9, 13, 19, 20, 21, 29, 30, 31, 100, 101, 119, 120, 365]
  .forEach((z) => [null, ziua, String(ziua)].forEach((la) => cazuri.push({ istoric_sters: sters, purge_zile: z, purge_la: la, purge_total_zile: 30 }))));
const scurt = (r) => (r == null ? null : { t: r.t, rau: r.rau });
if (web && tel) {
  const gresite = [];
  cazuri.forEach((c) => {
    let a, b;
    try { a = scurt(web(c)); } catch (e) { a = 'eroare web: ' + e.message; }
    try { b = scurt(tel(c)); } catch (e) { b = 'eroare telefon: ' + e.message; }
    if (J(a) !== J(b)) gresite.push(J(c) + '\n      web: ' + J(a) + '\n      tel: ' + J(b));
  });
  T('textul și „pe ducă" sunt identice cu web-ul, pe ' + cazuri.length + ' de rânduri', !gresite.length, gresite.length + ' diferite; primul: ' + gresite[0]);
  // Proba se verifică pe ea însăși: un prag mutat cu o zi trebuie să iasă la iveală (grila chiar trece pe la prag).
  if (telCuPrag) {
    const mutat = telCuPrag(Number(pragTel[1]) + 1);
    T('un prag mutat cu o zi pe telefon ar fi prins de grilă', cazuri.some((c) => J(scurt(web(c))) !== J(scurt(mutat(c)))));
  }
  T('„istoric șters" bate orice termen', J(scurt(tel({ istoric_sters: true, purge_zile: 3, purge_la: ziua }))) === J({ t: 'istoricul s-a șters', rau: false }));
  T('fără ziua arhivării nu se inventează un termen', tel({ purge_zile: null }) === null);
}

sect('4. O singură copie pe telefon, și banda spune de unde se scot datele');
T('„Acasă" folosește termenul din AdminArchived, nu a doua copie', /import \{ termen \} from '\.\/AdminArchived';/.test(acasa) && !/function termen\(/.test(acasa));
T('nicio altă copie a pragului pe telefon (PRAG_ZILE scris o singură dată)', (arh.match(/PRAG_ZILE = /g) || []).length === 1 && !/PRAG_ZILE = /.test(acasa));
// Banda trimite la „Descarcă tot istoricul” (02.10). Butonul există DOAR pe calculator (un an de date e un fișier mare,
// pe care telefonul nu-l poate aduce în timpul lui de așteptare) — deci telefonul spune, dinadins, „de pe calculator”.
const banda = 'Se șterge definitiv în câteva zile — dacă clientul îl cere înapoi, ';
const bandaWeb = banda + 'scoate-l acum: butonul „Descarcă tot istoricul” de pe rândul mașinii (un singur fișier, cu tot istoricul).';
const bandaTel = banda + 'scoate-l acum, de pe calculator: butonul „Descarcă tot istoricul” de pe rândul mașinii (un singur fișier, cu tot istoricul).';
T('banda „pe ducă" trimite la „Descarcă tot istoricul”, pe web și pe telefon (acolo „de pe calculator”)', html.indexOf(bandaWeb) >= 0 && arh.indexOf(bandaTel) >= 0);
T('„Restaurează" se întreabă în foaia aplicației, nu în fereastra sistemului', !/\bconfirm\(/.test(arh) && /<Confirma\b/.test(arh));
T('foile de pe ecranul arhivei sunt păzite de butonul „înapoi"', (arh.match(/useInapoiInchide\(/g) || []).length >= 2);

console.log('\n' + ok + ' trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
