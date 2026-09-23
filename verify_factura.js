// verify_factura.js — factura lunară spune ACEEAȘI sumă ca registrul de clienți.
//
//   node verify_factura.js
//
// DEFECTUL care a dat naștere probei (găsit 23.09, urmărind banii de la ofertă la factură):
// pe 15.09, la scoaterea planurilor, motorul de preț (plans.js) și-a redenumit modelele — `direct`
// a devenit `oferta`, `tiered` → `trepte`, `flat` → `fix`. Factura le căuta în continuare pe cele
// vechi, deci cădea MEREU pe ultima ramură, care punea pe factură doar mașinile FĂRĂ CAN:
//   2 mașini fără CAN × 29 + 3 cu CAN × 45 + 2 conturi RA Insight × 14 = 221 de lei,
//   iar factura ieșea 86. Lipseau 135 de lei pe lună, fără ca vreun ecran să spună ceva — registrul
//   („Venitul lunar") socotea corect, deci ecranul și factura se contraziceau în tăcere.
// Nicio probă nu rula factura. Asta de aici o rulează pe cod ADEVĂRAT (decupat din server.js, cu
// plans.js adevărat) și cere ca ea și registrul să dea aceeași sumă pe mai multe feluri de flote.

const fs = require('fs');
const plans = require('./plans.js');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

const server = fs.readFileSync('./server.js', 'utf8');
function taie(sursa, start, capat) {
  const a = sursa.indexOf(start); if (a < 0) throw new Error('nu găsesc: ' + start.slice(0, 60));
  const b = sursa.indexOf(capat, a); if (b < 0) throw new Error('nu găsesc capătul: ' + capat.slice(0, 60));
  return sursa.slice(a, b);
}

