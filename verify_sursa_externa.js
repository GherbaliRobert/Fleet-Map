// verify_sursa_externa.js — „Sursă externă" în RA Insight: căutarea pe internet (28.10).
//
//   node verify_sursa_externa.js
//
// Alin, 28.10, la propunerea „Internetul în RA Insight": „da — dar nu-l numim internet, îl numim sursă externă, și explicăm că
// caută pe internet". Butonul „Sursă externă" de lângă „+" (oprit la fiecare discuție nouă), trei niveluri care îl opresc (noi pe
// toată platforma, administratorul pentru firmă, omul pentru discuție), 10 / 30 / 50 de întrebări cu sursă externă pe lună
// (Basic / Pro / Business), căutarea într-un apel SEPARAT care primește doar textul căutării, fără datele firmei, sursele sub
// răspuns. Aici: regula curată (sursa_externa.js), cererea către Anthropic (ai.cautaExtern, ai.modelPrimesteCautarea), pagina și
// tot drumul pe server pornit, cu modelul, căutarea și Models API simulate — nu se cheltuie nimic.
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const { puneParola } = require('./test_parola');
const SE = require('./sursa_externa.js');
const K = require('./pachete.js');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, 'public', 'css', 'app.css'), 'utf8');
const DB = fs.readFileSync(path.join(__dirname, 'db.js'), 'utf8');
const AIJS = fs.readFileSync(path.join(__dirname, 'ai.js'), 'utf8');

// ─── 1. Cine vede butonul și câte au rămas (sursa_externa.stare) ───────────────────────────────────
console.log('\n1. Cine vede butonul și câte întrebări cu sursă externă au rămas');
const B = { cod: 'basic', ai: true }, PRO = { cod: 'pro', ai: true }, BUS = { cod: 'business', ai: true }, START = { cod: 'start', ai: false };
T('pe pachete: Basic 10, Pro 30, Business 50, Start niciuna (cifrele aprobate pe 27.10)', SE.peLuna(B) === 10 && SE.peLuna(PRO) === 30 && SE.peLuna(BUS) === 50 && SE.peLuna(START) === 0 && SE.peLuna(null) === 0);
T('oprită de noi (implicit) → butonul nu apare nimănui, nici nouă', !SE.stare({ platforma: 'oprita', isSuper: true }).vede && !SE.stare({ pachet: B }).vede && SE.starePlatforma(undefined) === 'oprita');
T('„doar pentru noi" → doar fondatorii o văd, fără limită', SE.stare({ platforma: 'noi', isSuper: true }).vede && SE.stare({ platforma: 'noi', isSuper: true }).fondator && !SE.stare({ platforma: 'noi', pachet: BUS }).vede);
T('„pornită pentru firme" → firmele cu Basic, Pro, Business; Start și regula veche nu', SE.stare({ platforma: 'firme', pachet: B }).vede && !SE.stare({ platforma: 'firme', pachet: START }).vede && !SE.stare({ platforma: 'firme', pachet: null }).vede);
T('oprită de administratorul firmei → butonul nu apare la oamenii firmei', !SE.stare({ platforma: 'firme', pachet: PRO, firmaOprita: true }).vede);
T('modelul nu primește căutarea → butonul nu apare nimănui, nici nouă', !SE.stare({ platforma: 'firme', pachet: B, model: { ok: false } }).vede && !SE.stare({ platforma: 'noi', isSuper: true, model: { ok: false } }).vede);
const s3 = SE.stare({ platforma: 'firme', pachet: B, folosite: 3 }), s10 = SE.stare({ platforma: 'firme', pachet: B, folosite: 10 });
T('folosite 3 din 10 → 7 rămase, se poate căuta', s3.ramase === 7 && s3.poate && s3.total === 10);
T('terminate → butonul rămâne (cu „0 din 10"), dar nu se mai caută', s10.vede && !s10.poate && s10.ramase === 0 && s10.motiv === 'terminate');
T('pe buton: „Sursă externă · 7 din 10"; la noi, doar numele', SE.textButon(s3) === 'Sursă externă · 7 din 10' && SE.textButon(SE.stare({ platforma: 'noi', isSuper: true })) === 'Sursă externă');
const pp = SE.pentruPagina(s3, Date.UTC(2026, 9, 28, 10));
T('pentru pagină: numele, contorul scurt („7 din 10", pe telefon), fraza de sub casetă — fără bani și fără motivele noastre', pp.vede && pp.contor === '7 din 10' && pp.nume === 'Sursă externă' &&
  /^Caută pe internet ce nu e în aplicație: prețuri, reguli, legi, informații generale\. Datele firmei nu pleacă în căutare\. Firma mai are 7 întrebări cu sursă externă luna asta\.$/.test(pp.nota) && !('motiv' in pp) && !/lei|cost/i.test(JSON.stringify(pp)));
T('…terminate: „S-au terminat… se reîncarcă pe 1 noiembrie"', /^S-au terminat întrebările cu sursă externă ale lunii\. RA Insight răspunde mai departe din aplicație; se reîncarcă pe 1 noiembrie\.$/.test(SE.textNota(s10, Date.UTC(2026, 9, 28, 10))));
T('numele e „Sursă externă", niciodată „Internet" pe buton', SE.NUME === 'Sursă externă' && !/internet/i.test(SE.textButon(s3)) && /internet/.test(SE.EXPLICATIE));

// ─── 2. Ce n-are voie să plece în căutare (sursa_externa.verifica) ─────────────────────────────────
console.log('\n2. Ce n-are voie să plece în căutare: datele firmei rămân în aplicație');
const Z = { nume: ['Mihai Ionescu', 'Alin Tilvar', 'Popovici'], numere: ['B 154 UIP', 'CJ 77 TIR', 'X-123-AB'] };
const NU = [
  ['consum B 154 UIP', 'numar'], ['cj77tir revizie', 'numar'], ['amenda IF 12 ABC', 'numar'], ['consum x123ab', 'numar'],
  ['amenzi Mihai Ionescu', 'nume'], ['ionescu mihai permis', 'nume'], ['Popovici', 'nume'],
  ['strada Mihai Viteazu 12 Cluj', 'adresa'], ['bd. Unirii nr 5 parcare', 'adresa'], ['bloc 12 ap. 4', 'adresa'],
  ['0723 456 789', 'telefon'], ['+40 723 456 789 cine e', 'telefon'], ['021 123 4567', 'telefon'],
  ['contact ion@firma.ro', 'email'], ['IMEI 862129084932001', 'numar_lung'], ['ro49 aaaa 1b31 0075 9384 0000', 'numar_lung'],
  ['VIN WVWZZZ1KZ6W123456', 'vin'], ['cnp sofer', 'persoana'], ['profilul lui pe facebook', 'persoana'], ['unde locuieste soferul', 'persoana'],
  ['', 'goala'], ['x'.repeat(201), 'lunga'],
];
NU.forEach(([q, m]) => { const r = SE.verifica(q, Z); T('„' + q.slice(0, 40) + '" → n-a plecat (' + m + ')', !r.ok && r.motiv === m, JSON.stringify(r).slice(0, 120)); });
const DA = ['consum normal Dacia Logan 1.5 dCi 2021', 'pret motorina octombrie 2026', 'Calea Victoriei restricții de tonaj', 'taxa de drum camioane 7,5 t 2026',
  'buget 700 000 000 lei', 'intrarea in vigoare a legii 2026', 'piața auto 2026', 'normele euro 6 pentru 2019 2020 2021', 'bloc motor fisurat Dacia', 'popoviciu'];
DA.forEach((q) => { const r = SE.verifica(q, Z); T('„' + q + '" → pleacă', r.ok && r.cautare === q, JSON.stringify(r).slice(0, 120)); });
T('modelul află de ce n-a plecat și ce poate face (o dată, doar subiectul general)', /^Căutarea are un număr de înmatriculare\. Sursa externă nu primește datele firmei, deci n-am căutat\. Poți încerca o dată o căutare doar cu subiectul general/.test(SE.verifica('consum B 154 UIP', Z).text));

