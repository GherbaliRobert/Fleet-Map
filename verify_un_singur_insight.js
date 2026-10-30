// verify_un_singur_insight.js — Capitolul 2, pasul 1 (Alin, 15.10, macheta aprobată: „1da 2.da 3. Da"): un singur RA Insight.
//
// Ce păzește:
//   1. „Azi la tine" (azi_la_tine.js): rândurile din ce au găsit agenții, cu regulile agenților (agents.esteFaraSemnal /
//      esteLiber), butoanele lor, ordinea, cheile pentru punctul mov de pe bulă — pe reguli, fără model, nenumărat;
//      1b. ziua agenților pe ora României, la orice oră din noapte (22.10: proba pica între 00 și 03 — agenții porneau ziua la 03);
//   2. rapoartele cerute în cuvinte (ai_raport.comanda): fiecare raport din catalog e înțeles după numele lui, o întrebare
//      („câți km…") rămâne întrebare, continuările („Și pentru toată flota?", „Și ziua dinainte?", mașina aleasă) se înțeleg;
//   3. pagina: bula duce în secțiune (fără chatul ei), „Agenți AI" iese din meniu pentru cine are cont RA Insight, „Azi la
//      tine" și cartonașul raportului se desenează din ce dă serverul (curățat), Istoric rapoarte are eticheta „din RA Insight",
//      „Rezumă cu RA Insight" scrie deasupra raportului, ramura se cheamă RA Drive;
//      macheta „mai simplu" (Alin, 15.10: „1. da, 2. da"): salutul scurt, „+", „⋯", „Pagini ▸", „Azi la tine" pe trei rânduri
//      apăsate o dată, pachetul pe un rând, „Fondator · fără limită", răspunsul cu titlu și cel mult două butoane;
//   4. serverul: o singură scriere în Istoric (_istoricRaport), cererea înaintea răspunsului rapid, /api/me spune `aiCont`;
//   5. pe server pornit, cu modelul simulat: cererea de raport → Istoric (status „insight"), cartonaș, Excel, continuări, alegerea
//      mașinii; pe Basic nu se numără, pe Start se numără din 50; „Azi la tine" cu o mașină tăcută, o scădere de combustibil și
//      una liberă — nenumărat; super-adminul primește un răspuns gol; omul fără cont, 403. ZERO cereri către model.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { puneParola } = require('./test_parola');
const azi = require('./azi_la_tine');
const AR = require('./ai_raport');
const reports = require('./reports');
const agents = require('./agents');
const I = require('./insight');

let ok = 0, rele = 0;
function T(nume, cond, detalii) {
  if (cond) { ok++; console.log('  ✓ ' + nume); }
  else { rele++; console.log('  ✗ ' + nume + (detalii !== undefined ? '  → ' + String(detalii).slice(0, 400) : '')); }
}
const SRV = fs.readFileSync(path.join(__dirname, 'server.js'), 'utf8');
const PAG = fs.readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(__dirname, 'public', 'css', 'app.css'), 'utf8');
const AG = fs.readFileSync(path.join(__dirname, 'agents.js'), 'utf8');

// ─── 1. „Azi la tine" ───────────────────────────────────────────────────────────────────────────────
console.log('1. „Azi la tine": rândurile, din ce au găsit agenții');
const toti = ['watch', 'care', 'dispatch', 'client', 'optimize', 'compliance'];
const r0 = azi.randuri({ agenti: toti, offlineMin: 60,
  faraSemnal: [{ imei: 'A', eticheta: 'B 268 ROY · Dacia', nr: 'B 268 ROY', minute: 180 }, { imei: 'B', eticheta: 'IF 07 TRX · Ford', nr: 'IF 07 TRX', minute: 80 }],
  constatari: [{ agent: 'watch', severity: 'critical', fkey: 'fuel_theft_A', title: 'Dacia (B 268 ROY): posibil furt combustibil ~38 L după pornire', imei: 'A', eticheta: 'B 268 ROY · Dacia', nr: 'B 268 ROY' }],
  termene: [{ stare: 'curand', cine: 'B 154 UIP · Logan', ce: 'ITP', cand: 'expiră pe 17.10' }],
  libere: 3, ieri: { km: 1240.4, active: 9, total: 11, top: { eticheta: 'B 154 UIP · Logan', km: 318.2 } } });
