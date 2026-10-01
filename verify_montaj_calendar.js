// verify_montaj_calendar.js — calendarul de montaj din Business → Montaj (Alin, 30.09).
//
//   node verify_montaj_calendar.js
//
// Alin: „în secțiunea Montaj, calendar de programare… să pot selecta eu ziua, și să-mi arate jos ce am de instalat
// și disponibilitatea". Calendarul e SINGURUL loc în care se programează montajul unui contract SEMNAT: fiecare zi
// programată e o lucrare („programat"), iar ce mai e de programat se socotește din Anexa nr. 2 minus lucrări.
// Proba: regula (montaj.js), ecranul (index.html) și tot drumul pe server pornit.
//
// Refăcut pe 01.10 (macheta aprobată de Alin: „ca în imagini — da"; „ajung cele două [motive] — și buton
// reprogramează"): apeși pe o zi și se deschide FEREASTRA ei; o zi programată are două confirmări (instalatorul,
// clientul), se mută, se trece montată sau se ANULEAZĂ cu motivul ei — nu se mai șterge — și rămâne în „Istoric",
// de unde se reprogramează. Textele (confirmări, istoric, ce are instalatorul în ziua aia, nota de stoc) le scrie
// serverul; ecranele doar le arată.

const fs = require('fs');
const { spawn } = require('child_process');
const M = require('./montaj.js');
const C = require('./contracts.js');
const { puneParola } = require('./test_parola');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);
const html = fs.readFileSync('./public/index.html', 'utf8');
const server = fs.readFileSync('./server.js', 'utf8');
const css = fs.readFileSync('./public/css/app.css', 'utf8');

sect('1. Regula (montaj.js)');
T('„montată" înseamnă aceleași stări ca în drumul clientului și termen (contracts.MONTAJ_EXECUTAT)', JSON.stringify(M.STARI_MONTATE) === JSON.stringify(C.MONTAJ_EXECUTAT));
const anexa = { items: [{ tip: 'gps', buc: 50, pretClient: 100 }, { tip: 'lvcan', buc: 30, pretClient: 60 }, { tip: 'deplasare', buc: 1, pretClient: 200 }] };
const luc = [
  { status: 'programat', items: [{ tip: 'gps', buc: 10 }, { tip: 'lvcan', buc: 6 }] },
  { status: 'executat', items: [{ tip: 'gps', buc: 15 }, { tip: 'lvcan', buc: 9 }] },
  { status: 'facturat_clientului', items: [{ tip: 'gps', buc: 5 }, { tip: 'lvcan', buc: 3 }] },
  { status: 'executat', items: JSON.stringify([{ tip: 'deplasare', buc: 1 }]) }
];
const s = M.deProgramat(anexa, luc);
T('din 50 de mașini: 20 montate, 10 programate, 20 de programat', s.masini === 50 && s.montate === 20 && s.programate === 10 && s.ramase === 20, JSON.stringify(s));
const lv = s.tipuri.filter((t) => t.tip === 'lvcan')[0] || {};
T('adaptoarele: 30 în anexă, 12 montate, 6 programate, 12 rămase, 0,6 pe mașină (nu toate mașinile au)', lv.inAnexa === 30 && lv.montate === 12 && lv.programate === 6 && lv.ramase === 12 && lv.peMasina === 0.6, JSON.stringify(lv));
T('deplasarea nu se împarte pe zile (nu e „pe mașină")', !s.tipuri.some((t) => t.tip === 'deplasare'));
T('anexa venită ca text din bază se citește la fel', M.deProgramat(JSON.stringify(anexa), luc).ramase === 20);
T('fără montaj de aparat în anexă → 0 mașini', M.deProgramat({ items: [{ tip: 'deplasare', buc: 1 }] }, []).masini === 0 && M.deProgramat(null, []).masini === 0);
const z = M.lucrareaZilei(s, { gps: 10, lvcan: 6 }, { gps: 60, lvcan: 40 });
T('ziua: prețul clientului din anexă, costul din tarifele instalatorului', JSON.stringify(z.items) === JSON.stringify([{ tip: 'gps', buc: 10, pretClient: 100, costPartener: 60 }, { tip: 'lvcan', buc: 6, pretClient: 60, costPartener: 40 }]), JSON.stringify(z));
T('instalator fără tarife → costul rămâne necunoscut (nu 0)', M.lucrareaZilei(s, { gps: 1 }, {}).items[0].costPartener === null);
T('peste ce a rămas → refuz, românește: „doar 20 de mașini"', M.lucrareaZilei(s, { gps: 21 }).eroare === 'Au mai rămas de programat doar 20 de mașini.', M.lucrareaZilei(s, { gps: 21 }).eroare);
T('adaptoare peste ce a rămas → refuz pe nume', M.lucrareaZilei(s, { gps: 1, lvcan: 13 }).eroare === 'Instalare modul LV-CAN: au mai rămas doar 12 bucăți.', M.lucrareaZilei(s, { gps: 1, lvcan: 13 }).eroare);
T('fără mașini → cere câte', /Scrie câte mașini/.test(M.lucrareaZilei(s, { gps: 0 }).eroare || '') && /Scrie câte mașini/.test(M.lucrareaZilei(s, {}).eroare || ''));
const tot = M.deProgramat({ items: [{ tip: 'gps', buc: 2 }] }, [{ status: 'programat', items: [{ tip: 'gps', buc: 2 }] }]);
T('totul programat → „Toate mașinile contractului sunt deja programate."', M.lucrareaZilei(tot, { gps: 1 }).eroare === 'Toate mașinile contractului sunt deja programate.');
const sc = M.scaleazaLaMontate([{ tip: 'gps', buc: 10, pretClient: 100 }, { tip: 'lvcan', buc: 6, pretClient: 60 }, { tip: 'deplasare', buc: 1, pretClient: 200 }], 8);
T('„montată" 8 din 10: GPS 8, adaptoare 5 (6 × 8/10), deplasarea neatinsă', JSON.stringify(sc.map((r) => r.tip + ':' + r.buc)) === JSON.stringify(['gps:8', 'lvcan:5', 'deplasare:1']), JSON.stringify(sc));
T('„montată" cu toate → lucrarea neschimbată', JSON.stringify(M.scaleazaLaMontate([{ tip: 'gps', buc: 3 }], 3)) === JSON.stringify([{ tip: 'gps', buc: 3 }]));
// 01.10 — anularea: o zi anulată nu ține mașini (se întorc la „de programat") și nu e o stare de ales în fișă
T('o zi anulată nu ține mașini: se întorc la „de programat"', M.deProgramat(anexa, luc.concat([{ status: 'anulat', items: [{ tip: 'gps', buc: 20 }, { tip: 'lvcan', buc: 12 }] }])).ramase === 20);
T('„anulată" are etichetă, dar NU e în lista stărilor din fișă (se anulează doar din calendar, cu motiv)', M.ETICHETE_STARE.anulat === 'anulată' && M.STARI.indexOf('anulat') < 0 && M.STARE_ANULAT === 'anulat');
T('motivele anulării sunt DOUĂ (Alin, 01.10: „ajung cele două"): instalatorul nu poate, clientul nu poate', JSON.stringify(Object.keys(M.MOTIVE_ANULARE)) === JSON.stringify(['instalator', 'client']) &&
  M.MOTIVE_ANULARE.instalator === 'Instalatorul nu poate' && M.MOTIVE_ANULARE.client === 'Clientul nu poate (mașinile nu sunt disponibile)');