// ─── 3. Răspunsul căutării → sursele (sursa_externa.citesteRaspuns) ────────────────────────────────
console.log('\n3. Răspunsul căutării (forma API-ului Anthropic) → ce s-a căutat, ce s-a găsit, sursele');
const CAUTARE = { content: [
  { type: 'text', text: 'Caut pe internet.' },
  { type: 'server_tool_use', id: 'srvtoolu_1', name: 'web_search', input: { query: 'consum normal Dacia Logan 1.5 dCi' } },
  { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_1', content: [
    { type: 'web_search_result', url: 'https://www.auto-test.ro/logan', title: 'Dacia Logan 1.5 dCi – consum real', encrypted_content: 'x', page_age: '2026' },
    { type: 'web_search_result', url: 'https://exemplu.com/logan', title: 'Logan specs', encrypted_content: 'y' },
    { type: 'web_search_result', url: 'javascript:alert(1)', title: 'rău', encrypted_content: 'z' }] },
  { type: 'server_tool_use', id: 'srvtoolu_2', name: 'web_search', input: { query: 'Dacia Logan dCi consum mixt' } },
  { type: 'web_search_tool_result', tool_use_id: 'srvtoolu_2', content: [{ type: 'web_search_result', url: 'https://www.auto-test.ro/logan', title: 'dublură', encrypted_content: 'x' }] },
  { type: 'text', text: 'Consumul mixt declarat e ' },
  { type: 'text', text: '4,9 l/100 km', citations: [{ type: 'web_search_result_location', url: 'https://exemplu.com/logan', title: 'Logan specs', cited_text: 'Consum mixt: 4,9 l/100 km', encrypted_index: 'e1' }] },
  { type: 'text', text: ', iar în teste reale 5,6 l/100 km.', citations: [{ type: 'web_search_result_location', url: 'https://www.auto-test.ro/logan', title: 'Dacia Logan 1.5 dCi – consum real', cited_text: 'în test am obținut 5,6 l/100 km', encrypted_index: 'e2' }] }],
  stop_reason: 'end_turn', usage: { input_tokens: 4000, output_tokens: 150, server_tool_use: { web_search_requests: 2 } } };
const rc = SE.citesteRaspuns(CAUTARE.content);
T('ce s-a căutat: cele două căutări, în ordine', JSON.stringify(rc.cautari) === JSON.stringify(['consum normal Dacia Logan 1.5 dCi', 'Dacia Logan dCi consum mixt']));
T('ce s-a găsit: doar textul de după rezultate („Caut pe internet." nu e răspuns)', rc.text === 'Consumul mixt declarat e 4,9 l/100 km, iar în teste reale 5,6 l/100 km.', rc.text);
T('sursele: întâi cele citate, fără dubluri, fără „javascript:"', rc.surse.map((s) => s.url).join(' | ') === 'https://exemplu.com/logan | https://www.auto-test.ro/logan' && rc.surse[1].site === 'auto-test.ro', rc.surse.map((s) => s.url).join(' | '));
T('o eroare a căutării se vede (max_uses_exceeded, unavailable…)', SE.citesteRaspuns([{ type: 'web_search_tool_result', tool_use_id: 'a', content: { type: 'web_search_tool_result_error', error_code: 'unavailable' } }]).erori[0] === 'unavailable');
const pm = SE.pentruModel(rc);
T('pentru RA Insight: ce s-a căutat, ce s-a găsit, sursele (site + titlu), fragmentele citate și cum să le scrie (fără titlu deasupra)', pm.gasit === rc.text && pm.surse.length === 2 && pm.fragmente.length === 2 &&
  /după ce spui ce arată aplicația, cu site-ul în paranteză lângă fiecare cifră, fără titlu deasupra/.test(pm.atentie) && !/Din sursă externă/.test(pm.atentie) && !JSON.stringify(pm).includes('encrypted'));
T('căutarea care n-a mers → RA Insight răspunde din aplicație și spune într-o propoziție', /^Căutarea pe internet n-a mers acum\./.test(SE.pentruModel({ eroare: true, cautari: [], surse: [], citate: [], text: '' }).mesaj));
const pe = SE.pentruEcran(rc, Date.UTC(2026, 9, 28, 8, 42));   // 28.10, după schimbarea orei: 08:42 UTC = 10:42 la noi
T('pentru ecran: „Surse de pe internet", „Căutat pe internet la 10:42 · 2 căutări" (ora României), sursele, „Ce am căutat: …"', pe.titlu === 'Surse de pe internet' && pe.text === 'Căutat pe internet la 10:42 · 2 căutări' &&
  pe.ceAmCautat === 'Ce am căutat: „consum normal Dacia Logan 1.5 dCi”, „Dacia Logan dCi consum mixt”' && pe.surse.length === 2, JSON.stringify(pe));
T('fără nicio căutare făcută → nimic sub răspuns', SE.pentruEcran({ cautari: [], surse: [] }) === null);
T('insigna: „1 întrebare · sursă externă, 2 căutări" (la noi, fără „1 întrebare")', K.insigna('ai', { numarat: true, sursa: 2 }).detaliu === '1 întrebare · sursă externă, 2 căutări' &&
  K.insigna('ai', { sursa: 1 }).detaliu === 'sursă externă, 1 căutare' && K.insigna('ai', { numarat: true }).detaliu === '1 întrebare');