const txt = r0.randuri.map((r) => r.text);
T('două mașini tăcute: un rând, pragul în vorbe, cele mai vechi primele, cu durata fiecăreia', txt[0] === '2 mașini nu transmit de peste o oră: **B 268 ROY · Dacia** (de 3 h), **IF 07 TRX · Ford** (de 1 h 20 min).' && r0.randuri[0].nivel === 'r', txt[0]);
T('…cu „Pe hartă" pe amândouă', JSON.stringify(r0.randuri[0].butoane) === JSON.stringify([{ fel: 'harta', text: 'Pe hartă', imeis: ['A', 'B'] }]), JSON.stringify(r0.randuri[0].butoane));
const fuel = r0.randuri.find((r) => r.cheie === 'fuel_theft_A');
T('scăderea de combustibil: propoziția agentului, roșu, „Pe hartă" și „De ce?" (întrebarea pentru RA Insight, cu numărul mașinii)', !!fuel && fuel.nivel === 'r' && fuel.butoane[1].fel === 'dece' && /B 268 ROY/.test(fuel.butoane[1].trimite), JSON.stringify(fuel));
T('actele: „Urmează: ITP la **…** — expiră pe 17.10." cu butonul „Actele" (ramura, altfel întrebarea pe reguli)', txt.indexOf('Urmează: ITP la **B 154 UIP · Logan** — expiră pe 17.10.') >= 0 && r0.randuri.find((r) => r.agent === 'care').butoane[0].ramura === 'mentenanta');
// Macheta „mai simplu" (Alin, 15.10: „1. da"): cel mult TREI rânduri, ce cere atenție întâi; ziua de ieri doar dacă mai e loc.
T('cel mult ' + azi.MAX_RANDURI + ' rânduri (macheta „mai simplu": trei), ordinea roșu, roșu, portocaliu; ieri și mașinile libere nu mai încap', azi.MAX_RANDURI === 3 && r0.randuri.map((r) => r.nivel).join('') === 'rrw' && !r0.randuri.some((r) => r.cheie === 'ieri' || r.agent === 'dispatch'), r0.randuri.map((r) => r.nivel).join(''));
T('…`deVazut` = câte cer atenție de tot („3 de văzut")', r0.deVazut === 3, r0.deVazut);
const rLib = azi.randuri({ agenti: toti, libere: 3, ieri: { km: 1240.4, active: 9, total: 11, top: { eticheta: 'B 154 UIP · Logan', km: 318.2 } } });
const tLib = rLib.randuri.map((r) => r.text);
T('mașinile libere (RA Dispatch): „3 mașini sunt libere acum…", „Care sunt?" = întrebarea pe reguli', tLib.some((t) => /^3 mașini sunt libere acum/.test(t)) && rLib.randuri.find((r) => r.agent === 'dispatch').butoane[0].trimite === 'Care mașini sunt oprite acum?', tLib.join(' ¦ '));
T('ieri: km cu punct de mii, câte au mers și au stat, cea mai activă — la capăt, când e loc', tLib[tLib.length - 1] === 'Ieri: **1.240 km**, 9 mașini au mers, 2 au stat. Cea mai activă: **B 154 UIP · Logan**, 318 km.' && rLib.randuri[rLib.randuri.length - 1].cheie === 'ieri' && rLib.randuri.map((r) => r.nivel).join('') === 'bg' && rLib.deVazut === 0, tLib.join(' ¦ '));
T('cheile punctului mov: doar rândurile care cer atenție (roșu, portocaliu)', JSON.stringify(r0.chei) === JSON.stringify(['offline:A,B', 'fuel_theft_A', 'care:curand:1']), JSON.stringify(r0.chei));
const r1 = azi.randuri({ agenti: ['client'], offlineMin: 90, faraSemnal: [{ imei: 'A', eticheta: 'X', minute: 200 }], libere: 2, ieri: { km: 0, active: 0, total: 3 } });
T('un agent oprit la firmă nu are rânduri; ieri fără drum: „Ieri n-a mers nicio mașină." fără buton', r1.randuri.length === 1 && r1.randuri[0].text === 'Ieri n-a mers nicio mașină.' && r1.randuri[0].butoane.length === 0 && r1.chei.length === 0, JSON.stringify(r1));
const multe = azi.randuri({ agenti: toti, offlineMin: 60, constatari: Array.from({ length: 9 }, (x, i) => ({ agent: 'watch', severity: 'critical', fkey: 'fuel_' + i, title: 'T' + i, imei: 'I' + i })), ieri: { km: 10, active: 1, total: 1 } });
T('nouă scăderi: tot trei rânduri, fără ieri; `deVazut` le numără pe toate nouă', multe.randuri.length === azi.MAX_RANDURI && !multe.randuri.some((r) => r.cheie === 'ieri') && multe.deVazut === 9, multe.randuri.length + ' ' + multe.deVazut);
T('„De ce?" (o întrebare pentru RA Insight, care se numără) stă DUPĂ butoanele gratuite: un clic pe rând face întâi ce nu costă', r0.randuri.concat(multe.randuri).every((r) => { const i = r.butoane.findIndex((b) => b.fel === 'dece'); return i < 0 || r.butoane.slice(i).every((b) => b.fel === 'dece'); }));
T('pragul în vorbe: 60 → o oră, 120 → 2 ore, 30 → 30 de minute, 15 → 15 minute', azi.pragText(60) === 'de peste o oră' && azi.pragText(120) === 'de peste 2 ore' && azi.pragText(30) === 'de peste 30 de minute' && azi.pragText(15) === 'de peste 15 minute');
T('duratele: 45 min, 3 h, 1 h 20 min, o zi, 3 zile, 25 de zile', ['45 min', '3 h', '1 h 20 min', 'o zi', '3 zile', '25 de zile'].join('|') === [45, 180, 80, 1500, 4400, 36000].map(azi.durata).join('|'), [45, 180, 80, 1500, 4400, 36000].map(azi.durata).join('|'));
T('fiecare raport din butoane e o cerere înțeleasă de comanda pe reguli', r0.randuri.concat(multe.randuri).concat(azi.randuri({ agenti: toti, constatari: [{ agent: 'watch', fkey: 'idle_A', title: 'x', imei: 'A', nr: 'B 1 X' }, { agent: 'compliance', severity: 'warning', fkey: 'c1', title: 'y', imei: 'A', nr: 'B 1 X' }, { agent: 'optimize', fkey: 'opt_eco_A', title: 'z', imei: 'A' }] }).randuri)
  .every((r) => r.butoane.filter((b) => b.fel === 'raport').every((b) => { const u = AR.comanda(b.trimite, null, [], Date.now()); return u && u.ok; })));
console.log('   regulile agenților: una singură');
T('„nu transmite" = peste pragul firmei și sub 7 zile (RA Watch și „Azi la tine")', agents.esteFaraSemnal(61, 60) && !agents.esteFaraSemnal(59, 60) && !agents.esteFaraSemnal(7 * 1440 + 1, 60) && agents.esteFaraSemnal(61, null) && /if \(esteFaraSemnal\(ageMin, offlineMin\)\)/.test(AG));
const acum = Date.now();
T('„liberă" = a transmis sub prag și stă pe loc (RA Dispatch și „Azi la tine")', agents.esteLiber({ timestamp: new Date(acum - 60000).toISOString(), speed: 0 }, acum, 65) && !agents.esteLiber({ timestamp: new Date(acum - 60000).toISOString(), speed: 20 }, acum, 65) && !agents.esteLiber({ timestamp: new Date(acum - 70 * 60000).toISOString(), speed: 0 }, acum, 65) && /if \(esteLiber\(live, now, ONLINE_MS \/ 60000\)\)/.test(AG));
T('serverul le cheamă pe aceleași (agents.esteFaraSemnal / esteLiber), cu pragurile firmei', /agents\.esteFaraSemnal\(min, th\.offlineMin\)/.test(SRV) && /agents\.esteLiber\(livePositions\.get\(imei\), acum, th\.dispOnlineMin\)/.test(SRV));