sect('1. Factura știe numele pe care le dă motorul de preț');
// Numele se citesc din plans.js, nu se scriu aici: dacă cineva le mai redenumește o dată, proba
// pică pe loc, nu după o lună de facturi greșite.
const plansSrc = fs.readFileSync('./plans.js', 'utf8');
const modele = [...plansSrc.matchAll(/mk\('([a-z-]+)'/g)].map(m => m[1]);
const bucataF = taie(server, 'function buildInvoiceLines(', '\nfunction _clientSnapshot');
const cautate = [...bucataF.matchAll(/p\.model === '([a-z-]+)'/g)].map(m => m[1]);
T('găsesc modelele motorului', modele.length >= 3, modele.join(', '));
T('factura caută DOAR nume care există în motor', cautate.length >= 3 && cautate.every(m => modele.indexOf(m) >= 0),
  'caută: ' + cautate.join(', ') + ' · motorul dă: ' + modele.join(', '));
T('și le caută pe toate cele cu rânduri proprii (ofertă, trepte, fix)',
  ['oferta', 'trepte', 'fix'].every(m => cautate.indexOf(m) >= 0), cautate.join(', '));

sect('2. Factura și registrul, pe aceleași flote');
const build = new Function('plans', bucataF + '\nreturn buildInvoiceLines;')(plans);
const bucataQ = taie(server, 'function _aiQuotaFromSettings(settings) {', '\n// ─── Câte conturi');
const bucataL = taie(server, 'function _lunaAcum()', '\nasync function _urcaSeatsPeak');
const bucataV = taie(server, '// ── începe „Venitul lunar pe firmă"', '// ── sfârșit „Venitul lunar pe firmă" ──');
const venit = new Function('plans', bucataQ + '\n' + bucataL + '\n' + bucataV + '\n; return _venitLunar;')(plans);

const firma = (plan, quota, features) => ({ id: 1, name: 'Transport Probă SRL', custom_plan: plan,
  settings: Object.assign({}, quota ? { ai_quota: quota } : {}, features ? { features: features } : {}) });
// Conturile RA Insight intră pe factură prin billCounts.raInsight, exact cum le pune _companyBillCounts.
const factura = (co, nr, conturi) => {
  const q = (co.settings && co.settings.ai_quota) || {};
  const bc = Object.assign({}, nr, { raInsight: conturi ? { seats: conturi, seatsAcum: conturi, seatPriceRON: Number(q.seatPriceRON) || 0 } : null });
  return build(co, bc, plans.featuresFor(co), 19);
};
const CAZURI = [
  // [nume, firmă, flotă, conturi RA Insight, cât trebuie să iasă, fără TVA]
  ['flotă amestecată: 2 fără CAN × 29 + 3 cu CAN × 45', firma({ priceNoneRON: 29, priceCanRON: 45 }), { none: 2, can: 3, fms: 0 }, 0, 193],
  ['...plus 2 conturi RA Insight × 14 (cazul găsit)', firma({ priceNoneRON: 29, priceCanRON: 45 }, { questionsPerSeat: 100, seatPriceRON: 14 }), { none: 2, can: 3, fms: 0 }, 2, 221],
  ['numai mașini cu CAN, cu RA Insight', firma({ priceNoneRON: 29, priceCanRON: 45 }, { questionsPerSeat: 100, seatPriceRON: 17 }), { none: 0, can: 4, fms: 0 }, 1, 197],
  ['numai mașini fără CAN', firma({ priceNoneRON: 29, priceCanRON: 45 }), { none: 5, can: 0, fms: 0 }, 0, 145],
  ['camioane cu FMS au prețul lor', firma({ priceNoneRON: 29, priceCanRON: 45, priceFmsRON: 65 }), { none: 1, can: 1, fms: 2 }, 0, 204],
  ['fără preț CAN scris, CAN-ul ia prețul simplu', firma({ priceNoneRON: 30 }), { none: 1, can: 2, fms: 0 }, 0, 90],
  ['forma în trepte: bază + spor CAN', firma({ basePerVehicleRON: 25, canAddonRON: 15 }), { none: 2, can: 2, fms: 0 }, 0, 130],
  ['forma veche: preț fix pe lună', firma({ flatPriceRON: 500 }), { none: 3, can: 4, fms: 0 }, 0, 500],
  ['forma veche: un singur preț pe vehicul', firma({ pricePerVehicleRON: 20 }), { none: 3, can: 2, fms: 0 }, 0, 100],
  // Suma fixă veche „Asistent AI" și conturile nu se adună: când se facturează pe cont, suma fixă tace.
  ['Asistent AI vechi + conturi: se facturează doar conturile', firma({ priceNoneRON: 30, aiAssistantRON: 150 }, { questionsPerSeat: 50, seatPriceRON: 15 }, { ai_assistant: true }), { none: 2, can: 0, fms: 0 }, 2, 90],
  ['Asistent AI vechi, fără conturi: se facturează suma fixă', firma({ priceNoneRON: 30, aiAssistantRON: 150 }, null, { ai_assistant: true }), { none: 2, can: 0, fms: 0 }, 0, 210],
  ['fără ofertă pe firmă: zero, nu un preț inventat', { id: 9, name: 'X', settings: {} }, { none: 4, can: 1, fms: 0 }, 0, 0]
];
for (const [nume, co, nr, conturi, astept] of CAZURI) {
  const f = factura(co, nr, conturi);
  const r = venit(co, nr, conturi);
  T(nume + ' → factura ' + astept + ' lei', Math.abs(f.subtotal - astept) < 0.005,
    'factura: ' + f.subtotal + ' lei · rânduri: ' + f.lines.map(l => l.desc + ' ' + l.net).join(' | '));
  T('   ...și registrul spune la fel', Math.abs(r - f.subtotal) < 0.005, 'registrul: ' + r + ' · factura: ' + f.subtotal);
}

sect('3. Rândurile facturii spun ce se plătește');
const f1 = factura(firma({ priceNoneRON: 29, priceCanRON: 45 }, { questionsPerSeat: 100, seatPriceRON: 14 }), { none: 2, can: 3, fms: 0 }, 2);
const rand = (re) => f1.lines.filter(l => re.test(l.desc))[0];
T('mașinile fără CAN au rândul lor', !!rand(/fără CAN/) && rand(/fără CAN/).qty === 2 && rand(/fără CAN/).net === 58);
T('mașinile cu CAN au rândul lor, cu cantitatea și prețul lor',
  !!rand(/cu CAN/) && rand(/cu CAN/).qty === 3 && rand(/cu CAN/).unitPrice === 45, JSON.stringify(rand(/cu CAN/)));
T('conturile de RA Insight au rândul lor', !!rand(/RA Insight/) && rand(/RA Insight/).net === 28);
T('TVA-ul se pune pe fiecare rând', f1.lines.every(l => Math.abs(l.vat - Math.round(l.net * 19) / 100) < 0.005));
T('totalul = fără TVA + TVA', Math.abs(f1.total - (f1.subtotal + f1.vatAmount)) < 0.005);

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
