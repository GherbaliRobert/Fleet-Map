// contract_pdf.js — ciorna contractului de prestări servicii, în PDF, cu logo RA Tracks.
//
// ⚠ CE ESTE ȘI CE NU ESTE. Fișierul ăsta scoate o CIORNĂ: aceleași clauze de fiecare dată,
// completate cu datele reale ale părților, cu anexa aparatelor și cu acordul GDPR. NU e consultanță
// juridică și nu înlocuiește avocatul — de asta scrie „ciornă" pe fiecare pagină până când omul
// marchează contractul ca semnat. Textul clauzelor se schimbă într-un singur loc, aici.
//
// Datele NOASTRE (Prestatorul) vin din „Date emitent" (setarea `invoice_issuer`), aceleași care
// apar pe facturi — ca să nu existe două versiuni ale firmei noastre în aceeași aplicație.

const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const C = require('./contracts');

const VERDE = '#3FE07D', NEGRU = '#111', GRI = '#6b7280', LINIE = '#e5e7eb';

let _logoBuf = null, _logoTried = false;
// „logo-light.png" e varianta ÎNCHISĂ (pentru fundal deschis) — pe hârtie albă asta se vede.
function _logo() {
  if (!_logoTried) { _logoTried = true; try { _logoBuf = fs.readFileSync(path.join(__dirname, 'public', 'logo-light.png')); } catch (e) { _logoBuf = null; } }
  return _logoBuf;
}
function _data(ms) {
  if (!ms) return '____________';
  return new Date(Number(ms)).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' });
}
function _bani(v, moneda) {
  if (v == null || !isFinite(v)) return '—';
  return Number(v).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + (moneda || 'RON');
}
function _sauLinie(v) { const t = String(v == null ? '' : v).trim(); return t || '____________'; }

