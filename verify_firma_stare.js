// verify_firma_stare.js — fereastra firmei: filele „Stare" și „Acces" și simulatorul de încărcare după flotă (12.10).
//
//   node verify_firma_stare.js
//
// Robert (12.10): „un dashboard pentru fiecare companie, accesat din lista firmelor, să se deschidă un modal și acolo
// să ai tot prin taburi" + simulatorul de încărcare „inclus în abonament, dar noi să bifăm la ce au acces" + „1.a"
// (pornit singur la firmele cu camioane, dube sau remorci, oprit la celelalte).
//
// Ce apără proba:
//   1. regula modulului `incarcare` (plans.js): după flotă cât nu l-am ales; alegerea noastră bate automatul; `null`
//      îl întoarce la automat;
//   2. serverul: flota se reîncarcă la fiecare schimbare care o mută; rutele trimit „ales de noi / după flotă";
//      RA Insight în „Stare" e doar numere;
//   3. web-ul: „Stare" prima, „Acces" ultima; comutatoarele s-au MUTAT în „Acces" (panoul separat a plecat, butoanele
//      vechi duc acolo);
//   4. telefonul: aceleași file, aceeași ordine, aceeași cale;
//   5. modulele și vorbele „automat / ales de noi" — aceleași pe web și pe telefon;
//   6. cartonașele „Stării" — socoteala paginii și a telefonului, RULATE pe aceleași firme, dau același rezultat;
//   7. pe server pornit: un camion pornește simulatorul, alegerea noastră îl oprește, „înapoi la automat" îl repornește.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawn } = require('child_process');

const ROOT = __dirname;
const citeste = (p) => { try { return fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n'); } catch (e) { return ''; } };
let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + String(d).slice(0, 900) : '')); } };
const sect = (s) => console.log('\n' + s);
const J = (x) => JSON.stringify(x);
// La comparat cartonașele contează ce scrie în ele, nu ordinea în care au fost puse cheile în obiect.
const JC = (x) => JSON.stringify(x, function (k, v) { return (v && typeof v === 'object' && !Array.isArray(v)) ? Object.keys(v).sort().reduce(function (o, kk) { o[kk] = v[kk]; return o; }, {}) : v; });

const html = citeste('public/index.html');
const server = citeste('server.js');
const plansSrc = citeste('plans.js');
const sheet = citeste('mobile/src/screens/CompanySheet.tsx');
const editTel = citeste('mobile/src/components/CompanyEdit.tsx');
const libComp = citeste('mobile/src/lib/companii.ts');
const libSemnal = citeste('mobile/src/lib/semnal.ts');
const endpoints = citeste('mobile/src/api/endpoints.ts');

sect('0. Fișierele');
T('toate fișierele citite de probă există', [html, server, plansSrc, sheet, editTel, libComp, libSemnal, endpoints].every(Boolean));

// ─── 1. Regula modulului ─────────────────────────────────────────────────────────────────────────────────────────
sect('1. Simulatorul de încărcare: după flotă, cât nu l-am ales noi');
const plans = require('./plans.js');
T('modulul `incarcare` e în lista modulelor', plans.FEATURE_KEYS.indexOf('incarcare') >= 0);
T('și e singurul care merge după flotă', J(plans.FEATURE_DUPA_FLOTA) === J(['incarcare']));
const firma = (id, f) => ({ id: id, settings: f ? { features: f } : {} });
plans.setFlotaGrea([]);
T('fără vehicule care cară marfă: oprit', plans.featuresFor(firma(901)).incarcare === false);
plans.setFlotaGrea([901]);
T('cu camioane / dube / remorci: pornit singur', plans.featuresFor(firma(901)).incarcare === true);
T('ales de noi „oprit" bate flota', plans.featuresFor(firma(901, { incarcare: false })).incarcare === false);
plans.setFlotaGrea([]);
T('ales de noi „pornit" bate lipsa flotei', plans.featuresFor(firma(901, { incarcare: true })).incarcare === true);
T('celelalte module își păstrează implicitul (agenții porniți, restul oprite)',
  J(plans.featuresFor(firma(902))) === J({ agents: true, ai_assistant: false, etransport: false, tahograf: false, etoll: false, incarcare: false }));