// ─── 2. Rapoartele cerute în cuvinte ────────────────────────────────────────────────────────────────
console.log('\n2. Rapoartele cerute în cuvinte');
const FISA = I.fisaFlotei([{ imei: '1', name: 'Dacia Logan', plate: 'B 101 BAS' }, { imei: '2', name: 'Dacia Logan', plate: 'B 202 BAS' }, { imei: '3', name: 'Ford Transit', plate: 'B 303 BAS' }], {});
const gresite = Object.keys(reports.REPORTS).filter((k) => { const u = AR.comanda('Fă-mi raportul „' + reports.REPORTS[k].label + '”', null, FISA, acum); return !u || (u.raport || (u.context && u.context.raport)) !== k; });
T('fiecare raport din catalog e înțeles după numele lui („Fă-mi raportul „…”", ce pune butonul „Raport")', gresite.length === 0, gresite.join(', '));
T('Hotspot și CAN detaliat cer o alegere făcută în Rapoarte (butonul care le deschide)', AR.comanda('Fă-mi raportul „Raport Hotspot”', null, FISA, acum).motiv === 'cu_alegeri' && AR.comanda('Fă-mi raportul „CAN detaliat (istoric)”', null, FISA, acum).motiv === 'cu_alegeri');
const c1 = AR.comanda('Fă-mi foaia de parcurs pentru B 303 BAS, săptămâna trecută', null, FISA, acum);
T('„fă-mi foaia de parcurs pentru B 303 BAS, săptămâna trecută" → foaia de parcurs, mașina, săptămâna trecută', c1 && c1.ok && c1.raport === 'trips' && JSON.stringify(c1.masini) === '["3"]' && c1.perioada.eticheta === I.etichetaPerioadei(I.perioada({ period: 'last_week' }, acum).from, I.perioada({ period: 'last_week' }, acum).to), JSON.stringify(c1));
T('o întrebare rămâne întrebare (răspunsul cu cifre): „câți km a făcut flota săptămâna trecută?", „dă-mi consumul de luna trecută"', AR.comanda('Câți km a făcut flota săptămâna trecută?', null, FISA, acum) === null && AR.comanda('dă-mi consumul de luna trecută', null, FISA, acum) === null && AR.comanda('De ce a crescut consumul?', null, FISA, acum) === null);
T('„generează raportul de consum pe luna trecută" → cerere (cu „raport" ajunge și un nume obișnuit)', AR.comanda('generează raportul de consum pe luna trecută', null, FISA, acum).raport === 'consumption');
T('„fă-mi raportul" fără nume → „Ce raport vrei?"', AR.comanda('fă-mi raportul', null, FISA, acum).motiv === 'fara_raport');
const amb = AR.comanda('Fă-mi foaia de parcurs pentru Logan, azi', null, FISA, acum);
T('două Logan-uri: îndoiala nu se rezolvă pe ghicite (variantele), cererea rămâne ținută minte', amb.motiv === 'ambiguu' && amb.variante.length === 2 && amb.context.raport === 'trips' && !!amb.context.perioada, JSON.stringify(amb));
const ales = AR.comanda('B 202 BAS', amb.context, FISA, acum);
T('…mașina aleasă din butoane = aceeași cerere, pe ea, pe aceeași perioadă', ales && ales.ok && ales.raport === 'trips' && JSON.stringify(ales.masini) === '["2"]' && ales.perioada.from === amb.context.perioada.from, JSON.stringify(ales));
const ctx1 = AR.contextulComenzii(c1, c1.perioada.from, c1.perioada.to);
const urm = AR.urmariComanda(c1);
T('continuările de sub cartonaș: perioada dinainte și toată flota', urm.map((x) => x.text).join(' | ') === 'Și săptămâna dinainte? | Și pentru toată flota?', urm.map((x) => x.text).join(' | '));
const uFlota = AR.comanda('Și pentru toată flota?', ctx1, FISA, acum), uInainte = AR.comanda('Și săptămâna dinainte?', ctx1, FISA, acum);
T('…fiecare înțeleasă: același raport pe toată flota / pe săptămâna dinainte, pe aceeași mașină', uFlota && uFlota.ok && uFlota.masini === null && uFlota.raport === 'trips' && uInainte && uInainte.ok && JSON.stringify(uInainte.masini) === '["3"]' && Date.parse(uInainte.perioada.to) === Date.parse(c1.perioada.from), JSON.stringify([uFlota, uInainte]).slice(0, 300));
T('după o cerere, o întrebare nouă („și consumul?") NU e luată drept continuare a cererii', AR.comanda('și consumul?', ctx1, FISA, acum) === null);