// ─── Cărămizile paginii ──────────────────────────────────────────────────────────────────────
function _antet(doc, contract, ciorna) {
  const left = doc.page.margins.left;
  const w = doc.page.width - left - doc.page.margins.right;
  const lg = _logo();
  if (lg) { try { doc.image(lg, left, doc.y, { height: 22 }); } catch (e) {} }
  doc.fillColor(GRI).font('Nunito').fontSize(9)
    .text('Contract nr. ' + _sauLinie(contract.number) + ' / ' + _data(contract.signed_at), left, doc.y + 6, { width: w, align: 'right' });
  doc.moveDown(0.4);
  const y = doc.y;
  doc.moveTo(left, y).lineTo(left + w, y).strokeColor(VERDE).lineWidth(2).stroke();
  doc.moveDown(0.8);
  doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(15)
    .text('CONTRACT DE PRESTĂRI SERVICII', { align: 'center' });
  doc.font('Nunito').fontSize(9).fillColor(GRI)
    .text('monitorizare GPS a flotei prin platforma RA Tracks', { align: 'center' });
  if (ciorna) {
    doc.moveDown(0.5);
    doc.fillColor('#b45309').font('Nunito-Bold').fontSize(8.5)
      .text('CIORNĂ — generată automat din datele din aplicație. A se verifica juridic înainte de semnare.', { align: 'center' });
  }
  doc.moveDown(1);
}
function _titlu(doc, t) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 70) doc.addPage();
  doc.moveDown(0.6);
  doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(10.5).text(t);
  doc.moveDown(0.25);
}
function _p(doc, t, optiuni) {
  doc.fillColor('#1f2937').font('Nunito').fontSize(9.5)
    .text(t, Object.assign({ align: 'justify', lineGap: 1.2 }, optiuni || {}));
  doc.moveDown(0.35);
}
function _parte(doc, eticheta, d) {
  const left = doc.page.margins.left;
  const w = doc.page.width - left - doc.page.margins.right;
  doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(9.5).text(eticheta);
  const randuri = [
    ['Denumire', d.name], ['CUI / CIF', d.cui], ['Nr. Reg. Com.', d.reg_com],
    ['Sediu', d.address], ['IBAN', d.iban], ['Banca', d.bank],
    ['Email', d.email], ['Telefon', d.phone],
    ['Reprezentat prin', d.rep]
  ].filter(function (r) { return r[1] || r[0] === 'Reprezentat prin'; });
  doc.font('Nunito').fontSize(9);
  randuri.forEach(function (r) {
    const y = doc.y;
    doc.fillColor(GRI).text(r[0], left + 6, y, { width: 92, lineBreak: false });
    doc.fillColor('#1f2937').text(_sauLinie(r[1]), left + 102, y, { width: w - 108 });
  });
  doc.moveDown(0.6);
}
function _tabelAnexa(doc, anexa) {
  const left = doc.page.margins.left;
  const w = doc.page.width - left - doc.page.margins.right;
  const col = [w * 0.40, w * 0.20, w * 0.22, w * 0.18];
  const cap = ['Vehicul', 'Nr. înmatriculare', 'Aparat (IMEI)', 'Abonament / lună'];
  function rand(valori, gros) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - 30) { doc.addPage(); }
    const y = doc.y;
    doc.font(gros ? 'Nunito-Bold' : 'Nunito').fontSize(8.5).fillColor(gros ? NEGRU : '#1f2937');
    let x = left;
    valori.forEach(function (v, i) {
      doc.text(String(v == null ? '—' : v), x + 4, y + 4, { width: col[i] - 8, lineBreak: false, ellipsis: true, align: i === 3 ? 'right' : 'left' });
      x += col[i];
    });
    doc.moveTo(left, y + 17).lineTo(left + w, y + 17).strokeColor(LINIE).lineWidth(gros ? 1.2 : 0.6).stroke();
    doc.y = y + 21;
  }
  rand(cap, true);
  const veh = (anexa && anexa.vehicles) || [];
  if (!veh.length) { _p(doc, 'Nu au fost trecute aparate în anexă la momentul generării.'); return; }
  const moneda = (anexa && anexa.currency) || 'RON';
  veh.forEach(function (v) { rand([v.name || v.imei, v.plate, v.imei, v.monthlyRON == null ? '—' : _bani(v.monthlyRON, moneda)]); });
  doc.moveDown(0.3);
  doc.font('Nunito-Bold').fontSize(9.5).fillColor(NEGRU)
    .text('Total abonament lunar: ' + _bani(anexa.monthlyTotal, moneda) + ' (fără TVA)', left, doc.y, { width: w, align: 'right' });
  doc.moveDown(0.5);
}
function _semnaturi(doc, numePrestator, numeBeneficiar) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - 110) doc.addPage();
  const left = doc.page.margins.left;
  const w = doc.page.width - left - doc.page.margins.right;
  doc.moveDown(1.5);
  const y = doc.y;
  doc.font('Nunito-Bold').fontSize(9.5).fillColor(NEGRU);
  doc.text('PRESTATOR', left, y, { width: w / 2 - 10 });
  doc.text('BENEFICIAR', left + w / 2 + 10, y, { width: w / 2 - 10 });
  doc.font('Nunito').fontSize(9).fillColor('#1f2937');
  doc.text(_sauLinie(numePrestator), left, y + 15, { width: w / 2 - 10 });
  doc.text(_sauLinie(numeBeneficiar), left + w / 2 + 10, y + 15, { width: w / 2 - 10 });
  doc.fillColor(GRI).fontSize(8.5);
  doc.text('Semnătura și ștampila', left, y + 62, { width: w / 2 - 10 });
  doc.text('Semnătura și ștampila', left + w / 2 + 10, y + 62, { width: w / 2 - 10 });
  doc.moveTo(left, y + 58).lineTo(left + w / 2 - 10, y + 58).strokeColor(LINIE).lineWidth(0.8).stroke();
  doc.moveTo(left + w / 2 + 10, y + 58).lineTo(left + w, y + 58).stroke();
}

