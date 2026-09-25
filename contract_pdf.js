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
// ⚠ REGULA CASEI, învățată pe pielea noastră: pdfkit ȚINE MINTE ultima poziție scrisă. Dacă scrii
// o dată la `left + 102` (coloana valorilor din blocul părților) și pe urmă chemi `doc.text(t)`
// fără poziție, TOT restul contractului pornește de la 152 în loc de 50 — adică textul e împins
// cu zece centimetri spre dreapta și intră în marginea din dreapta. Exact asta s-a întâmplat.
// De aceea, aici, FIECARE scriere își dă explicit x-ul și lățimea. Nu scoate `_ST(doc)`.
function _ST(doc) {
  const left = doc.page.margins.left;
  return { left: left, w: doc.page.width - left - doc.page.margins.right };
}
// Trece la pagină nouă dacă nu mai încap `inaltime` puncte până jos.
function _incape(doc, inaltime) {
  if (doc.y > doc.page.height - doc.page.margins.bottom - inaltime) { doc.addPage(); return true; }
  return false;
}
function _antet(doc, contract, ciorna, titlu, subtitlu) {
  const { left, w } = _ST(doc);
  const sus = doc.page.margins.top;
  const lg = _logo();
  const hLogo = 22;
  if (lg) { try { doc.image(lg, left, sus, { height: hLogo }); } catch (e) {} }
  doc.fillColor(GRI).font('Nunito').fontSize(9)
    .text('Contract nr. ' + _sauLinie(contract.number) + ' / ' + _data(contract.signed_at), left, sus + 7, { width: w, align: 'right' });
  // Linia verde stă sub CE E MAI JOS dintre logo și text, nu sub ultimul lucru scris.
  const yLinie = sus + hLogo + 8;
  doc.moveTo(left, yLinie).lineTo(left + w, yLinie).strokeColor(VERDE).lineWidth(2).stroke();
  doc.y = yLinie + 14;
  doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(15)
    .text(titlu || 'CONTRACT DE PRESTĂRI SERVICII', left, doc.y, { width: w, align: 'center' });
  doc.font('Nunito').fontSize(9).fillColor(GRI)
    .text(subtitlu || 'monitorizare GPS a flotei prin platforma RA Tracks', left, doc.y + 2, { width: w, align: 'center' });
  if (ciorna) {
    doc.fillColor('#b45309').font('Nunito-Bold').fontSize(8.5)
      .text('CIORNĂ — generată automat din datele din aplicație. A se verifica juridic înainte de semnare.',
        left, doc.y + 8, { width: w, align: 'center' });
  }
  doc.x = left;
  doc.y = doc.y + 16;
}
function _titlu(doc, t) {
  const { left, w } = _ST(doc);
  _incape(doc, 70);
  doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(10.5).text(t, left, doc.y + 8, { width: w });
  doc.x = left;
  doc.y += 3;
}
function _p(doc, t, optiuni) {
  const { left, w } = _ST(doc);
  doc.fillColor('#1f2937').font('Nunito').fontSize(9.5)
    .text(t, left, doc.y, Object.assign({ width: w, align: 'justify', lineGap: 1.2 }, optiuni || {}));
  doc.x = left;
  doc.y += 4;
}
function _parte(doc, eticheta, d) {
  const { left, w } = _ST(doc);
  const xEt = left + 6, latEt = 96, xVal = left + 106, latVal = w - 112;
  doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(9.5).text(eticheta, left, doc.y, { width: w });
  doc.y += 2;
  // TOATE rândurile se scriu, chiar goale. Un contract în care lipsește IBAN-ul trebuie să ARATE
  // că lipsește (linie punctată), nu să ascundă rândul — altfel semnezi fără să bagi de seamă.
  const randuri = [
    ['Denumire', d.name], ['CUI / CIF', d.cui], ['Nr. Reg. Com.', d.reg_com],
    ['Sediu', d.address], ['IBAN', d.iban], ['Banca', d.bank],
    ['Email', d.email], ['Telefon', d.phone], ['Reprezentat prin', d.rep]
  ];
  doc.font('Nunito').fontSize(9);
  randuri.forEach(function (r) {
    _incape(doc, 40);
    const y = doc.y;
    doc.fillColor(GRI).text(r[0], xEt, y, { width: latEt, lineBreak: false });
    doc.fillColor('#1f2937').text(_sauLinie(r[1]), xVal, y, { width: latVal });
    // Valoarea poate ocupa două rânduri (o adresă lungă): rândul următor pornește de sub ea.
    doc.y = Math.max(doc.y, y + 10.5);
  });
  doc.x = left;
  doc.y += 8;
}
// Taie un text ca să încapă într-o coloană, MĂSURÂND lățimea lui, nu ghicind după numărul de
// litere. Fără asta, „Teltonika FMC650 · 860000000000001" se rupea pe două rânduri și strica tot
// tabelul; iar `ellipsis` din pdfkit nu se poartă la fel pentru orice combinație de opțiuni.
function _taie(doc, text, latime) {
  let s = String(text == null ? '—' : text);
  if (doc.widthOfString(s) <= latime) return s;
  while (s.length > 1 && doc.widthOfString(s + '…') > latime) s = s.slice(0, -1);
  return s + '…';
}
function _tabelAnexa(doc, anexa) {
  const { left, w } = _ST(doc);
  // Cinci coloane, fiindcă anexa trebuie să justifice prețul: un vehicul „cu CAN" costă mai mult
  // tocmai pentru că aparatul citește date din motor. Fără coloanele astea, anexa spunea o sumă
  // fără să spună pentru ce.
  const col = [w * 0.23, w * 0.14, w * 0.32, w * 0.13, w * 0.18];
  const cap = ['Vehicul', 'Nr. înmatric.', 'Aparat', 'Date motor', 'Abonament'];
  // O celulă poate avea și un al doilea rând, mai mic (modelul sus, IMEI-ul dedesubt). IMEI-ul e
  // numărul care identifică aparatul în contract: NU are voie să fie tăiat ca să încapă.
  function rand(valori, gros) {
    const cuSub = valori.some(function (v) { return v && typeof v === 'object' && v.sub; });
    const h = cuSub ? 28 : 18;
    _incape(doc, h + 16);
    const y = doc.y;
    let x = left;
    valori.forEach(function (v, i) {
      const t = (v && typeof v === 'object') ? v.t : v;
      const sub = (v && typeof v === 'object') ? v.sub : null;
      const alin = i === 4 ? 'right' : (i === 3 ? 'center' : 'left');
      doc.font(gros ? 'Nunito-Bold' : 'Nunito').fontSize(8.5).fillColor(gros ? NEGRU : '#1f2937');
      doc.text(_taie(doc, t, col[i] - 8), x + 4, y + 5, { width: col[i] - 8, lineBreak: false, align: alin });
      if (sub) {
        doc.font('Nunito').fontSize(7.5).fillColor(GRI)
          .text(_taie(doc, sub, col[i] - 8), x + 4, y + 15, { width: col[i] - 8, lineBreak: false, align: alin });
      }
      x += col[i];
    });
    doc.moveTo(left, y + h).lineTo(left + w, y + h).strokeColor(LINIE).lineWidth(gros ? 1.2 : 0.6).stroke();
    doc.x = left;
    doc.y = y + h + 4;
  }
  const veh = (anexa && anexa.vehicles) || [];
  const vehOferta = (anexa && anexa.vehiculeOferta) || [];
  const servicii = (anexa && anexa.servicii) || [];
  const moneda = (anexa && anexa.currency) || 'RON';
  if (veh.length) {
    rand(cap, true);
    veh.forEach(function (v) {
      rand([v.name || v.imei, v.plate,
        { t: v.gpsModel || 'model necompletat', sub: 'IMEI ' + v.imei },
        v.can ? 'DA' : 'nu',
        v.monthlyRON == null ? '—' : _bani(v.monthlyRON, moneda)]);
    });
  } else if (vehOferta.length) {
    // Aparatele nu sunt încă adoptate: hârtia spune câte mașini de fiecare fel și la ce preț, cum
    // s-a convenit în ofertă. Lista cu IMEI-uri vine la bifarea aparatelor.
    _tabelLunar(doc, 'Vehicule monitorizate', vehOferta, moneda);
    doc.font('Nunito').fontSize(8).fillColor(GRI)
      .text('Aparatele (model și IMEI) se trec în anexă după montaj; prețul pe vehicul rămâne cel de mai sus.', left, doc.y, { width: w });
    doc.x = left; doc.y += 6;
  } else {
    rand(cap, true);
    doc.x = left;
    _p(doc, 'Nu au fost trecute aparate în anexă la momentul generării. Anexa se completează în aplicație, la fila „Contract" a firmei, după ce aparatele sunt adoptate.');
  }
  // Ce se plătește lunar fără să țină de o mașină: conturile RA Insight, păstrarea datelor, agenții
  // (incluși). Până pe 23.09 nu apăreau deloc: totalul le cuprindea, dar hârtia nu spunea pentru ce.
  if (servicii.length) _tabelLunar(doc, 'Servicii lunare', servicii, moneda);
  if (!veh.length && !vehOferta.length && !servicii.length && !(anexa && Number(anexa.monthlyTotal) > 0)) return;
  doc.font('Nunito-Bold').fontSize(9.5).fillColor(NEGRU)
    .text('Total abonament lunar: ' + _bani(anexa.monthlyTotal, moneda) + ' (fără TVA)', left, doc.y + 4, { width: w, align: 'right' });
  doc.x = left;
  doc.y += 10;
}
// Un tabel de rânduri lunare (nume · cantitate · preț · total). Aceleași reguli ca restul: fiecare
// scriere își dă poziția, textul se taie măsurat.
function _tabelLunar(doc, titlu, randuri, moneda) {
  const { left, w } = _ST(doc);
  const col = [w * 0.52, w * 0.12, w * 0.18, w * 0.18];
  function rand(valori, gros, sub) {
    const h = sub ? 28 : 18;
    _incape(doc, h + 16);
    const y = doc.y;
    let x = left;
    valori.forEach(function (v, i) {
      doc.font(gros ? 'Nunito-Bold' : 'Nunito').fontSize(8.5).fillColor(gros ? NEGRU : '#1f2937');
      doc.text(_taie(doc, v, col[i] - 8), x + 4, y + 5, { width: col[i] - 8, lineBreak: false, align: i === 0 ? 'left' : 'right' });
      x += col[i];
    });
    if (sub) {
      doc.font('Nunito').fontSize(7.5).fillColor(GRI)
        .text(_taie(doc, sub, col[0] - 8), left + 4, y + 15, { width: col[0] - 8, lineBreak: false });
    }
    doc.moveTo(left, y + h).lineTo(left + w, y + h).strokeColor(LINIE).lineWidth(gros ? 1.2 : 0.6).stroke();
    doc.x = left; doc.y = y + h + 4;
  }
  rand([titlu, 'Cantitate', 'Preț unitar', 'Total / lună'], true);
  randuri.forEach(function (r) {
    rand([r.nume, String(r.cant == null ? 1 : r.cant),
      r.inclus ? 'inclus' : (r.pret == null ? '—' : _bani(r.pret, moneda)),
      r.inclus ? 'inclus' : _bani(r.total, moneda)], false, r.detaliu || null);
  });
  doc.x = left; doc.y += 4;
}
// Tabelul montajului. Aceleași reguli ca la Anexa 1: fiecare scriere își dă poziția, textul se
// taie măsurat. Patru coloane, fiindcă aici nu e nimic de justificat cu CAN — e o lucrare și un preț.
function _tabelMontaj(doc, mont) {
  const { left, w } = _ST(doc);
  const col = [w * 0.46, w * 0.14, w * 0.20, w * 0.20];
  const moneda = (mont && mont.currency) || 'RON';
  function rand(valori, gros) {
    _incape(doc, 34);
    const y = doc.y;
    doc.font(gros ? 'Nunito-Bold' : 'Nunito').fontSize(8.5).fillColor(gros ? NEGRU : '#1f2937');
    let x = left;
    valori.forEach(function (v, i) {
      doc.text(_taie(doc, v, col[i] - 8), x + 4, y + 5, { width: col[i] - 8, lineBreak: false, align: i === 0 ? 'left' : 'right' });
      x += col[i];
    });
    doc.moveTo(left, y + 18).lineTo(left + w, y + 18).strokeColor(LINIE).lineWidth(gros ? 1.2 : 0.6).stroke();
    doc.x = left; doc.y = y + 22;
  }
  rand(['Lucrare', 'Cantitate', 'Preț unitar', 'Total'], true);
  (mont.items || []).forEach(function (r) {
    rand([r.eticheta || r.tip, r.buc + ' ' + (r.um || 'buc'),
      r.pretClient == null ? '—' : _bani(r.pretClient, moneda),
      _bani(r.total, moneda)]);
  });
  doc.font('Nunito-Bold').fontSize(9.5).fillColor(NEGRU)
    .text('Total montaj (cost unic): ' + _bani(mont.totalClient, moneda) + ' (fără TVA)', left, doc.y + 4, { width: w, align: 'right' });
  doc.x = left; doc.y += 12;
}
// Tabelul echipamentelor vândute. Prețul se negociază în euro (așa le cumpărăm și noi), dar pe
// hârtie apare și echivalentul în lei, la cursul ÎNGHEȚAT în anexă — nu la cursul de mâine.
function _tabelEchip(doc, echip) {
  const { left, w } = _ST(doc);
  const col = [w * 0.44, w * 0.12, w * 0.16, w * 0.14, w * 0.14];
  function rand(valori, gros) {
    _incape(doc, 34);
    const y = doc.y;
    doc.font(gros ? 'Nunito-Bold' : 'Nunito').fontSize(8.5).fillColor(gros ? NEGRU : '#1f2937');
    let x = left;
    valori.forEach(function (v, i) {
      doc.text(_taie(doc, v, col[i] - 8), x + 4, y + 5, { width: col[i] - 8, lineBreak: false, align: i === 0 ? 'left' : 'right' });
      x += col[i];
    });
    doc.moveTo(left, y + 18).lineTo(left + w, y + 18).strokeColor(LINIE).lineWidth(gros ? 1.2 : 0.6).stroke();
    doc.x = left; doc.y = y + 22;
  }
  rand(['Echipament', 'Cant.', 'Preț unitar', 'Total EUR', 'Total lei'], true);
  (echip.items || []).forEach(function (r) {
    rand([r.eticheta || r.tip, r.buc + ' buc',
      r.pretEur == null ? '—' : _bani(r.pretEur, 'EUR'),
      _bani(r.totalEur, 'EUR'), _bani(r.totalLei, 'RON')]);
  });
  doc.font('Nunito-Bold').fontSize(9.5).fillColor(NEGRU)
    .text('Total echipamente: ' + _bani(echip.totalEur, 'EUR') + ' = ' + _bani(echip.totalLei, 'RON'), left, doc.y + 4, { width: w, align: 'right' });
  doc.font('Nunito').fontSize(8).fillColor(GRI)
    .text('Curs de schimb folosit în prezenta anexă: 1 EUR = ' + Number(echip.curs).toFixed(4) + ' lei.', left, doc.y + 3, { width: w, align: 'right' });
  doc.x = left; doc.y += 14;
}
// Aparatele ÎNCHIRIATE (25.09): ale Prestatorului, date în folosință. Chiria e deja în tabelul lunar de
// mai sus; aici e lista lor, cu valoarea care se plătește dacă un aparat nu se returnează.
function _tabelChirie(doc, chirie) {
  const { left, w } = _ST(doc);
  const col = [w * 0.46, w * 0.14, w * 0.2, w * 0.2];
  function rand(valori, gros) {
    _incape(doc, 34);
    const y = doc.y;
    doc.font(gros ? 'Nunito-Bold' : 'Nunito').fontSize(8.5).fillColor(gros ? NEGRU : '#1f2937');
    let x = left;
    valori.forEach(function (v, i) {
      doc.text(_taie(doc, v, col[i] - 8), x + 4, y + 5, { width: col[i] - 8, lineBreak: false, align: i === 0 ? 'left' : 'right' });
      x += col[i];
    });
    doc.moveTo(left, y + 18).lineTo(left + w, y + 18).strokeColor(LINIE).lineWidth(gros ? 1.2 : 0.6).stroke();
    doc.x = left; doc.y = y + 22;
  }
  rand(['Aparat', 'Cant.', 'Chirie / lună / buc.', 'Valoare / buc.'], true);
  (chirie.aparate || []).forEach(function (a) {
    rand([a.nume, a.cant + ' buc', _bani(a.chirie, 'RON'), a.valoare == null ? '—' : _bani(a.valoare, 'RON')]);
  });
  doc.x = left; doc.y += 6;
}
function _semnaturi(doc, numePrestator, numeBeneficiar) {
  const { left, w } = _ST(doc);
  _incape(doc, 120);
  const y = doc.y + 24;
  const latCol = w / 2 - 12, xDr = left + w / 2 + 12;
  doc.font('Nunito-Bold').fontSize(9.5).fillColor(NEGRU);
  doc.text('PRESTATOR', left, y, { width: latCol, lineBreak: false });
  doc.text('BENEFICIAR', xDr, y, { width: latCol, lineBreak: false });
  doc.font('Nunito').fontSize(9).fillColor('#1f2937');
  doc.text(_sauLinie(numePrestator), left, y + 14, { width: latCol, lineBreak: false, ellipsis: true });
  doc.text(_sauLinie(numeBeneficiar), xDr, y + 14, { width: latCol, lineBreak: false, ellipsis: true });
  // Numele sus, locul de semnat gol dedesubt, linia sub el, iar explicația sub linie — cum arată
  // orice contract pe hârtie. Înainte numele stătea lipit sus, iar linia venea din senin, jos.
  const yLinie = y + 62;
  doc.moveTo(left, yLinie).lineTo(left + latCol, yLinie).strokeColor(LINIE).lineWidth(0.8).stroke();
  doc.moveTo(xDr, yLinie).lineTo(xDr + latCol, yLinie).stroke();
  doc.fillColor(GRI).fontSize(8.5);
  doc.text('Semnătura și ștampila', left, yLinie + 4, { width: latCol, lineBreak: false });
  doc.text('Semnătura și ștampila', xDr, yLinie + 4, { width: latCol, lineBreak: false });
  doc.x = left;
  doc.y = yLinie + 20;
}