T('textele pentru noi: modelul primește / NU primește / neverificat', /^Haiku 5\.5 primește căutarea pe internet \(verificat pe /.test(SE.textModel({ model: 'claude-haiku-5-5', nume: 'Haiku 5.5', ok: true, la: Date.now() })) &&
  /NU primește căutarea pe internet, deci butonul nu apare nimănui\. .*AI_MODEL_SURSA/.test(SE.textModel({ nume: 'Haiku 5.5', ok: false })) && /^Modelul nu a fost încă verificat/.test(SE.textModel(null)));
T('instrucțiunile apelului de căutare: română, scurt, doar din ce a găsit, fără persoane, ziua de azi', /răspunde în română, scurt/.test(SE.instructiuniCautare(Date.now())) && /Nu căuta persoane/.test(SE.instructiuniCautare(Date.now())) && /Azi e \d+ [a-z]+ \d{4}\./.test(SE.instructiuniCautare(Date.now())));
// Alin, 29.10: „scoate din text: Din sursă externă" — fără titluri deasupra părților; ordinea și site-ul lângă cifră rămân.
T('instrucțiunile lui RA Insight: întâi aplicația, apoi internetul cu site-ul lângă cifră, FĂRĂ titluri de parte, fără datele firmei în căutare', /Întâi uneltele aplicației/.test(SE.INSTRUCTIUNI) &&
  /spune întâi ce arată aplicația .* apoi ce a găsit căutarea, cu site-ul în paranteză lângă fiecare cifră/.test(SE.INSTRUCTIUNI) && /Fără titluri deasupra părților/.test(SE.INSTRUCTIUNI) &&
  !/Din flota ta|Din sursă externă/.test(SE.INSTRUCTIUNI) && /NICIODATĂ numere de înmatriculare/.test(SE.INSTRUCTIUNI));
const FT = SE.faraTitluri;
T('titlul scris din obișnuință pleacă: singur pe rând (bold, „##", cu sau fără diacritice) sau în fața textului', FT('**Din sursă externă**\nUngaria are vinietă (cebia.com).') === 'Ungaria are vinietă (cebia.com).' &&
  FT('## Din flota ta\nB 154 UIP a mers 1.240 km.\n\n**Din sursă externă:**\nVinieta: 6.900 HUF (vintrica.com).') === 'B 154 UIP a mers 1.240 km.\n\nVinieta: 6.900 HUF (vintrica.com).' &&
  FT('**Din sursă externă:** Vinieta costă 6.900 HUF (x.ro).') === 'Vinieta costă 6.900 HUF (x.ro).' && FT('De pe internet: Euro 6 din 2014 (norme.ro).') === 'Euro 6 din 2014 (norme.ro).' &&
  FT('Din sursa externa\nText') === 'Text', FT('## Din flota ta\nB 154 UIP a mers 1.240 km.\n\n**Din sursă externă:**\nVinieta: 6.900 HUF (vintrica.com).'));
T('…o propoziție care doar începe cu aceleași cuvinte rămâne, iar un text fără titluri rămâne întocmai (și spațiile lui)', FT('Din flota ta, trei mașini au mers peste 1.000 km.') === 'Din flota ta, trei mașini au mers peste 1.000 km.' &&
  FT('Din sursă externă reiese că taxa a crescut.') === 'Din sursă externă reiese că taxa a crescut.' && FT('**Concluzie:** ok\n\n\n• a ') === '**Concluzie:** ok\n\n\n• a ' && FT(null) === '' && FT('') === '');
// Rândul „✓" de sub răspuns (30.10; Alin: „da" — la vinieta din Ungaria scria „din aplicație", deși nicio cifră nu venea de acolo):
// spune de unde au venit chiar cifrele, căutate separat în datele aplicației și în ce a găsit căutarea (cifre.negasite pe fiecare).
{
  const TV = SE.TEXT_VERIFICAT, CF = require('./cifre');
  const dateApp = [{ vehicule: [{ nr: 'B 154 UIP', consum_fisa_l100: 7.5 }] }], dateNet = [SE.pentruModel(SE.citesteRaspuns(CAUTARE.content))];
  const unde = (t) => SE.deUndeCifrele(CF.cifreleRaspunsului(t).filter((c) => c.fel !== 'timp' && !(c.zec === 0 && c.v <= CF.MICI)).map((c) => c.text),
    CF.negasite(t, dateApp), CF.negasite(t, dateNet));
  T('rândul „✓": fără internet „din rapoarte", doar de pe internet „din sursele de mai sus", din amândouă „din aplicație și din sursele de mai sus"',
    SE.textVerificat({}) === TV.aplicatie && SE.textVerificat({ aplicatie: true }) === 'Cifrele le-am luat din rapoarte.' &&
    SE.textVerificat({ sursa: true }) === 'Cifrele le-am luat din sursele de mai sus.' && SE.textVerificat({ aplicatie: true, sursa: true }) === 'Cifrele le-am luat din aplicație și din sursele de mai sus.');
  T('…de unde au venit: doar internet; fișa + internet = amândouă; doar fișa = aplicația; o socoteală între ele = amândouă',
    SE.textVerificat(unde('Dacia declară 4,9 l/100 km (exemplu.com).')) === TV.sursa &&
    SE.textVerificat(unde('În fișă scrie 7,5 l/100 km, iar Dacia declară 4,9 l/100 km (exemplu.com).')) === TV.amandoua &&
    SE.textVerificat(unde('În fișă scrie 7,5 l/100 km.')) === TV.aplicatie &&
    SE.textVerificat(SE.deUndeCifrele(['260 lei'], ['260 lei'], ['260 lei'])) === TV.amandoua && SE.textVerificat(SE.deUndeCifrele([], [], [])) === TV.aplicatie,
    JSON.stringify([unde('Dacia declară 4,9 l/100 km (exemplu.com).'), unde('În fișă scrie 7,5 l/100 km.')]));
}

// ─── 4. Cererea către Anthropic (ai.js), cu fetch înlocuit — nu pleacă nimic ───────────────────────
console.log('\n4. Cererea către Anthropic: un apel separat, doar textul căutării');
(async () => {
  const ai = require('./ai.js');
  T('prețul căutării, din documentația oficială: 10 $ la 1.000 (0,01 $ una), adunat la tokeni', ai.PRET_CAUTARE_USD === 0.01 &&
    Math.abs(ai.costUsd({ input_tokens: 0, output_tokens: 0, server_tool_use: { web_search_requests: 3 } }, 'claude-haiku-5-5') - 0.03) < 1e-9 &&
    Math.abs(ai.costUsd({ input_tokens: 1e6, output_tokens: 0 }, 'claude-haiku-5-5') - 0.10) < 1e-9);
  const orig = globalThis.fetch, cereri = [];
  let raspunsuri = [];
  // Ca Anthropic (29.10, prima probă adevărată a lui Alin): o țară pe care motorul lor de căutare n-o știe = 400, înainte de orice.
  const REFUZ_TARA = (tara) => ({ status: 400, json: { type: 'error', error: { type: 'invalid_request_error', message: 'tools.0.web_search_20250305: Country code ' + tara + ' is not supported.' } } });
  globalThis.fetch = async function (url, opts) {
    const corp = opts && opts.body ? JSON.parse(opts.body) : null;
    cereri.push({ url: String(url), metoda: (opts && opts.method) || 'GET', corp, antet: (opts && opts.headers) || {} });
    const loc = corp && Array.isArray(corp.tools) && corp.tools[0] && corp.tools[0].user_location;
    const r = (loc && loc.country) ? REFUZ_TARA(loc.country) : raspunsuri.shift();
    return new Response(JSON.stringify(r.json), { status: r.status || 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    ai.setKey('sk-ant-proba');
    raspunsuri = [{ json: CAUTARE }];
    const out = await ai.cautaExtern({ cautare: 'consum normal Dacia Logan 1.5 dCi', instructiuni: SE.instructiuniCautare(Date.now()), model: 'claude-haiku-5-5', maxCautari: 3 });
    const c0 = cereri[0].corp;
    T('o singură cerere, la /v1/messages, cu unealta de bază web_search_20250305 (fără „filtrarea dinamică")', cereri.length === 1 && /\/v1\/messages$/.test(cereri[0].url) && c0.tools.length === 1 && c0.tools[0].type === 'web_search_20250305' && c0.tools[0].name === 'web_search');
    T('…cel mult 3 căutări, cu ora României și FĂRĂ țară (Anthropic refuză „RO": 400 „Country code RO is not supported", 29.10)',
      c0.tools[0].max_uses === 3 && c0.tools[0].user_location.type === 'approximate' && !('country' in c0.tools[0].user_location) && c0.tools[0].user_location.timezone === 'Europe/Bucharest');
    T('…modelul primește DOAR textul căutării (un singur mesaj) și instrucțiunile ei', c0.messages.length === 1 && c0.messages[0].content === 'consum normal Dacia Logan 1.5 dCi' && /unealta de căutare a lui RA Insight/.test(JSON.stringify(c0.system)));
    T('…la Haiku 5.5: gândire adaptivă, efort mic (ca restul lui RA Insight)', c0.thinking && c0.thinking.type === 'adaptive' && c0.output_config && c0.output_config.effort === 'low');
    T('…întoarce blocurile răspunsului (le citește sursa_externa.citesteRaspuns)', out.blocuri.length === CAUTARE.content.length && out.model === 'claude-haiku-5-5');
    // pause_turn: mesajul oprit se trimite înapoi, neschimbat
    cereri.length = 0;
    const PAUZA = { content: [{ type: 'server_tool_use', id: 's3', name: 'web_search', input: { query: 'norma euro 6' } }], stop_reason: 'pause_turn', usage: { input_tokens: 50, output_tokens: 5 } };
    const CONT = { content: [{ type: 'web_search_tool_result', tool_use_id: 's3', content: [{ type: 'web_search_result', url: 'https://norme.ro/euro6', title: 'Euro 6', encrypted_content: 'q' }] }, { type: 'text', text: 'Euro 6 se aplică din 2014.' }], stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 40, server_tool_use: { web_search_requests: 1 } } };
    raspunsuri = [{ json: PAUZA }, { json: CONT }];
    const usg = [];
    const out2 = await ai.cautaExtern({ cautare: 'norma euro 6', instructiuni: 'x', model: 'claude-haiku-4-5', onUsage: (u) => usg.push(u) });
    T('„pause_turn": a doua cerere trimite înapoi, neschimbat, ce a scris modelul până acolo', cereri.length === 2 && cereri[1].corp.messages.length === 2 && cereri[1].corp.messages[1].role === 'assistant' &&
      JSON.stringify(cereri[1].corp.messages[1].content) === JSON.stringify(PAUZA.content) && cereri[1].corp.messages[0].content === 'norma euro 6');
    T('…și răspunsul se citește din toate bucățile; consumul vine pe fiecare cerere', SE.citesteRaspuns(out2.blocuri).surse[0].site === 'norme.ro' && SE.citesteRaspuns(out2.blocuri).text === 'Euro 6 se aplică din 2014.' && usg.length === 2);
    // Locul refuzat (oricare: țara, fusul, orașul) → aceeași căutare, O DATĂ, fără loc. Alt refuz → eroarea merge mai departe, fără a doua cerere.
    cereri.length = 0;
    raspunsuri = [{ status: 400, json: { type: 'error', error: { type: 'invalid_request_error', message: 'tools.0.web_search_20250305.user_location.timezone: invalid IANA timezone' } } }, { json: CAUTARE }];
    const out3 = await ai.cautaExtern({ cautare: 'taxe de drum Ungaria autoturism', instructiuni: 'x', model: 'claude-haiku-5-5' });
    T('locul refuzat → a doua cerere, aceeași căutare, fără loc; răspunsul vine', cereri.length === 2 && cereri[0].corp.tools[0].user_location &&
      !('user_location' in cereri[1].corp.tools[0]) && cereri[1].corp.messages[0].content === 'taxe de drum Ungaria autoturism' && out3.blocuri.length === CAUTARE.content.length);
    cereri.length = 0;
    raspunsuri = [{ status: 400, json: { type: 'error', error: { type: 'invalid_request_error', message: 'web search is not enabled for this organization' } } }];
    let eroare3 = null; try { await ai.cautaExtern({ cautare: 'norma euro 6', instructiuni: 'x', model: 'claude-haiku-5-5' }); } catch (e) { eroare3 = e; }
    T('…alt refuz (căutarea oprită în contul Anthropic) → eroarea, dintr-o singură cerere', cereri.length === 1 && eroare3 && eroare3.status === 400 && /not enabled/.test(eroare3.message));
    T('când căutarea n-a mers, RA Insight nu scrie din memorie instituții, site-uri sau tarife', /Nu scrie din memorie nume de instituții, site-uri, tarife sau reguli/.test(SE.pentruModel({ eroare: true, cautari: [], surse: [], citate: [], text: '' }).mesaj));
    // Models API
    cereri.length = 0;
    raspunsuri = [{ json: { id: 'claude-haiku-5-5', capabilities: { server_tools: { supported: true, web_search: { supported: true } } } } }];
    const m1 = await ai.modelPrimesteCautarea('claude-haiku-5-5');
    T('Models API: GET /v1/models/{model}, cu cheia — și răspunsul „primește"', cereri[0].metoda === 'GET' && /\/v1\/models\/claude-haiku-5-5$/.test(cereri[0].url) && cereri[0].antet['x-api-key'] === 'sk-ant-proba' && m1.ok === true);
    raspunsuri = [{ json: { id: 'x', capabilities: { server_tools: { web_search: { supported: false } } } } }, { json: { id: 'x', capabilities: {} } }, { status: 404, json: { error: { message: 'model not found' } } }];
    const m2 = await ai.modelPrimesteCautarea('x'), m3 = await ai.modelPrimesteCautarea('x'), m4 = await ai.modelPrimesteCautarea('x');
    T('…„nu primește" = false; răspuns fără câmp sau eroare = null (nu știm), cu motivul', m2.ok === false && m3.ok === null && m4.ok === null && /404/.test(m4.eroare));
    ai.setKey(null);
    const m5 = await ai.modelPrimesteCautarea('x');
    T('…fără cheie, nicio cerere', m5.ok === null && /cheia/.test(m5.eroare) && cereri.length === 4);
  } catch (e) { T('cererea către Anthropic', false, e.stack); }
  globalThis.fetch = orig;
  delete require.cache[require.resolve('./ai.js')];

  // ─── 5. Pagina și CSS-ul ─────────────────────────────────────────────────────────────────────────
  console.log('\n5. Pagina: butonul, sursele sub răspuns, rândul firmei, tabloul nostru');
  const bloc = PAG.slice(PAG.indexOf('// ── începe „secțiunea RA Insight" ──'), PAG.indexOf('// ── sfârșit „secțiunea RA Insight"'));
  T('caseta: butonul „Sursă externă" lângă „+" (ascuns până spune serverul) și fraza de sub casetă', /class="chat-un chat-sursa" id="insp-sursa" onclick="insightSursa\(\)" style="display:none;" aria-pressed="false"><i class="fas fa-globe"><\/i>/.test(bloc) && /id="insp-sursa-nota"/.test(bloc));
  T('textele butonului vin de la server (/api/ai/quota → `sursa`); pagina nu-și face contorul („… din …")', /S\.sursaInfo = \(q && !q\.error && q\.sursa && q\.sursa\.vede\) \? q\.sursa : null;/.test(bloc) &&
    !/(ramase|total) \+ ' din '|' din ' \+ (si|S\.sursaInfo)\./.test(bloc) && /snm\.textContent = String\(si\.nume/.test(bloc) && /snr\.textContent = \(S\.sursa \|\| !si\.poate\) && si\.contor \? String\(si\.contor\)/.test(bloc));
  T('pornit doar pentru discuția de acum: o discuție nouă sau redeschisă îl oprește', /window\.insightNou = function \(\) \{\s*S\.conv = null; S\.mesaje = \[\]; S\.ramura = 'general'; window\._raxConvId = null; S\.sursa = false;/.test(bloc) &&
    /window\._raxConvId = S\.conv\.id; S\.sursa = false;/.test(bloc));
  T('întrebarea pleacă cu `sursa: true` doar cu butonul pornit', /if \(S\.sursa\) corp\.sursa = true;/.test(bloc) && (bloc.match(/corp\.sursa = true/g) || []).length === 1);
  T('terminate: butonul spune de ce nu pornește, nu pornește', /if \(!si\.poate && !S\.sursa\) \{ \(window\.raxToast \|\| alert\)\(String\(si\.nota \|\| ''\), 'warning'\); return; \}/.test(bloc));
  const bs = bloc.slice(bloc.indexOf('function blocSursa(se)'), bloc.indexOf('function caseta()'));
  T('sursele sub răspuns: textContent, doar linkuri http(s), în altă filă, fără să trimită pagina noastră (noopener noreferrer)', bs.length > 100 && !/innerHTML = [^'"]/.test(bs) && /if \(!\/\^https\?:\\\/\\\/\/i\.test\(String\(s\.url \|\| ''\)\)\) return;/.test(bs) && /a\.rel = 'noopener noreferrer nofollow'/.test(bs) && /a\.target = '_blank'/.test(bs));
  // blocSursa, rulat pe un DOM de carton
  const nod = (tag) => ({ tag, className: '', textContent: '', children: [], href: '', target: '', rel: '', innerHTML: '', appendChild(c) { this.children.push(c); return c; }, get childNodes() { return this.children; } });
  const el = (tag, cls, text) => { const e = nod(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; };
  const blocSursa = new Function('el', bs + '\n; return blocSursa;')(el);
  const w = blocSursa({ titlu: 'Surse de pe internet', text: 'Căutat pe internet la 11:42 · 2 căutări', ceAmCautat: 'Ce am căutat: „a”',
    surse: [{ url: 'https://exemplu.com/logan', titlu: '<b>Logan</b>', site: 'exemplu.com' }, { url: 'javascript:alert(1)', titlu: 'rău' }] });
  const lista = w.children.find((c) => c.tag === 'ol');
  T('…rulat: o sursă bună (titlul ca text, nu ca HTML), cea cu „javascript:" sărită, „Ce am căutat" dedesubt', lista && lista.children.length === 1 && lista.children[0].children[0].href === 'https://exemplu.com/logan' &&
    lista.children[0].children[0].textContent === '<b>Logan</b>' && w.children.some((c) => c.className === 'chat-se-q'));
  // Din 30.10 textul rândului „✓" îl scrie serverul (de unde au venit chiar cifrele); textul vechi rămâne doar pentru mesajele salvate înainte.
  T('rândul „✓": textul serverului (verificatText, și în răspunsul pe loc); cel vechi doar pentru mesajele de dinainte de 30.10',
    /createTextNode\(x\.verificatText \|\| \(x\.sursa \? 'Cifrele le-am luat din aplicație și din sursele de mai sus\.' : 'Cifrele le-am luat din rapoarte\.'\)\)/.test(bloc) &&
    /verificat: j\.verificat, verificatText: j\.verificatText,/.test(bloc));
  T('„Pachet și conturi": rândul firmei, cu comutatorul (PUT /api/insight/sursa-externa) și textele serverului', /if \(j\.sursa\) \{/.test(bloc) && /cere\('PUT', '\/api\/insight\/sursa-externa', \{ pornita: !!on \}\)/.test(bloc) && /el\('div', 'pkc-se-t', j\.sursa\.text\)/.test(bloc));
  T('„RA Insight · control": comutatorul în trei stări, modelul, coloana „Sursă externă" pe fiecare firmă', /function _aiuSursa\(se\)/.test(PAG) && /fetch\('\/api\/admin\/insight\/sursa-externa', \{ method: 'PUT'/.test(PAG) &&
    /<th class="n" title="[^"]*">Sursă externă<\/th>/.test(PAG) && /_aiuControale\(d\.pachete, d\.sursa\)/.test(PAG) && /colspan="7"/.test(PAG));
  // Comutatorul din „RA Insight · control", rulat din bucata paginii (ca în verify_insight_panou.js): costul vine ca HTML (lei + euro),
  // nu scăpat a doua oară (pe 28.10 apărea „<span style=…>" în text).
  const panou = PAG.slice(PAG.indexOf('// ─── începe „Panoul RA Insight pe firme"'), PAG.indexOf('// ─── sfârșit „Panoul RA Insight pe firme" ──'));
  const escP = (x) => String(x == null ? '' : x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fnP = new Function('window', 'document', 'esc', panou + '\n; return { sursa: _aiuSursa, controale: _aiuControale };')(
    { raFx: () => ({ eur: 5 }), _raxNrI: (n) => n + ' întrebări' }, { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] }, escP);
  const hS = fnP.sursa({ stare: 'firme', stari: SE.STARI.map((k) => ({ k, t: SE.TEXT_STARI[k], d: SE.DESCRIERE_STARI[k] })), model: SE.textModel({ nume: 'Haiku 5.5', ok: true, la: Date.now() }), modelOk: true,
    intrebari: 1, cautari: 2, costLei: 0.09, peLuna: SE.PE_PACHET });
  T('„RA Insight · control", rulat: trei butoane (cel ales plin), modelul, „1 întrebare … · 2 căutări · 0,09 lei", fără HTML scăpat', (hS.match(/raxAiSursa\(/g) || []).length === 3 &&
    /class="rax-btn primary"[^>]*>Pornită pentru firme</.test(hS) && /1 întrebare cu sursă externă luna asta · 2 căutări · 0,09 lei/.test(hS) && hS.indexOf('&lt;span') < 0 && /Basic 10, Pro 30, Business 50/.test(hS), hS.slice(0, 300));
  T('…și stă în controale, după butoane', /<\/div><div class="aiu-se">/.test(fnP.controale({}, { stare: 'oprita', stari: [], model: '', intrebari: 0, cautari: 0, peLuna: {} })) && fnP.controale({}, null).indexOf('aiu-se') < 0);
  // Contrastul culorilor noi (WCAG ≥ 4,5), pe ambele teme.
  const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16)); };
  const lum = (c) => { const v = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ct = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const peste = (c, alfa, fond) => c.map((x, i) => Math.round(x * alfa + fond[i] * (1 - alfa)));
  const ALB = hex('#ffffff'), INCHIS = hex('#15181D'), ALBASTRU = [59, 130, 246];
  const cere = (re, n) => { const m = CSS.match(re); return m ? m[n == null ? 1 : n] : null; };
  const onC = cere(/\.chat-un\.chat-sursa\.on \{ background: (#[0-9a-f]{6}); border-color: #[0-9a-f]{6}; color: (#[0-9a-f]{6}); \}/i, 0);
  const onBg = onC && hex(onC.match(/background: (#[0-9a-f]{6})/i)[1]), onTx = onC && hex(onC.match(/ color: (#[0-9a-f]{6})/i)[1]);
  const onDk = cere(/body\.dark \.chat-un\.chat-sursa\.on \{ background: rgba\(59,130,246,\.16\); border-color: [^;]+; color: (#[0-9a-f]{6}); \}/i);
  T('butonul pornit (albastru): contrast ≥ 4,5 pe tema deschisă și pe cea închisă', onBg && ct(onTx, onBg) >= 4.5 && onDk && ct(hex(onDk), peste(ALBASTRU, 0.16, INCHIS)) >= 4.5,
    onBg && onDk ? ct(onTx, onBg).toFixed(2) + ' / ' + ct(hex(onDk), peste(ALBASTRU, 0.16, INCHIS)).toFixed(2) : 'regula lipsește');
  const lnk = cere(/\.chat-se-l a \{ color: (#[0-9a-f]{6});/i), lnkDk = cere(/body\.dark \.chat-se-h, body\.dark \.chat-se-l a \{ color: (#[0-9a-f]{6}); \}/i);
  T('linkurile surselor: contrast ≥ 4,5 pe ambele teme (pe fondul albăstrui al blocului)', lnk && ct(hex(lnk), peste(ALBASTRU, 0.06, ALB)) >= 4.5 && lnkDk && ct(hex(lnkDk), peste(ALBASTRU, 0.06, INCHIS)) >= 4.5,
    lnk && lnkDk ? ct(hex(lnk), peste(ALBASTRU, 0.06, ALB)).toFixed(2) + ' / ' + ct(hex(lnkDk), peste(ALBASTRU, 0.06, INCHIS)).toFixed(2) : 'regula lipsește');
  const rauL = cere(/\.aiu-se-m\.rau \{ color: (#[0-9a-f]{6}); \}/i), rauD = cere(/body\.dark \.aiu-se-m\.rau \{ color: (#[0-9a-f]{6}); \}/i);
  T('roșul din tabloul nostru (modelul nu primește / eroare): contrast ≥ 4,5 pe ambele teme', rauL && ct(hex(rauL), ALB) >= 4.5 && rauD && ct(hex(rauD), INCHIS) >= 4.5);
  T('pe telefon butonul se strânge: globul și „6 din 10" (numele pleacă)', /\.chat-un\.chat-sursa \{ width: auto; min-width: 34px; padding: 0 10px; gap: 6px; \}\s*\.chat-un\.chat-sursa \.nm \{ display: none; \}/.test(CSS));

  // ─── 6. Serverul (citit) ─────────────────────────────────────────────────────────────────────────
  console.log('\n6. Serverul: o singură cale, costul în plasă, verificarea modelului');
  T('unealta intră doar cu `sursa: true` (nu la proba modelelor) și doar cu voie (stare.poate)', /if \(b\.sursa === true && !o\.proba\) \{ try \{ stSursa = await _stareSursa\(/.test(SRV) && /const cuSursa = !!\(stSursa && stSursa\.poate\);/.test(SRV) &&
    /if \(cuSursa\) tools\.push\(sursaExterna\.UNEALTA\);/.test(SRV) && /if \(cuSursa\) system\.push\(\{ type: 'text', text: sursaExterna\.INSTRUCTIUNI \}\);/.test(SRV));
  T('o singură cale spre căutare: ai.cautaExtern, chemată o dată, din _cautaSursaExterna', (SRV.match(/ai\.cautaExtern\(/g) || []).length === 1 && (SRV.match(/_cautaSursaExterna\(/g) || []).length === 2);
  T('consumul căutării: un rând „sursa_externa", scris ÎNAINTE de răspuns (butonul arată pe loc câte au rămas)', /await db\.recordAiUsage\(req\.isSuper \? null : req\.companyId, 'sursa_externa', agg, userId, model\)/.test(SRV));
  T('costul intră în plasă și în „Ne costă" (felurile de cost ale firmei au și „sursa_externa")', /const AI_KINDS_COST_FIRMA = AI_BILLABLE_KINDS\.concat\(\['scrisoare', 'sursa_externa'\]\);/.test(DB) && /\[companyId, AI_KINDS_COST_FIRMA\]/.test(DB) && /db\.getAiMonthUsageByCompany\(db\.AI_KINDS_COST_FIRMA\)/.test(SRV));
  T('…căutările se plătesc în cost (`cautari` pe fiecare rând, socotite de ai.costUsd)', /ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS cautari INTEGER DEFAULT 0/.test(DB) && /server_tool_use: \{ web_search_requests: Number\(r\.cautari\) \|\| 0 \}/.test(DB) && /cautari \* PRET_CAUTARE_USD/.test(AIJS));
  T('cota se numără doar cu o căutare făcută (cautari > 0), pe luna firmei', /kind = 'sursa_externa' AND cautari > 0/.test(DB));
  T('comutatorul nostru: doar super-admin; al firmei: doar cine dă conturi (manageUsers)', /app\.put\('\/api\/admin\/insight\/sursa-externa', requireAuth, requireSuperadmin/.test(SRV) && /app\.put\('\/api\/insight\/sursa-externa', requireAuth, requirePerm\('manageUsers'\)/.test(SRV));
  T('verificarea modelului la pornire: nu în celelalte probe (modelul lor simulat răspunde la orice cerere)', /if \(process\.env\.NODE_ENV !== 'test' \|\| process\.env\.SURSA_VERIFICARE_LA_MS\) \{/.test(SRV));
  T('„Stare producție": rândul sursa_externa, cu ce să facă Robert dacă Anthropic o are oprită', /add\('sursa_externa', 'RA Insight · Sursă externă \(căutare pe internet\)'/.test(SRV) && /Console › Settings › Capabilities/.test(SRV));

  await peServer();
})();

// ─── 7. Pe server pornit ─────────────────────────────────────────────────────────────────────────
async function peServer() {
  console.log('\n7. Pe server pornit: tot drumul, cu modelul, căutarea și Models API simulate (nu se cheltuie nimic)');
  const PORT = 3311, TCP = 5311;
  const DIR = path.join(os.tmpdir(), 'rax_sursa_' + Date.now());
  const PRELOAD = DIR + '_fetch.js', AI_LOG = DIR + '_ai.jsonl', AI_COADA = DIR + '_coada.json', MODEL_F = DIR + '_model.txt';
  const BASE = 'http://127.0.0.1:' + PORT;
  fs.writeFileSync(PRELOAD, [
    "const fs = require('fs');", 'const orig = globalThis.fetch;',
    'globalThis.fetch = async function (url, opts) {', "  const u = String((url && url.url) || url);",
    "  if (u.indexOf('https://api.anthropic.com/v1/models/') === 0) {",
    "    try { fs.appendFileSync(process.env.PROBA_AI_LOG, JSON.stringify({ __models: u }) + '\\n'); } catch (e) {}",
    "    const da = String(fs.readFileSync(process.env.PROBA_MODEL_CAUTARE, 'utf8') || 'da').trim();",
    "    return new Response(JSON.stringify({ type: 'model', id: decodeURIComponent(u.split('/').pop()), capabilities: { server_tools: { supported: true, web_search: { supported: da === 'da' } } } }), { status: 200, headers: { 'content-type': 'application/json' } });",
    '  }',
    "  if (u.indexOf('https://api.anthropic.com/') === 0) {",
    "    let corp = {}; try { corp = JSON.parse((opts && opts.body) || '{}'); } catch (e) {}",
    "    try { fs.appendFileSync(process.env.PROBA_AI_LOG, JSON.stringify(corp) + '\\n'); } catch (e) {}",
    // Ca Anthropic: o țară pe care motorul de căutare n-o știe = 400 (29.10, „Country code RO is not supported"), fără să ia din coadă.
    "    const loc = Array.isArray(corp.tools) && corp.tools[0] && corp.tools[0].user_location;",
    "    if (loc && loc.country) return new Response(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'tools.0.web_search_20250305: Country code ' + loc.country + ' is not supported.' } }), { status: 400, headers: { 'content-type': 'application/json' } });",
    "    let coada = []; try { coada = JSON.parse(fs.readFileSync(process.env.PROBA_AI_COADA, 'utf8') || '[]'); } catch (e) {}",
    "    const r = coada.shift() || { content: [{ type: 'text', text: 'RASPUNS_DE_PROBA' }], stop_reason: 'end_turn' };",
    "    fs.writeFileSync(process.env.PROBA_AI_COADA, JSON.stringify(coada));",
    "    if (r.__status) return new Response(r.__body || '{}', { status: r.__status, headers: { 'content-type': 'application/json' } });",
    "    r.usage = Object.assign({ input_tokens: 100, output_tokens: 20 }, r.usage || {});",
    "    return new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } });", '  }',
    "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
    '  return orig.apply(this, arguments);', '};'].join('\n'));
  fs.writeFileSync(AI_LOG, ''); fs.writeFileSync(AI_COADA, '[]'); fs.writeFileSync(MODEL_F, 'da');
  const env = Object.assign({}, process.env, { NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_sursa', DEMO_DISABLED: 'true',
    PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG, PROBA_AI_COADA: AI_COADA, PROBA_MODEL_CAUTARE: MODEL_F, RATE_LIMIT_ENABLED: 'false',
    SURSA_VERIFICARE_LA_MS: '1500', ANTHROPIC_API_KEY: 'sk-ant-proba-fara-retea', GEOCODE_URL: 'http://127.0.0.1:9/reverse', GEOCODE_MIN_INTERVAL_MS: '0', GEOCODE_TIMEOUT_MS: '300' });
  ['DATABASE_URL', 'AI_AGENT_MODEL', 'AI_MODEL', 'AI_MODEL_SURSA', 'BREVO_API_KEY', 'SMTP_HOST'].forEach((k) => { delete env[k]; });   // cheia: falsă, mai sus
  const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
  let terminat = false;
  const curata = () => { for (const f of [PRELOAD, AI_LOG, AI_COADA, MODEL_F]) { try { fs.rmSync(f, { force: true }); } catch (e) {} } try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} };
  const gata = (code) => { terminat = true; try { srv.kill(); } catch (e) {} setTimeout(() => { curata(); process.exit(code); }, 800); };
  srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const login = async (u, p) => {
    const r = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
    if (!r.ok) return null;
    return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  };
  const json = async (m, u, ck, body) => {
    const r = await fetch(BASE + u, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck || '' }, body: body ? JSON.stringify(body) : undefined });
    const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch (e) {}
    return { status: r.status, j: j || {}, text };
  };
  const cereri = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const coada = (lista) => fs.writeFileSync(AI_COADA, JSON.stringify(lista));
  const unealta = (name, input) => ({ content: [{ type: 'tool_use', id: 'tu_' + Math.random().toString(36).slice(2, 8), name, input }], stop_reason: 'tool_use' });
  const text = (t) => ({ content: [{ type: 'text', text: t }], stop_reason: 'end_turn' });
  const MIC = (q, url) => ({ content: [{ type: 'server_tool_use', id: 's_' + q.length, name: 'web_search', input: { query: q } },
    { type: 'web_search_tool_result', tool_use_id: 's_' + q.length, content: [{ type: 'web_search_result', url: url || 'https://a.ro/x', title: 'A', encrypted_content: 'e' }] },
    { type: 'text', text: 'Găsit.' }], stop_reason: 'end_turn', usage: { input_tokens: 500, output_tokens: 20, server_tool_use: { web_search_requests: 1 } } });
  const eCautare = (c) => Array.isArray(c.tools) && c.tools.length === 1 && c.tools[0].type === 'web_search_20250305';
  const eRaInsight = (c) => Array.isArray(c.tools) && c.tools.some((t) => t.name === 'list_vehicles');
  const areUnealta = (c) => (c.tools || []).some((t) => t.name === 'sursa_externa');
  try {
    let pornit = false;
    for (let i = 0; i < 360 && !pornit; i++) { try { const r = await fetch(BASE + '/api'); if (r.ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
    if (!pornit) { console.log('  ✗ serverul nu a pornit'); return gata(1); }
    const S = await login('admin', 'test1234');
    await json('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
    const co = (await json('POST', '/api/companies', S, { name: 'Firma Sursa SRL' })).j;
    await json('PUT', '/api/companies/' + co.id + '/settings', S, { ai_pachet: { cod: 'basic' } });
    const coS = (await json('POST', '/api/companies', S, { name: 'Firma Start Sursa SRL' })).j;
    const LOG = '862129084933001', STL = '862129084933002';
    await json('POST', '/api/devices/import', S, { rows: [{ imei: LOG, nume: 'Dacia Logan 3', nr_inmatriculare: 'B 154 UIP' }, { imei: STL, nume: 'Dacia Duster', nr_inmatriculare: 'B 777 STR' }] });
    await json('PUT', '/api/devices/' + LOG + '/company', S, { company_id: co.id });
    await json('PUT', '/api/devices/' + STL + '/company', S, { company_id: coS.id });
    await json('POST', '/api/drivers', S, { name: 'Mihai Ionescu', company_id: co.id });
    const om = async (user, firma) => { const r = await json('POST', '/api/users', S, { username: user, full_name: 'Om Sursă', role: 'company_admin', company_id: firma }); await puneParola(r.j, 'Str4da-Verde-2026', BASE); await json('PUT', '/api/users/' + r.j.id + '/ai-seat', S, { on: true }); return login(user, 'Str4da-Verde-2026'); };
    const ck = await om('sef@sursa.ro', co.id), ckS = await om('sef@start-sursa.ro', coS.id);
    T('pregătire: o firmă pe Basic (Dacia Logan 3, B 154 UIP; șoferul Mihai Ionescu), una pe Start, administratorii cu RA Insight', !!(co.id && coS.id && ck && ckS));
    const quota = async (c) => (await json('GET', '/api/ai/quota', c)).j.sursa;
    const intreaba = async (c, message, extra) => json('POST', '/api/insight/intreaba', c, Object.assign({ message, nou: true }, extra || {}));
    const sanatate = async () => ((await json('GET', '/api/admin/health', S)).j.checks || []).find((x) => x.key === 'sursa_externa');

    // a) oprită (implicit); la pornire, modelul a fost întrebat (Models API, gratuit)
    for (let i = 0; i < 40 && !cereri().some((c) => c.__models); i++) await sleep(250);
    T('a) la pornire, aplicația a întrebat Anthropic dacă modelul primește căutarea (Models API, gratuit, fără nimic din aplicație)', cereri().filter((c) => c.__models).length === 1 && /\/v1\/models\/claude-haiku-4-5$/.test(cereri().find((c) => c.__models).__models));
    T('…implicit oprită: butonul nu apare (nici la firmă, nici la noi)', (await quota(ck)) === null && (await quota(S)) === null);
    let n0 = cereri().length;
    coada([text('Din aplicație: totul e în regulă.')]);
    await intreaba(ck, 'Ce consum normal declară Dacia pentru Logan 1.5 dCi?', { sursa: true });
    let noi = cereri().slice(n0);
    T('…și o întrebare trimisă cu `sursa: true` nu primește unealta (oprită de noi)', noi.length === 1 && eRaInsight(noi[0]) && !areUnealta(noi[0]) && !/SURSĂ EXTERNĂ PORNITĂ/.test(JSON.stringify(noi[0].system)));
    let h = await sanatate();
    T('…„Stare producție": „Oprită", fără avertisment, cu ce a spus Anthropic despre model', h && h.level === 'info' && /^Oprită \(din RA Insight · control\) · Haiku 4\.5 primește căutarea pe internet \(verificat pe /.test(h.detail), JSON.stringify(h));

    // b) doar pentru noi
    T('b) comutatorul nostru: firma nu-l poate schimba (403), o stare necunoscută = 400', (await json('PUT', '/api/admin/insight/sursa-externa', ck, { stare: 'firme' })).status === 403 && (await json('PUT', '/api/admin/insight/sursa-externa', S, { stare: 'internet' })).status === 400);
    let rp = await json('PUT', '/api/admin/insight/sursa-externa', S, { stare: 'noi' });
    T('…„doar pentru noi": aplicația întreabă din nou, pe loc, Anthropic dacă modelul primește căutarea și o spune', rp.status === 200 && rp.j.modelOk === true && /primește căutarea pe internet/.test(rp.j.model) &&
      cereri().filter((c) => c.__models).length === 2, JSON.stringify(rp.j));
    const qS = await quota(S);
    T('…noi vedem butonul (doar numele, fără limită); firma nu', qS && qS.vede && qS.buton === 'Sursă externă' && qS.contor === '' && (await quota(ck)) === null, JSON.stringify(qS));

    // c) pornită pentru firme
    rp = await json('PUT', '/api/admin/insight/sursa-externa', S, { stare: 'firme' });
    let q = await quota(ck);
    T('c) „pornită pentru firme": firma pe Basic vede „Sursă externă · 10 din 10"', rp.status === 200 && q && q.vede && q.poate && q.buton === 'Sursă externă · 10 din 10' && q.contor === '10 din 10' && /Firma mai are 10 întrebări cu sursă externă luna asta\./.test(q.nota), JSON.stringify(q));
    T('…firma pe Start nu (Start n-are întrebări cu AI)', (await quota(ckS)) === null);
    n0 = cereri().length;
    coada([text('Din aplicație.')]);
    await intreaba(ck, 'Ce consum normal declară Dacia pentru Logan 1.5 dCi?');
    noi = cereri().slice(n0);
    T('…fără butonul pornit (fără `sursa`), RA Insight nu primește unealta', noi.length === 1 && !areUnealta(noi[0]));

    // d) căutarea, cap-coadă
    n0 = cereri().length;
    coada([unealta('sursa_externa', { cautare: 'consum normal Dacia Logan 1.5 dCi' }), CAUTARE,
      text('**Din sursă externă**\nConsumul mixt declarat e 4,9 l/100 km (exemplu.com), iar în teste reale 5,6 l/100 km (auto-test.ro).')]);
    let r = await intreaba(ck, 'Ce consum normal declară Dacia pentru Logan 1.5 dCi?', { sursa: true });
    noi = cereri().slice(n0);
    const c1 = noi[0], cS = noi.find(eCautare), c3 = noi[2];
    T('d) RA Insight primește unealta (ultima) și instrucțiunea „SURSĂ EXTERNĂ PORNITĂ"', noi.length === 3 && areUnealta(c1) && c1.tools[c1.tools.length - 1].name === 'sursa_externa' && /SURSĂ EXTERNĂ PORNITĂ/.test(JSON.stringify(c1.system)));
    T('…căutarea pleacă SEPARAT: un singur mesaj = textul căutării; nimic din flotă (număr, șofer, firmă)', cS && cS.messages.length === 1 && cS.messages[0].content === 'consum normal Dacia Logan 1.5 dCi' &&
      !/B 154 UIP|Mihai|Ionescu|Firma Sursa|Dacia Logan 3/.test(JSON.stringify(cS)) && cS.tools[0].max_uses === 3 && !('country' in cS.tools[0].user_location) && cS.tools[0].user_location.timezone === 'Europe/Bucharest');
    T('…RA Insight primește înapoi ce s-a găsit și fragmentele citate', c3 && /4,9 l\/100 km/.test(JSON.stringify(c3.messages)) && /fragmente/.test(JSON.stringify(c3.messages)));
    T('…răspunsul: sursele sub el (întâi cele citate, fără „javascript:"), ce s-a căutat, când', r.j.sursa && r.j.sursa.titlu === 'Surse de pe internet' && r.j.sursa.surse.map((s) => s.site).join(',') === 'exemplu.com,auto-test.ro' &&
      /^Căutat pe internet la \d\d:\d\d · 2 căutări$/.test(r.j.sursa.text) && /^Ce am căutat: „consum normal Dacia Logan 1\.5 dCi”, „Dacia Logan dCi consum mixt”$/.test(r.j.sursa.ceAmCautat), JSON.stringify(r.j.sursa));
    T('…insigna: „1 întrebare · sursă externă, 2 căutări"', r.j.insigna && r.j.insigna.detaliu === '1 întrebare · sursă externă, 2 căutări', JSON.stringify(r.j.insigna));
    T('…cifrele de pe internet se regăsesc (nu „Nu am găsit în rapoarte")', r.j.verificat === true && !(r.j.probleme || []).some((p) => p.fel === 'cifra'), JSON.stringify({ v: r.j.verificat, p: r.j.probleme }));
    T('…și rândul „✓" spune „Cifrele le-am luat din sursele de mai sus." (nicio cifră din aplicație, 30.10)', r.j.verificatText === SE.TEXT_VERIFICAT.sursa, JSON.stringify(r.j.verificatText));
    q = await quota(ck);
    T('…butonul arată pe loc „9 din 10" (s-a numărat o întrebare cu sursă externă)', q && q.contor === '9 din 10', JSON.stringify(q));
    const conv = await json('GET', '/api/insight/conversatii/' + r.j.conversatieId, ck);
    const ult = (conv.j.mesaje || []).filter((m) => m.rol !== 'user').pop();
    T('…conversația redeschisă păstrează sursele (ale omului, 12 luni, ca restul) și rândul „✓"', ult && ult.extra && ult.extra.sursa && ult.extra.sursa.surse.length === 2 &&
      ult.extra.verificatText === SE.TEXT_VERIFICAT.sursa);
    // Modelul a scris „**Din sursă externă**" din obișnuință (ca în conversațiile din 28–29.10): omul nu-l mai vede (Alin, 29.10).
    T('…titlul „Din sursă externă" scris de model pleacă din răspuns și din conversația redeschisă', !/Din sursă externă/.test(r.j.reply) && /^Consumul mixt declarat e 4,9 l\/100 km/.test(r.j.reply) &&
      ult && !/Din sursă externă/.test(ult.text) && /^Consumul mixt/.test(ult.text), JSON.stringify({ reply: r.j.reply, salvat: ult && ult.text }));
    let au = (await json('GET', '/api/admin/ai-usage', S)).j;
    let rand = (au.rows || []).find((x) => x.id === co.id);
    T('…„RA Insight · control": pe firmă, 1 întrebare cu sursă externă, 2 căutări, costul lor (doar numere)', rand && rand.sursa && rand.sursa.intrebari === 1 && rand.sursa.cautari === 2 && rand.sursa.costLei > 0, JSON.stringify(rand && rand.sursa));
    T('…și sus, comutatorul în trei stări, modelul, cifrele lunii', au.sursa && au.sursa.stare === 'firme' && au.sursa.stari.map((x) => x.t).join('|') === 'Oprită|Doar pentru noi|Pornită pentru firme' &&
      au.sursa.modelOk === true && au.sursa.cautari === 2 && au.sursa.peLuna.basic === 10, JSON.stringify(au.sursa));
    T('…costul căutării intră în plasa firmei (cele 2 căutări = 0,02 $, plus tokenii)', rand && rand.plasa && rand.plasa.costLei >= 0.02 * 0.92 * 4, JSON.stringify(rand && rand.plasa));

    // e) ce n-are voie să plece: număr de înmatriculare, numele șoferului
    const cautariInainte = cereri().filter(eCautare).length;
    n0 = cereri().length;
    coada([unealta('sursa_externa', { cautare: 'consum B 154 UIP' }), text('Răspund din aplicație.')]);
    r = await intreaba(ck, 'Cât consumă B 154 UIP față de ce scrie pe internet?', { sursa: true });
    noi = cereri().slice(n0);
    T('e) o căutare cu numărul mașinii NU pleacă; RA Insight află de ce', cereri().filter(eCautare).length === cautariInainte && noi.length === 2 && /Căutarea are un număr de înmatriculare/.test(JSON.stringify(noi[1].messages)) && !r.j.sursa);
    n0 = cereri().length;
    coada([unealta('sursa_externa', { cautare: 'amenzi Mihai Ionescu' }), text('Nu caut persoane.')]);
    r = await intreaba(ck, 'Are Mihai Ionescu amenzi?', { sursa: true });
    noi = cereri().slice(n0);
    T('…nici numele unui om al firmei (șoferul Mihai Ionescu)', cereri().filter(eCautare).length === cautariInainte && /Căutarea are numele unui om al firmei/.test(JSON.stringify(noi[1] && noi[1].messages)));
    T('…și nu s-au numărat (tot „9 din 10")', (await quota(ck)).contor === '9 din 10');

    // f) comutatorul firmei
    let rf = await json('PUT', '/api/insight/sursa-externa', ck, { pornita: false });
    let pc = (await json('GET', '/api/insight/pachet-conturi', ck)).j;
    T('f) administratorul o oprește pentru toată firma: butonul dispare, „Pachet și conturi" spune', rf.status === 200 && rf.j.sursa && rf.j.sursa.oprita === true && (await quota(ck)) === null &&
      pc.sursa && pc.sursa.oprita === true && pc.sursa.text === 'Oprită pentru toată firma: butonul nu apare nimănui.', JSON.stringify(pc.sursa));
    n0 = cereri().length;
    coada([text('Din aplicație.')]);
    await intreaba(ck, 'Ce consum normal declară Dacia pentru Logan 1.5 dCi?', { sursa: true });
    T('…și o întrebare cu `sursa: true` nu mai primește unealta', !areUnealta(cereri()[n0]));
    rf = await json('PUT', '/api/insight/sursa-externa', ck, { pornita: true });
    pc = (await json('GET', '/api/insight/pachet-conturi', ck)).j;
    T('…pornită din nou: „1 din 10 întrebări cu sursă externă folosite luna asta"', rf.status === 200 && (await quota(ck)).contor === '9 din 10' && /^Pornită: oricine are RA Insight o poate porni într-o discuție\. 1 din 10 întrebări cu sursă externă folosite luna asta; se reîncarcă pe 1 /.test(pc.sursa.text), pc.sursa && pc.sursa.text);
    T('…firma pe Start nu are rândul și nu-l poate porni', !(await json('GET', '/api/insight/pachet-conturi', ckS)).j.sursa && (await json('PUT', '/api/insight/sursa-externa', ckS, { pornita: true })).status === 400);

    // g) căutarea care dă eroare (căutarea oprită în contul Anthropic)
    n0 = cereri().length;
    coada([unealta('sursa_externa', { cautare: 'pret rovinieta camion 12 tone' }),
      { __status: 400, __body: JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'web search is not enabled for this organization' } }) },
      text('Sursa externă n-a răspuns acum; din aplicație nu am prețul rovinietei.')]);
    r = await intreaba(ck, 'Cât costă rovinieta pentru un camion de 12 tone?', { sursa: true });
    noi = cereri().slice(n0);
    T('g) căutarea dă eroare: RA Insight răspunde din aplicație, fără surse, și nu se numără', r.status === 200 && !r.j.sursa && /n-a mers acum/.test(JSON.stringify(noi[2] && noi[2].messages)) && (await quota(ck)).contor === '9 din 10');
    h = await sanatate();
    T('…„Stare producție" o spune, cu ce e de făcut (Console › Settings › Capabilities)', h && h.level === 'warn' && /web search is not enabled/.test(h.detail) && /Console › Settings › Capabilities/.test(h.detail), JSON.stringify(h));

    // h) pause_turn pe server + cota până la capăt
    n0 = cereri().length;
    const PAUZA = { content: [{ type: 'server_tool_use', id: 's9', name: 'web_search', input: { query: 'norma euro 6 camioane' } }], stop_reason: 'pause_turn', usage: { input_tokens: 50, output_tokens: 5 } };
    const CONT = { content: [{ type: 'web_search_tool_result', tool_use_id: 's9', content: [{ type: 'web_search_result', url: 'https://norme.ro/euro6', title: 'Euro 6', encrypted_content: 'q' }] }, { type: 'text', text: 'Euro 6 se aplică din 2014.' }],
      stop_reason: 'end_turn', usage: { input_tokens: 900, output_tokens: 40, server_tool_use: { web_search_requests: 1 } } };
    coada([unealta('sursa_externa', { cautare: 'norma euro 6 camioane' }), PAUZA, CONT, text('**Din sursă externă**\nEuro 6 se aplică din 2014 (norme.ro).')]);
    r = await intreaba(ck, 'De când se aplică norma Euro 6 la camioane?', { sursa: true });
    noi = cereri().slice(n0).filter(eCautare);
    T('h) „pause_turn": căutarea continuă, cu ce scrisese modelul trimis înapoi neschimbat', noi.length === 2 && noi[1].messages.length === 2 && JSON.stringify(noi[1].messages[1].content) === JSON.stringify(PAUZA.content) &&
      r.j.sursa && r.j.sursa.surse[0].site === 'norme.ro' && (await quota(ck)).contor === '8 din 10');
    for (let i = 0; i < 8; i++) {
      coada([unealta('sursa_externa', { cautare: 'pret motorina saptamana ' + i }), MIC('pret motorina saptamana ' + i), text('Găsit.')]);
      await intreaba(ck, 'Cât costă motorina săptămâna asta? (' + i + ')', { sursa: true });
    }
    q = await quota(ck);
    T('…după 10 întrebări cu sursă externă: „0 din 10", nu se mai caută, fraza spune până când', q && q.vede && !q.poate && q.contor === '0 din 10' && /^S-au terminat întrebările cu sursă externă ale lunii\./.test(q.nota), JSON.stringify(q));
    n0 = cereri().length;
    coada([text('Din aplicație.')]);
    await intreaba(ck, 'Cât costă motorina azi?', { sursa: true });
    T('…și RA Insight răspunde mai departe din aplicație, fără unealtă', !areUnealta(cereri()[n0]));

    // i) modelul nu primește căutarea
    fs.writeFileSync(MODEL_F, 'nu');
    rp = await json('PUT', '/api/admin/insight/sursa-externa', S, { stare: 'firme' });
    h = await sanatate();
    T('i) Anthropic spune că modelul nu primește căutarea: butonul dispare la toți, iar noi aflăm ce putem face', rp.j.modelOk === false && /NU primește căutarea/.test(rp.j.model) && /AI_MODEL_SURSA/.test(rp.j.model) &&
      (await quota(ck)) === null && (await quota(S)) === null && h && h.level === 'warn' && /NU primește/.test(h.detail));
    fs.writeFileSync(MODEL_F, 'da');
    rp = await json('PUT', '/api/admin/insight/sursa-externa', S, { stare: 'firme' });
    T('…și înapoi, când îl primește', rp.j.modelOk === true && (await quota(S)) && (await quota(S)).vede);

    // j) noi (fondatorii), fără limită și fără „1 întrebare"
    n0 = cereri().length;
    coada([unealta('sursa_externa', { cautare: 'pret motorina octombrie 2026' }), MIC('pret motorina octombrie 2026', 'https://b.ro/m'), text('**Din sursă externă**\nGăsit (b.ro).')]);
    r = await intreaba(S, 'Cât a costat motorina în octombrie 2026?', { sursa: true });
    T('j) noi căutăm fără limită; insigna: „sursă externă, 1 căutare"', r.j.sursa && r.j.sursa.surse[0].site === 'b.ro' && r.j.insigna && r.j.insigna.detaliu === 'sursă externă, 1 căutare', JSON.stringify(r.j.insigna));
    au = (await json('GET', '/api/admin/ai-usage', S)).j;
    T('…costul nostru se vede tot în cifrele lunii (11 întrebări cu sursă externă, 12 căutări — cu ale noastre)', au.sursa && au.sursa.intrebari === 11 && au.sursa.cautari === 12, JSON.stringify(au.sursa));

    // k) oprită de noi din nou
    await json('PUT', '/api/admin/insight/sursa-externa', S, { stare: 'oprita' });
    T('k) oprită de noi: butonul dispare la toți', (await quota(ck)) === null && (await quota(S)) === null);
  } catch (e) { T('proba pe server', false, e.stack); }
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
}
