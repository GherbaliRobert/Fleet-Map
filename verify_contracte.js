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

const anexa = C.facAnexa([{ imei: '1', name: 'Camion A', plate: 'B-1', monthlyRON: 49 }, { imei: '2', name: 'B', monthlyRON: 59 }]);
T('anexa își face singură totalul', anexa.monthlyTotal === 108, String(anexa.monthlyTotal));
T('anexa păstrează numărul de înmatriculare', anexa.vehicles[0].plate === 'B-1');
T('anexa e în lei, dacă nu se spune altfel', anexa.currency === 'RON');
T('un aparat fără preț nu strică totalul', C.facAnexa([{ imei: '1' }, { imei: '2', monthlyRON: 10 }]).monthlyTotal === 10);

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
T('semnul de ciornă dispare când contractul e activ', /const ciorna = contract\.status !== 'activ';/.test(cpdf));
T('foloseşte logo-ul pentru fundal alb (vezi CLAUDE.md)', /logo-light\.png/.test(cpdf));
T('numele fișierului e brandat, ca la rapoarte', /'RA-Tracks - Contract '/.test(cpdf));
T('rolurile GDPR sunt scrise corect: clientul operator, noi împuternicit',
  /Beneficiarul are calitatea de OPERATOR, iar Prestatorul pe cea de PERSOANĂ ÎMPUTERNICITĂ/.test(cpdf));
T('anexa GDPR dispare dacă acordul e act separat', /const gdprAnexa = !\(contract\.gdpr && contract\.gdpr\.kind === 'separat'\);/.test(cpdf));
T('datele noastre vin din „Date emitent", nu scrise a doua oară',
  /invoice_issuer/.test(server) && /const emitent = \(\(await getSystemSettings\(\)\)\.invoice_issuer\) \|\| \{\};/.test(server));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