T('„ales de noi" = doar cheile scrise', J(plans.featuresSetate(firma(903, { incarcare: false, agents: true, nimic: 1 }))) === J({ agents: true, incarcare: false }));
T('felurile care cară marfă: autotractor, camion, TIR, dubă, remorcă (și scrierile vechi)',
  ['Autotractor', 'Camion', 'TIR', 'Duba', 'Remorca', 'truck', 'van', 'trailer'].every((t) => plans.TIPURI_CU_MARFA.indexOf(t) >= 0) &&
  ['Auto', 'Autobuz', 'Utilaj', 'Tractor', 'Remorcă tehnologică'].every((t) => plans.TIPURI_CU_MARFA.indexOf(t) < 0));
plans.setFlotaGreaFirma(904, true);
T('o firmă se poate trece pe loc (fișa firmei, cu flota în mână)', plans.areFlotaGrea(904) && !plans.areFlotaGrea(905));
plans.setFlotaGrea([]);

// ─── 2. Serverul ─────────────────────────────────────────────────────────────────────────────────────────────────
sect('2. Serverul: flota se ține la zi, rutele spun „ales de noi / după flotă"');
T('`null` pe o cheie = înapoi la automat (cheia iese din setări)',
  /if \(typeof body\.features\[k\] === 'boolean'\) f\[k\] = body\.features\[k\];[\s\S]{0,200}else if \(body\.features\[k\] === null\) delete f\[k\];/.test(server));
T('flota se citește din baza de date după aceleași feluri (db.firmeCuFlotaGrea(plans.TIPURI_CU_MARFA))',
  /plans\.setFlotaGrea\(await db\.firmeCuFlotaGrea\(plans\.TIPURI_CU_MARFA\)\)/.test(server));
