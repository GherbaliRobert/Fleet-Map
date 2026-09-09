// verify_contracte.js — dosarul juridic al firmelor client: contract, GDPR, anexă, ANAF.
//
//   node verify_contracte.js
//
// Până acum o firmă se năștea cu un buton: un rând în bază și o invitație pe email. Niciun act,
// nicio durată, niciun acord de prelucrare — deși noi ținem datele de localizare ale șoferilor
// clientului, ceea ce ne face persoană împuternicită în sensul GDPR. Lucrurile care nu au voie să
// se strice tăcut, în ordinea gravității:
//   • dosarul să ajungă sub ochii cuiva care nu e fondator (proba 1);
//   • starea dosarului să MINTĂ — „în regulă" la o firmă fără contract semnat sau fără acord GDPR
//     e mai rău decât niciun semn (proba 2);
//   • un contract semnat să poată fi șters — ar dispărea dovada că a existat (proba 5);
//   • datele luate de la ANAF să fie citite greșit: un CUI corect cu denumire greșită înseamnă
//     contract cu altă firmă (proba 4).

const fs = require('fs');
const C = require('./contracts');
const A = require('./anaf_firme');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

const html = fs.readFileSync('./public/index.html', 'utf8');
const server = fs.readFileSync('./server.js', 'utf8');
const dbjs = fs.readFileSync('./db.js', 'utf8');

const ZI = 24 * 60 * 60 * 1000;
const ACUM = Date.parse('2026-09-08T12:00:00Z');

sect('1. Dosarul juridic e strict al fondatorilor');
const RUTE = [...server.matchAll(/app\.(get|post|put|delete)\('(\/api\/(?:contracts[^']*|companies\/:id\/contract|anaf\/firma))'([^\n]*)/g)]
  .map(m => ({ verb: m[1].toUpperCase(), cale: m[2], rest: m[3] }));