// ─── Contractul întreg ───────────────────────────────────────────────────────────────────────
// `date` = { contract, firma, emitent }. Scrie în `doc` (un PDFDocument deja pornit).
function scrieContract(doc, date) {
  const contract = date.contract || {};
  const firma = date.firma || {};
  const em = date.emitent || {};
  const anexa = contract.annex || { vehicles: [], monthlyTotal: 0, currency: 'RON' };
  // Semnul „CIORNĂ" ține de o singură stare: „în lucru". Din clipa în care contractul e APROBAT,
  // hârtia e curată și se poate printa pentru semnare — asta a fost cererea lui Alin: „dacă noi deja
  // vorbim de o semnare de contract, aici ar trebui aprobă contractul și îl poți descărca printabil".
  const ciorna = contract.status === 'ciorna';
  const clientRep = contract.client_rep || firma.legal_rep || {};
  const ourRep = contract.our_rep || {};
  const gdprAnexa = !(contract.gdpr && contract.gdpr.kind === 'separat');
  // Anexa nr. 2 e montajul (costurile unice), dacă există; atunci acordul GDPR e Anexa nr. 3. Textul
  // contractului trimite la acord prin numărul ĂSTA — până pe 23.09 scria mereu „Anexa nr. 2", deși,
  // cu montaj, acordul se tipărea ca Anexa nr. 3: un act semnat care trimitea la anexa greșită.
  const mont = contract.montaj;
  const echip = mont && mont.echipamente;
  const areEchip = !!(echip && (echip.items || []).length);
  const areMontaj = !!(mont && ((mont.items || []).length || areEchip));
  const nrGdpr = areMontaj ? 3 : 2;
  const luni = contract.months;
  const sfarsit = contract.end_at || C.calcSfarsit(contract.start_at, luni);
  const preaviz = contract.notice_days == null ? 30 : contract.notice_days;
  const termenPlata = firma.payment_term_days == null ? 15 : firma.payment_term_days;
  const ziFactura = firma.billing_day || 1;
  const cotaTva = em.vat_rate == null ? 19 : em.vat_rate;
  // Cât se păstrează istoricul: cât scrie în anexa semnată (dacă s-a cumpărat mai mult), altfel regula
  // de azi a firmei, altfel cele 12 luni incluse. Aceeași cifră după care aplicația chiar șterge
  // (contracts.js → `pastrareFirma`) — hârtia și aplicația nu au voie să spună lucruri diferite.
  const _pf = C.pastrareFirma(firma && firma.settings);
  const luniIstoric = Number(anexa.pastrareLuni) || (_pf ? _pf.luni : C.LUNI_ISTORIC_INCLUSE);

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
  _p(doc, 'Serviciul cuprinde: colectarea și stocarea datelor de poziție transmise de aparate, afișarea lor în aplicație, rapoartele și alertele incluse în abonament, precum și asistență tehnică pe durata contractului.');

  _titlu(doc, 'III. DURATA CONTRACTULUI');
  _p(doc, 'Contractul intră în vigoare la data de ' + _data(contract.start_at) +
    (luni ? ' și se încheie pe o durată de ' + C.numar(luni, 'lună', 'luni') + ', până la data de ' + _data(sfarsit) + '.'
          : ' și se încheie pe durată nedeterminată.'));
  _p(doc, contract.auto_renew !== false
    ? 'La împlinirea termenului, contractul se prelungește automat pe perioade succesive egale, dacă niciuna dintre părți nu îl denunță în scris cu cel puțin ' + preaviz + ' de zile înainte de expirare.'
    : 'Contractul nu se prelungește automat. Continuarea relației după împlinirea termenului se face prin act adițional scris.');

  _titlu(doc, 'IV. PREȚUL ȘI MODALITATEA DE PLATĂ');
  const areServicii = (anexa.servicii || []).length > 0;
  _p(doc, 'Prețul serviciilor este de ' + _bani(anexa.monthlyTotal, anexa.currency) + ' pe lună, fără TVA, conform Anexei nr. 1' +
    (areServicii ? ', și cuprinde abonamentul vehiculelor și serviciile lunare enumerate acolo. ' : '. ') +
    (em.vat_payer === false ? 'Prestatorul nu este plătitor de TVA.' : 'La preț se adaugă TVA în cota legală de ' + cotaTva + '%.'));
  // RA Insight se vinde pe CONT, iar numărul de conturi îl schimbă clientul singur, din aplicație.
  // Fără clauza asta, factura din noiembrie ar putea fi alta decât cea din octombrie fără ca omul să
  // fi semnat nimic — și ar avea dreptate să întrebe de ce.
  if (Number(anexa.aiSeatPriceRON) > 0) {
    const nIntrebari = Math.max(0, Math.round(Number(anexa.aiQuestionsPerSeat) || 0));
    _p(doc, 'Prețul unui cont de RA Insight este de ' + _bani(anexa.aiSeatPriceRON, anexa.currency) + ' pe lună, fără TVA. ' +
      'Numărul de conturi se modifică oricând de către Beneficiar, din aplicație, iar factura urmează numărul de conturi active în luna respectivă' +
      (areServicii ? ' (numărul din Anexa nr. 1 e cel de la semnare). ' : '. ') +
      // 0 = NELIMITAT, exact ca pe firmă. Înainte un 0 se scria „50 de întrebări".
      (nIntrebari > 0
        ? 'Fiecare cont aduce ' + C.numar(nIntrebari, 'întrebare', 'întrebări') + ' pe lună, într-un fond comun al Beneficiarului; ' +
          'la epuizarea fondului serviciul se oprește până la reînnoirea lunară, fără costuri suplimentare.'
        : 'Numărul de întrebări nu este limitat.'));
  }
  // Aparatele ÎNCHIRIATE (25.09): ale Prestatorului, cu chiria pe rând separat și durata minimă.
  const chirieA = anexa.chirie && (anexa.chirie.aparate || []).length ? anexa.chirie : null;
  const luniMinCh = chirieA ? (Number(chirieA.luniMin) || C.CHIRIE_LUNI_MIN) : 0;
  if (chirieA) {
    _p(doc, 'Aparatele de monitorizare enumerate în Anexa nr. 1, la „Aparate închiriate", sunt date Beneficiarului în folosință, cu chirie, și rămân proprietatea Prestatorului pe toată durata contractului. ' +
      'Chiria lunară este cuprinsă în prețul de mai sus și apare pe factură pe rând separat. Durata minimă a contractului este de ' + C.numar(luniMinCh, 'lună', 'luni') + '.');
  }
  _p(doc, 'Factura se emite în data de ' + ziFactura + ' a fiecărei luni, iar plata se face în termen de ' + termenPlata + ' zile de la emitere, prin transfer bancar în contul Prestatorului indicat mai sus.');
  _p(doc, 'Neplata facturii la scadență dă dreptul Prestatorului să suspende accesul la platformă, după o perioadă de grație de 15 zile de la expirarea termenului, cu notificarea prealabilă a Beneficiarului. Suspendarea nu înlătură obligația de plată a sumelor datorate.');

  _titlu(doc, 'V. OBLIGAȚIILE PĂRȚILOR');
  _p(doc, 'Prestatorul se obligă: să asigure funcționarea platformei și accesul Beneficiarului la datele proprii; să păstreze confidențialitatea datelor Beneficiarului; să asigure asistență tehnică în timpul programului de lucru; să anunțe din timp lucrările planificate care afectează serviciul.');
  _p(doc, 'Beneficiarul se obligă: să achite prețul la termenele convenite; să folosească platforma potrivit legii și scopului declarat; să își informeze proprii angajați despre monitorizarea vehiculelor, potrivit legislației muncii și protecției datelor; să anunțe Prestatorul despre modificările din flotă care afectează Anexa nr. 1.');

  _titlu(doc, 'VI. PROTECȚIA DATELOR CU CARACTER PERSONAL');
  _p(doc, 'În privința datelor personale prelucrate prin platformă (date de localizare ale vehiculelor și, după caz, ale conducătorilor auto), Beneficiarul are calitatea de OPERATOR, iar Prestatorul pe cea de PERSOANĂ ÎMPUTERNICITĂ, în sensul Regulamentului (UE) 2016/679 (GDPR).');
  _p(doc, gdprAnexa
    ? 'Condițiile prelucrării sunt cele din Anexa nr. ' + nrGdpr + ' — Acord de prelucrare a datelor, parte integrantă din prezentul contract.'
    : 'Condițiile prelucrării sunt stabilite printr-un acord de prelucrare a datelor semnat separat de părți, care completează prezentul contract.');
  _p(doc, 'Cât contractul e în vigoare, istoricul vehiculelor (pozițiile, cursele și alertele) se păstrează ' +
    C.numar(luniIstoric, 'lună', 'luni') + ' de la înregistrare, apoi se șterge automat. Beneficiarul își poate descărca oricând rapoartele de care are nevoie pentru o perioadă mai lungă.');

  _titlu(doc, 'VII. ÎNCETAREA CONTRACTULUI');
  _p(doc, 'Contractul încetează: prin ajungerea la termen, dacă nu se prelungește; prin acordul scris al părților; prin denunțare unilaterală, cu preaviz de ' + preaviz + ' de zile comunicat în scris; prin reziliere, în cazul neexecutării obligațiilor, după o notificare rămasă fără efect timp de 15 zile.');
  _p(doc, 'La încetare, Prestatorul oprește colectarea datelor de la aparatele Beneficiarului. Datele deja colectate se păstrează sau se șterg potrivit ' +
    (gdprAnexa ? 'Anexei nr. ' + nrGdpr + ' (acordul de prelucrare a datelor).' : 'acordului de prelucrare a datelor semnat separat.'));
  if (chirieA) {
    _p(doc, 'Dacă Beneficiarul denunță contractul înainte de împlinirea duratei minime de ' + C.numar(luniMinCh, 'lună', 'luni') +
      ', datorează chiria aparatelor închiriate pentru lunile rămase până la împlinirea acesteia.');
    _p(doc, 'La încetarea contractului, Beneficiarul restituie aparatele închiriate: pune vehiculele la dispoziția Prestatorului pentru demontare în cel mult ' +
      C.numar(C.CHIRIE_ZILE_RETUR, 'zi', 'zile') + '. Aparatele nerestituite sau deteriorate din culpa Beneficiarului se plătesc la valoarea din Anexa nr. 1.');
  }

  _titlu(doc, 'VIII. DISPOZIȚII FINALE');
  _p(doc, 'Modificarea contractului se face prin act adițional scris, semnat de ambele părți. Litigiile se soluționează pe cale amiabilă, iar în lipsa unei înțelegeri, de instanțele competente de la sediul Prestatorului. Contractul se completează cu prevederile legislației române în vigoare.');
  _p(doc, 'Încheiat astăzi, ' + _data(contract.signed_at) + ', în două exemplare originale, câte unul pentru fiecare parte.');

  _semnaturi(doc, em.name, firma.name);

  // ── Anexa 1: aparatele contractate ──
  doc.addPage();
  const A1 = _ST(doc);
  doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(12).text('ANEXA nr. 1 — Aparate și vehicule contractate', A1.left, doc.y, { width: A1.w });
  doc.font('Nunito').fontSize(8.5).fillColor(GRI)
    .text('la contractul nr. ' + _sauLinie(contract.number) + ' din ' + _data(contract.signed_at), A1.left, doc.y + 2, { width: A1.w });
  doc.x = A1.left; doc.y += 12;
  _tabelAnexa(doc, anexa);
  if (chirieA) {
    _titlu(doc, 'Aparate închiriate — proprietatea Prestatorului');
    _tabelChirie(doc, chirieA);
    _p(doc, 'Aparatele de mai sus rămân proprietatea Prestatorului. Chiria lor e cuprinsă în prețul lunar de mai sus; valoarea se plătește doar dacă un aparat nu se restituie la încetare sau e deteriorat din culpa Beneficiarului.');
  }
  _p(doc, 'Modificarea listei de mai sus (adăugarea sau scoaterea unui vehicul) se face prin act adițional sau prin anexă nouă, semnată de ambele părți.');
  _semnaturi(doc, em.name, firma.name);

  // ── Anexa 2: montajul, dacă s-a convenit. COST UNIC, separat de abonamentul lunar. ──
  // Aici apare DOAR prețul către client. Cât ne cere partenerul care execută nu are ce căuta pe
  // hârtia asta și nici nu ajunge până aici: `facAnexaMontaj` nu-l copiază.
  if (areMontaj) {
    doc.addPage();
    const AM = _ST(doc);
    doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(12)
      .text('ANEXA nr. 2 — ' + (areEchip ? 'Echipamente și montaj' : 'Montaj') + ' (costuri unice)', AM.left, doc.y, { width: AM.w });
    doc.font('Nunito').fontSize(8.5).fillColor(GRI)
      .text('la contractul nr. ' + _sauLinie(contract.number) + ' din ' + _data(contract.signed_at), AM.left, doc.y + 2, { width: AM.w });
    doc.x = AM.left; doc.y += 12;
    _p(doc, 'Sumele din prezenta anexă se plătesc O SINGURĂ DATĂ, la livrare și la execuție, și NU fac parte din abonamentul lunar din Anexa nr. 1.');
    // Marfa întâi, manopera după: așa se citește o factură și așa se înțelege devizul.
    if (areEchip) {
      _titlu(doc, 'A. Echipamente livrate');
      _tabelEchip(doc, echip);
    }
    if ((mont.items || []).length) {
      if (areEchip) _titlu(doc, 'B. Montaj și punere în funcțiune');
      _tabelMontaj(doc, mont);
    }
    if (areEchip && (mont.items || []).length) {
      const { left, w } = _ST(doc);
      doc.font('Nunito-Bold').fontSize(11).fillColor(NEGRU)
        .text('TOTAL de plată o singură dată: ' + _bani(mont.totalUnicLei != null ? mont.totalUnicLei : (mont.totalClient + echip.totalLei), 'RON') + ' (fără TVA)',
          left, doc.y + 6, { width: w, align: 'right' });
      doc.x = left; doc.y += 16;
    }
    _p(doc, (areEchip ? 'Echipamentele rămân în proprietatea Beneficiarului de la data achitării lor. '
      : (chirieA ? 'Aparatele montate sunt cele închiriate din Anexa nr. 1 și rămân proprietatea Prestatorului. ' : '')) +
      'Lucrările de montaj se execută de Prestator sau prin colaboratori ai acestuia, sub răspunderea Prestatorului. Deplasările suplimentare, lucrările neprevăzute și intervențiile cerute ulterior se tarifează separat, la tarifele de mai sus.');
    _semnaturi(doc, em.name, firma.name);
  }

  // ── Anexa 2: acordul GDPR, dacă e anexă și nu act separat ──
  if (gdprAnexa) {
    doc.addPage();
    const A2 = _ST(doc);
    // Numărul anexei se mută dacă există montaj: GDPR-ul e mereu ULTIMA anexă.
    doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(12).text('ANEXA nr. ' + nrGdpr + ' — Acord de prelucrare a datelor cu caracter personal', A2.left, doc.y, { width: A2.w });
    doc.font('Nunito').fontSize(8.5).fillColor(GRI)
      .text('la contractul nr. ' + _sauLinie(contract.number) + ' din ' + _data(contract.signed_at), A2.left, doc.y + 2, { width: A2.w });
    doc.x = A2.left; doc.y += 12;
    _titlu(doc, '1. Rolurile părților');
    _p(doc, 'Beneficiarul, în calitate de OPERATOR, stabilește scopurile și mijloacele prelucrării. Prestatorul, în calitate de PERSOANĂ ÎMPUTERNICITĂ, prelucrează datele numai la instrucțiunile documentate ale Operatorului, cuprinse în prezentul acord și în contract.');
    _titlu(doc, '2. Obiectul, durata și scopul prelucrării');
    _p(doc, 'Obiectul: furnizarea serviciului de monitorizare GPS. Durata: pe toată durata contractului; istoricul se păstrează ' +
      C.numar(luniIstoric, 'lună', 'luni') + ' de la înregistrare, apoi se șterge automat. Scopul: urmărirea vehiculelor Operatorului, întocmirea rapoartelor de activitate și a alertelor, în interesul legitim al acestuia de administrare a flotei.');
    _titlu(doc, '3. Categoriile de date și de persoane vizate');
    _p(doc, 'Date: poziție geografică, viteză, trasee, opriri, consum și date tehnice transmise de aparat, iar acolo unde Operatorul le introduce — numele conducătorului auto, datele permisului și ale cardului de tahograf. Persoane vizate: angajații și colaboratorii Operatorului care conduc vehiculele monitorizate.');
    _titlu(doc, '4. Obligațiile Persoanei împuternicite');
    _p(doc, 'Prestatorul: prelucrează datele doar la instrucțiunile Operatorului; asigură confidențialitatea persoanelor care au acces la date; ia măsuri tehnice și organizatorice potrivite (control al accesului pe roluri, criptare în transport, jurnal de audit al operațiunilor); sprijină Operatorul la răspunsul către persoanele vizate și la notificarea unei încălcări de securitate; pune la dispoziție informațiile necesare pentru a dovedi respectarea obligațiilor.');
    _titlu(doc, '5. Subîmputerniciți');
    _p(doc, 'Prestatorul poate folosi furnizori de găzduire și de servicii tehnice, cu obligații cel puțin la fel de stricte ca ale sale. Operatorul poate cere oricând lista acestora, iar Prestatorul îl anunță înainte de schimbarea unui furnizor, dându-i posibilitatea de a obiecta.');
    _titlu(doc, '6. Încălcări de securitate');
    _p(doc, 'Prestatorul îl înștiințează pe Operator fără întârziere nejustificată, în cel mult 24 de ore de la luarea la cunoștință, despre orice încălcare a securității datelor, cu informațiile de care dispune la acel moment.');
    _titlu(doc, '7. Soarta datelor la încetare');
    // Cifra e ACEEAȘI cu cea după care aplicația șterge singură istoricul (contracts.js) — hârtia și
    // aplicația nu au voie să promită lucruri diferite (până pe 24.09 aplicația ținea 2 ani).
    _p(doc, 'La încetarea contractului, Prestatorul șterge sau restituie datele, la alegerea Operatorului exprimată în scris în termen de ' +
      C.numar(C.ZILE_DATE_DUPA_INCETARE, 'zi', 'zile') + ' de la încetare. În lipsa unei opțiuni, datele se șterg după expirarea acestui termen, cu excepția celor pe care legea îl obligă să le păstreze.');
    _titlu(doc, '8. Transferuri în afara Uniunii Europene');
    _p(doc, 'Datele se prelucrează și se stochează pe teritoriul Uniunii Europene. Orice transfer în afara UE se face doar cu garanțiile prevăzute de GDPR și cu informarea prealabilă a Operatorului.');
    _semnaturi(doc, em.name, firma.name);
  }
}

