// verify_meniu_nou.js — eticheta „NOU" din meniu (05.11). Alin: „să apară atunci când aducem ceva nou în meniu, dar să dispară
// după 15 zile de la implementare… de când am făcut noi astea; nu trebuie să mai apară NOU acum când intrăm" + „2. da" (telefonul)
// + „3. da" (doar eticheta din meniu).
//
//   node verify_meniu_nou.js
//
// Ce păzește:
//   1. regula (meniu_nou.js): 15 zile — ziua publicării și încă 14 —, pe zilele României (și peste schimbarea orei); RA Insight
//      (02.10) și Simulatorul (12.10) nu mai sunt „noi" pe 05.11;
//   2. O SINGURĂ listă: serverul trimite cheile în /api/me (`meniuNou`), pagina pune eticheta pe `#nav-<cheie>`, telefonul pe
//      rândul cu aceeași cheie; nicăieri un „NOU" scris de mână în meniu; fiecare cheie are rândul ei pe web și pe telefon;
//   3. funcția paginii, rulată în browser (unde e Chromium): pune și scoate eticheta după listă, fără dubluri.
'use strict';
const fs = require('fs');
const path = require('path');
const M = require('./meniu_nou');

let ok = 0, rele = 0;
function T(nume, cond, detaliu) {
  if (cond) { ok++; console.log('  ✓ ' + nume); }
  else { rele++; console.log('  ✗ ' + nume + (detaliu !== undefined ? '  → ' + String(detaliu).slice(0, 300) : '')); }
}
const citeste = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8').replace(/\r\n/g, '\n');
const ro = (s) => Date.parse(s);   // o clipă scrisă cu fusul României