// ─── Contractul întreg ───────────────────────────────────────────────────────────────────────
// `date` = { contract, firma, emitent }. Scrie în `doc` (un PDFDocument deja pornit).
function scrieContract(doc, date) {
  const contract = date.contract || {};
  const firma = date.firma || {};
  const em = date.emitent || {};
  const anexa = contract.annex || { vehicles: [], monthlyTotal: 0, currency: 'RON' };
  const ciorna = contract.status !== 'activ';
  const clientRep = contract.client_rep || firma.legal_rep || {};
  const ourRep = contract.our_rep || {};
  const gdprAnexa = !(contract.gdpr && contract.gdpr.kind === 'separat');
  const luni = contract.months;
  const sfarsit = contract.end_at || C.calcSfarsit(contract.start_at, luni);
  const preaviz = contract.notice_days == null ? 30 : contract.notice_days;
  const termenPlata = firma.payment_term_days == null ? 15 : firma.payment_term_days;
  const ziFactura = firma.billing_day || 1;
  const cotaTva = em.vat_rate == null ? 19 : em.vat_rate;

  _antet(doc, contract, ciorna);

  _titlu(doc, 'I. PĂRȚILE CONTRACTANTE');
  _parte(doc, 'PRESTATOR', {
    name: em.name, cui: em.cui, reg_com: em.reg_com,
    address: [em.address, em.city, em.county].filter(Boolean).join(', '),
    iban: em.iban, bank: em.bank, email: em.email, phone: em.phone,
    rep: [ourRep.name, ourRep.role].filter(Boolean).join(', ')
  });
  _parte(doc, 'BENEFICIAR', {
    name: firma.name, cui: firma.cui, reg_com: firma.reg_com, address: firma.address,
    iban: firma.iban, bank: firma.bank_name, email: firma.contact_email, phone: firma.phone,
    rep: [clientRep.name, clientRep.role].filter(Boolean).join(', ')
  });

  _titlu(doc, 'II. OBIECTUL CONTRACTULUI');
  _p(doc, 'Prestatorul pune la dispoziția Beneficiarului serviciul de monitorizare prin GPS a vehiculelor acestuia, prin platforma RA Tracks, împreună cu funcțiile activate în contul Beneficiarului. Aparatele și vehiculele care fac obiectul contractului sunt cele din Anexa nr. 1, parte integrantă din prezentul contract.');
  _p(doc, 'Serviciul cuprinde: colectarea și stocarea datelor de poziție transmise de aparate, afișarea lor în aplicație, rapoartele și alertele disponibile în planul contractat, precum și asistență tehnică pe durata contractului.');

  _titlu(doc, 'III. DURATA CONTRACTULUI');
  _p(doc, 'Contractul intră în vigoare la data de ' + _data(contract.start_at) +
    (luni ? ' și se încheie pe o durată de ' + luni + ' luni, până la data de ' + _data(sfarsit) + '.'
          : ' și se încheie pe durată nedeterminată.'));
  _p(doc, contract.auto_renew !== false
    ? 'La împlinirea termenului, contractul se prelungește automat pe perioade succesive egale, dacă niciuna dintre părți nu îl denunță în scris cu cel puțin ' + preaviz + ' de zile înainte de expirare.'
    : 'Contractul nu se prelungește automat. Continuarea relației după împlinirea termenului se face prin act adițional scris.');

  _titlu(doc, 'IV. PREȚUL ȘI MODALITATEA DE PLATĂ');
  _p(doc, 'Prețul serviciilor este de ' + _bani(anexa.monthlyTotal, anexa.currency) + ' pe lună, fără TVA, conform Anexei nr. 1. ' +
    (em.vat_payer === false ? 'Prestatorul nu este plătitor de TVA.' : 'La preț se adaugă TVA în cota legală de ' + cotaTva + '%.'));
  _p(doc, 'Factura se emite în data de ' + ziFactura + ' a fiecărei luni, iar plata se face în termen de ' + termenPlata + ' zile de la emitere, prin transfer bancar în contul Prestatorului indicat mai sus.');
  _p(doc, 'Neplata facturii la scadență dă dreptul Prestatorului să suspende accesul la platformă, după o perioadă de grație de 15 zile de la expirarea termenului, cu notificarea prealabilă a Beneficiarului. Suspendarea nu înlătură obligația de plată a sumelor datorate.');

  _titlu(doc, 'V. OBLIGAȚIILE PĂRȚILOR');
  _p(doc, 'Prestatorul se obligă: să asigure funcționarea platformei și accesul Beneficiarului la datele proprii; să păstreze confidențialitatea datelor Beneficiarului; să asigure asistență tehnică în timpul programului de lucru; să anunțe din timp lucrările planificate care afectează serviciul.');
  _p(doc, 'Beneficiarul se obligă: să achite prețul la termenele convenite; să folosească platforma potrivit legii și scopului declarat; să își informeze proprii angajați despre monitorizarea vehiculelor, potrivit legislației muncii și protecției datelor; să anunțe Prestatorul despre modificările din flotă care afectează Anexa nr. 1.');

  _titlu(doc, 'VI. PROTECȚIA DATELOR CU CARACTER PERSONAL');
  _p(doc, 'În privința datelor personale prelucrate prin platformă (date de localizare ale vehiculelor și, după caz, ale conducătorilor auto), Beneficiarul are calitatea de OPERATOR, iar Prestatorul pe cea de PERSOANĂ ÎMPUTERNICITĂ, în sensul Regulamentului (UE) 2016/679 (GDPR).');
  _p(doc, gdprAnexa
    ? 'Condițiile prelucrării sunt cele din Anexa nr. 2 — Acord de prelucrare a datelor, parte integrantă din prezentul contract.'
    : 'Condițiile prelucrării sunt stabilite printr-un acord de prelucrare a datelor semnat separat de părți, care completează prezentul contract.');

  _titlu(doc, 'VII. ÎNCETAREA CONTRACTULUI');
  _p(doc, 'Contractul încetează: prin ajungerea la termen, dacă nu se prelungește; prin acordul scris al părților; prin denunțare unilaterală, cu preaviz de ' + preaviz + ' de zile comunicat în scris; prin reziliere, în cazul neexecutării obligațiilor, după o notificare rămasă fără efect timp de 15 zile.');
  _p(doc, 'La încetare, Prestatorul oprește colectarea datelor de la aparatele Beneficiarului. Datele deja colectate se păstrează sau se șterg potrivit Anexei nr. 2, respectiv acordului de prelucrare.');

  _titlu(doc, 'VIII. DISPOZIȚII FINALE');
  _p(doc, 'Modificarea contractului se face prin act adițional scris, semnat de ambele părți. Litigiile se soluționează pe cale amiabilă, iar în lipsa unei înțelegeri, de instanțele competente de la sediul Prestatorului. Contractul se completează cu prevederile legislației române în vigoare.');
  _p(doc, 'Încheiat astăzi, ' + _data(contract.signed_at) + ', în două exemplare originale, câte unul pentru fiecare parte.');

  _semnaturi(doc, em.name, firma.name);

  // ── Anexa 1: aparatele contractate ──
  doc.addPage();
  doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(12).text('ANEXA nr. 1 — Aparate și vehicule contractate');
  doc.font('Nunito').fontSize(8.5).fillColor(GRI)
    .text('la contractul nr. ' + _sauLinie(contract.number) + ' din ' + _data(contract.signed_at));
  doc.moveDown(0.8);
  _tabelAnexa(doc, anexa);
  _p(doc, 'Modificarea listei de mai sus (adăugarea sau scoaterea unui vehicul) se face prin act adițional sau prin anexă nouă, semnată de ambele părți.');
  _semnaturi(doc, em.name, firma.name);

  // ── Anexa 2: acordul GDPR, dacă e anexă și nu act separat ──
  if (gdprAnexa) {
    doc.addPage();
    doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(12).text('ANEXA nr. 2 — Acord de prelucrare a datelor cu caracter personal');
    doc.font('Nunito').fontSize(8.5).fillColor(GRI)
      .text('la contractul nr. ' + _sauLinie(contract.number) + ' din ' + _data(contract.signed_at));
    doc.moveDown(0.8);
    _titlu(doc, '1. Rolurile părților');
    _p(doc, 'Beneficiarul, în calitate de OPERATOR, stabilește scopurile și mijloacele prelucrării. Prestatorul, în calitate de PERSOANĂ ÎMPUTERNICITĂ, prelucrează datele numai la instrucțiunile documentate ale Operatorului, cuprinse în prezentul acord și în contract.');
    _titlu(doc, '2. Obiectul, durata și scopul prelucrării');
    _p(doc, 'Obiectul: furnizarea serviciului de monitorizare GPS. Durata: pe toată durata contractului. Scopul: urmărirea vehiculelor Operatorului, întocmirea rapoartelor de activitate și a alertelor, în interesul legitim al acestuia de administrare a flotei.');
    _titlu(doc, '3. Categoriile de date și de persoane vizate');
    _p(doc, 'Date: poziție geografică, viteză, trasee, opriri, consum și date tehnice transmise de aparat, iar acolo unde Operatorul le introduce — numele conducătorului auto, datele permisului și ale cardului de tahograf. Persoane vizate: angajații și colaboratorii Operatorului care conduc vehiculele monitorizate.');
    _titlu(doc, '4. Obligațiile Persoanei împuternicite');
    _p(doc, 'Prestatorul: prelucrează datele doar la instrucțiunile Operatorului; asigură confidențialitatea persoanelor care au acces la date; ia măsuri tehnice și organizatorice potrivite (control al accesului pe roluri, criptare în transport, jurnal de audit al operațiunilor); sprijină Operatorul la răspunsul către persoanele vizate și la notificarea unei încălcări de securitate; pune la dispoziție informațiile necesare pentru a dovedi respectarea obligațiilor.');
    _titlu(doc, '5. Subîmputerniciți');
    _p(doc, 'Prestatorul poate folosi furnizori de găzduire și de servicii tehnice, cu obligații cel puțin la fel de stricte ca ale sale. Operatorul poate cere oricând lista acestora, iar Prestatorul îl anunță înainte de schimbarea unui furnizor, dându-i posibilitatea de a obiecta.');
    _titlu(doc, '6. Încălcări de securitate');
    _p(doc, 'Prestatorul îl înștiințează pe Operator fără întârziere nejustificată, în cel mult 24 de ore de la luarea la cunoștință, despre orice încălcare a securității datelor, cu informațiile de care dispune la acel moment.');
    _titlu(doc, '7. Soarta datelor la încetare');
    _p(doc, 'La încetarea contractului, Prestatorul șterge sau restituie datele, la alegerea Operatorului exprimată în scris în termen de 30 de zile de la încetare. În lipsa unei opțiuni, datele se șterg după expirarea acestui termen, cu excepția celor pe care legea îl obligă să le păstreze.');
    _titlu(doc, '8. Transferuri în afara Uniunii Europene');
    _p(doc, 'Datele se prelucrează și se stochează pe teritoriul Uniunii Europene. Orice transfer în afara UE se face doar cu garanțiile prevăzute de GDPR și cu informarea prealabilă a Operatorului.');
    _semnaturi(doc, em.name, firma.name);
  }
}

// Randează contractul într-un flux (răspunsul HTTP). Întoarce documentul, ca apelantul să-l poată lega.
function contractPdf(date) {
  const doc = new PDFDocument({
    size: 'A4', margin: 50,
    info: { Title: 'Contract ' + ((date.contract && date.contract.number) || ''), Author: 'RA Tracks' }
  });
  try {
    doc.registerFont('Nunito', path.join(__dirname, 'fonts', 'DejaVuSans.ttf'));
    doc.registerFont('Nunito-Bold', path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf'));
  } catch (e) {
    try { doc.registerFont('Nunito', 'Helvetica'); doc.registerFont('Nunito-Bold', 'Helvetica-Bold'); } catch (e2) {}
  }
  scrieContract(doc, date);
  doc.end();
  return doc;
}

// Numele fișierului, în aceeași formă brandată ca rapoartele (vezi CLAUDE.md).
function numeFisier(contract, firma) {
  const nr = (contract && contract.number) || 'ciorna';
  const cine = String((firma && firma.name) || '').replace(/[\\/:*?"<>|]+/g, '').trim();
  return 'RA-Tracks - Contract ' + nr + (cine ? ' - ' + cine : '') + '.pdf';
}

module.exports = { contractPdf, scrieContract, numeFisier };