// Confirmările: verde = amândoi, galben = mai lipsește una; o zi montată sau anulată nu mai are confirmări
const cf = (i, c, st) => ({ status: st || 'programat', confirmat_instalator_la: i ? 1700000000000 : null, confirmat_client_la: c ? '1700000000000' : null });
T('confirmările: amândoi → „confirmat de instalator și de client" (verde)', M.stareConfirmare(cf(1, 1)) === 'confirmat' && M.textConfirmare(cf(1, 1)) === 'confirmat de instalator și de client');
T('confirmările: lipsește una → galben, cu numele celui care lipsește', M.stareConfirmare(cf(1, 0)) === 'de_confirmat' && M.textConfirmare(cf(1, 0)) === 'lipsește confirmarea clientului' &&
  M.stareConfirmare(cf(0, 1)) === 'de_confirmat' && M.textConfirmare(cf(0, 1)) === 'lipsește confirmarea instalatorului' && M.textConfirmare(cf(0, 0)) === 'neconfirmat încă');
T('o zi montată sau anulată nu are stare de confirmare', M.stareConfirmare(cf(1, 1, 'executat')) === null && M.stareConfirmare(cf(1, 1, 'anulat')) === null && M.stareConfirmare(null) === null);
// Ce are deja fiecare instalator în fiecare zi: programate + montate; anulatele și „de programat" nu țin pe nimeni ocupat
const inc = M.incarcarePeZile([
  { zi: '2027-03-10', partener_id: 7, status: 'programat', masini: 6, company_name: 'Logistic Nord SRL' },
  { zi: '2027-03-10', partener_id: 7, status: 'executat', masini: 14, company_name: 'Alfa SRL' },
  { zi: '2027-03-10', partener_id: 7, status: 'anulat', masini: 50, company_name: 'Anulat SRL' },
  { zi: '2027-03-10', partener_id: 9, status: 'de_programat', masini: 5, company_name: 'X' },
  { zi: '2027-03-10', partener_id: null, status: 'programat', masini: 5, company_name: 'Fără instalator' },
  { zi: '2027-03-11', partener_id: 9, status: 'programat', masini: 1, company_name: 'Beta SRL' },
]);
T('încărcarea: Instal 7 are 20 de mașini pe 10.03 (6 programate + 14 montate; anulata nu contează), 9 are o mașină pe 11.03',
  inc['2027-03-10'][7].masini === 20 && !inc['2027-03-10'][9] && inc['2027-03-11'][9].masini === 1 && Object.keys(inc['2027-03-10']).length === 1, JSON.stringify(inc));
T('textul încărcării: „are deja 20 de mașini (Logistic Nord SRL, Alfa SRL)" / „are deja 1 mașină (Beta SRL)" / „liber în ziua asta"',
  M.textIncarcare(inc['2027-03-10'][7]) === 'are deja 20 de mașini (Logistic Nord SRL, Alfa SRL)' && M.textIncarcare(inc['2027-03-11'][9]) === 'are deja 1 mașină (Beta SRL)' &&
  M.textIncarcare(null) === 'liber în ziua asta' && M.textIncarcare({ masini: 0 }) === 'liber în ziua asta');
// Ce aparate merg la fiecare fel de lucrare: din Anexa nr. 2 (vândute) sau din chirie
const a2 = { echipamente: { items: [{ tip: 'fmc130', buc: 6 }, { tip: 'lvcan200', buc: 4 }, { tip: 'fmc650', buc: 0 }] } };
T('aparatele contractului: GPS → FMC130 (vândut), adaptor → LV-CAN200; un model cu 0 bucăți nu contează',
  JSON.stringify(M.aparatePeTip(a2, null)) === JSON.stringify({ gps: ['fmc130'], lvcan: ['lvcan200'], caninc: [], fms: [] }));
T('aparatele închiriate (Anexa nr. 1) se numără la fel; fără aparate → liste goale',
  JSON.stringify(M.aparatePeTip(null, { chirie: { aparate: [{ tip: 'fmc650', cant: 2 }] } }).gps) === JSON.stringify(['fmc650']) &&
  JSON.stringify(M.aparatePeTip(null, null)) === JSON.stringify({ gps: [], lvcan: [], caninc: [], fms: [] }) && M.numeScurt('fmc130') === 'FMC130' && M.numeScurt('lvcan200') === 'LV-CAN200');
// Nota de stoc: ce are instalatorul la el și ce trebuie să-i mai duci
const ap = M.aparatePeTip(a2, null);
const ns = (cate, stoc, are) => M.notaStoc(cate, ap, stoc, are === undefined ? true : are);
T('nota de stoc fără instalator: „Alege instalatorul ca să vezi ce aparate are la el din stoc."', ns({ gps: 6 }, {}, false).text === 'Alege instalatorul ca să vezi ce aparate are la el din stoc.' && !ns({ gps: 6 }, {}, false).lipsa.length);
T('nota de stoc: are 6 × FMC130 și 4 × LV-CAN200, ziua cere 6 + 6 → „…: mai trebuie să-i duci 2 × LV-CAN200."',
  ns({ gps: 6, lvcan: 6 }, { fmc130: 6, lvcan200: 4 }).text === 'Are la el din stoc 6 × FMC130 și 4 × LV-CAN200: mai trebuie să-i duci 2 × LV-CAN200.' &&
  JSON.stringify(ns({ gps: 6, lvcan: 6 }, { fmc130: 6, lvcan200: 4 }).lipsa.map((x) => x.tip + ':' + x.n)) === JSON.stringify(['lvcan:2']), ns({ gps: 6, lvcan: 6 }, { fmc130: 6, lvcan200: 4 }).text);
T('nota de stoc: n-are nimic → „N-are la el niciun aparat din stoc: trebuie să-i duci 6 × FMC130 și 6 × LV-CAN200."',
  ns({ gps: 6, lvcan: 6 }, {}).text === 'N-are la el niciun aparat din stoc: trebuie să-i duci 6 × FMC130 și 6 × LV-CAN200.', ns({ gps: 6, lvcan: 6 }, {}).text);
T('nota de stoc: ajunge → „Are la el din stoc 8 × FMC130: ajunge pentru ziua asta."', ns({ gps: 6 }, { fmc130: 8 }).text === 'Are la el din stoc 8 × FMC130: ajunge pentru ziua asta.', ns({ gps: 6 }, { fmc130: 8 }).text);
T('nota de stoc: contract fără aparate de-ale noastre → doar ce are la el', M.notaStoc({ gps: 3 }, M.aparatePeTip(null, null), { fmc130: 2 }, true).text === 'Are la el din stoc 2 × FMC130.' &&
  M.notaStoc({ gps: 3 }, M.aparatePeTip(null, null), {}, true).text === 'N-are la el niciun aparat din stoc.');