const chemari = (server.match(/await _flotaGreaReincarca\(\)/g) || []).length;
T('…și se reîncarcă la pornire / la 2 minute, la mutarea pe firmă, la felul vehiculului (ambele căi), la arhivare și restaurare',
  chemari >= 6 && /loadRegisteredImeis\(\) \{[\s\S]{0,1500}await _flotaGreaReincarca\(\);/.test(server) &&
  /async function _trecePeFirma[\s\S]{0,900}await _flotaGreaReincarca\(\)/.test(server), chemari + ' chemări');
const aM = (server.match(/\.\.\._accesModule\(/g) || []).length;
T('setările, comutatorul și fișa firmei trimit ce e ales de noi și ce merge după flotă (_accesModule, de 3 ori)', aM === 3, aM);
T('fișa firmei socotește flota pe vehiculele pe care le are în mână, înainte de module',
  /plans\.setFlotaGreaFirma\(id, vehicles\.some[\s\S]{0,200}\n    const features = plans \? plans\.featuresFor\(company\) : \{\};/.test(server));
const iIns = server.indexOf('insight = { enabled: ri.enabled');
T('RA Insight în „Stare" = doar numere (conturi, fond, folosite), nu cine ce a întrebat',
  iIns > 0 && /insight = \{ enabled: ri\.enabled, conturi: ri\.conturi, fond: ri\.fond, used: ri\.used, ramase: ri\.ramase, epuizat: ri\.epuizat \}/.test(server) &&
  !/oameni/.test(server.slice(iIns, server.indexOf('\n', iIns))));

// ─── 3. Web ──────────────────────────────────────────────────────────────────────────────────────────────────────
sect('3. Web: „Stare" prima, „Acces" ultima, comutatoarele mutate');
const iTabs = html.indexOf("'<div class=\"rax-cod-tabs\">'");
const TABS = iTabs > 0 ? html.slice(iTabs, html.indexOf("'</div>'", iTabs)) : '';
const ordine = (TABS.match(/data-ct="([a-z]+)"/g) || []).map((x) => x.slice(9, -1));
T('filele: Stare · Detalii · Utilizatori · Vehicule · Facturi · Abonament & plăți · Contract · Acces',
  J(ordine) === J(['stare', 'detalii', 'utilizatori', 'vehicule', 'facturi', 'abonament', 'contract', 'acces']), J(ordine));
T('„Stare" e aprinsă la deschidere și e fila implicită', /class="rax-cod-tab on" data-ct="stare"/.test(TABS) && /raxCodTab\(tab \|\| 'stare'\)/.test(html));
T('raxCodTab știe „stare" și „acces"', /tab === 'stare' \? _raxCodStare\(d\)/.test(html) && /if \(tab === 'acces'\) _raxCodAccesIncarca\(d\.company\.id\)/.test(html));
T('panoul separat de configurare a plecat', !/rax-cfg-overlay|rax-cfg-body/.test(html));
T('butoanele vechi („Configurează", „Module & limite") duc pe fila „Acces"',
  /window\.raxOpenCompanyConfig = function \(id\) \{ raxOpenCompanyDetail\(id, 'acces'\); \};/.test(html) &&
  /onclick="raxCodTab\(\\'acces\\'\)"><i class="fas fa-sliders"><\/i> Module &amp; limite/.test(html));
T('reîmprospătarea după o editare rămâne pe fila deschisă', /raxOpenCompanyDetail\(window\._raxCodId, window\._raxCodFila\)/.test(html));
T('culorile de stare au pereche pe tema deschisă', /body:not\(\.dark\) \.raco-st \.v\.ok, body:not\(\.dark\) \.raco-auto\.ok \{ color: #166534; \}/.test(html));

// ─── 4. Telefonul ────────────────────────────────────────────────────────────────────────────────────────────────
sect('4. Telefonul: aceleași file, aceeași cale');
const oTel = Array.from(sheet.matchAll(/\{ k: '([a-z]+)', et: /g)).map((m) => m[1]);
T('filele telefonului, în aceeași ordine', J(oTel) === J(ordine), J(oTel));
T('„Stare" e fila implicită', /\.tab \|\| 'stare'\)/.test(sheet) && /filaCeruta : 'stare'\)/.test(sheet));
T('„Module & limite" din Detalii duce pe fila „Acces"', /onConfig=\{\(\) => alegeFila\('acces'\)\}/.test(sheet));
T('foaia separată a plecat, fila „Acces" e CompanyAcces', !/CompanyConfigSheet/.test(sheet + editTel) && /fila === 'acces' && <CompanyAcces /.test(sheet));
T('„Înapoi la automat" trimite `null` (tipul îl primește)', /Record<string, boolean \| null>/.test(endpoints) && /setCompanyFeatures\(companyId, \{ \[key\]: null \}\)/.test(editTel));

// ─── TypeScript-ul telefonului, tradus și rulat ─────────────────────────────────────────────────────────────────
let ts = null;
try { ts = require(path.join(ROOT, 'mobile/node_modules/typescript')); } catch (e) { try { ts = require('typescript'); } catch (e2) { /* lipsește */ } }
if (!ts) { T('compilatorul TypeScript (npm install în mobile/)', false); console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate'); process.exit(1); }
const tsJs = (cod, fisier) => ts.transpileModule(cod, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS }, fileName: fisier }).outputText;
function modul(cod, fisier, cereri) {
  const m = { exports: {} };
  vm.runInContext(tsJs(cod, fisier), vm.createContext({ module: m, exports: m.exports, console,
    require: (id) => { if (cereri && cereri[id]) return cereri[id]; throw new Error('require neașteptat: ' + id); } }), { filename: fisier });
  return m.exports;
}
const SEMNAL = modul(libSemnal, 'semnal.ts', {});
const COMP = modul(libComp, 'companii.ts', {
  './format': { raCauta: () => true }, './contracte': { DOSAR_FEL: {}, de: () => ' ' }, '../components/FondatorUi': { adresaFirmei: () => '' },
});

// ─── 5. Modulele și vorbele ──────────────────────────────────────────────────────────────────────────────────────
sect('5. Modulele și „automat / ales de noi" — aceleași pe web și pe telefon');
const iMods = html.indexOf('var _RAX_MODS = [');
const RAX_MODS = iMods > 0 ? vm.runInNewContext('(' + html.slice(iMods + 'var _RAX_MODS = '.length, html.indexOf('];', iMods) + 1) + ')') : [];
T('aceleași module, aceleași nume și descrieri, în aceeași ordine',
  J(RAX_MODS.map((m) => [m[0], m[1], m[2]])) === J(COMP.MODULE_FIRMA.map((m) => [m.key, m.label, m.sub])),
  J(RAX_MODS.map((m) => m[0])) + ' / ' + J(COMP.MODULE_FIRMA.map((m) => m.key)));
const iAuto = html.indexOf('function _raxModAuto(');
const AUTO = iAuto > 0 ? html.slice(iAuto, html.indexOf('\n    }', iAuto)) : '';
T('„Ales de noi, de mână." și „Înapoi la automat" — aceleași vorbe',
  AUTO.indexOf(COMP.MOD_ALES) >= 0 && AUTO.indexOf(COMP.MOD_INAPOI) >= 0, COMP.MOD_ALES + ' / ' + COMP.MOD_INAPOI);
T('„Automat, după flotă: pornit / oprit — …" — aceleași vorbe',
  AUTO.indexOf("Automat, după flotă: ' +") >= 0 &&
  COMP.modulAutoText(true) === 'Automat, după flotă: pornit — firma are camioane, dube sau remorci.' &&
  COMP.modulAutoText(false) === 'Automat, după flotă: oprit — firma n-are camioane, dube sau remorci.' &&
  AUTO.indexOf("'pornit — firma are camioane, dube sau remorci.'") >= 0 && AUTO.indexOf("'oprit — firma n-are camioane, dube sau remorci.'") >= 0);

// ─── 6. Cartonașele „Stării", rulate pe ambele părți ─────────────────────────────────────────────────────────────
sect('6. „Stare": pagina și telefonul, pe aceleași firme, același rezultat');
const iB = html.indexOf('// ── începe „fila Stare" ──'), jB = html.indexOf('// ── sfârșit „fila Stare" ──');
T('blocul paginii e între repere', iB > 0 && jB > iB);
const WEB = vm.runInNewContext(html.slice(iB, jB) + '\n;({ cart: _raxStareCartonase, acces: _raxAccesEt })');
const iSt = html.indexOf('var CTR_STARI = {');
const CTR_STARI = vm.runInNewContext('(' + html.slice(iSt + 'var CTR_STARI = '.length, html.indexOf('};', iSt) + 1) + ')');
const ACUM = Date.UTC(2026, 9, 12, 9, 0, 0);
const ZI = 86400000;
const dep = { stari: CTR_STARI, semnal: SEMNAL.stareAparat, module: RAX_MODS.map((m) => ({ k: m[0], et: m[1] })) };
const vehicule = (n, varsta) => Array.from({ length: n }, (_, i) => ({ imei: '86000000000' + i, plate: 'B ' + (10 + i) + ' RAT', last_position_time: varsta == null ? null : ACUM - varsta(i) }));
const CAZURI = [
  { nume: 'firmă goală, activă', d: { company: { id: 1 }, access: { status: 'active' }, features: { agents: true } } },
  { nume: 'restanță cu zilele până la suspendare', d: { company: { id: 2 }, access: { status: 'grace', neplata: { zilePanaLaSuspendare: 6 } },
      facturi: [{ status: 'issued', total: 1250.4, due_date: ACUM - 3 * ZI }, { status: 'issued', total: 99.6, due_date: ACUM + 5 * ZI }, { status: 'paid', total: 7 }, { status: 'canceled', total: 9 }],
      payments: [{ amount_ron: 1180, paid_at: ACUM - 30 * ZI }, { amount_ron: 50, paid_at: ACUM - 2 * ZI }] } },
  { nume: 'oprită de noi, cu motivul nostru', d: { company: { id: 3, suspend_reason: 'cerere client' }, access: { status: 'expired', motiv: 'manual' } } },
  { nume: 'suspendată pentru neplată', d: { company: { id: 4 }, access: { status: 'expired', motiv: 'neplata' } } },
  { nume: 'compania demo', d: { company: { id: 5, is_demo: true }, access: { status: 'active' } } },
  { nume: 'contract semnat, cu capăt', d: { company: { id: 6 }, access: { status: 'active' }, contract: { status: 'activ', number: 'RAT-2026-0007' }, sfarsit: Date.UTC(2028, 8, 15),
      facturi: [{ status: 'issued', total: 300, due_date: ACUM + 10 * ZI }] } },
  { nume: 'contract semnat, nedeterminat', d: { company: { id: 7 }, access: { status: 'active' }, contract: { status: 'activ', number: null } } },
  { nume: 'contract trimis / în lucru / încheiat', d: { company: { id: 8 }, access: { status: 'active' }, contract: { status: 'trimis', number: 'RAT-2026-0008' } } },
  { nume: 'contract încheiat', d: { company: { id: 9 }, access: { status: 'active' }, contract: { status: 'incheiat', number: 'RAT-2025-0001' } } },
  { nume: '20 de aparate, toate comunică', d: { company: { id: 10 }, access: { status: 'active' }, vehicles: vehicule(20, () => 5 * 60000) } },
  { nume: 'aparate tăcute și fără semnal (peste 3)', d: { company: { id: 11 }, access: { status: 'active' }, vehicles: vehicule(6, (i) => [60000, 3 * 3600000, 2 * ZI, 3 * ZI, 4 * ZI, 5 * ZI][i]).concat([{ imei: '860', name: 'Fără poziție', last_position_time: null }]) } },
  { nume: 'un aparat tăcut', d: { company: { id: 12 }, access: { status: 'active' }, vehicles: vehicule(1, () => 2 * 3600000) } },
  { nume: 'RA Insight cu fond', d: { company: { id: 13 }, access: { status: 'active' }, insight: { enabled: true, conturi: 3, fond: 300, used: 142, epuizat: false } } },
  { nume: 'RA Insight cu fondul terminat', d: { company: { id: 14 }, access: { status: 'active' }, insight: { enabled: true, conturi: 1, fond: 100, used: 100, epuizat: true } } },
  { nume: 'RA Insight fără plafon', d: { company: { id: 15 }, access: { status: 'active' }, insight: { enabled: true, conturi: 21, fond: 0, used: 0, epuizat: false } } },
  { nume: 'toate modulele', d: { company: { id: 16 }, access: { status: 'active' }, features: { agents: true, ai_assistant: true, etransport: true, tahograf: true, incarcare: true } } },
  { nume: 'niciun modul', d: { company: { id: 17 }, access: { status: 'active' }, features: {} } },
];
CAZURI.forEach((c) => {
  const w = WEB.cart(c.d, ACUM, dep), t = COMP.cartonaseStare(c.d, ACUM, dep);
  T('la fel: ' + c.nume, JC(w) === JC(t), '\n    web:     ' + JC(w) + '\n    telefon: ' + JC(t));
});
const ia = (nume, k) => (WEB.cart(CAZURI.find((c) => c.nume === nume).d, ACUM, dep).find((x) => x.k === k) || {});
T('„20 de aparate · 20 comunică" (cu „de")', ia('20 de aparate, toate comunică', 'Aparatele').v === '20 de aparate · 20 comunică', ia('20 de aparate, toate comunică', 'Aparatele').v);
T('„142 din 300 de întrebări luna asta"', ia('RA Insight cu fond', 'RA Insight').d === '142 din 300 de întrebări luna asta', ia('RA Insight cu fond', 'RA Insight').d);
T('restanța: 2 documente, una trecută, ultima plată cea mai nouă',
  ia('restanță cu zilele până la suspendare', 'Facturi și plăți').v === '2 documente de plată' &&
  /1 trecută de scadență/.test(ia('restanță cu zilele până la suspendare', 'Facturi și plăți').d) &&
  /ultima plată: 50,00 lei/.test(ia('restanță cu zilele până la suspendare', 'Facturi și plăți').d), J(ia('restanță cu zilele până la suspendare', 'Facturi și plăți')));
T('accesul: aceleași cuvinte ca în Detalii (_raxAccesEt)', ia('restanță cu zilele până la suspendare', 'Accesul').v === WEB.acces({ status: 'grace', neplata: { zilePanaLaSuspendare: 6 } })[0]);
T('motivul nostru de oprire se vede doar la noi', ia('oprită de noi, cu motivul nostru', 'Accesul').d === 'Motivul nostru: cerere client');
T('peste trei aparate fără semnal (aici 5): primele trei și „și încă 2"', /· și încă 2$/.test(ia('aparate tăcute și fără semnal (peste 3)', 'Aparatele').d), ia('aparate tăcute și fără semnal (peste 3)', 'Aparatele').d);

// ─── 7. Pe server pornit ─────────────────────────────────────────────────────────────────────────────────────────
const PORT = 3488, DIR = '.firma-stare-db';
try { fs.rmSync(path.join(ROOT, DIR), { recursive: true, force: true }); } catch (e) {}
const env = { ...process.env, NODE_ENV: 'test', SEED_TEST: '1', ADMIN_PASSWORD: 'test1234', DEMO_DISABLED: 'true',
  SESSION_SECRET: 'ci_firma_stare', PORT: String(PORT), TCP_PORT: '5488', PGLITE_DIR: DIR + '/pgdata', DATABASE_URL: '' };
const srv = spawn(process.execPath, ['server.js'], { cwd: ROOT, env, stdio: ['ignore', 'ignore', 'inherit'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const B = 'http://127.0.0.1:' + PORT;
function gata(code) {
  try { srv.kill(); } catch (e) {}
  setTimeout(() => { try { fs.rmSync(path.join(ROOT, DIR), { recursive: true, force: true }); } catch (e) {} process.exit(code); }, 400);
}
(async () => {
  for (let i = 0; i < 120; i++) { try { if ((await fetch(B + '/api')).ok) break; } catch (e) {} await sleep(500); }
  const lr = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: J({ username: 'admin', password: 'test1234' }) });
  if (!lr.ok) { console.log('nu m-am putut autentifica (' + lr.status + ')'); rele++; return fin(); }
  const ck = (lr.headers.getSetCookie ? lr.headers.getSetCookie() : [lr.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const H = { 'Content-Type': 'application/json', Cookie: ck };
  const GET = (u) => fetch(B + u, { headers: { Cookie: ck } }).then((r) => r.json());
  const POST = (u, b) => fetch(B + u, { method: 'POST', headers: H, body: J(b) }).then((r) => r.json());
  const PUT = (u, b) => fetch(B + u, { method: 'PUT', headers: H, body: J(b) }).then((r) => r.json());

  sect('7. Pe server pornit: camionul pornește simulatorul, alegerea noastră bate automatul');
  const T1 = (await POST('/api/companies', { name: 'CI Transport Camioane' })).id;
  const T2 = (await POST('/api/companies', { name: 'CI Doar Autoturisme' })).id;
  await POST('/api/devices', { imei: '861000000330001', name: 'Camion 1', plate: 'B 01 CAM', company_id: T1, vehicle_type: 'Camion' });
  await POST('/api/devices', { imei: '861000000330002', name: 'Logan', plate: 'B 02 AUT', company_id: T2, vehicle_type: 'Auto' });
  let s1 = await GET('/api/companies/' + T1 + '/settings'), s2 = await GET('/api/companies/' + T2 + '/settings');
  T('firma cu camion: simulatorul pornit singur, nimic ales de noi', s1.flota_grea === true && s1.features.incarcare === true && !('incarcare' in (s1.features_setate || {})), J({ f: s1.flota_grea, i: s1.features && s1.features.incarcare, s: s1.features_setate }));
  T('firma doar cu autoturisme: oprit', s2.flota_grea === false && s2.features.incarcare === false, J({ f: s2.flota_grea, i: s2.features && s2.features.incarcare }));
  T('setările spun ce merge după flotă', J(s1.dupa_flota) === J(['incarcare']));
  let r = await PUT('/api/companies/' + T1 + '/features', { features: { incarcare: false } });
  T('oprit de noi: rămâne oprit, deși are camion', r.features && r.features.incarcare === false && r.features_setate && r.features_setate.incarcare === false, J(r));
  r = await PUT('/api/companies/' + T1 + '/features', { features: { incarcare: null } });
  T('„înapoi la automat": cheia iese, simulatorul repornește după flotă', r.features && r.features.incarcare === true && !('incarcare' in (r.features_setate || {})), J(r));
  await PUT('/api/devices/861000000330002', { name: 'Logan', plate: 'B 02 AUT', vehicle_type: 'Duba' });
  s2 = await GET('/api/companies/' + T2 + '/settings');
  T('o dubă trecută în fișă pornește simulatorul pe loc (fără să aștepte 2 minute)', s2.features.incarcare === true && s2.flota_grea === true, J({ f: s2.flota_grea, i: s2.features && s2.features.incarcare }));
  const ov = await GET('/api/companies/' + T1 + '/overview');
  T('fișa firmei aduce pentru „Stare": RA Insight (doar numere), modulele, ce e ales de noi',
    ov.insight && typeof ov.insight.conturi === 'number' && !('oameni' in ov.insight) && ov.features && ov.features.incarcare === true &&
    ov.features_setate && J(ov.dupa_flota) === J(['incarcare']), J({ ins: ov.insight, f: ov.features, s: ov.features_setate }));
  fin();
})().catch((e) => { console.log('eroare: ' + e.message); rele++; fin(); });
function fin() {
  console.log('\n' + ok + ' verificări trecute, ' + rele + ' picate');
  gata(rele ? 1 : 0);
}