(async () => {
  console.log('\n1. Regula: 15 zile de la publicare, pe zilele României');
  T('cincisprezece zile', M.ZILE_NOU === 15);
  T('ziua publicării = ziua 0 (și imediat după miezul nopții)', M.zileDeLa('2026-11-05', ro('2026-11-05T00:10:00+02:00')) === 0 && M.eNou('2026-11-05', ro('2026-11-05T00:10:00+02:00')));
  T('a 15-a zi (19.11, 23:59) încă „NOU"; 20.11, la 00:01, nu mai e', M.eNou('2026-11-05', ro('2026-11-19T23:59:00+02:00')) && !M.eNou('2026-11-05', ro('2026-11-20T00:01:00+02:00')),
    [M.zileDeLa('2026-11-05', ro('2026-11-19T23:59:00+02:00')), M.zileDeLa('2026-11-05', ro('2026-11-20T00:01:00+02:00'))].join(','));
  T('înainte de publicare nu e „NOU"; o zi stricată nici atât', !M.eNou('2026-11-05', ro('2026-11-04T23:59:00+02:00')) && !M.eNou('5.11.2026', Date.now()) && M.zileDeLa('', Date.now()) === null);
  T('peste schimbarea orei (25.10 și 29.03) zilele se numără întregi', M.zileDeLa('2026-10-20', ro('2026-10-25T23:30:00+02:00')) === 5 && M.zileDeLa('2026-10-20', ro('2026-10-26T00:30:00+02:00')) === 6 &&
    M.zileDeLa('2026-03-25', ro('2026-03-29T12:00:00+03:00')) === 4);
  const chei = M.RANDURI.map((r) => r.cheie);
  T('lista: chei fără dubluri, zile „AAAA-LL-ZZ"', new Set(chei).size === chei.length && M.RANDURI.every((r) => /^[a-z0-9_-]+$/.test(r.cheie) && /^\d{4}-\d{2}-\d{2}$/.test(r.de_la) && M.zileDeLa(r.de_la, Date.now()) !== null), JSON.stringify(M.RANDURI));
  T('RA Insight (02.10) și Simulatorul (12.10) sunt în listă, cu ziua lor', JSON.stringify(M.RANDURI.map((r) => r.cheie + '@' + r.de_la)).indexOf('"insight@2026-10-02","incarcare@2026-10-12"') >= 0);
  T('pe 05.11 niciunul nu mai e „NOU" (Alin: „acum când intrăm nu trebuie să mai apară")', JSON.stringify(M.noi(ro('2026-11-05T12:00:00+02:00'))) === '[]', JSON.stringify(M.noi(ro('2026-11-05T12:00:00+02:00'))));
  T('…pe 12.10 erau amândouă, pe 17.10 doar Simulatorul', JSON.stringify(M.noi(ro('2026-10-12T12:00:00+03:00'))) === '["insight","incarcare"]' && JSON.stringify(M.noi(ro('2026-10-17T12:00:00+03:00'))) === '["incarcare"]',
    JSON.stringify([M.noi(ro('2026-10-12T12:00:00+03:00')), M.noi(ro('2026-10-17T12:00:00+03:00'))]));

  console.log('\n2. O singură listă: serverul o dă, pagina și telefonul doar o arată');
  const SRV = citeste('server.js'), PAG = citeste('public/index.html'), MENIU = citeste('mobile/src/screens/Menu.tsx');
  T('/api/me dă `meniuNou` din regulă', /const meniuNou = require\('\.\/meniu_nou'\);/.test(SRV) && /meniuNou: meniuNou\.noi\(Date\.now\(\)\),/.test(SRV));
  T('pagina: niciun „NOU" scris de mână în HTML', !/>NOU</.test(PAG.replace(/s\.textContent = 'NOU'/, '')), (PAG.match(/.{60}>NOU<.{20}/) || [''])[0]);
  T('pagina: eticheta vine din `currentUser.meniuNou`, pusă la intrarea în aplicație', /window\._meniuNou = function \(chei\) \{/.test(PAG) && /window\.currentUser = currentUser;\s*\n\s*window\._meniuNou\(currentUser && currentUser\.meniuNou\);/.test(PAG));
  T('fiecare cheie are rândul ei pe web (`#nav-<cheie>`) și pe telefon (`item(…, \'<cheie>\')`)', chei.every((k) => PAG.indexOf('id="nav-' + k + '"') >= 0 && new RegExp("item\\([^\\n]*, '" + k + "'\\)").test(MENIU)),
    chei.filter((k) => !(PAG.indexOf('id="nav-' + k + '"') >= 0 && new RegExp("item\\([^\\n]*, '" + k + "'\\)").test(MENIU))).join(', '));
  T('telefonul: „NOU" doar din `u.meniuNou`, nescris de mână', (MENIU.match(/NOU</g) || []).length === 1 && /\{nou && noi\.indexOf\(nou\) >= 0 \? <span class="mn-nou">NOU<\/span> : null\}/.test(MENIU) &&
    /const noi: string\[\] = Array\.isArray\(u\?\.meniuNou\)/.test(MENIU) && /meniuNou\?: string\[\];/.test(citeste('mobile/src/api/endpoints.ts')));
  const CSS_TEL = citeste('mobile/src/screens/menu.css');
  T('telefonul: aceleași culori ca pe web, pe ambele teme', /\.mn-item \.mn-nou \{[^}]*background: #3FE07D; color: #06210F;/.test(CSS_TEL) && /:root\[data-theme="light"\] \.mn-item \.mn-nou \{ background: #0B0E11; color: #3FE07D; \}/.test(CSS_TEL) &&
    /\.nav-nou \{[^}]*background: #0B0E11; color: #3FE07D;/.test(citeste('public/css/app.css')));

  console.log('\n3. Funcția paginii, în browser');
  const fn = (PAG.match(/window\._meniuNou = function \(chei\) \{[\s\S]*?\n    \};/) || [''])[0];
  T('funcția se decupează din pagină', fn.length > 100);
  let pw = null; try { pw = require('playwright'); } catch (e) {}
  let br = null; if (pw) { try { br = await pw.chromium.launch(); } catch (e) { br = null; } }
  if (!br) console.log('  (fără Chromium: partea din browser se sare)');
  else {
    const pg = await br.newPage();
    await pg.setContent('<nav id="navrail"><button class="nav-item" id="nav-insight"><span>RA Insight</span></button>' +
      '<button class="nav-item" id="nav-incarcare"><span>Simulator încărcare</span><span class="nav-nou">NOU</span></button>' +
      '<button class="nav-item" id="nav-rapoarte"><span>Rapoarte</span></button></nav><script>' + fn + '</script>');
    const stare = () => pg.evaluate(() => Array.from(document.querySelectorAll('.nav-item')).map((b) => b.id.replace('nav-', '') + ':' + b.querySelectorAll('.nav-nou').length).join(' '));
    await pg.evaluate(() => window._meniuNou([]));
    const s0 = await stare();
    T('lista goală scoate și eticheta rămasă (ca acum, pe 05.11)', s0 === 'insight:0 incarcare:0 rapoarte:0', s0);
    await pg.evaluate(() => { window._meniuNou(['insight']); window._meniuNou(['insight']); });
    const s1 = await stare();
    T('un rând nou primește eticheta o singură dată, oricâte desenări', s1 === 'insight:1 incarcare:0 rapoarte:0', s1);
    await pg.evaluate(() => window._meniuNou(['incarcare', 'nu-exista']));
    const s2 = await stare();
    T('…și o pierde când iese din listă; o cheie fără rând nu strică nimic', s2 === 'insight:0 incarcare:1 rapoarte:0', s2);
    T('eticheta scrie „NOU"', (await pg.evaluate(() => document.querySelector('#nav-incarcare .nav-nou').textContent)) === 'NOU');
    await br.close();
  }

  console.log('\n' + (rele ? '✗' : '✓') + ' verify_meniu_nou: ' + ok + ' trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
})();