// Istoricul: textul și amănuntele le scrie serverul (aceeași funcție pentru noi și, mai târziu, pentru „Refuz" de la instalator)
const ti = M.textIstoric({ status: 'anulat', motiv_anulare: 'instalator', detalii_anulare: '  Bolnav, revine luni ', anulat_de_nume: 'Alin', anulat_zi: '2027-03-08', reprogramat_zi: '2027-03-15', masini: 6 });
T('istoric, anulată: „Anulată — instalatorul nu poate" · „„Bolnav, revine luni” · anulată de Alin, pe 08.03 · reprogramată pe 15.03"',
  ti.text === 'Anulată — instalatorul nu poate' && ti.detaliu === '„Bolnav, revine luni” · anulată de Alin, pe 08.03 · reprogramată pe 15.03' && ti.anulata === true, JSON.stringify(ti));
const tc = M.textIstoric({ status: 'anulat', motiv_anulare: 'client', anulat_zi: '2027-03-08' });
T('istoric, anulată de client, fără amănunte: „Anulată — clientul nu poate" · „anulată, pe 08.03"', tc.text === 'Anulată — clientul nu poate' && tc.detaliu === 'anulată, pe 08.03', JSON.stringify(tc));
T('istoric, montată: „Montată — 1 mașină" / „Montată — 20 de mașini" (+ „facturat clientului" când e cazul)', M.textIstoric({ status: 'executat', masini: 1 }).text === 'Montată — 1 mașină' &&
  M.textIstoric({ status: 'executat', masini: 1 }).detaliu === '' && M.textIstoric({ status: 'facturat_clientului', masini: 20 }).text === 'Montată — 20 de mașini' &&
  M.textIstoric({ status: 'facturat_clientului', masini: 20 }).detaliu === 'facturat clientului' && M.textIstoric({ status: 'facturat_clientului' }).anulata === false);