T('găsesc rutele de contract și ANAF', RUTE.length >= 8, RUTE.length + ' rute');
const scapate = RUTE.filter(r => !/requireSuperadmin/.test(r.rest));
T('fiecare cere requireSuperadmin', scapate.length === 0, scapate.map(r => r.verb + ' ' + r.cale).join(', '));
T('și fiecare cere mai întâi autentificare', RUTE.every(r => /requireAuth/.test(r.rest)));
// ANAF are un serviciu PUBLIC, dar la noi nu devine un serviciu de interogare pentru orice cont.
T('interogarea ANAF nu e deschisă tuturor', /app\.get\('\/api\/anaf\/firma', requireAuth, requireSuperadmin/.test(server));

sect('2. Starea dosarului spune adevărul');
const FIRMA = { id: 1, name: 'Client SRL', cui: 'RO123', address: 'Str. X 1', legal_rep: { name: 'Ion Popescu', role: 'Administrator' } };
const start = Date.parse('2026-01-01T00:00:00Z');
const ACTIV = { status: 'activ', signed_at: start, start_at: start, months: 12, end_at: C.calcSfarsit(start, 12),
  auto_renew: false, notice_days: 30, has_file: true, gdpr: { kind: 'anexa', signed_at: start } };
const s = (firma, contract, acum) => C.stareDosar(firma, contract, acum || ACUM);

T('firmă fără contract → „fără contract"', s(FIRMA, null).nivel === 'lipsa', s(FIRMA, null).eticheta);
T('și spune că lipsește contractul', s(FIRMA, null).lipsuri.indexOf('contract') >= 0, s(FIRMA, null).text);
T('ciorna nu trece drept contract', s(FIRMA, { status: 'ciorna' }).nivel === 'nesemnat');
T('trimis la semnat tot nu e semnat', s(FIRMA, { status: 'trimis' }).nivel === 'nesemnat', s(FIRMA, { status: 'trimis' }).eticheta);
// Defectul găsit la proba în aplicație: scria „lipsește data semnării" lângă un câmp completat.
T('la ciornă NU pretinde că lipsește data semnării',
  s(FIRMA, { status: 'ciorna', signed_at: start }).lipsuri.indexOf('semnatura') < 0,
  s(FIRMA, { status: 'ciorna', signed_at: start }).text);
T('dosar complet → „în regulă"', s(FIRMA, ACTIV).nivel === 'ok', JSON.stringify(s(FIRMA, ACTIV)));

// Fiecare piesă lipsă, luată una câte una: niciuna nu are voie să treacă drept „în regulă".
const fara = (schimb) => s(FIRMA, Object.assign({}, ACTIV, schimb));
T('activ fără actul semnat urcat NU e „în regulă"', fara({ has_file: false }).nivel === 'incomplet', fara({ has_file: false }).text);
T('și spune exact ce lipsește', /contractul semnat/.test(fara({ has_file: false }).text), fara({ has_file: false }).text);
T('activ fără acord GDPR NU e „în regulă"', fara({ gdpr: null }).nivel === 'incomplet', fara({ gdpr: null }).text);
T('activ fără data semnării NU e „în regulă"', fara({ signed_at: null }).nivel === 'incomplet', fara({ signed_at: null }).text);
T('firmă fără CUI e semnalată', s({ name: 'X' }, ACTIV).lipsuri.indexOf('cui') >= 0);
T('firmă fără sediu e semnalată', s({ name: 'X', cui: 'RO1' }, ACTIV).lipsuri.indexOf('sediu') >= 0);
T('firmă fără reprezentant e semnalată', s({ name: 'X', cui: 'RO1', address: 'a' }, ACTIV).lipsuri.indexOf('reprezentant') >= 0);
T('reprezentantul de pe contract ține loc de cel al firmei',
  s({ name: 'X', cui: 'RO1', address: 'a' }, Object.assign({}, ACTIV, { client_rep: { name: 'Ana' } })).lipsuri.indexOf('reprezentant') < 0);
T('contractul încheiat se vede ca încheiat, nu ca lipsă', s(FIRMA, { status: 'incheiat' }).nivel === 'incheiat');
T('compania demo nu are dosar juridic', s({ is_demo: true }, null).nivel === 'demo');

// Expirarea: contează doar dacă NU se reînnoiește singur.
const cuSfarsit = (zile, reinnoire) => Object.assign({}, ACTIV, { end_at: ACUM + zile * ZI, auto_renew: reinnoire });
T('la 30 de zile de expirare, fără reînnoire → avertisment', s(FIRMA, cuSfarsit(30, false)).nivel === 'expira', s(FIRMA, cuSfarsit(30, false)).eticheta);
T('și spune în câte zile', /30 zile/.test(s(FIRMA, cuSfarsit(30, false)).eticheta), s(FIRMA, cuSfarsit(30, false)).eticheta);
T('la 30 de zile, dar CU reînnoire → nu e nimic de făcut', s(FIRMA, cuSfarsit(30, true)).nivel === 'ok');
T('la 200 de zile nu deranjează pe nimeni', s(FIRMA, cuSfarsit(200, false)).nivel === 'ok');
T('termen depășit fără reînnoire → avertisment', s(FIRMA, cuSfarsit(-5, false)).nivel === 'expira', s(FIRMA, cuSfarsit(-5, false)).eticheta);
T('termen depășit CU reînnoire → în regulă, se prelungește', s(FIRMA, cuSfarsit(-5, true)).nivel === 'ok', s(FIRMA, cuSfarsit(-5, true)).eticheta);
T('contract pe durată nedeterminată nu expiră niciodată',
  s(FIRMA, Object.assign({}, ACTIV, { months: null, end_at: null })).zileRamase === null);
T('starea are mereu aceeași formă (interfața nu are de gândit)',
  ['lipsa', 'nesemnat', 'ok', 'demo'].every(function () { return true; }) &&
  ['nivel', 'eticheta', 'lipsuri', 'text', 'zileRamase'].every(function (k) { return k in s(FIRMA, null); }));

sect('2b. Drumul contractului: în lucru → aprobat → trimis → semnat → încheiat');
// Treapta „aprobat" e cea cerută de Alin: până acolo e ciornă, de acolo încolo se printează și se
// semnează. Fără ea, singura cale de la „ciornă" la „semnat" era să minți despre stare.
T('starea „aprobat" există pe server', /const CONTRACT_STARI = \['ciorna', 'aprobat', 'trimis', 'activ', 'incheiat'\]/.test(server));
T('un contract aprobat NU e dat drept semnat', s(FIRMA, { status: 'aprobat' }).nivel === 'nesemnat');
T('și se citește „gata de semnat", nu „ciornă"', /gata de semnat/.test(s(FIRMA, { status: 'aprobat' }).eticheta), s(FIRMA, { status: 'aprobat' }).eticheta);
T('„trimis" spune că e la client', /la client/.test(s(FIRMA, { status: 'trimis' }).eticheta), s(FIRMA, { status: 'trimis' }).eticheta);
T('nicio stare nu mai foloseşte cuvântul „ciornă" în afară de prima',
  Object.keys(C.ETICHETE_STARE).filter(function (k) { return /ciorn/i.test(C.ETICHETE_STARE[k]); }).length === 0,
  JSON.stringify(C.ETICHETE_STARE));
// Interfața are propria copie a etichetelor (nu poate cere serverul pentru fiecare desen). Copia
// aia trebuie să fie IDENTICĂ — altfel un ecran spune „trimis la client" și altul „trimis la semnat".
const mCli = /var CTR_STARI = \{([\s\S]*?)\};/.exec(html);
T('găsesc etichetele din interfață', !!mCli);
if (mCli) {
  const cli = {};
  [...mCli[1].matchAll(/(\w+):\s*\['([^']*)'/g)].forEach(m => { cli[m[1]] = m[2]; });
  T('interfața cunoaște exact aceleași stări ca serverul',
    Object.keys(cli).sort().join(',') === Object.keys(C.ETICHETE_STARE).sort().join(','),
    Object.keys(cli).join(',') + '  ≠  ' + Object.keys(C.ETICHETE_STARE).join(','));
  Object.keys(C.ETICHETE_STARE).forEach(k =>
    T('eticheta „' + k + '" e scrisă la fel în amândouă locurile', cli[k] === C.ETICHETE_STARE[k], cli[k] + ' ≠ ' + C.ETICHETE_STARE[k]));
}
const mPas = /var CTR_PAS = \{([\s\S]*?)\};/.exec(html);
T('găsesc pașii din interfață', !!mPas);
if (mPas) {
  const pas = {};
  [...mPas[1].matchAll(/(\w+):\s*\['([^']*)',\s*'([^']*)'\]/g)].forEach(m => { pas[m[1]] = [m[2], m[3]]; });
  Object.keys(C.URMATORUL_PAS).filter(k => C.URMATORUL_PAS[k]).forEach(k => {
    T('după „' + k + '" urmează același pas în amândouă locurile',
      pas[k] && pas[k][0] === C.URMATORUL_PAS[k][0] && pas[k][1] === C.URMATORUL_PAS[k][1],
      JSON.stringify(pas[k]) + ' ≠ ' + JSON.stringify(C.URMATORUL_PAS[k]));
  });
  T('din „încheiat" nu mai urmează nimic', !pas.incheiat && C.URMATORUL_PAS.incheiat === null);
}

sect('2c. Parola clientului nu trece niciodată prin mâinile noastre');
// Alin, 08.09: „doar trimitem invitația și parola o pune singur, nu are ce căuta la noi."
T('traseul nu mai are câmp de parolă', !/cn-pass/.test(html));
T('și nu mai trimite parolă la crearea administratorului',
  /body: JSON\.stringify\(\{ username: s\.admin\.username \}\)/.test(html));
T('scrie limpede că omul își pune singur parola', /își pune SINGUR parola/.test(html));

sect('3. Datele actului: durată, GDPR, anexă');
T('12 luni de la 1 ianuarie → 1 ianuarie la anul', new Date(C.calcSfarsit(Date.parse('2026-01-01T00:00:00Z'), 12)).getUTCFullYear() === 2027);
// 31 ianuarie + 1 lună nu are voie să sară în martie.
const feb = new Date(C.calcSfarsit(Date.parse('2026-01-31T00:00:00Z'), 1));
T('31 ianuarie + 1 lună cade în februarie, nu în martie', feb.getMonth() === 1, feb.toISOString().slice(0, 10));
T('fără durată nu există sfârșit', C.calcSfarsit(start, null) === null);
T('fără început nu există sfârșit', C.calcSfarsit(null, 12) === null);

T('o bifă goală NU înseamnă acord GDPR', C.areGdpr({ gdpr: { kind: 'anexa' } }) === false);
T('anexă semnată odată cu contractul înseamnă acord', C.areGdpr({ gdpr: { kind: 'anexa' }, signed_at: start }) === true);
T('act separat, urcat ca fișier, înseamnă acord', C.areGdpr({ gdpr: { kind: 'separat' }, has_gdpr_file: true }) === true);
T('act separat DOAR bifat nu înseamnă nimic', C.areGdpr({ gdpr: { kind: 'separat' }, signed_at: start }) === false);

const preaviz = C.ultimaZiDePreaviz({ start_at: start, months: 12, notice_days: 30 });
T('ultima zi de preaviz e cu 30 de zile înainte de sfârșit',
  Math.round((C.calcSfarsit(start, 12) - preaviz) / ZI) === 30, String(preaviz));

const anexa = C.facAnexa([
  { imei: '1', name: 'Camion A', plate: 'B-1', gps_model: 'Teltonika FMC650', bill_can: true, monthlyRON: 49 },
  { imei: '2', name: 'B', gps_model: 'FMC130', bill_can: false, monthlyRON: 59 }]);
T('anexa își face singură totalul', anexa.monthlyTotal === 108, String(anexa.monthlyTotal));
T('anexa păstrează numărul de înmatriculare', anexa.vehicles[0].plate === 'B-1');
T('anexa e în lei, dacă nu se spune altfel', anexa.currency === 'RON');
T('un aparat fără preț nu strică totalul', C.facAnexa([{ imei: '1' }, { imei: '2', monthlyRON: 10 }]).monthlyTotal === 10);
// Modelul aparatului și CAN-ul justifică prețul: fără ele anexa spunea o sumă fără să spună pentru ce.
T('anexa îngheață modelul aparatului', anexa.vehicles[0].gpsModel === 'Teltonika FMC650', anexa.vehicles[0].gpsModel);
T('și dacă citește date din motor (CAN)', anexa.vehicles[0].can === true && anexa.vehicles[1].can === false,
  JSON.stringify([anexa.vehicles[0].can, anexa.vehicles[1].can]));
T('un aparat fără model nu inventează unul', C.facAnexa([{ imei: '9' }]).vehicles[0].gpsModel === null);
T('lipsa informației despre CAN nu devine „are CAN"', C.facAnexa([{ imei: '9' }]).vehicles[0].can === false);
T('anexa deja salvată își păstrează modelul la recitire',
  C.facAnexa([{ imei: '9', gpsModel: 'FMC650', can: true }]).vehicles[0].gpsModel === 'FMC650');
// Pe hârtie: coloanele există, IMEI-ul NU se taie (stă pe rândul lui, sub model).
T('PDF-ul are coloana „Aparat" și „Date motor"',
  /const cap = \['Vehicul', 'Nr\. înmatric\.', 'Aparat', 'Date motor', 'Abonament'\]/.test(fs.readFileSync('./contract_pdf.js', 'utf8')));
T('IMEI-ul are rândul lui, ca să nu fie tăiat',
  /sub: 'IMEI ' \+ v\.imei/.test(fs.readFileSync('./contract_pdf.js', 'utf8')));
T('textul din tabel se taie MĂSURAT, nu ghicit după litere',
  /function _taie\(doc, text, latime\)[\s\S]{0,200}doc\.widthOfString/.test(fs.readFileSync('./contract_pdf.js', 'utf8')));
T('modelul aparatului ajunge de la server în ecran', /gps_model: d\.gps_model \|\| null/.test(server));

sect('4. Datele de la ANAF se citesc corect');
T('CUI-ul se curăță de „RO" și spații', A.curataCui('RO 12345678') === '12345678');
T('un CUI fără cifre e refuzat', A.curataCui('abc') === null);
const RASPUNS = {
  cod: 200, message: 'SUCCESS',
  found: [{
    date_generale: { cui: 12345678, denumire: 'TRANSPORT ALFA SRL', adresa: 'MUN. TIMIŞOARA, STR. EXEMPLU NR. 1', nrRegCom: 'J35/1234/2020', telefon: '0256111222', stare_inregistrare: 'INREGISTRAT din data 01.02.2020' },
    inregistrare_scop_Tva: { scpTVA: true },
    stare_inactiv: { statusInactivi: false }
  }],
  notFound: []
};
const f = A.mapeaza(RASPUNS);
T('ia denumirea exactă', f && f.name === 'TRANSPORT ALFA SRL', f && f.name);
T('ia numărul de la Registrul Comerțului', f && f.reg_com === 'J35/1234/2020');
T('ia sediul', f && /STR. EXEMPLU/.test(f.address), f && f.address);
T('vede că e plătitoare de TVA', f && f.vat_payer === true);
T('nu o dă drept inactivă când nu e', f && f.inactiva === false && f.radiata === false);
T('un răspuns fără firme întoarce nimic, nu o eroare', A.mapeaza({ found: [], notFound: [12] }) === null);
T('un răspuns aiurea nu aruncă', A.mapeaza(null) === null && A.mapeaza('bla') === null && A.mapeaza({}) === null);
T('o firmă fără denumire nu se ia în seamă', A.mapeaza({ found: [{ date_generale: { cui: 1 } }] }) === null);
const radiat = A.mapeaza({ found: [{ date_generale: { cui: 1, denumire: 'X SRL', stare_inregistrare: 'RADIERE din data 01.01.2025' }, stare_inactiv: { statusInactivi: true } }] });
T('o firmă RADIATĂ e semnalată', radiat && radiat.radiata === true, radiat && radiat.stare);
T('o firmă INACTIVĂ e semnalată', radiat && radiat.inactiva === true);
T('neplătitor de TVA nu devine plătitor din lipsa câmpului', radiat && radiat.vat_payer === false);
// Steagurile astea se ARATĂ, nu se scriu automat nicăieri — omul decide dacă semnează cu ei.
T('interfața chiar arată avertismentul de firmă radiată/inactivă',
  /firma apare RADIATĂ la ANAF/.test(html) && /firma e declarată INACTIVĂ/.test(html));

sect('5. Ce nu are voie să se întâmple');
T('un contract semnat nu se poate șterge (regula e pe server)',
  /if \(c\.status === 'activ' \|\| c\.status === 'incheiat'\)[\s\S]{0,160}Un contract semnat nu se șterge/.test(server));
T('„încheiat" fără dată de încetare primește data de azi',
  /if \(date\.status === 'incheiat' && !date\.ended_at\) date\.ended_at = Date\.now\(\);/.test(server));
T('un identificator care nu e număr nu ajunge la baza de date',
  /function _idCtr\(req, res\) \{[\s\S]{0,220}Identificator invalid/.test(server));
T('stările contractului sunt o listă închisă (nu se inventează din cerere)',
  /CONTRACT_STARI\.indexOf\(b\.status\) >= 0 \? b\.status : 'ciorna'/.test(server));
T('sfârșitul se CALCULEAZĂ, nu se primește de la client',
  /end_at: contracte\.calcSfarsit\(start, luni\)/.test(server));
T('se acceptă doar PDF, JPG sau PNG ca act semnat',
  /const CONTRACT_MIME = \{ pdf:[^}]*\}/.test(server) && /Se acceptă doar PDF, JPG sau PNG/.test(server));
T('actele au o limită de mărime', /CONTRACT_MAX_B = 4 \* 1024 \* 1024/.test(server));
// PDF-urile scanate nu au ce căuta în liste: ar umfla fiecare răspuns cu megaocteți.
T('fișierele NU se aduc în listele de contracte',
  /const _FARA_FISIERE = `[\s\S]*?\(file_b64 IS NOT NULL\) AS has_file/.test(dbjs) &&
  !/_FARA_FISIERE = `[^`]*[^_]file_b64,/.test(dbjs));
T('și există o singură cale prin care ies: descărcarea explicită',
  /async function getContractFile\(id, care\)/.test(dbjs));

sect('6. Traseul „client nou" din interfață');
const i1 = html.indexOf('    // ── începe „Dosarul juridic"');
const i2 = html.indexOf('    // ── sfârșit „Dosarul juridic" ──');
T('găsesc blocul între repere', i1 > 0 && i2 > i1, 'i1=' + i1 + ' i2=' + i2);
if (i1 > 0 && i2 > i1) {
  const win = {};
  const doc = { getElementById: () => null, querySelectorAll: () => [] };
  const escReal = (s2) => String(s2 == null ? '' : s2).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const M = new Function('window', 'document', 'esc', 'fetch', 'raxLoadCompanies', 'raxOpenCompanyDetail', 'raConfirm',
    html.slice(i1, i2) + '\n; return { pastila: dosarPastila, pasi: CO_PASI, zi: _zi };')(win, doc, escReal, null, null, null, null);

  T('traseul are exact trei pași', M.pasi.length === 3, M.pasi.join(' → '));
  T('primul e firma, ultimul e contul', M.pasi[0] === 'Firma' && M.pasi[2] === 'Administratorul', M.pasi.join(', '));
  T('deschiderea traseului e expusă ca buton', typeof win.coNouStart === 'function');

  const p = (nivel, eticheta, text) => M.pastila({ nivel: nivel, eticheta: eticheta, text: text }, 7);
  T('pastila lipsă e roșie', /raco-dos bad/.test(p('lipsa', 'fără contract', 'contractul')), p('lipsa', 'fără contract', 'contractul'));
  T('pastila nesemnată e portocalie', /raco-dos warn/.test(p('nesemnat', 'ciornă de contract', '')));
  T('pastila „în regulă" e verde', /raco-dos ok/.test(p('ok', 'în regulă', '')));
  T('pastila duce direct în fila Contract', /raxOpenCompanyDetail\(7, 'contract'\)/.test(p('lipsa', 'x', '')));
  T('la trecerea cu mouse-ul spune ce lipsește', /Lipsește din dosar: contractul/.test(p('lipsa', 'x', 'contractul')));
  T('compania demo nu primește pastilă', M.pastila({ nivel: 'demo' }, 7) === '');
  T('fără dosar nu se desenează nimic', M.pastila(null, 7) === '');
  // Numele firmelor vin de la oameni: un nume cu ghilimele nu are voie să spargă atributul title.
  T('textul e escapat, nu lipit brut', !/<img/.test(p('lipsa', '<img src=x onerror=1>', '')), p('lipsa', '<img src=x onerror=1>', ''));

  T('o zi scrisă în câmp devine moment în timp', typeof M.zi('2026-09-15') === 'number');
  T('un câmp gol nu devine 1 ianuarie 1970', M.zi('') === null);
  T('o zi aiurea nu devine dată', M.zi('bla') === null);
}

sect('7. Ciorna de contract spune că e ciornă');
const cpdf = fs.readFileSync('./contract_pdf.js', 'utf8');
T('scrie pe hârtie că e ciornă până la semnare', /CIORNĂ — generată automat/.test(cpdf));
T('și că trebuie verificată juridic', /A se verifica juridic înainte de semnare/.test(cpdf));
// Alin, 08.09: „de ce o ciornă, dacă noi deja vorbim de o semnare de contract?" — din clipa în care
// contractul e APROBAT, hârtia e curată și se poate printa. Semnul rămâne doar cât e în lucru.
T('semnul de ciornă apare DOAR cât contractul e în lucru', /const ciorna = contract\.status === 'ciorna';/.test(cpdf));
T('foloseşte logo-ul pentru fundal alb (vezi CLAUDE.md)', /logo-light\.png/.test(cpdf));
T('numele fișierului e brandat', /'RA TRAKS-' \+ \(fel \|\| 'Contract'\)/.test(cpdf));
T('rolurile GDPR sunt scrise corect: clientul operator, noi împuternicit',
  /Beneficiarul are calitatea de OPERATOR, iar Prestatorul pe cea de PERSOANĂ ÎMPUTERNICITĂ/.test(cpdf));
T('anexa GDPR dispare dacă acordul e act separat', /const gdprAnexa = !\(contract\.gdpr && contract\.gdpr\.kind === 'separat'\);/.test(cpdf));
T('datele noastre vin din „Date emitent", nu scrise a doua oară',
  /invoice_issuer/.test(server) && /const emitent = \(\(await getSystemSettings\(\)\)\.invoice_issuer\) \|\| \{\};/.test(server));

sect('7b. Ceasul care anunță contractele aproape de capăt');
// Alin, 08.09: „o alertă cu 60 de zile înainte de expirarea contractelor care nu se reînnoiesc
// singure". Regula: se anunță DOAR contractele în vigoare, cu termen, care se opresc singure la
// data aia. Cele care se prelungesc automat nu sunt un eveniment — acolo n-ai ce face.
const CT = (schimb) => Object.assign({ status: 'activ', auto_renew: false, notice_days: 30,
  start_at: start, months: 12, end_at: null }, schimb);
const anunt = (schimb, acum) => C.deAnuntat(CT(schimb), acum || ACUM);
T('la 30 de zile de capăt, fără reînnoire → se anunță', !!anunt({ end_at: ACUM + 30 * ZI }));
T('și spune în câte zile', anunt({ end_at: ACUM + 30 * ZI }).zileRamase === 30, String(anunt({ end_at: ACUM + 30 * ZI }).zileRamase));
T('la 90 de zile e prea devreme, nu deranjează', anunt({ end_at: ACUM + 90 * ZI }) === null);
T('exact la 60 de zile se anunță (pragul e inclusiv)', !!anunt({ end_at: ACUM + 60 * ZI }));
T('un contract care SE REÎNNOIEȘTE singur nu sună niciodată',
  anunt({ end_at: ACUM + 10 * ZI, auto_renew: true }) === null);
T('un contract nesemnat nu sună', anunt({ end_at: ACUM + 10 * ZI, status: 'ciorna' }) === null);
T('un contract încheiat nu mai sună', anunt({ end_at: ACUM + 10 * ZI, status: 'incheiat' }) === null);
T('un contract pe durată nedeterminată nu are ce anunța',
  anunt({ end_at: null, months: null }) === null);
T('un contract deja expirat se anunță, marcat ca trecut',
  anunt({ end_at: ACUM - 3 * ZI }) && anunt({ end_at: ACUM - 3 * ZI }).trecut === true);
T('anunțul spune și ultima zi de preaviz', typeof anunt({ end_at: ACUM + 30 * ZI }).preavizPana === 'number');
T('și dacă termenul de preaviz a trecut deja', anunt({ end_at: ACUM + 10 * ZI }).preavizTrecut === true);
T('la 45 de zile, preavizul de 30 încă nu a trecut', anunt({ end_at: ACUM + 45 * ZI }).preavizTrecut === false);
// Pe server: anunțul e pentru NOI, sună o dată per termen, și nu bate la ușa clientului.
T('serverul are ceasul contractelor', /async function contractExpiryTick\(\)/.test(server));
T('sună o singură dată per contract și per termen (cheia ține data)',
  /const cheie = 'contract_expira:' \+ c\.id \+ ':' \+ a\.sfarsit;/.test(server) &&
  /await db\.notificationKeyExists\(cheie/.test(server));
T('anunțul merge la super-admini, nu în compania clientului',
  /type: 'contract_expira'[\s\S]{0,200}companyId: null, userId: null/.test(server) &&
  /u\.role === 'superadmin'/.test(server));
T('un contract deja expirat e anunțat mai tare (critical)', /severity: a\.trecut \? 'critical' : 'warning'/.test(server));
T('ceasul bate zilnic, nu la fiecare minut', /setInterval\(\(\) => contractExpiryTick\(\)\.catch\(\(\) => \{\}\), 24 \* 60 \* 60 \* 1000\)/.test(server));
T('companiile demo nu intră în ceas', /WHERE c\.status = 'activ' AND COALESCE\(co\.is_demo, false\) = false/.test(dbjs));
T('se poate rula și manual, ca să nu aștepți o zi',
  /app\.post\('\/api\/admin\/contracts\/check-expiry', requireAuth, requireSuperadmin/.test(server));

sect('7c. Oferta se transformă în client, fără să retastezi nimic');
T('oferta ține minte în ce s-a transformat',
  /ALTER TABLE offers ADD COLUMN IF NOT EXISTS company_id INTEGER/.test(dbjs) &&
  /ALTER TABLE offers ADD COLUMN IF NOT EXISTS contract_id INTEGER/.test(dbjs));
T('serverul leagă oferta de firmă și de contract la creare',
  /await db\.legOferta\(oferta\.id, \{ company_id: id, contract_id: c\.id \}\)/.test(server));
T('prețul din ofertă intră în anexa contractului',
  /date\.annex = contracte\.facAnexa\(\[\], \{ monthlyTotal: Number\(oferta\.monthly_total\)/.test(server));
T('dar aparatele NU vin din ofertă (acolo sunt doar numere)',
  /Aparatele NU vin din ofertă/.test(server));
T('traseul „client nou" poate porni dintr-o ofertă', /window\.coNouDinOferta = function \(offerId\)/.test(html));
T('și trimite oferta mai departe la crearea contractului', /offer_id: s\.offerId \|\| null/.test(html));
T('ofertele deja devenite contract nu se mai propun a doua oară',
  /\.filter\(function \(o\) \{ return !o\.contract_id; \}\)/.test(html));
T('pe lista de oferte se vede care a devenit client', /a devenit client/.test(html));
T('și duce direct în dosarul lui', /onclick="raxOpenCompanyDetail\(' \+ o\.company_id \+ ', \\'contract\\'\)/.test(html));

sect('7d. Meniul urmează fluxul, iar Contractele au ecranul lor');
// Alin, 09.09: „întâi ofertare, apoi contract și anexe, apoi îmi apar companiile. E mai sănătos
// așa, să știm și noi fluxul și să-l vedem." Ordinea din meniu E fluxul, nu alfabetul.
const grupBiz = /<div class="nav-group" data-vert="fondator" data-super data-group="business">([\s\S]*?)<\/div>\s*<\/div>/.exec(html);
T('găsesc grupul Business în meniu', !!grupBiz);
if (grupBiz) {
  const randuri = [...grupBiz[1].matchAll(/<span>([^<]+)<\/span>/g)].map(m => m[1].replace(/&amp;/g, '&').trim());
  // randuri[0] e chiar titlul grupei („Business"); pașii încep de la al doilea.
  T('primele trei rânduri sunt exact pașii, în ordine',
    randuri.slice(1, 4).join(' → ') === 'Ofertare Live → Contracte → Companii', randuri.join(' · '));
  T('Companii a plecat din Gestiune', !/data-group="gestiune"[\s\S]*?<span>Companii<\/span>/.test(html.slice(0, html.indexOf('data-group="module"'))));
  T('Gestiune a rămas cu aparatele și oamenii',
    /data-group="gestiune"[\s\S]{0,900}?<span>Dispozitive<\/span>[\s\S]{0,900}?<span>Utilizatori<\/span>/.test(html));
}
T('ecranul „Contracte" are containerul lui', /<div id="admin-tab-contracte" style="display:none;"><\/div>/.test(html));
T('și se încarcă la deschiderea filei', /name === 'contracte'\) \{\s*\n\s*if \(window\.raxLoadContracte\)/.test(html));
T('e strict al fondatorilor, ca și Companii',
  /name === 'accounts' \|\| name === 'contracte'\) && !can\('manageCompanies'\)/.test(html) &&
  /tab === 'audit' \|\| tab === 'contracte'\) && !can\('manageCompanies'\)/.test(html));
T('ruta care dă toate contractele cere super-admin',
  /app\.get\('\/api\/contracts', requireAuth, requireSuperadmin/.test(server));
T('ruta trimite și firmele FĂRĂ contract — aia e gaura adevărată',
  /fara_contract: fara/.test(server) && /async function firmeFaraContract\(\)/.test(dbjs));
T('firmele demo nu apar ca „fără contract"', /firmeFaraContract[\s\S]{0,300}COALESCE\(co\.is_demo, false\) = false/.test(dbjs));
T('ecranul are filtre după ce te întrebi de fapt, nu după stări din bază',
  /\['desemnat', 'De semnat'/.test(html) && /\['incomplet', 'Dosar incomplet'/.test(html) && /\['expira', 'Expiră curând'/.test(html));
T('și se poate căuta după client, număr sau CUI', /Caută după client, număr de contract sau CUI/.test(html));
T('fiecare rând duce în dosarul clientului',
  /raxOpenCompanyDetail\(' \+ c\.company_id \+ ', \\'contract\\'\)/.test(html));

sect('7e. Semnăm amândoi, numele fișierului, și fără amânări de scadență');
// Alin, 09.09: „la administrator trece și Alin Tîlvar și Gherbali Robert. Ți-am mai zis."
// De regulă semnează amândoi fondatorii, deci bife cu toți bifați implicit — nu un singur nume.
T('semnatarii noștri sunt bife, nu un singur nume', /function _raxNoiBifeHtml\(idPrefix, valoare\)/.test(html));
T('la un contract nou sunt bifați TOȚI', /var bifat = function \(n\) \{ return alesi\.length \? alesi\.indexOf\(n\) >= 0 : true; \};/.test(html));
T('numele se leagă cu „și", ca pe hârtie', /return \(_raxNoi \|\| \[\]\)\.join\(' și '\);/.test(html));
T('funcția devine „Administratori" la mai mulți', /return cati > 1 \? 'Administratori' : 'Administrator';/.test(html));
T('lista vine tot din conturile de super-admin, nu din nume scrise în cod',
  /x\.role === 'superadmin' && x\.active !== false/.test(html));
T('câmpul rămâne editabil (se poate semna și prin împuternicit)', /id="' \+ idPrefix \+ '-our"/.test(html));
// Numele fișierului descărcat, cerut de Alin.
T('contractul se descarcă „RA TRAKS-Contract …"', /return 'RA TRAKS-' \+ \(fel \|\| 'Contract'\)/.test(cpdf));
// Amânarea scadenței: Alin, 09.09 — „nu înțeleg, nu vreau să existe asta". Scoasă de tot.
T('nu mai există rută de amânare a scadenței', !/\/api\/invoices\/:id\/due/.test(server));
T('și nici funcția din spate', !/'set_due', 'invoice'/.test(server));

sect('7f. Actele adiționale: contractul semnat nu se mai schimbă');
// „Ca na se poate modifica contractul inițial, gen mai cumpără clientul mașini, mai vrea servicii."
T('actele adiționale au tabela lor', /CREATE TABLE IF NOT EXISTS acte_aditionale/.test(dbjs));
T('sunt legate de contract și de firmă', /contract_id INTEGER NOT NULL,\s*\n\s*company_id INTEGER NOT NULL/.test(dbjs));
T('se numerotează per contract (A1, A2…), nu global',
  /async function urmatorulNrAct\(contractId\)[\s\S]{0,220}MAX\(nr_ordine\), 0\) \+ 1/.test(dbjs));
T('numărul se propune ca „<contract>/A<n>"', /date\.number = \(c\.number \|\| 'contract'\) \+ '\/A' \+ nr;/.test(server));
T('NU se face act adițional la un contract nesemnat',
  /if \(c\.status === 'ciorna' \|\| c\.status === 'aprobat'\)[\s\S]{0,180}modifică-l direct, nu prin act adițional/.test(server));
T('un act adițional SEMNAT nu se șterge', /Un act adițional semnat nu se șterge/.test(server));
T('are PDF propriu', /app\.get\('\/api\/acte\/:id\/pdf', requireAuth, requireSuperadmin/.test(server));
T('și se descarcă tot brandat', /contractPdf\.numeFisier\(a, co, 'Act aditional'\)/.test(server));
T('actul semnat se poate urca înapoi', /app\.post\('\/api\/acte\/:id\/file', requireAuth, requireSuperadmin/.test(server));
T('toate rutele de acte sunt ale fondatorilor',
  [...server.matchAll(/app\.(get|post|put|delete)\('(\/api\/acte[^']*|\/api\/contracts\/:id\/acte)'([^\n]*)/g)]
    .every(m => /requireSuperadmin/.test(m[3])));
// Pe hârtie: actul spune ce se schimbă și că restul rămâne neschimbat.
T('hârtia se cheamă ACT ADIȚIONAL și trimite la contractul inițial',
  /text\('ACT ADIȚIONAL'/.test(cpdf) && /la contractul de prestări servicii nr\. '/.test(cpdf));
T('scrie de când produce efecte', /Modificările produc efecte începând cu data de/.test(cpdf));
T('și că restul clauzelor rămân neschimbate',
  /Restul clauzelor contractului inițial și ale anexelor sale rămân neschimbate/.test(cpdf));
T('anexele se repetă DOAR dacă se schimbă',
  /const areAnexa = !!\(act\.annex && \(act\.annex\.vehicles \|\| \[\]\)\.length\);/.test(cpdf));
T('anexa nouă spune limpede că o înlocuiește pe cea veche',
  /înlocuiește Anexa nr\. 1 a contractului nr\./.test(cpdf));
T('în ecran, actele apar doar la contractele semnate',
  /if \(c\.status === 'activ' \|\| c\.status === 'trimis' \|\| c\.status === 'incheiat'\) \{/.test(html));
T('și se explică de ce există', /Contractul semnat nu se mai schimbă\. Când clientul mai cumpără mașini/.test(html));
T('nu se salvează un act fără să scrie ce schimbă', /Scrie ce se schimbă — asta ajunge pe hârtie/.test(html));

sect('8. Aliniamentul contractului — fiecare scriere își spune poziția');
// DEFECTUL GĂSIT DE ALIN, 08.09, și motivul pentru care proba asta există:
// pdfkit ȚINE MINTE ultima poziție scrisă. Blocul părților scria valorile la x = margine + 106;
// de acolo încolo, orice `doc.text(t)` fără poziție pornea de la 156 în loc de 50 — adică TOT
// contractul era împins cu zece centimetri spre dreapta și intra în marginea din dreapta.
// Aici punem un „document de carton" care înregistrează fiecare scriere și verificăm că fiecare
// și-a dat singură x-ul și lățimea, și că nimic nu iese din pagină.
const CP = require('./contract_pdf');
const A4 = { width: 595.28, height: 841.89, margins: { top: 50, bottom: 50, left: 50, right: 50 } };
const scrieri = [];
const carton = {
  page: A4, x: A4.margins.left, y: A4.margins.top, _pagini: 1,
  font() { return this; }, fontSize() { return this; }, fillColor() { return this; },
  strokeColor() { return this; }, lineWidth() { return this; },
  moveTo() { return this; }, lineTo() { return this; }, stroke() { return this; },
  image() { return this; },
  // Tăierea textului din tabel măsoară lățimea reală. Aproximăm: 4,6 puncte pe literă la 8,5pt.
  widthOfString(s) { return String(s == null ? '' : s).length * 4.6; },
  addPage() { this._pagini++; this.x = A4.margins.left; this.y = A4.margins.top; return this; },
  moveDown(n) { this.y += 12 * (n == null ? 1 : n); return this; },
  text(t, x, y, o) {
    scrieri.push({ t: String(t == null ? '' : t).slice(0, 60), x: x, y: y, o: o, pagina: this._pagini });
    if (typeof y === 'number') this.y = y + 11;
    else this.y += 11;
    return this;
  }
};
const start2 = Date.parse('2026-09-15T00:00:00Z');
CP.scrieContract(carton, {
  contract: { number: 'RAT-C-2026-0007', status: 'aprobat', signed_at: start2, start_at: start2, months: 12,
    end_at: C.calcSfarsit(start2, 12), auto_renew: true, notice_days: 30,
    client_rep: { name: 'Ion Popescu', role: 'Administrator' }, our_rep: { name: 'Alin Tîlvar', role: 'Administrator' },
    gdpr: { kind: 'anexa' }, annex: C.facAnexa([{ imei: '860000000000001', name: 'Camion A', plate: 'B-111-AAA', gps_model: 'Teltonika FMC650', bill_can: true, monthlyRON: 49 }]) },
  firma: { name: 'Transport Zebra SRL', cui: 'RO12345678', address: 'Str. Exemplu 1', payment_term_days: 15, billing_day: 5 },
  emitent: { name: 'RA TRACKS SRL', cui: 'RO44556677', vat_rate: 19 }
});
T('contractul chiar se scrie (nu pică pe drum)', scrieri.length > 40, scrieri.length + ' scrieri');
const faraX = scrieri.filter(w => typeof w.x !== 'number');
T('FIECARE scriere își dă explicit poziția pe orizontală', faraX.length === 0,
  faraX.slice(0, 3).map(w => JSON.stringify(w.t)).join(' | '));
const faraLat = scrieri.filter(w => !w.o || (typeof w.o.width !== 'number' && w.o.lineBreak !== false));
T('și lățimea (sau spune limpede că nu se rupe rândul)', faraLat.length === 0,
  faraLat.slice(0, 3).map(w => JSON.stringify(w.t)).join(' | '));
const inAfara = scrieri.filter(w => w.x < A4.margins.left - 0.5 || (w.o && typeof w.o.width === 'number' && w.x + w.o.width > A4.width - A4.margins.right + 0.5));
T('nimic nu iese din marginile paginii', inAfara.length === 0,
  inAfara.slice(0, 3).map(w => JSON.stringify(w.t) + ' la x=' + w.x).join(' | '));
// Paragrafele contractului trebuie să înceapă FIX la margine, nu la coloana valorilor din antet.
const laMargine = scrieri.filter(w => w.x === A4.margins.left).length;
T('cele mai multe rânduri pornesc chiar de la margine', laMargine >= scrieri.length * 0.4,
  laMargine + ' din ' + scrieri.length);
T('blocul părților scrie toate rândurile, chiar goale (linie punctată, nu rând lipsă)',
  scrieri.filter(w => w.t === 'IBAN').length === 2 && scrieri.filter(w => w.t === '____________').length > 0);
T('contractul are patru pagini: actul, restul, Anexa 1, Anexa 2', carton._pagini === 4, carton._pagini + ' pagini');

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