// ─── 3. Pagina ──────────────────────────────────────────────────────────────────────────────────────
console.log('\n3. Pagina');
T('bula din colț duce în secțiune (pe verticala Fondator, în chatul asistentului fondatorilor — 30.10); fereastra ei mică și chatul ei au plecat', /window\.raxToggleAI = function \(\) \{ showView\(window\._asfVerticalaNoastra && window\._asfVerticalaNoastra\(\) \? 'asistent' : 'insight'\); \};/.test(PAG) && PAG.indexOf('id="rax-ai-overlay"') < 0 && PAG.indexOf('raxSendAI') < 0 && PAG.indexOf("fetch('/api/ai/reports-agent'") < 0);
T('punctul mov: „Azi la tine" verificat cel mult o dată la 5 minute, doar cu cont, cheile văzute ținute în browser (cu try/catch)', /if \(!\(me && me\.aiCont && appVisible\(\)\)/.test(PAG) && /Date\.now\(\) - _aziUltima < 5 \* 60000/.test(PAG) && /try \{ localStorage\.setItem\(_aziCheie\(\)/.test(PAG) && /#rax-main-fab\.are-nou::after/.test(CSS));
T('„Agenți AI" iese din meniu pentru cine are cont RA Insight (colegii fără cont îl păstrează)', /na\.style\.display = \(feats\.agents !== false && me\.permissions && me\.permissions\.viewReports && !me\.aiCont\) \? '' : 'none';/.test(PAG));
const SECT = (PAG.split('// ── începe „secțiunea RA Insight" ──')[1] || '').split('// ── sfârșit „secțiunea RA Insight" ──')[0];
T('„Azi la tine" stă sub salut, la o conversație nouă, și cere serverul (nu socotește nimic)', /var az = el\('div', 'azi'\); az\.id = 'insp-azi'; az\.style\.display = 'none'; sal\.appendChild\(az\); deseneazaAzi\(az\);/.test(SECT) && (SECT.match(/cere\('GET', '\/api\/insight\/azi'\)/g) || []).length === 1);
T('…textul (cu numele mașinilor, scrise de oameni) trece prin mdScurt, care curăță întâi; numele agentului doar ca text la trecerea cu mouse-ul', /function mdScurt\(t\) \{ return String\(t \|\| ''\)\.replace\(\/&\/g, '&amp;'\)\.replace\(\/<\/g, '&lt;'\)/.test(SECT) && /tx\.innerHTML = mdScurt\(rd\.text\)/.test(SECT) && /row\.title = String\(rd\.nume \|\| ''\)/.test(SECT));
T('…un rând = un clic: primul buton pe care omul îl poate folosi („De ce?" doar cu AI, harta doar cu mașini, raportul doar cu dreptul); „De ce?" se vede pe rând', /if \(b\.fel === 'dece' && !areAi\(\)\) return false;/.test(SECT) && /var b = aziPrimul\(rd\);/.test(SECT) && /if \(b && b\.fel === 'dece'\) row\.appendChild\(el\('span', 'azi-dece', b\.text\)\);/.test(SECT) && /if \(window\._aziVazut\) window\._aziVazut\(j\.chei \|\| \[\]\);/.test(SECT));
T('…cel mult trei rânduri (le taie serverul), cu „N de văzut" sus; „Setările agenților" s-a mutat în „⋯"', /dv > 0 \? dv \+ ' de văzut'/.test(SECT) && /else if \(x\.k === 'agenti'\) showView\('agenti'\);/.test(SECT) && SECT.indexOf('Setările agenților →') < 0);
T('cartonașele rapoartelor: din `raport` / `rapoarte` (de la server; mai multe zile = mai multe cartonașe, 15.10), „Deschide raportul" → Istoric, „Descarcă Excel" → fișierul din Istoric; pe reguli, doar cartonașele (cu `note`), iar cu „compară" și analiza lui RA Insight dedesubt', /var carduri = Array\.isArray\(x\.rapoarte\) && x\.rapoarte\.length \? x\.rapoarte : \(x\.raport && x\.raport\.label \? \[x\.raport\] : \[\]\);/.test(SECT) && /var cuRaport = carduri\.length > 0 && x\.source !== 'ai';/.test(SECT) && /carduri\.forEach\(function \(rp\) \{ cw\.appendChild\(cartonasRaport\(rp\)\); \}\);/.test(SECT) && /if \(!x\.limita && !cuRaport && !propInchisa && textAi\)/.test(SECT) && /repViewHistory\(id\)/.test(SECT) && /repExportHistory\(rp\.id, 'xlsx'\)/.test(SECT) && /raport: j\.raport, rapoarte: j\.rapoarte, probleme: j\.probleme,/.test(SECT) && /\(Array\.isArray\(rp\.note\) \? rp\.note : \[\]\)\.forEach/.test(SECT) && /if \(note\.length\) card\.note = note;/.test(SRV));
T('„Raport" din „+": lista o dă serverul (drepturile omului), alesul se pune în text; doar cu dreptul la rapoarte', /cere\('GET', '\/api\/insight\/rapoarte'\)/.test(SECT) && /if \(poateRapoarte\(\)\) l\.push\(\{ text: 'Raport'/.test(SECT));
T('Istoric rapoarte: eticheta „din RA Insight" pe rapoartele cerute în cuvinte', /h\.status === 'insight' \? '<span class="rh-ins"/.test(PAG) && /\.rh-ins \{/.test(CSS) && /body\.dark \.rh-ins/.test(CSS));
T('„Rezumă cu RA Insight": rezumatul apare deasupra raportului (fără fereastra bulei), curățat; raportul nou îl golește', /<div id="rep-rezumat" class="rep-rezumat" style="display:none;"><\/div>/.test(PAG) && /c\.innerHTML = esc\(text\)\.replace/.test(PAG) && /var _rz = document\.getElementById\('rep-rezumat'\)/.test(PAG) && PAG.indexOf('raxSummarizeVisibleReport') < 0);
T('ramura se cheamă RA Drive, cu subtitlul „condus & costuri" (în stânga și în capul paginii)', /et: 'RA Drive', sub: 'condus & costuri'/.test(PAG) && /if \(r\.sub\) b\.appendChild\(el\('span', 'insp-ram-sub', r\.sub\)\);/.test(PAG) && PAG.indexOf("'Safe Drive & costuri'") < 0);
T('culorile noi au pereche pe tema închisă (puncte, chenarul raportului, nota lui, „De ce?", titlul ținut minte, pachetul oprit, rezumatul)', /body\.dark \.azi-st\.r/.test(CSS) && /body\.dark \.chat-rap \{/.test(CSS) && /body\.dark \.chat-rap-n/.test(CSS) && /body\.dark \.rep-rezumat/.test(CSS) && /body\.dark \.azi-dece/.test(CSS) && /body\.dark \.ins-tit \.mem/.test(CSS) && /body\.dark \.insp-fond\.w/.test(CSS));
// Macheta „mai simplu" (Alin, 15.10: „1. da, 2. da"): ce rămâne pe ecran și unde s-a mutat restul.
T('salutul scurt cu prenumele: „Salut, Alin! Cu ce te pot ajuta?" (fără iconița mare și paragraful de sub el)', /\(prenume\(\) \? 'Salut, ' \+ prenume\(\) \+ '! ' : 'Salut! '\) \+ 'Cu ce te pot ajuta\?'/.test(SECT) && SECT.indexOf('insp-stea mare') < 0 && SECT.indexOf('Ce vrei să afli despre flotă?') < 0);
T('trei butoane scurte sub casetă (pe butoane, primul e pe reguli), în locul celor patru cartonașe', (SECT.match(/\{ t: '[^']+', q: '[^']+' \}/g) || []).length === 4 && /el\('button', 'insp-chip', c\.t\)/.test(SECT) && SECT.indexOf('insp-card-q') < 0);
T('caseta: un singur „+" (Mașina, Perioada, Raport), fără butoanele de pe vremuri', /onclick="insightPlus\(this\)"/.test(SECT) && /window\.insightPlus = function \(btn\)/.test(SECT) && SECT.indexOf('onclick="insightAlegeMasina(this)"') < 0 && SECT.indexOf('insightAlegeRamura') < 0 && SECT.indexOf('insp-b-ramuri') < 0);
T('„⋯": pachetul (doar administratorul — și când n-are încă un cont al lui), notițele, agenții, ghidul, redenumirea; nota despre păstrare în el', /window\.insightMeniu = function \(btn\)/.test(SECT) && /if \(esteAdmin\(\) && \(S\.pachet \|\| S\.faraLoc\)\) l\.push\(\{ text: 'Pachet și conturi'/.test(SECT) && /l\.push\(\{ text: 'Notițele firmei'/.test(SECT) && /l\.push\(\{ text: 'Ghidul aplicației'/.test(SECT) && /'Conversațiile le vezi doar tu și se păstrează 12 luni de la ultimul mesaj\.'\);/.test(SECT) && SECT.indexOf('insp-pastrare') < 0 && SECT.indexOf('onclick="insightNotite()"') < 0);
T('„Pagini ▸": ramurile, închise, cu suma lucrurilor de văzut; ghidul nu e printre ele (stă în „⋯")', /function pagini\(\) \{ return RAMURI\.filter\(function \(r\) \{ return r\.gata && r\.k !== 'general' && !r\.meniu; \}\); \}/.test(SECT) && /k: 'ghid', [^}]*meniu: true/.test(SECT) && /window\.insightPagini = function/.test(SECT));
T('pachetul pe un rând („Basic · 188 din 200"), amănuntul la mouse, administratorul ajunge din el în „Pachet și conturi"', /box\.textContent = p\.nume \+ ' · ' \+ String\(p\.scurt \|\| ''\);/.test(SECT) && /box\.title = \[p\.text, p\.textOm, p\.reincarcare\]/.test(SECT) && SECT.indexOf('insp-pk-top') < 0 && SECT.indexOf('Pachet și conturi →') < 0);
T('noi, fondatorii (fără pachet): contorul scrie „Fondator · fără limită", și jos, și lângă casetă', /return S\.fondator \? 'Fondator · fără limită' : 'Fără limită';/.test(SECT) && /S\.fondator = !!\(window\.currentUser && window\.currentUser\.isSuper\);/.test(SECT) && /c\.textContent = S\.contor \|\| '';/.test(SECT));
T('un răspuns: titlu scurt („Am înțeles" fără bule), cel mult două butoane spre rapoarte; Copiază · 👍 · 👎 la trecerea cu mouse-ul (la vedere pe telefon)', PAG.indexOf("r.className = 'ins-tit'") > 0 && PAG.indexOf("'Am înțeles:'") < 0 && /surse\.slice\(0, 2\)\.forEach/.test(SECT) && /\.insp-a \.chat-act \{ opacity: 0;/.test(CSS) && /@media \(hover: none\) \{ \.insp-a \.chat-act \{ opacity: 1; \} \}/.test(CSS) && SECT.indexOf('insp-nota') < 0);

// ─── 4. Serverul ────────────────────────────────────────────────────────────────────────────────────
console.log('\n4. Serverul');
T('Istoric rapoarte are O SINGURĂ scriere în server (_istoricRaport): pagina pe loc, în fundal, și RA Insight', (SRV.match(/db\.saveReportHistory\(/g) || []).length === 1 && (SRV.match(/await _istoricRaport\(/g) || []).length === 3 && /status: 'insight' \}\);/.test(SRV));
// Din 22.10 (pasul 2): înaintea ei stă doar cererea de șoferi („Pune-l pe Mihai pe B 77 TIR"), tot pe reguli, care lasă
// mai departe orice nu e despre șoferi („Pune-mi raportul…") — păzită în verify_soferi_masini.js.
T('cererea de raport e întâia în RA Insight (înaintea răspunsului rapid; doar cererile pasului 2 — revizia, actul și raportul programat, alerta și discuția, apoi șoferii — înaintea ei), o singură dată; proba modelelor o sare; cu „compară" dă rapoartele mai departe lui RA Insight (`dupa`)', (SRV.match(/await _insightComanda\(req, res, /g) || []).length === 1 && SRV.indexOf('await _insightComanda(req, res, ') < SRV.indexOf('// 1) Răspuns rapid, LOCAL și GRATUIT') && /if \(!o\.proba\) \{\n(?: {6}\/\/[^\n]*\n){0,3}(?: {6}if \(await _insightProgramari\(req, res, [^\n]*\)\) return;\n)? {6}if \(await _insightPropuneri\(req, res, [^\n]*\)\) return;\n {6}if \(await _insightSoferi\(req, res, [^\n]*\)\) return;\n(?: {6}[^\n]*\n){0,3} {6}const rc = await _insightComanda\(req, res, /.test(SRV) && /if \(rc && rc\.dupa\) gata = rc\.dupa;/.test(SRV));
T('cererea: aceleași drepturi ca Rapoarte (viewReports + poateRaport) și aceleași opțiuni (_optiuniRaport)', /if \(!permReq\(req, 'viewReports'\)\)/.test(SRV) && /if \(!poateRaport\(req, u\.raport\)\)/.test(SRV) && /const opts = _optiuniRaport\(\{\}, cs\);/.test(SRV) && /const report = await reports\.runReport\(db, u\.raport, imeis, from, to, opts, scope\);/.test(SRV));
T('…se numără prin ACEEAȘI numărătoare a răspunsurilor pe reguli (pe Start din 50; altfel doar statistică)', /pachetInfo = await _numaraRaspunsReguli\(req, sp, 'raport_' \+ u\.raport/.test(SRV));
T('/api/me spune dacă omul are cont RA Insight (nu și noi: păstrăm pagina agenților în meniu)', /aiCont: !isSuper\(a\.role\) && features\.ai_assistant !== false && aiSeat,/.test(SRV));
T('„Azi la tine" cere contul RA Insight, dar nu se numără (fără _numaraRaspunsReguli, fără model)', /app\.get\('\/api\/insight\/azi', requireAuth, withScope, requireFeature\('ai_assistant'\), requireAiSeat,/.test(SRV) && !/async function _aziLaTine[\s\S]*?(_numaraRaspunsReguli|callClaude|runAgent)[\s\S]*?\napp\.get\('\/api\/insight\/azi'/.test(SRV));

// ─── 5. Pe server pornit ────────────────────────────────────────────────────────────────────────────
const PORT = 3315, TCP = 5315;
const DIR = path.join(os.tmpdir(), 'rax_unsingur_' + Date.now());
const PRELOAD = DIR + '_fetch.js', AI_LOG = DIR + '_ai.jsonl';
const B = 'http://127.0.0.1:' + PORT;
fs.writeFileSync(PRELOAD, [
  "const fs = require('fs');",
  'const orig = globalThis.fetch;',
  'globalThis.fetch = async function (url, opts) {',
  "  const u = String((url && url.url) || url);",
  "  if (u.indexOf('https://api.anthropic.com/') === 0) {",
  "    try { fs.appendFileSync(process.env.PROBA_AI_LOG, String((opts && opts.body) || '').slice(0, 200) + '\\n'); } catch (e) {}",
  "    return new Response(JSON.stringify({ content: [{ type: 'text', text: 'RASPUNS_DE_PROBA' }], stop_reason: 'end_turn', usage: { input_tokens: 100, output_tokens: 20 } }), { status: 200, headers: { 'content-type': 'application/json' } });",
  '  }',
  "  if (!/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(u)) throw new Error('proba: fara retea');",
  '  return orig.apply(this, arguments);',
  '};',
].join('\n'));
fs.writeFileSync(AI_LOG, '');
const env = Object.assign({}, process.env, {
  NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_unsingur', DEMO_DISABLED: 'true',
  PORT: String(PORT), TCP_PORT: String(TCP), PGLITE_DIR: DIR, PROBA_AI_LOG: AI_LOG, EUR_RON_RATE: '5', RATE_LIMIT_ENABLED: 'false',
});
['DATABASE_URL', 'ANTHROPIC_API_KEY', 'AI_AGENT_MODEL', 'AI_MODEL', 'AI_MODEL_APROFUNDAT', 'BREVO_API_KEY', 'SMTP_HOST'].forEach((k) => { delete env[k]; });
const srv = spawn(process.execPath, ['-r', PRELOAD, 'server.js'], { cwd: __dirname, env, stdio: ['ignore', 'ignore', 'inherit'] });
let terminat = false;
srv.on('exit', (c) => { if (!terminat) { console.log('  ✗ serverul probei s-a oprit singur (cod ' + c + ')'); curata(); process.exit(1); } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function curata() { for (const f of [PRELOAD, AI_LOG]) { try { fs.rmSync(f, { force: true }); } catch (e) {} } try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {} }
function gata(code) { terminat = true; try { srv.kill(); } catch (e) {} setTimeout(() => { curata(); process.exit(code); }, 800); }
async function login(u, pw) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: pw }) });
  if (!r.ok) return null;
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}
async function json(m, u, cine, body) {
  const h = { 'Content-Type': 'application/json' };
  if (cine) h.Cookie = cine;
  const r = await fetch(B + u, { method: m, headers: h, body: body ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let j = null; try { j = JSON.parse(text); } catch (e) {}
  return { status: r.status, j: j || {}, text, tip: r.headers.get('content-type') || '' };
}
const nModel = () => fs.readFileSync(AI_LOG, 'utf8').split('\n').filter(Boolean).length;

(async () => {
  // 1b. Ziua agenților pe ceasul României. Pe 22.10 proba asta pica noaptea (00–03, ora României): RA Watch nu mai vedea
  //     scăderea de combustibil de la 02:30, pentru că ziua lui începea la 03:00 (setHours pe ceasul serverului, care e pe UTC).
  console.log('\n1b. Ziua agenților, pe ora României (nu pe ceasul serverului, care e pe UTC)');
  const _acumAdevarat = Date.now;
  async function ziuaAgentilor(laIso, agent, live) {
    const cerute = [];
    const fals = { getDeviceHistory: async (imei, de) => { cerute.push(de); return []; } };
    Date.now = () => Date.parse(laIso);
    try {
      const r = await agents.runAgent(agent, { db: fals, imeis: ['X'], livePositions: new Map(live ? [['X', live]] : []), alertThresholds: {} });
      return { de: cerute[0], fk: ((r && r.findings) || []).map((f) => f.fkey) };
    } finally { Date.now = _acumAdevarat; }
  }
  const n1 = await ziuaAgentilor('2026-10-22T00:05:00Z', 'watch');   // 03:05, ora României (vara)
  T('RA Watch la 03:05 (ora României, vara): ziua începe la miezul nopții României (21:00 UTC), nu la 3 dimineața', n1.de === '2026-10-21T21:00:00.000Z', n1.de);
  const n2 = await ziuaAgentilor('2026-12-10T00:30:00Z', 'watch');   // 02:30, iarna
  T('…și iarna, la 02:30: de la 22:00 UTC', n2.de === '2026-12-09T22:00:00.000Z', n2.de);
  const n3 = await ziuaAgentilor('2026-10-21T22:00:00Z', 'watch');   // 01:00 pe 22.10
  T('…la 01:00 pe 22.10, „azi" e 22.10 (nu 21.10 de la 3 dimineața)', n3.de === '2026-10-21T21:00:00.000Z', n3.de);
  const liberLa = (iso) => ({ timestamp: new Date(Date.parse(iso) - 60000).toISOString(), speed: 0 });
  const d1 = await ziuaAgentilor('2026-10-22T09:30:00Z', 'dispatch', liberLa('2026-10-22T09:30:00Z'));   // 12:30, ora României
  const d2 = await ziuaAgentilor('2026-10-22T08:30:00Z', 'dispatch', liberLa('2026-10-22T08:30:00Z'));   // 11:30
  T('RA Dispatch: „nefolosit azi" după ora 12 a ROMÂNIEI (la 12:30 da, la 11:30 nu)', d1.fk.includes('disp_idle_X') && !d2.fk.includes('disp_idle_X'), JSON.stringify([d1.fk, d2.fk]));
  T('agents.js nu mai socotește ziua sau ora pe ceasul serverului (fără setHours, fără new Date().getHours())', !/setHours\(0,\s*0,\s*0,\s*0\)/.test(AG) && !/new Date\(\)\.getHours\(\)/.test(AG));

  let pornit = false;
  for (let i = 0; i < 360 && !pornit; i++) { try { const r = await fetch(B + '/api'); if (r.ok) pornit = true; } catch (e) {} if (!pornit) await sleep(500); }
  if (!pornit) { console.log('serverul nu a pornit'); return gata(1); }
  console.log('\n5. Pe server pornit (modelul simulat: orice cerere către el se numără; trebuie să rămână ZERO)');
  const S = await login('admin', 'test1234');
  if (!S) { console.log('nu m-am putut autentifica ca super-admin'); return gata(1); }
  await json('POST', '/api/ai/config', S, { key: 'sk-ant-proba-fara-retea' });
  const PAROLA = 'Str4da-Verde-2026';
  async function om(username, role, companyId) {
    const r = await json('POST', '/api/users', S, { username, full_name: username.split('@')[0], role, company_id: companyId });
    if (r.j && r.j.link) await puneParola(r.j, PAROLA, B);
    return Object.assign({}, r.j, { ck: await login(username, PAROLA) });
  }
  // Firma pe Basic: trei mașini (două Logan-uri, ca să se vadă alegerea), un administrator cu cont, un manager fără.
  const coB = (await json('POST', '/api/companies', S, { name: 'Firma Basic SRL' })).j;
  await json('PUT', '/api/companies/' + coB.id + '/settings', S, { ai_pachet: { cod: 'basic' } });
  const MAS = [['350000000071001', 'Dacia Logan', 'B 101 BAS'], ['350000000071002', 'Dacia Logan', 'B 202 BAS'], ['350000000071003', 'Ford Transit', 'B 303 BAS'], ['350000000071004', 'VW Caddy', 'B 404 BAS']];
  await json('POST', '/api/devices/import', S, { rows: MAS.map((m) => ({ imei: m[0], nume: m[1], nr_inmatriculare: m[2] })) });
  for (const m of MAS) await json('PUT', '/api/devices/' + m[0] + '/company', S, { company_id: coB.id });
  const adm = await om('sef@basic.ro', 'company_admin', coB.id);
  const man = await om('dispecer@basic.ro', 'manager', coB.id);
  await json('PUT', '/api/users/' + adm.id + '/ai-seat', S, { on: true });
  // Datele „de azi" trebuie să încapă în ziua ROMÂNIEI: în primele 7 minute după miezul nopții (ora României) proba așteaptă
  // să treacă, altfel drumul de acum 6 minute ar fi „ieri" — corect pentru aplicație, greșit pentru datele probei.
  const dupaMiezulNoptii = (Date.now() - Date.parse(I.perioada({ period: 'today' }, Date.now()).from)) / 60000;
  if (dupaMiezulNoptii < 7) { console.log('  (aștept ' + Math.ceil(7 - dupaMiezulNoptii) + ' min: e imediat după miezul nopții, ora României)'); await sleep((7 - dupaMiezulNoptii) * 60000 + 2000); }
  const t = Date.now();
  // B 101: drum azi, apoi oprit acum (liberă). B 202: tăcută de 2 ore. B 303: scădere de combustibil azi (80 → 40 l), în ultimele
  // 3 minute. B 404: n-a transmis niciodată.
  for (let k = 0; k < 6; k++) await json('POST', '/api/test/simulate', S, { imei: MAS[0][0], name: MAS[0][1], speed: k < 5 ? 50 : 0, io: { ignition: k < 5 ? 1 : 0 }, ts: new Date(t - (6 - k) * 60000).toISOString(), lat: 44.43 + k * 0.01, lng: 26.1 });
  await json('POST', '/api/test/simulate', S, { imei: MAS[1][0], name: MAS[1][1], speed: 0, io: { ignition: 0 }, ts: new Date(t - 120 * 60000).toISOString() });
  for (const [i, l] of [[0, 80], [1, 79.5], [2, 40]]) await json('POST', '/api/test/simulate', S, { imei: MAS[2][0], name: MAS[2][1], speed: 0, io: { ignition: 0, fuel_level_liters: l }, ts: new Date(t - (3 - i) * 60000).toISOString() });
  T('pregătire: firma pe Basic, patru mașini, administratorul cu cont, managerul fără', !!(coB.id && adm.ck && man.ck));
  const me1 = await json('GET', '/api/me', adm.ck), me2 = await json('GET', '/api/me', man.ck), me0 = await json('GET', '/api/me', S);
  T('/api/me: `aiCont` la administratorul cu cont (meniul fără „Agenți AI"), nu la manager și nu la noi', me1.j.aiCont === true && me2.j.aiCont === false && me0.j.aiCont === false, [me1.j.aiCont, me2.j.aiCont, me0.j.aiCont].join(','));

  const q0 = (await json('GET', '/api/ai/quota', adm.ck)).j;
  // a) cererea de raport
  const r1 = await json('POST', '/api/insight/intreaba', adm.ck, { message: 'Fă-mi foaia de parcurs pentru B 101 BAS, azi', nou: true });
  const rp = r1.j.raport || {};
  T('„Fă-mi foaia de parcurs pentru B 101 BAS, azi" → pe reguli, cu cartonașul raportului', r1.status === 200 && r1.j.source === 'reguli' && rp.label === 'Foaie de parcurs' && /B 101 BAS/.test(rp.vehicul || '') && rp.perioada === 'azi' && Number(rp.id) > 0 && Array.isArray(rp.kpi), r1.status + ' ' + r1.text.slice(0, 300));
  T('…răspunsul spune ce a făcut și până când stă în Istoric', /Am făcut raportul \*\*„Foaie de parcurs”\*\* pentru \*\*B 101 BAS/.test(r1.j.reply || '') && /Istoric rapoarte/.test(r1.j.reply || '') && /^\d{2}\.\d{2}$/.test(rp.pana || ''), r1.j.reply);
  T('…„Am înțeles" spune raportul, mașina și perioada', (r1.j.inteles || []).map((x) => x.text).join(' | ') === 'Foaie de parcurs | B 101 BAS · Dacia Logan | azi', (r1.j.inteles || []).map((x) => x.text).join(' | '));
  const ist = await json('GET', '/api/reports/history', adm.ck);
  const rand = (Array.isArray(ist.j) ? ist.j : []).find((h) => h.id === rp.id);
  T('raportul e în Istoric rapoarte, cu eticheta „din RA Insight" (status) și 7 zile', !!rand && rand.status === 'insight' && rand.report_type === 'trips' && Math.round((Date.parse(rand.expires_at) - Date.parse(rand.generated_at)) / 86400000) === 7, JSON.stringify(rand));
  const vz = await json('GET', '/api/reports/history/' + rp.id, adm.ck);
  const xl = await json('GET', '/api/reports/history/' + rp.id + '?format=xlsx', adm.ck);
  T('„Deschide raportul" îl găsește întreg, iar „Descarcă Excel" dă fișierul (același drum ca din Istoric)', vz.status === 200 && vz.j.report && Array.isArray(vz.j.report.rows) && xl.status === 200 && /spreadsheet/.test(xl.tip), vz.status + ' ' + xl.status + ' ' + xl.tip);
  T('…și n-a mers la model; pe Basic nu se numără', nModel() === 0 && (await json('GET', '/api/ai/quota', adm.ck)).j.used === q0.used, nModel() + ' / ' + q0.used);
  const cid = r1.j.conversatieId;
  T('continuările de sub cartonaș: perioada dinainte și toată flota', (r1.j.urmari || []).map((x) => x.text).join(' | ') === 'Și ziua dinainte? | Și pentru toată flota?', (r1.j.urmari || []).map((x) => x.text).join(' | '));
  const r2 = await json('POST', '/api/insight/intreaba', adm.ck, { message: 'Și pentru toată flota?', conversatieId: cid, buton: true });
  T('„Și pentru toată flota?" → același raport, pe toată flota, alt rând în Istoric', r2.status === 200 && (r2.j.raport || {}).vehicul === 'toată flota' && (r2.j.raport || {}).label === 'Foaie de parcurs' && r2.j.raport.id !== rp.id, r2.text.slice(0, 200));
  const r3 = await json('POST', '/api/insight/intreaba', adm.ck, { message: 'Și ziua dinainte?', conversatieId: cid, buton: true });
  T('„Și ziua dinainte?" → același raport, ieri', r3.status === 200 && (r3.j.raport || {}).perioada === 'ieri', r3.text.slice(0, 200));
  const a1 = await json('POST', '/api/insight/intreaba', adm.ck, { message: 'Fă-mi foaia de parcurs pentru Logan, azi', nou: true });
  T('„…pentru Logan" (sunt două): întreabă care, cu butoane, fără raport', a1.status === 200 && !a1.j.raport && (a1.j.alege || []).length === 2 && /Pentru care fac raportul/.test(a1.j.reply || ''), a1.text.slice(0, 200));
  const a2 = await json('POST', '/api/insight/intreaba', adm.ck, { message: 'B 202 BAS', conversatieId: a1.j.conversatieId, buton: true });
  T('…mașina aleasă primește raportul cerut', a2.status === 200 && /B 202 BAS/.test((a2.j.raport || {}).vehicul || '') && (a2.j.raport || {}).label === 'Foaie de parcurs', a2.text.slice(0, 200));
  const conv = await json('GET', '/api/insight/conversatii/' + cid, adm.ck);
  T('cartonașul rămâne în conversație (se vede și la redeschidere)', (conv.j.mesaje || []).some((m) => m.extra && m.extra.raport && m.extra.raport.id === rp.id));
  const lst = await json('GET', '/api/insight/rapoarte', adm.ck);
  T('butonul „Raport": lista rapoartelor care se pot cere (fără Hotspot și CAN detaliat), fiecare cu textul pus în casetă', lst.status === 200 && (lst.j.rapoarte || []).length === Object.keys(reports.REPORTS).length - 2 && !(lst.j.rapoarte || []).some((x) => x.tip === 'hotspot' || x.tip === 'can_detail') && (lst.j.rapoarte || []).every((x) => /^Fă-mi raportul „/.test(x.pune)), lst.text.slice(0, 160));
  const fara = await json('POST', '/api/insight/intreaba', man.ck, { message: 'Fă-mi foaia de parcurs, azi', nou: true });
  T('omul fără cont RA Insight nu ajunge la cerere (403, cine îi poate da acces)', fara.status === 403 && fara.j.seatMissing === true, fara.status);

  // b) „Azi la tine"
  await json('POST', '/api/agents/run', adm.ck, { agent: 'watch' });   // RA Watch scrie scăderea de azi (ca din oră în oră)
  const qA = (await json('GET', '/api/ai/quota', adm.ck)).j;
  const az = await json('GET', '/api/insight/azi', adm.ck);
  const tx = (az.j.randuri || []).map((r) => r.text).join(' ¦ ');
  T('„Azi la tine": mașina tăcută de 2 ore (cea care n-a transmis niciodată nu e „tăcută")', az.status === 200 && /\*\*B 202 BAS · Dacia Logan\*\* nu transmite de 2 h/.test(tx) && !/B 404 BAS/.test(tx), az.status + ' ' + tx);
  T('…scăderea de combustibil scrisă de RA Watch azi, cu „De ce?"', (az.j.randuri || []).some((r) => r.agent === 'watch' && /combustibil/.test(r.text) && /B 303 BAS|Ford Transit/.test(r.text) && r.butoane.some((b) => b.fel === 'dece')), tx);
  T('…mașinile libere acum (RA Dispatch) încap a treia; ziua de ieri nu mai încape (cel mult trei rânduri, ce cere atenție întâi)', /sunt libere acum|e liberă acum/.test(tx) && (az.j.randuri || []).length === 3 && !(az.j.randuri || []).some((r) => r.cheie === 'ieri') && az.j.deVazut === 2, tx + ' · ' + az.j.deVazut);
  T('…cheile punctului mov (tăcută, combustibil) și ora socotelii', (az.j.chei || []).length >= 2 && !isNaN(Date.parse(az.j.la)), JSON.stringify(az.j.chei));
  T('…nu se numără și nu merge la model', nModel() === 0 && (await json('GET', '/api/ai/quota', adm.ck)).j.used === qA.used);
  T('noi (super-admin) n-avem o flotă pentru „Azi la tine": răspuns gol', (await json('GET', '/api/insight/azi', S)).j.platforma === true);
  T('omul fără cont: 403', (await json('GET', '/api/insight/azi', man.ck)).status === 403);

  // c) Start: cererea de raport se numără din cele 50
  const coS = (await json('POST', '/api/companies', S, { name: 'Firma Start SRL' })).j;
  await json('POST', '/api/devices/import', S, { rows: [{ imei: '350000000071101', nume: 'Dacia Logan', nr_inmatriculare: 'B 101 STA' }] });
  await json('PUT', '/api/devices/350000000071101/company', S, { company_id: coS.id });
  const admS = await om('sef@start.ro', 'company_admin', coS.id);
  const qs0 = (await json('GET', '/api/ai/quota', admS.ck)).j;
  const s1 = await json('POST', '/api/insight/intreaba', admS.ck, { message: 'Fă-mi raportul „Staționări” pentru toată flota, ieri', nou: true });
  const qs1 = (await json('GET', '/api/ai/quota', admS.ck)).j;
  T('pe Start, cererea de raport se face pe reguli și se numără din cele 50', s1.status === 200 && (s1.j.raport || {}).label === 'Staționări' && qs0.pachet && qs0.pachet.cod === 'start' && qs1.used === qs0.used + 1 && s1.j.pachet && s1.j.pachet.ramase === 49, s1.status + ' ' + JSON.stringify([qs0.used, qs1.used, s1.j.pachet]));

  // d) „Azi" pe ora României și în restul aplicației (A, 23.10; Alin: „da, le rezolvăm"): Tabloul de bord, fișa mașinii de pe hartă,
  //    raportul vechi pe o mașină și întrebările gata făcute ale telefonului vechi socoteau „azi" cu setHours pe serverul pe UTC
  //    (de la 3 dimineața, vara). O mașină merge de la 23:40 la 23:45 (ieri) și de la 00:01 la 00:02 (azi, ora României): „azi"
  //    trebuie să numere DOAR al doilea drum, oricând rulează proba (după 03:00 regula veche nu-l vedea; înainte de 03:00 le număra
  //    pe amândouă, plus drumul dintre ele).
  console.log('\n5d. „Azi" pe ora României: Tabloul de bord, fișa mașinii, raportul vechi, întrebările vechi ale telefonului');
  const coO = (await json('POST', '/api/companies', S, { name: 'Firma Ora SRL' })).j;
  const IO = '350000000071201';
  await json('POST', '/api/devices/import', S, { rows: [{ imei: IO, nume: 'Dacia Duster', nr_inmatriculare: 'B 201 ORA' }] });
  await json('PUT', '/api/devices/' + IO + '/company', S, { company_id: coO.id });
  const z0 = Date.parse(I.perioada({ period: 'today' }, Date.now()).from);
  for (const [min, lat] of [[-20, 44.40], [-15, 44.41], [1, 44.42], [2, 44.43]]) await json('POST', '/api/test/simulate', S, { imei: IO, name: 'Dacia Duster', speed: 50, io: { ignition: 1 }, ts: new Date(z0 + min * 60000).toISOString(), lat: lat, lng: 26.1 });
  const kmAzi = (x) => Number(x) > 1.0 && Number(x) < 1.25;   // 0,01° de latitudine ≈ 1,11 km: doar drumul de după miezul nopții
  const ziRO = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Bucharest' });
  const st = await json('GET', '/api/stats/' + IO, S);
  T('fișa mașinii de pe hartă: „azi" = de la miezul nopții României (doar drumul de la 00:01), cu ziua României', st.status === 200 && kmAzi(st.j.totalKm) && st.j.date === ziRO, st.status + ' ' + JSON.stringify({ km: st.j.totalKm, date: st.j.date, ziRO }));
  const db0 = await json('GET', '/api/dashboard?companyId=' + coO.id, S);
  const dv = ((db0.j && db0.j.devices) || []).find((d) => d.imei === IO) || {};
  T('Tabloul de bord: km de azi ai mașinii, la fel', db0.status === 200 && kmAzi(dv.km), db0.status + ' ' + JSON.stringify(dv).slice(0, 160));
  const rv = await json('GET', '/api/report/' + IO, S);
  T('raportul vechi pe o mașină, fără perioadă: de la miezul nopții României', rv.status === 200 && rv.j.from === new Date(z0).toISOString() && kmAzi(rv.j.totalKm), rv.status + ' ' + JSON.stringify({ from: rv.j.from, km: rv.j.totalKm }));
  const pk = await json('POST', '/api/insight/run', S, { key: 'km' }), pc = await json('POST', '/api/insight/run', S, { key: 'costuri' });
  T('întrebările vechi ale telefonului: „săptămâna asta" și „luna asta" pe ora României (aceeași regulă ca RA Insight)', pk.status === 200 && pc.status === 200 && (pk.j.period || {}).from === I.perioada({ period: 'this_week' }, Date.now()).from && (pc.j.period || {}).from === I.perioada({ period: 'this_month' }, Date.now()).from, JSON.stringify([pk.j.period, pc.j.period]));
  // Panoul tehnic al nostru (io-peek) era singurul rămas cu setHours — întrebat pe 23.10, Alin: „rezolvă-le".
  const pk2 = await json('GET', '/api/admin/io-peek?q=' + IO, S);
  T('panoul tehnic al nostru (io-peek): „azi" tot de la miezul nopții României — doar cele două poziții de după 00:00', pk2.status === 200 && pk2.j.today_debug && pk2.j.today_debug.points === 2, pk2.status + ' ' + JSON.stringify(pk2.j && pk2.j.today_debug));
  T('…și în server.js nu mai e niciun „azi" socotit cu setHours', (SRV.match(/setHours\(0,\s*0,\s*0,\s*0\)/g) || []).length === 0 && /const dayStart = new Date\(insight\.perioada\(\{ period: 'today' \}, Date\.now\(\)\)\.from\);/.test(SRV.split("app.get('/api/admin/io-peek'")[1] || '') && /function _insightPeriod\(p\) \{ return insight\.perioada\(\{ period: p \}, Date\.now\(\)\); \}/.test(SRV), (SRV.match(/setHours\(0,\s*0,\s*0,\s*0\)/g) || []).length);
  T('ZERO cereri către model în toată proba', nModel() === 0, nModel());

  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate.');
  gata(rele ? 1 : 0);
})().catch((e) => { console.log('  ✗ proba a crăpat: ' + (e && e.stack || e)); gata(1); });