sect('2. Pe ecran');
T('Calendarul e prima filă din Montaj și se deschide primul', /var MJ_FILE = \[\['calendar', 'Calendar'\], \['parteneri', 'Parteneri'\], \['contracte', 'Contracte cu partenerii'\], \['lucrari', 'Lucrări'\]\];/.test(html) && /var _raxMj = \{ fila: 'calendar',/.test(html));
const bloc = html.slice(html.indexOf('// ── începe „calendarul de montaj"'), html.indexOf('// ── sfârșit „calendarul de montaj"'));
T('blocul calendarului există, între sentinele', bloc.length > 2000);
T('pagina nu socotește ce e de programat și nici prețurile: le cere serverului', /\/api\/montaj\/calendar/.test(bloc) && /\/api\/montaj\/programeaza/.test(bloc) && !/pretClient|costPartener|termenMontaj|deProgramat\(/.test(bloc.replace(/\/\/[^\n]*/g, '')));
T('o zi se programează cu clic (și cu Enter, de la tastatură)', /onclick="raxMjCalZi\(\\'' \+ zi \+ '\\'\)"/.test(bloc) && /onkeydown="if\(event\.key===\\'Enter\\'\)raxMjCalZi/.test(bloc));
T('„jos, ce am de instalat": panoul „Ce ai de montat", cu termenul și butonul pe fiecare client', /<\/i> Ce ai de montat<\/div>/.test(bloc) && /raxMjCalProgrameaza\(' \+ c\.contract_id \+ '\)/.test(bloc) && /esc\(t\.text\)/.test(bloc));
T('disponibilitatea: filtrul pe instalator, stocul de aparate, ce are fiecare instalator în ziua aleasă (textul serverului) și nota de stoc (de la server)',
  /raxMjCalPart\(this\.value\)/.test(bloc) && /Aparate în stoc:/.test(bloc) && /\(d\.incarcare \|\| \{\}\)\[f\.zi\]/.test(bloc) && /esc\(x \? x\.text : d\.textLiber\)/.test(bloc) &&
  /fetch\('\/api\/montaj\/nota-stoc'/.test(bloc) && /id="mjc-nota-stoc"/.test(bloc));
// „Apeși pe o zi și se deschide fereastra ei" (Alin, 01.10): o singură fereastră peste ecran, cu conținutul după stare
T('clicul pe o zi deschide FEREASTRA zilei (peste ecran, dialog), cu „Programează" și ce e deja în ziua aia', /<div class="rax-overlay mjc-ov' \+ \(c\.html \? ' open' : ''\) \+ '" id="mjc-ov"/.test(bloc) &&
  /role="dialog" aria-modal="true"/.test(bloc) && /ov\.classList\.toggle\('open', !!c\.html\)/.test(bloc) && /Deja în ziua asta/.test(bloc) && /window\.raxMjCalZi = function \(zi\) \{/.test(bloc));
T('confirmările vorbite la telefon (instalatorul, clientul): la programare și pe ziua programată', /id="mjc-cinst"/.test(bloc) && /id="mjc-ccli"/.test(bloc) &&
  /confirmat_instalator: !!\(document\.getElementById\('mjc-cinst'\) \|\| \{\}\)\.checked, confirmat_client: !!\(document\.getElementById\('mjc-ccli'\) \|\| \{\}\)\.checked/.test(bloc) && /\/api\/montaje\/' \+ id \+ '\/confirmari'/.test(bloc) && /raxMjCalConfirma\(' \+ l\.id \+ ', \\'instalator\\', this\.checked\)/.test(bloc));
T('o zi programată se mută, se trece „montată" (cu câte) sau se ANULEAZĂ (cu motiv) — nu se mai șterge', /\/api\/montaje\/' \+ id \+ '\/muta'/.test(bloc) && /\/api\/montaje\/' \+ id \+ '\/montata'/.test(bloc) &&
  /\/api\/montaje\/' \+ id \+ '\/anuleaza'/.test(bloc) && !/method: 'DELETE'/.test(bloc) && !/Șterge ziua/.test(bloc));
T('motivele anulării vin de la server (nu sunt scrise în pagină), iar fără motiv nu pleacă nicio cerere', /var mot = d\.motive \|\| \{\};/.test(bloc) &&
  !/Instalatorul nu poate|Clientul nu poate/.test(bloc) && /if \(!a\.motiv\) \{ _mjcMesaj\('Alege motivul anulării\.'\); return; \}/.test(bloc));
T('„Programate / Istoric": zilele încă programate și cele montate sau anulate (textul serverului), „Reprogramează" pe o zi anulată', /raxMjCalFila\(\\'programate\\'\)/.test(bloc) &&
  /raxMjCalFila\(\\'istoric\\'\)/.test(bloc) && /\['toate', 'Toate'\], \['montate', 'Montate'\], \['anulate', 'Anulate'\]/.test(bloc) && /esc\(l\.text \|\| ''\)/.test(bloc) &&
  /l\.poateReprograma \? '<button class="rax-btn" onclick="raxMjCalReprogrameaza\(' \+ l\.id \+ '\)"/.test(bloc) && /\/api\/montaje\/' \+ id \+ '\/reprogrameaza'/.test(bloc));
T('pagina nu-și scrie textele istoricului, ale confirmărilor sau ale încărcării: le arată pe ale serverului', !/textIstoric|textConfirmare|textIncarcare|notaStoc\(|incarcarePeZile/.test(bloc.replace(/\/\/[^\n]*/g, '')) &&
  /esc\(l\.conf_text \|\| ''\)/.test(bloc));
T('„La client" închide întâi fereastra (altfel ar acoperi fișa firmei)', /window\.raxMjCalLaClient = function \(companyId\) \{ raxMjCalRenunt\(\); raxOpenCompanyDetail\(companyId, 'contract'\); \};/.test(bloc));
T('legenda: verde = confirmat, galben = de confirmat, gri = montat', /<span class="mjc-l mjc-ok"><b>10<\/b> confirmat<\/span><span class="mjc-l mjc-conf"><b>10<\/b> de confirmat<\/span><span class="mjc-l mjc-mont"><b>10<\/b> montat<\/span>/.test(bloc) &&
  /function _mjcClasa\(l\) \{ return _mjcMontata\(l\.status\) \? 'mjc-mont' : \(l\.conf === 'confirmat' \? 'mjc-ok' : 'mjc-conf'\); \}/.test(bloc));
const drum = html.slice(html.indexOf('window.raxDrumMontaj'), html.indexOf('window.raxDrumAparate'));
T('„Programează montajul" din drumul clientului duce în calendar, cu clientul ales', /_raxMj\.fila = 'calendar';/.test(drum) && /_raxMj\.cal\.pre = companyId;/.test(drum) && /raxAdminTab\('montaj'\)/.test(drum) && !/raxMontajEdit\(0\)/.test(drum));
T('fișa: la contract semnat, „Programează în calendar"; la nesemnat, formularul lucrării (scrie Anexa nr. 2)', /_raxCtr\.contract\.status === 'activ'\)\s*\? '<button class="rax-btn primary" style="margin-top:10px;" onclick="raxDrumMontaj\(/.test(html) && /: '<button class="rax-btn" style="margin-top:10px;" onclick="raxMontajEdit\(0\)"><i class="fas fa-plus"><\/i> Lucrare de montaj<\/button>'/.test(html));
// Culorile, MĂSURATE din CSS pe amândouă temele (regula casei: „se prinde măsurând, nu privind"). Fundalurile
// transparente se pun peste căsuța zilei (--bg-card), peste weekend (--bg-dark) și peste fereastră/rând (--bg-panel).
const hex = (h) => { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map((c) => c + c).join(''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const culoare = (v) => { v = String(v || '').trim(); if (v[0] === '#') return hex(v).concat(1); const m = /rgba?\(([^)]+)\)/.exec(v); if (!m) return null; const p = m[1].split(',').map(Number); return [p[0], p[1], p[2], p[3] == null ? 1 : p[3]]; };
const peste = (c, f) => c[3] >= 1 ? c.slice(0, 3) : [0, 1, 2].map((i) => c[i] * c[3] + f[i] * (1 - c[3]));
const lum = (c) => { const a = c.map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const varTema = (sel) => { const m = new RegExp(sel.replace(/[.()]/g, (c) => '\\' + c) + '\\s*\\{([\\s\\S]*?)\\}').exec(css); const o = {}; if (m) m[1].replace(/--([\w-]+):\s*([^;]+);/g, (_, k, v) => { o[k] = v.trim(); }); return o; };
const regula = (sel) => { const m = new RegExp('(^|\\n)\\s*' + sel.replace(/[.()]/g, (c) => '\\' + c).replace(/ /g, '\\s+') + '\\s*\\{([^}]*)\\}').exec(css); const o = {}; if (m) m[2].replace(/(color|background|border-color):\s*([^;]+);/g, (_, k, v) => { o[k] = v.trim(); }); return o; };
const TEME = [['închisă', Object.assign({}, varTema(':root'), varTema('body.dark')), ''], ['deschisă', varTema(':root'), 'body:not(.dark) ']];
let cOk = true; const cD = [];
TEME.forEach(([tema, v, pre]) => {
  const fund = { 'căsuță': culoare(v['bg-card']), weekend: culoare(v['bg-dark']), panou: culoare(v['bg-panel']) };
  const masoara = (nume, sel, fundaluri) => {
    const r = Object.assign({}, regula('.raco ' + sel), pre ? regula(pre + '.raco ' + sel) : {});
    const tc = culoare(r.color), bc = r.background ? culoare(r.background) : null;
    if (!tc) { cOk = false; cD.push(tema + ' ' + nume + ': culoare necitită'); return; }
    fundaluri.forEach((k) => {
      const f = fund[k], fond = bc ? peste(bc, f) : f, x = contrast(peste(tc, fond), fond);
      if (!(x >= 4.5)) { cOk = false; cD.push(tema + ' ' + nume + ' pe ' + k + ' = ' + x.toFixed(2)); }
    });
  };
  ['mjc-ok', 'mjc-conf', 'mjc-mont'].forEach((k) => masoara('eticheta ' + k, '.mjc-l.' + k, ['căsuță', 'weekend', 'panou']));
  ['ok', 'conf', 'an'].forEach((k) => masoara('rezultatul „' + k + '"', '.mjc-rez.' + k, ['panou', 'căsuță']));
  masoara('nota de stoc „trebuie să-i duci"', '.mjc-nota.warn', ['panou', 'căsuță']);
  masoara('butonul „Anulează"', '.rax-btn.mjc-anul-btn', ['panou', 'căsuță']);
});
const rosu = regula('.ra-camp .raco .rax-btn.mjc-rosu, .raco .rax-btn.mjc-rosu');
const xr = contrast(culoare(rosu.color || '#000').slice(0, 3), culoare(rosu.background || '#000').slice(0, 3));
T('culorile calendarului (etichetele confirmat / de confirmat / montat, rezultatele din Programate / Istoric, nota de stoc, „Anulează"): ≥ 4,5:1 pe AMBELE teme, și pe weekend',
  cOk && TEME.every(([, v]) => v['bg-card'] && v['bg-dark'] && v['bg-panel']), cD.join('; '));
T('butonul plin „Anulează lucrarea": alb pe roșu, ≥ 4,5:1 (și pe .ra-camp, unde butoanele își pun fundalul lor)', xr >= 4.5 && /^\.ra-camp \.raco \.rax-btn\.mjc-rosu, \.raco \.rax-btn\.mjc-rosu \{/m.test(css.replace(/^\s+/gm, '')), xr.toFixed(2));
T('fiecare culoare nouă are pereche pe tema deschisă (fără ea, culorile închise ar ieși pe alb)', ['.mjc-l.mjc-ok', '.mjc-l.mjc-conf', '.mjc-l.mjc-mont', '.mjc-rez.ok', '.mjc-rez.conf', '.mjc-rez.an', '.mjc-nota.warn', '.rax-btn.mjc-anul-btn']
  .every((sel) => regula('body:not(.dark) .raco ' + sel).color));
T('pe telefon: grila rămâne în pagină (7 coloane care se strâng), numele clientului se ascunde, cifra rămâne', /\.raco \.mjc-grila \{ display: grid; grid-template-columns: repeat\(7, minmax\(0, 1fr\)\);/.test(css) && /\.raco \.mjc-l \.mjc-cl \{ display: none; \}/.test(css));

sect('3. Pe server');
T('rutele calendarului sunt doar pentru noi (super-admin)', /app\.get\('\/api\/montaj\/calendar', requireAuth, requireSuperadmin,/.test(server) &&
  /app\.post\('\/api\/montaj\/programeaza', requireAuth, requireSuperadmin,/.test(server) && /app\.post\('\/api\/montaje\/:id\/muta', requireAuth, requireSuperadmin,/.test(server) &&
  /app\.post\('\/api\/montaje\/:id\/montata', requireAuth, requireSuperadmin,/.test(server) &&
  ['confirmari', 'anuleaza', 'reprogrameaza'].every((r) => new RegExp("app\\.post\\('\\/api\\/montaje\\/:id\\/" + r + "', requireAuth, requireSuperadmin,").test(server)) &&
  /app\.post\('\/api\/montaj\/nota-stoc', requireAuth, requireSuperadmin,/.test(server));
T('anularea are O SINGURĂ funcție (_anuleazaLucrarea): butonul nostru azi, „Refuz" din contul instalatorului mâine (Robert)',
  (server.replace(/\/\/[^\n]*/g, '').match(/_anuleazaLucrarea\(/g) || []).length === 2 && /async function _anuleazaLucrarea\(id, o\) \{/.test(server));
T('o zi programată a unui contract semnat NU se șterge (409, „se anulează din calendar"), iar una anulată e istoric (409)',
  /if \(c && \(c\.status === 'activ' \|\| c\.status === 'incheiat'\)\) return res\.status\(409\)\.json\(\{ anuleaza: true,/.test(server) &&
  /if \(m\.status === montaj\.STARE_ANULAT\) return res\.status\(409\)\.json\(\{ error: 'O zi anulată rămâne în istoric/.test(server));
T('o zi anulată nu se rescrie din fișa clientului și nu se mută / nu se trece montată (se reprogramează)', /if \(ex && ex\.status === montaj\.STARE_ANULAT\) return res\.status\(409\)/.test(server) &&
  (server.match(/if \(m\.status === montaj\.STARE_ANULAT\) return res\.status\(400\)\.json\(\{ error: 'Ziua asta e anulată: se reprogramează din „Istoric"\.' \}\);/g) || []).length === 2);
T('se programează doar un contract semnat (la nesemnat, lucrările scriu încă Anexa nr. 2)', /if \(c\.status !== 'activ'\) return res\.status\(400\)\.json\(\{ error: 'Montajul se programează după semnare/.test(server));

// ─── 4. Pe server pornit ────────────────────────────────────────────────────────────────────
const PORT = 3238, DIR = '.calendar-ci-db';
const envS = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', SESSION_SECRET: 'ci_calendar',
  PORT: String(PORT), TCP_PORT: '5238', PGLITE_DIR: DIR + '/pgdata' };
delete envS.ANTHROPIC_API_KEY; delete envS.DATABASE_URL; delete envS.SMTP_HOST;
try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
const srv = spawn(process.execPath, ['server.js'], { env: envS, stdio: ['ignore', 'ignore', 'inherit'] });
const B = 'http://127.0.0.1:' + PORT;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function gata() {
  try { srv.kill(); } catch (e) {}
  try { fs.rmSync(DIR, { recursive: true, force: true }); } catch (e) {}
  console.log('\n──────────────────────────────');
  console.log(ok + ' verificări trecute, ' + rele + ' picate');
  process.exit(rele ? 1 : 0);
}
async function intra(u, p) {
  const lg = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  const ck = (lg.headers.getSetCookie ? lg.headers.getSetCookie() : [lg.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  return async (m, url, body) => {
    const r = await fetch(B + url, { method: m, headers: { 'Content-Type': 'application/json', Cookie: ck }, body: body ? JSON.stringify(body) : undefined });
    let j = null; try { j = await r.json(); } catch (e) {}
    return { s: r.status, j: j };
  };
}
// Ziua ca în pagină (`_zi`: miezul nopții LOCAL, deci al României) — aici fix, în martie 2027.
const zi = (d) => Date.UTC(2027, 2, d) - 2 * 3600000;
(async () => {
  let pornit = false;
  for (let i = 0; i < 240; i++) { try { if ((await fetch(B + '/api')).ok) { pornit = true; break; } } catch (e) {} await sleep(500); }
  sect('4. Pe server pornit');
  T('serverul pornește', pornit);
  if (!pornit) return gata();
  const R = await intra('admin', 'test1234');
  const part = (await R('POST', '/api/montaj/parteneri', { name: 'Instal Vest SRL', tarife: { gps: 60, lvcan: 40 } })).j || {};
  const of = (await R('POST', '/api/admin/offers', { name: 'Ofertă Calendar', client_name: 'Calendar SRL', monthly_total: 145, currency: 'RON',
    config: { cfg: { nVeh: 5, contractMonths: 12, montaj: { qGps: 5, qLvCan: 3 }, devices: { d130: 5, lvcan: 3 } }, prices: { pPlain: 29, mGps: 100, mLvCan: 60, dFmc130: 45, dLvCan: 20 } } })).j;
  const co = (await R('POST', '/api/companies', { name: 'Calendar SRL' })).j;
  await R('PUT', '/api/companies/' + co.id + '/dosar', { cui: 'RO779', address: 'Str. Calendarului 3', legal_rep: { name: 'Ana Calendar', role: 'Administrator' } });
  const c = (await R('POST', '/api/companies/' + co.id + '/contract', { offer_id: of.id, months: 12,
    din_oferta: { unitati: { plain: 29, can: 29, fms: 29 }, vehicule: [{ fel: 'plain', nume: 'Vehicule GPS (fără CAN)', cant: 5, pret: 29, total: 145 }], servicii: [] } })).j;
  const cal = async () => (await R('GET', '/api/montaj/calendar?luna=2027-03')).j || {};
  const alLui = (x) => ((x.deProgramat || []).filter((d) => d.contract_id === c.id)[0]) || null;
  let k = await cal();
  T('contractul nesemnat nu apare la „De programat"', k.luna === '2027-03' && !alLui(k), JSON.stringify(k.deProgramat));
  const nesemnat = await R('POST', '/api/montaj/programeaza', { contract_id: c.id, data_lucrare: zi(10), partener_id: part.id, cate: { gps: 2 } });
  T('nesemnat → refuz: „Montajul se programează după semnare"', nesemnat.s === 400 && /după semnare/.test((nesemnat.j || {}).error || ''), JSON.stringify(nesemnat));
  await R('PUT', '/api/contracts/' + c.id, { status: 'aprobat' });
  await R('PUT', '/api/contracts/' + c.id, { status: 'trimis' });
  await R('PUT', '/api/contracts/' + c.id, { status: 'activ', signed_at: Date.now() });
  k = await cal();
  let d = alLui(k) || {};
  T('semnat → la „De programat": 5 mașini, toate de programat, adaptoarele 3 (0,6 pe mașină)', d.masini === 5 && d.ramase === 5 && d.programate === 0 &&
    JSON.stringify((d.tipuri || []).map((t) => t.tip + ':' + t.ramase + ':' + t.peMasina)) === JSON.stringify(['gps:5:1', 'lvcan:3:0.6']), JSON.stringify(d));
  T('textul e cel de pe drum: „0 din 5 mașini montate"', d.text === '0 din 5 mașini montate', d.text);
  T('aparatul fiecărei lucrări, din Anexa nr. 2: GPS → FMC130, adaptor → LV-CAN200', JSON.stringify((d.tipuri || []).map((t) => t.tip + ':' + t.aparat)) === JSON.stringify(['gps:FMC130', 'lvcan:LV-CAN200']), JSON.stringify(d.tipuri));
  T('motivele anulării și „liber în ziua asta" vin de la server', JSON.stringify(k.motive) === JSON.stringify(M.MOTIVE_ANULARE) && k.textLiber === 'liber în ziua asta' &&
    Array.isArray(k.programate) && Array.isArray(k.istoric) && k.incarcare && typeof k.incarcare === 'object');
  T('instalatorii și stările vin de la server', (k.parteneri || []).some((p) => p.id === part.id && p.active) && k.stari && k.stari.programat === 'programat');
  const p1 = await R('POST', '/api/montaj/programeaza', { contract_id: c.id, data_lucrare: zi(10), partener_id: part.id, cate: { gps: 3, lvcan: 2 } });
  const l1 = (p1.j || {}).lucrare || {};
  T('ziua programată: 3 GPS + 2 adaptoare, prețul din contract, costul din tarifele instalatorului', p1.s === 200 && l1.status === 'programat' &&
    Number(l1.total_client) === 420 && Number(l1.total_partener) === 260, JSON.stringify(p1));
  k = await cal(); d = alLui(k) || {};
  const inCal = (k.lucrari || []).filter((l) => l.id === l1.id)[0] || {};
  T('apare în calendar pe 10.03, cu 3 mașini și instalatorul', inCal.zi === '2027-03-10' && inCal.masini === 3 && inCal.partener_nume === 'Instal Vest SRL' && inCal.company_name === 'Calendar SRL', JSON.stringify(inCal));
  T('fără bife la programare: „neconfirmat încă" (galben), și la „Programate"', inCal.conf === 'de_confirmat' && inCal.conf_text === 'neconfirmat încă' && inCal.confirmat_instalator === false &&
    (k.programate || []).some((x) => x.id === l1.id && x.conf === 'de_confirmat'), JSON.stringify(inCal));
  T('Instal Vest e ocupat pe 10.03: „are deja 3 mașini (Calendar SRL)"', ((k.incarcare['2027-03-10'] || {})[part.id] || {}).text === 'are deja 3 mașini (Calendar SRL)', JSON.stringify(k.incarcare));
  T('„De programat": 3 programate, 2 rămase (adaptoare: 1)', d.programate === 3 && d.ramase === 2 && ((d.tipuri || [])[1] || {}).ramase === 1, JSON.stringify(d));
  const prea = await R('POST', '/api/montaj/programeaza', { contract_id: c.id, data_lucrare: zi(12), cate: { gps: 3 } });
  T('peste ce a rămas → refuz: „doar 2 mașini"', prea.s === 400 && (prea.j || {}).error === 'Au mai rămas de programat doar 2 mașini.', JSON.stringify(prea));
  const p2 = await R('POST', '/api/montaj/programeaza', { contract_id: c.id, data_lucrare: zi(12), cate: { gps: 2, lvcan: 1 } });
  const l2 = (p2.j || {}).lucrare || {};
  T('fără instalator ales se poate programa (îl alegi mai târziu)', p2.s === 200 && l2.partener_id == null, JSON.stringify(p2));
  const mut = await R('POST', '/api/montaje/' + l2.id + '/muta', { data_lucrare: zi(15), partener_id: part.id });
  k = await cal();
  const m2 = (k.lucrari || []).filter((l) => l.id === l2.id)[0] || {};
  T('mutată pe 15.03, cu instalatorul ales acum (costul din tarifele lui)', mut.s === 200 && m2.zi === '2027-03-15' && m2.partener_id === part.id && Number((mut.j.lucrare || {}).total_partener) === 160, JSON.stringify(mut));
  const mont = await R('POST', '/api/montaje/' + l1.id + '/montata', { masini: 2 });
  k = await cal(); d = alLui(k) || {};
  T('„montată" 2 din 3: una se întoarce la „De programat"', mont.s === 200 && (mont.j || {}).inapoi_la_programat === 1 && d.montate === 2 && d.programate === 2 && d.ramase === 1, JSON.stringify({ r: mont.j && mont.j.inapoi_la_programat, d }));
  const dr = ((((await R('GET', '/api/contracts')).j || {}).contracte || []).filter((x) => x.id === c.id)[0] || {}).drum || {};
  const pasM = (dr.pasi || []).filter((p) => p.cheie === 'montaj')[0] || {};
  T('drumul clientului numără aceleași mașini: „2 din 5 mașini montate"', /^2 din 5 mașini montate/.test(pasM.detaliu || ''), JSON.stringify(pasM));
  T('a doua oară „montată" → refuz', (await R('POST', '/api/montaje/' + l1.id + '/montata', { masini: 1 })).s === 400);
  T('una montată nu se mai mută', (await R('POST', '/api/montaje/' + l1.id + '/muta', { data_lucrare: zi(20) })).s === 400);
  T('„montată" cu mai multe decât erau programate → refuz', (await R('POST', '/api/montaje/' + l2.id + '/montata', { masini: 3 })).s === 400);
  // ─── 01.10: confirmări, anulare cu motiv, istoric, reprogramare, nota de stoc ───
  const ziua = (x, id) => (x.lucrari || []).filter((l) => l.id === id)[0] || {};
  const cI = await R('POST', '/api/montaje/' + l2.id + '/confirmari', { instalator: true });
  k = await cal();
  T('confirmă instalatorul → „lipsește confirmarea clientului"', cI.s === 200 && cI.j.confirmat_instalator === true && cI.j.confirmat_client === false &&
    ziua(k, l2.id).conf === 'de_confirmat' && ziua(k, l2.id).conf_text === 'lipsește confirmarea clientului', JSON.stringify([cI, ziua(k, l2.id)]));
  const cC = await R('POST', '/api/montaje/' + l2.id + '/confirmari', { client: true });
  k = await cal();
  T('și clientul → „confirmat de instalator și de client" (verde)', cC.s === 200 && ziua(k, l2.id).conf === 'confirmat' && ziua(k, l2.id).conf_text === 'confirmat de instalator și de client', JSON.stringify(ziua(k, l2.id)));
  const cX = await R('POST', '/api/montaje/' + l2.id + '/confirmari', { client: false });
  k = await cal();
  T('debifat clientul → înapoi galben, instalatorul rămâne bifat', cX.s === 200 && ziua(k, l2.id).conf === 'de_confirmat' && ziua(k, l2.id).confirmat_instalator === true, JSON.stringify(ziua(k, l2.id)));
  const cM = await R('POST', '/api/montaje/' + l1.id + '/confirmari', { client: true });
  T('o zi montată nu se mai confirmă → 400', cM.s === 400 && /Doar o zi încă programată/.test((cM.j || {}).error || ''), JSON.stringify(cM));
  // Ultima mașină, programată cu amândouă bifele deja puse (vorbit la telefon înainte)
  const p3 = await R('POST', '/api/montaj/programeaza', { contract_id: c.id, data_lucrare: zi(20), partener_id: part.id, cate: { gps: 1, lvcan: 0 }, confirmat_instalator: true, confirmat_client: true });
  const l3 = (p3.j || {}).lucrare || {};
  k = await cal(); d = alLui(k) || {};
  T('programată cu amândouă bifele → verde din prima', p3.s === 200 && ziua(k, l3.id).conf === 'confirmat' && d.ramase === 0, JSON.stringify([p3.s, ziua(k, l3.id), d.ramase]));
  // Nota de stoc: 2 × FMC130 la instalator; ziua cere 3 GPS + 2 adaptoare
  await R('POST', '/api/stoc/intrare', { tip: 'fmc130', serii: '864275079000001\n864275079000002' });
  const st = ((await R('GET', '/api/stoc')).j || {});
  const buc = (st.aparate || []).filter((b) => b.serie === '864275079000001' || b.serie === '864275079000002').map((b) => b.id);
  const mt = await R('POST', '/api/stoc/muta', { ids: buc, stare: 'instalator', partener_id: part.id });
  const n0 = await R('POST', '/api/montaj/nota-stoc', { contract_id: c.id, partener_id: null, cate: { gps: 3, lvcan: 2 } });
  const n1 = await R('POST', '/api/montaj/nota-stoc', { contract_id: c.id, partener_id: part.id, cate: { gps: 3, lvcan: 2 } });
  const n2 = await R('POST', '/api/montaj/nota-stoc', { contract_id: c.id, partener_id: part.id, cate: { gps: 2, lvcan: 0 } });
  T('nota de stoc pe server, cu aparatele de la instalator: „Are la el din stoc 2 × FMC130: mai trebuie să-i duci 1 × FMC130 și 2 × LV-CAN200."',
    buc.length === 2 && mt.s === 200 && n0.j.text === 'Alege instalatorul ca să vezi ce aparate are la el din stoc.' &&
    n1.j.text === 'Are la el din stoc 2 × FMC130: mai trebuie să-i duci 1 × FMC130 și 2 × LV-CAN200.' && n1.j.lipsa.length === 2 &&
    n2.j.text === 'Are la el din stoc 2 × FMC130: ajunge pentru ziua asta.' && !n2.j.lipsa.length, JSON.stringify([buc, mt.s, n0.j, n1.j, n2.j]));
  T('nota de stoc pe un contract care nu există → 404', (await R('POST', '/api/montaj/nota-stoc', { contract_id: 999999, cate: {} })).s === 404);
  // O zi programată (contract semnat) nu se mai șterge: se anulează
  const sters = await R('DELETE', '/api/montaje/' + l2.id);
  T('ștergerea unei zile programate → 409: „se anulează din calendar, cu motivul ei"', sters.s === 409 && (sters.j || {}).anuleaza === true, JSON.stringify(sters));
  const faraMotiv = await R('POST', '/api/montaje/' + l2.id + '/anuleaza', { motiv: 'altceva' });
  T('anulare fără un motiv din cele două → 400', faraMotiv.s === 400 && /^Alege motivul anulării/.test((faraMotiv.j || {}).error || ''), JSON.stringify(faraMotiv));
  const reprogRau = await R('POST', '/api/montaje/' + l2.id + '/anuleaza', { motiv: 'client', reprogramare: { data_lucrare: zi(25), partener_id: 999999 } });
  k = await cal();
  T('„anulează și reprogramează" cu un instalator care nu există → 400, iar ziua rămâne programată (nu se anulează pe jumătate)',
    reprogRau.s === 400 && ziua(k, l2.id).status === 'programat', JSON.stringify([reprogRau, ziua(k, l2.id).status]));
  const an = await R('POST', '/api/montaje/' + l2.id + '/anuleaza', { motiv: 'instalator', detalii: '  Bolnav  ' });
  k = await cal(); d = alLui(k) || {};
  const i2 = (k.istoric || []).filter((x) => x.id === l2.id)[0] || {};
  T('anulată („instalatorul nu poate") → iese din calendar și din „Programate", mașinile se întorc la „Ce ai de montat" (2)',
    an.s === 200 && an.j.reprogramata === null && !ziua(k, l2.id).id && !(k.programate || []).some((x) => x.id === l2.id) && d.programate === 1 && d.ramase === 2, JSON.stringify([an, d]));
  T('istoricul: „Anulată — instalatorul nu poate" · „„Bolnav” · anulată de …, pe ZZ.LL", cu „Reprogramează"', i2.anulata === true && i2.motiv === 'instalator' &&
    i2.text === 'Anulată — instalatorul nu poate' && /^„Bolnav” · anulată( de [^,]+)?, pe \d\d\.\d\d$/.test(i2.detaliu || '') && i2.poateReprograma === true, JSON.stringify(i2));
  const i1 = (k.istoric || []).filter((x) => x.id === l1.id)[0] || {};
  T('istoricul are și ziua montată: „Montată — 2 mașini", fără „Reprogramează"', i1.text === 'Montată — 2 mașini' && i1.anulata === false && i1.poateReprograma === false, JSON.stringify(i1));
  T('Instal Vest e liber pe 15.03 după anulare (o zi anulată nu ține pe nimeni ocupat)', !((k.incarcare['2027-03-15'] || {})[part.id]), JSON.stringify(k.incarcare));
  const pasM2 = ((((((await R('GET', '/api/contracts')).j || {}).contracte || []).filter((x) => x.id === c.id)[0] || {}).drum || {}).pasi || []).filter((p) => p.cheie === 'montaj')[0] || {};
  T('drumul clientului nu numără ziua anulată: tot „2 din 5 mașini montate"', /^2 din 5 mașini montate/.test(pasM2.detaliu || ''), JSON.stringify(pasM2));
  T('a doua anulare → 400 „Ziua asta e deja anulată."', ((await R('POST', '/api/montaje/' + l2.id + '/anuleaza', { motiv: 'client' })).j || {}).error === 'Ziua asta e deja anulată.');
  T('o zi anulată nu se șterge (e istoricul) → 409', (await R('DELETE', '/api/montaje/' + l2.id)).s === 409);
  const muA = await R('POST', '/api/montaje/' + l2.id + '/muta', { data_lucrare: zi(21) });
  const moA = await R('POST', '/api/montaje/' + l2.id + '/montata', { masini: 1 });
  T('o zi anulată nu se mută și nu se trece montată → 400 „Ziua asta e anulată: se reprogramează din „Istoric"."', muA.s === 400 && moA.s === 400 &&
    (muA.j || {}).error === 'Ziua asta e anulată: se reprogramează din „Istoric".' && (moA.j || {}).error === (muA.j || {}).error, JSON.stringify([muA, moA]));
  const fisa = await R('POST', '/api/companies/' + co.id + '/montaje', { id: l2.id, status: 'programat', data_lucrare: zi(21), items: [{ tip: 'gps', buc: 2 }] });
  T('nici din fișa clientului nu se rescrie o zi anulată → 409', fisa.s === 409 && /anulată și stă în istoric/.test((fisa.j || {}).error || ''), JSON.stringify(fisa));
  // Reprogramează din istoric: aceleași mașini, ziua nouă
  const rpg = await R('POST', '/api/montaje/' + l2.id + '/reprogrameaza', { data_lucrare: zi(18), partener_id: part.id });
  k = await cal(); d = alLui(k) || {};
  const r2 = ziua(k, ((rpg.j || {}).reprogramata || {}).id);
  const i2b = (k.istoric || []).filter((x) => x.id === l2.id)[0] || {};
  T('reprogramată pe 18.03 → aceleași 2 mașini (și adaptorul), instalatorul ales, costul din tarifele lui; istoricul: „reprogramată pe 18.03", fără al doilea buton',
    rpg.s === 200 && rpg.j.reprogramata.zi === '2027-03-18' && r2.masini === 2 && r2.partener_id === part.id && r2.status === 'programat' && r2.conf === 'de_confirmat' &&
    JSON.stringify((r2.items || []).map((x) => x.tip + ':' + x.buc)) === JSON.stringify(['gps:2', 'lvcan:1']) && d.programate === 3 && d.ramase === 0 &&
    /reprogramată pe 18\.03$/.test(i2b.detaliu || '') && i2b.poateReprograma === false && i2b.reprogramat_ca === r2.id, JSON.stringify([rpg, r2, i2b, d]));
  const rp2 = await R('POST', '/api/montaje/' + l2.id + '/reprogrameaza', { data_lucrare: zi(19) });
  T('a doua reprogramare a aceleiași zile → 400 „Ziua asta a fost deja reprogramată."', rp2.s === 400 && (rp2.j || {}).error === 'Ziua asta a fost deja reprogramată.', JSON.stringify(rp2));
  const rp3 = await R('POST', '/api/montaje/' + r2.id + '/reprogrameaza', { data_lucrare: zi(19) });
  T('o zi încă programată nu se „reprogramează" (se mută) → 400', rp3.s === 400 && /se mută/.test((rp3.j || {}).error || ''), JSON.stringify(rp3));
  // Anulează și reprogramează dintr-o apăsare (clientul nu poate)
  const ar = await R('POST', '/api/montaje/' + r2.id + '/anuleaza', { motiv: 'client', detalii: '', reprogramare: { data_lucrare: zi(22), partener_id: null } });
  k = await cal(); d = alLui(k) || {};
  const r3 = ziua(k, ((ar.j || {}).reprogramata || {}).id);
  const ir2 = (k.istoric || []).filter((x) => x.id === r2.id)[0] || {};
  T('anulată și reprogramată („clientul nu poate") → ziua nouă pe 22.03, fără instalator; istoricul: „Anulată — clientul nu poate" · „… · reprogramată pe 22.03"',
    ar.s === 200 && ar.j.reprogramata.zi === '2027-03-22' && r3.partener_id == null && r3.masini === 2 && d.programate === 3 && d.ramase === 0 &&
    ir2.text === 'Anulată — clientul nu poate' && /^anulată( de [^,]+)?, pe \d\d\.\d\d · reprogramată pe 22\.03$/.test(ir2.detaliu || '') && ir2.poateReprograma === false, JSON.stringify([ar, r3, ir2]));
  const anL3 = await R('POST', '/api/montaje/' + l3.id + '/anuleaza', { motiv: 'client' });
  k = await cal(); d = alLui(k) || {};
  T('ultima zi anulată fără reprogramare → mașina ei se întoarce la „Ce ai de montat" (1 de programat)', anL3.s === 200 && d.ramase === 1 && d.programate === 2, JSON.stringify(d));
  // Clientul nu vede nimic de aici: calendarul, prețurile și instalatorii sunt ai noștri.
  const u = (await R('POST', '/api/users', { username: 'sef@calendar.ro', full_name: 'Șef Calendar', role: 'company_admin', company_id: co.id })).j;
  await puneParola(u, 'Str4da-Verde-2026', B);
  const Cl = await intra('sef@calendar.ro', 'Str4da-Verde-2026');
  const rc = await Cl('GET', '/api/montaj/calendar?luna=2027-03');
  const rp = await Cl('POST', '/api/montaj/programeaza', { contract_id: c.id, data_lucrare: zi(20), cate: { gps: 1 } });
  const rm = await Cl('POST', '/api/montaje/' + l1.id + '/muta', { data_lucrare: zi(20) });
  const rcf = await Cl('POST', '/api/montaje/' + r3.id + '/confirmari', { client: true });
  const ran = await Cl('POST', '/api/montaje/' + r3.id + '/anuleaza', { motiv: 'client' });
  const rrp = await Cl('POST', '/api/montaje/' + l3.id + '/reprogrameaza', { data_lucrare: zi(25) });
  const rns = await Cl('POST', '/api/montaj/nota-stoc', { contract_id: c.id, partener_id: part.id, cate: { gps: 1 } });
  T('administratorul firmei client nu ajunge la calendar (403 pe toate, și pe confirmări, anulare, reprogramare, nota de stoc)',
    [rc, rp, rm, rcf, ran, rrp, rns].every((x) => x.s === 403), [rc, rp, rm, rcf, ran, rrp, rns].map((x) => x.s).join(','));
  k = await cal();
  T('…iar ziua pe care a încercat s-o anuleze rămâne programată', ziua(k, r3.id).status === 'programat');
  gata();
})().catch((e) => { console.log('✗ EROARE', e); rele++; gata(); });