// ─── Actul adițional ─────────────────────────────────────────────────────────────────────────
// Un contract semnat nu se mai schimbă. Ce se schimbă în timp (mai multe mașini, alt preț, alte
// module, prelungire) se scrie într-un act adițional: o hârtie scurtă, care se agață de contractul
// vechi, spune CE se schimbă și de CÂND, și repetă doar anexele care se modifică.
function scrieAct(doc, date) {
  const act = date.act || {};
  const contract = date.contract || {};
  const firma = date.firma || {};
  const em = date.emitent || {};
  const ciorna = act.status === 'ciorna';
  const clientRep = act.client_rep || contract.client_rep || firma.legal_rep || {};
  const ourRep = act.our_rep || contract.our_rep || {};

  const { left, w } = _ST(doc);
  const sus = doc.page.margins.top;
  const lg = _logo();
  if (lg) { try { doc.image(lg, left, sus, { height: 22 }); } catch (e) {} }
  doc.fillColor(GRI).font('Nunito').fontSize(9)
    .text('Act adițional nr. ' + _sauLinie(act.number) + ' / ' + _data(act.signed_at), left, sus + 7, { width: w, align: 'right' });
  const yLinie = sus + 30;
  doc.moveTo(left, yLinie).lineTo(left + w, yLinie).strokeColor(VERDE).lineWidth(2).stroke();
  doc.y = yLinie + 14;
  doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(15).text('ACT ADIȚIONAL', left, doc.y, { width: w, align: 'center' });
  doc.font('Nunito').fontSize(9).fillColor(GRI)
    .text('la contractul de prestări servicii nr. ' + _sauLinie(contract.number) + ' din ' + _data(contract.signed_at),
      left, doc.y + 2, { width: w, align: 'center' });
  if (ciorna) {
    doc.fillColor('#b45309').font('Nunito-Bold').fontSize(8.5)
      .text('CIORNĂ — a se verifica juridic înainte de semnare.', left, doc.y + 8, { width: w, align: 'center' });
  }
  doc.x = left; doc.y += 16;

  _titlu(doc, 'I. PĂRȚILE');
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

  _titlu(doc, 'II. OBIECTUL ACTULUI ADIȚIONAL');
  _p(doc, 'Părțile convin modificarea contractului menționat mai sus, după cum urmează:');
  _p(doc, act.obiect || '____________________________________________________________________');
  _p(doc, 'Modificările produc efecte începând cu data de ' + _data(act.start_at) + '.');
  if (act.luni_noi) {
    // Cu data până la care ține contractul DUPĂ prelungire (o dă serverul, din capătul de azi). Textul
    // vechi — „cu N luni de la data de mai sus" — lăsa de ghicit de la ce dată se numără.
    _p(doc, 'Durata contractului se prelungește cu ' + C.numar(act.luni_noi, 'lună', 'luni') +
      (date.panaLa ? ', până la data de ' + _data(date.panaLa) + '.' : '.'));
  }

  _titlu(doc, 'III. CELELALTE CLAUZE');
  _p(doc, 'Restul clauzelor contractului inițial și ale anexelor sale rămân neschimbate și își produc efectele în continuare. Prezentul act adițional face parte integrantă din contract.');
  _p(doc, 'Încheiat astăzi, ' + _data(act.signed_at) + ', în două exemplare originale, câte unul pentru fiecare parte.');
  _semnaturi(doc, em.name, firma.name);

  // Anexele se REPETĂ doar dacă se schimbă. Un act adițional care nu atinge aparatele n-are de ce
  // să retipărească lista lor — altfel nu se mai înțelege ce s-a schimbat de fapt.
  const areAnexa = !!(act.annex && (act.annex.vehicles || []).length);
  const areMontaj = !!(act.montaj && (act.montaj.items || []).length);
  if (areAnexa) {
    doc.addPage();
    const A = _ST(doc);
    doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(12)
      .text('ANEXA nr. 1 la actul adițional — lista actualizată de aparate', A.left, doc.y, { width: A.w });
    doc.font('Nunito').fontSize(8.5).fillColor(GRI)
      .text('înlocuiește Anexa nr. 1 a contractului nr. ' + _sauLinie(contract.number), A.left, doc.y + 2, { width: A.w });
    doc.x = A.left; doc.y += 12;
    _tabelAnexa(doc, act.annex);
    _semnaturi(doc, em.name, firma.name);
  }
  if (areMontaj) {
    doc.addPage();
    const A = _ST(doc);
    doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(12)
      .text('ANEXA nr. ' + (areAnexa ? 2 : 1) + ' la actul adițional — montaj (cost unic)', A.left, doc.y, { width: A.w });
    doc.x = A.left; doc.y += 12;
    _p(doc, 'Lucrările de montaj de mai jos se tarifează o singură dată, la execuție, și nu fac parte din abonamentul lunar.');
    _tabelMontaj(doc, act.montaj);
    _semnaturi(doc, em.name, firma.name);
  }
}
function actPdf(date) {
  const doc = new PDFDocument({
    size: 'A4', margin: 50,
    info: { Title: 'Act adițional ' + ((date.act && date.act.number) || ''), Author: 'RA Tracks' }
  });
  try {
    doc.registerFont('Nunito', path.join(__dirname, 'fonts', 'DejaVuSans.ttf'));
    doc.registerFont('Nunito-Bold', path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf'));
  } catch (e) {
    try { doc.registerFont('Nunito', 'Helvetica'); doc.registerFont('Nunito-Bold', 'Helvetica-Bold'); } catch (e2) {}
  }
  scrieAct(doc, date);
  doc.end();
  return doc;
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

// Numele fișierului descărcat, după regula casei (ca rapoartele și ofertele): „RA-Tracks - Contract
// RAT-C-2026-0001 - Transport Alfa SRL.pdf". Hotărât de Alin pe 24.09 (pe 09.09 ceruse „RA
// TRAKS-Contract", de pe vremea când și logo-ul scria „traks").
// Caracterele interzise în numele de fișier se scot din TOT numele, nu doar din firmă: numărul unui
// act adițional are „/" („RAT-C-2026-0001/A1"), iar browserul îl transforma cum voia el.
function numeFisier(contract, firma, fel) {
  const curat = function (t) { return String(t || '').replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim(); };
  const nr = curat((contract && contract.number) || 'ciornă');
  const cine = curat(firma && firma.name);
  return 'RA-Tracks - ' + (fel || 'Contract') + ' ' + nr + (cine ? ' - ' + cine : '') + '.pdf';
}

// ─── Contractul de colaborare cu un PARTENER DE MONTAJ (24.09) ──────────────────────────────────
// Alin: „semnăm contracte cu partenerii fix la fel ca la clienți", iar textul „fă-l tu". Aici banii
// merg invers: partenerul (PRESTATOR) execută lucrări pentru noi (BENEFICIAR) și ne facturează pe noi.
// Clientul nu apare pe hârtie și nu vede niciodată partenerul — pentru el montăm noi.
// Ce contează juridic: partenerul intră la clienți și vede date ale lor (adrese, persoane de contact,
// mașini), deci e SUBÎMPUTERNICIT GDPR al nostru (art. 28 alin. 4) — Anexa nr. 2. Tarifele sunt Anexa
// nr. 1, înghețate la creare. De citit de un jurist înainte de primul semnat (în jurnal, la lansare).
const montajMod = require('./montaj');
function _tabelTarife(doc, tarife) {
  const { left, w } = _ST(doc);
  const t = tarife || {};
  const randuri = montajMod.TIPURI.filter(function (x) { return t[x.k] != null && t[x.k] !== ''; });
  if (!randuri.length) {
    _p(doc, 'Tarifele se stabilesc în scris, pentru fiecare comandă, înainte de executarea lucrării.');
    return;
  }
  const c1 = left, c2 = left + w * 0.62, c3 = left + w * 0.74, lat3 = w * 0.26;
  _incape(doc, 40);
  let y = doc.y;
  doc.font('Nunito-Bold').fontSize(9).fillColor(NEGRU);
  doc.text('Lucrare', c1, y, { width: w * 0.6, lineBreak: false });
  doc.text('U.M.', c2, y, { width: w * 0.1, lineBreak: false });
  doc.text('Tarif (lei, fără TVA)', c3, y, { width: lat3, align: 'right', lineBreak: false });
  y += 14;
  doc.moveTo(left, y - 3).lineTo(left + w, y - 3).strokeColor(LINIE).lineWidth(0.8).stroke();
  doc.font('Nunito').fontSize(9).fillColor('#1f2937');
  randuri.forEach(function (r) {
    _incape(doc, 20);
    doc.text(r.et, c1, y, { width: w * 0.6, lineBreak: false });
    doc.text(r.um === 'km' ? 'km' : 'buc.', c2, y, { width: w * 0.1, lineBreak: false });
    doc.text(_bani(t[r.k], 'lei'), c3, y, { width: lat3, align: 'right', lineBreak: false });
    y += 13;
  });
  doc.x = left; doc.y = y + 6;
}
function scrieContractMontaj(doc, date) {
  const c = date.contract || {}, p = date.partener || {}, em = date.emitent || {};
  const { left } = _ST(doc);
  const ciorna = c.status === 'ciorna';
  const luni = c.months, sfarsit = c.end_at || C.calcSfarsit(c.start_at, luni);
  const preaviz = c.notice_days == null ? 30 : c.notice_days;
  const plata = c.plata_zile == null ? 30 : c.plata_zile;
  const repP = c.partner_rep || p.legal_rep || {}, repN = c.our_rep || {};
  const zona = String(c.zona || p.zona || '').trim();

  _antet(doc, c, ciorna, 'CONTRACT DE COLABORARE', 'servicii de montaj pentru echipamente de monitorizare GPS');

  _titlu(doc, 'I. PĂRȚILE CONTRACTANTE');
  _parte(doc, 'PRESTATOR', {
    name: p.name, cui: p.cui, reg_com: p.reg_com, address: p.address, iban: p.iban, bank: p.bank,
    email: p.email, phone: p.phone, rep: [repP.name, repP.role].filter(Boolean).join(', ')
  });
  _parte(doc, 'BENEFICIAR', {
    name: em.name, cui: em.cui, reg_com: em.reg_com,
    address: [em.address, em.city, em.county].filter(Boolean).join(', '),
    iban: em.iban, bank: em.bank, email: em.email, phone: em.phone,
    rep: [repN.name, repN.role].filter(Boolean).join(', ')
  });

  _titlu(doc, 'II. OBIECTUL CONTRACTULUI');
  _p(doc, 'Prestatorul execută, la comanda Beneficiarului, lucrări de montaj, demontaj, înlocuire și verificare a echipamentelor de monitorizare GPS (aparate de urmărire, module de citire a datelor din calculatorul de bord, conexiuni la tahograf) pe vehiculele clienților Beneficiarului' +
    (zona ? ', în zona: ' + zona + '.' : ', pe teritoriul României.'));
  _p(doc, 'Prestatorul lucrează ca subcontractant al Beneficiarului: față de clienți, lucrarea este a Beneficiarului, iar Prestatorul se prezintă ca montator al acestuia.');

  _titlu(doc, 'III. COMANDA ȘI EXECUȚIA LUCRĂRILOR');
  _p(doc, '1. Fiecare lucrare se comandă de Beneficiar în scris (email sau aplicația Beneficiarului), cu: clientul, adresa, persoana de contact, vehiculele, echipamentele și data propusă.');
  _p(doc, '2. Prestatorul confirmă comanda sau propune o altă dată în cel mult două zile lucrătoare și execută lucrarea la data convenită cu clientul.');
  _p(doc, '3. Montajul se face după instrucțiunile tehnice ale Beneficiarului și ale producătorului echipamentului, fără a afecta funcționarea sau garanția vehiculului.');
  _p(doc, '4. La final, Prestatorul confirmă execuția către Beneficiar, cu: numărul de înmatriculare al vehiculului, seria (IMEI) aparatului montat, locul de montaj și fotografii ale instalației. Lucrarea se consideră recepționată după ce Beneficiarul verifică transmisia aparatului.');

  _titlu(doc, 'IV. PREȚUL ȘI PLATA');
  _p(doc, 'Tarifele sunt cele din Anexa nr. 1, în lei, fără TVA. Deplasarea se plătește pe kilometru, numai când a fost comandată. Tarifele se pot schimba doar prin act adițional scris.');
  _p(doc, 'Prestatorul facturează lunar lucrările executate și recepționate în luna anterioară, cu lista lor (data, clientul, vehiculul, lucrarea). Beneficiarul plătește în termen de ' + C.numar(plata, 'zi', 'zile') + ' de la primirea facturii, prin transfer bancar în contul Prestatorului indicat mai sus.');

  _titlu(doc, 'V. ECHIPAMENTELE');
  _p(doc, 'Echipamentele de montat sunt proprietatea Beneficiarului sau a clientului acestuia. Prestatorul le primește pe bază de proces-verbal, le păstrează în siguranță până la montaj și returnează Beneficiarului echipamentele demontate sau nefolosite. Pentru echipamentele pierdute sau deteriorate din culpa sa, Prestatorul plătește valoarea lor de achiziție.');

  _titlu(doc, 'VI. CALITATE, GARANȚIE ȘI RĂSPUNDERE');
  _p(doc, 'Prestatorul garantează manopera timp de 12 luni de la recepție. Defectele de montaj se remediază gratuit, în cel mult cinci zile lucrătoare de la anunțarea lor. Prestatorul răspunde pentru pagubele produse vehiculelor sau clienților din culpa sa și respectă regulile de securitate și sănătate în muncă pentru personalul propriu.');

  _titlu(doc, 'VII. CLIENȚII BENEFICIARULUI');
  _p(doc, 'Pe durata contractului și 12 luni după încetarea lui, Prestatorul nu oferă direct clienților Beneficiarului, cunoscuți prin acest contract, servicii de monitorizare GPS sau de montaj pentru aceleași vehicule și nu le comunică prețurile Beneficiarului.');

  _titlu(doc, 'VIII. CONFIDENȚIALITATE ȘI DATE PERSONALE');
  _p(doc, 'Pentru executarea lucrărilor, Prestatorul primește date ale clienților Beneficiarului (denumirea, adresa, persoana de contact, vehiculele). Le folosește numai pentru lucrarea comandată, le păstrează confidențiale și le șterge după încheierea lucrării. În privința datelor cu caracter personal, Prestatorul are calitatea de SUBÎMPUTERNICIT al Beneficiarului, în condițiile din Anexa nr. 2 — Acord de prelucrare a datelor, parte integrantă din prezentul contract.');

  _titlu(doc, 'IX. DURATA ȘI ÎNCETAREA');
  _p(doc, 'Contractul intră în vigoare la data de ' + _data(c.start_at || c.signed_at) +
    (luni ? ' și se încheie pe o durată de ' + C.numar(luni, 'lună', 'luni') + ', până la data de ' + _data(sfarsit) + '.' : ' și se încheie pe durată nedeterminată.'));
  if (luni) {
    _p(doc, c.auto_renew !== false
      ? 'La împlinirea termenului, contractul se prelungește automat pe perioade succesive egale, dacă niciuna dintre părți nu îl denunță în scris cu cel puțin ' + C.numar(preaviz, 'zi', 'zile') + ' înainte de expirare.'
      : 'Contractul nu se prelungește automat. Continuarea colaborării după împlinirea termenului se face prin act adițional scris.');
  }
  _p(doc, 'Contractul încetează: prin acordul scris al părților; prin denunțare unilaterală, cu preaviz de ' + C.numar(preaviz, 'zi', 'zile') + ' comunicat în scris; prin reziliere, în cazul neexecutării obligațiilor, după o notificare rămasă fără efect timp de 15 zile. Lucrările comandate înainte de încetare se execută și se plătesc potrivit contractului.');

  _titlu(doc, 'X. DISPOZIȚII FINALE');
  _p(doc, 'Modificarea contractului se face prin act adițional scris, semnat de ambele părți. Litigiile se soluționează pe cale amiabilă, iar în lipsa unei înțelegeri, de instanțele competente de la sediul Beneficiarului. Contractul se completează cu prevederile legislației române în vigoare.');
  _p(doc, 'Încheiat astăzi, ' + _data(c.signed_at) + ', în două exemplare originale, câte unul pentru fiecare parte.');
  _semnaturi(doc, p.name, em.name);

  // ── Anexa nr. 1: tarifele ──
  doc.addPage();
  const A1 = _ST(doc);
  doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(12).text('ANEXA nr. 1 — Tarifele lucrărilor', A1.left, doc.y, { width: A1.w });
  doc.font('Nunito').fontSize(8.5).fillColor(GRI).text('la contractul de colaborare nr. ' + _sauLinie(c.number) + ' din ' + _data(c.signed_at), A1.left, doc.y + 2, { width: A1.w });
  doc.x = A1.left; doc.y += 12;
  _tabelTarife(doc, c.tarife);

  // ── Anexa nr. 2: acordul de subîmputernicire (GDPR) ──
  doc.addPage();
  const A2 = _ST(doc);
  doc.fillColor(NEGRU).font('Nunito-Bold').fontSize(12).text('ANEXA nr. 2 — Acord de prelucrare a datelor cu caracter personal', A2.left, doc.y, { width: A2.w });
  doc.font('Nunito').fontSize(8.5).fillColor(GRI).text('la contractul de colaborare nr. ' + _sauLinie(c.number) + ' din ' + _data(c.signed_at), A2.left, doc.y + 2, { width: A2.w });
  doc.x = A2.left; doc.y += 12;
  _titlu(doc, '1. Rolurile părților');
  _p(doc, 'Clienții Beneficiarului sunt OPERATORI ai datelor, Beneficiarul este PERSOANA LOR ÎMPUTERNICITĂ, iar Prestatorul este SUBÎMPUTERNICIT al Beneficiarului, în sensul art. 28 alin. (4) din Regulamentul (UE) 2016/679 (GDPR), în condițiile contractelor Beneficiarului cu clienții săi.');
  _titlu(doc, '2. Obiectul, durata și scopul');
  _p(doc, 'Obiectul și scopul: executarea lucrărilor de montaj comandate de Beneficiar. Durata: pe durata fiecărei lucrări comandate.');
  _titlu(doc, '3. Datele și persoanele vizate');
  _p(doc, 'Date: denumirea și adresa clientului, numele și telefonul persoanei de contact, numerele de înmatriculare ale vehiculelor, seriile echipamentelor. Persoane vizate: angajații și colaboratorii clienților (persoane de contact, conducători auto).');
  _titlu(doc, '4. Obligațiile Prestatorului');
  _p(doc, 'Prestatorul: prelucrează datele numai la instrucțiunile documentate ale Beneficiarului; asigură confidențialitatea persoanelor care au acces la date; ia măsuri de securitate potrivite; nu folosește alți subîmputerniciți fără acordul scris al Beneficiarului; nu transferă datele în afara Uniunii Europene; îl înștiințează pe Beneficiar fără întârziere nejustificată, în cel mult 24 de ore, despre orice încălcare a securității datelor; îl sprijină la răspunsurile către persoanele vizate și pune la dispoziție informațiile necesare pentru a dovedi respectarea acestor obligații.');
  _titlu(doc, '5. Soarta datelor');
  _p(doc, 'După încheierea fiecărei lucrări, și cel târziu la încetarea contractului, Prestatorul șterge datele primite și confirmă ștergerea în scris, la cererea Beneficiarului.');
  _semnaturi(doc, p.name, em.name);
}
function contractMontajPdf(date) {
  const doc = new PDFDocument({ size: 'A4', margin: 50,
    info: { Title: 'Contract de colaborare ' + ((date.contract && date.contract.number) || ''), Author: 'RA Tracks' } });
  try {
    doc.registerFont('Nunito', path.join(__dirname, 'fonts', 'DejaVuSans.ttf'));
    doc.registerFont('Nunito-Bold', path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf'));
  } catch (e) {
    try { doc.registerFont('Nunito', 'Helvetica'); doc.registerFont('Nunito-Bold', 'Helvetica-Bold'); } catch (e2) {}
  }
  scrieContractMontaj(doc, date);
  doc.end();
  return doc;
}

module.exports = { contractPdf, scrieContract, actPdf, scrieAct, numeFisier, contractMontajPdf, scrieContractMontaj };
