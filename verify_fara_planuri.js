// verify_fara_planuri.js — RA Tracks nu funcționează pe planuri. Niciodată.
//
//   node verify_fara_planuri.js
//
// Modelul e simplu și e singurul: fiecare client primește o OFERTĂ făcută pe ce are el, iar
// contractul se face pe oferta acceptată. Atât. Nu există pachete de-a gata, nu există „Start /
// Pro / Premium", nu există plată cu cardul.
//
// De ce e nevoie de proba asta: tabelul de planuri n-a fost niciodată vândut, dar HOTĂRA lucruri
// reale în spate — ce module are o firmă și ce agenți îi rulează. Așa s-a ajuns ca fiecare client
// deschis să rămână fără agenți (pica pe „standard" → „start", unde scria `agents: false`), iar
// registrul de clienți să arate venituri lunare inventate pentru firme care n-aveau nicio ofertă.
//
// Ce prinde: un tabel de planuri reapărut, o valoare implicită luată din plan, coloana `plan`
// recitită de cod, Stripe întors în aplicație, sau cuvântul „plan" reapărut pe ecran.
const fs = require('fs');
const P = (f) => require('path').join(__dirname, f);
const html = fs.readFileSync(P('public/index.html'), 'utf8');
const server = fs.readFileSync(P('server.js'), 'utf8');
const db = fs.readFileSync(P('db.js'), 'utf8');
const preturi = require('./plans.js');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) { ok++; console.log('  ✓ ' + n); } else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };

console.log('\n1. Nu mai există niciun tabel de planuri');
['PLANS', 'getPlan', 'publicPlans', 'TRIAL_DAYS', 'VOLUME_DISCOUNTS', 'AGENTS_BY_PLAN', 'FEATURE_DEFAULTS_BY_PLAN']
  .forEach(function (k) { T('`' + k + '` nu mai e exportat', preturi[k] === undefined, typeof preturi[k]); });
T('a rămas doar socoteala din ofertă', typeof preturi.computeCompanyPrice === 'function' && typeof preturi.ofertaFirmei === 'function');

console.log('\n2. Prețul vine DOAR din ofertă');
const pret = (co, n) => preturi.computeCompanyPrice(co, n || { none: 5, can: 0, fms: 0 }).monthlyTotal;
T('firmă fără ofertă → 0 lei', pret({ id: 1, settings: {} }) === 0, String(pret({ id: 1, settings: {} })));
T('un plan scris în coloană nu mai schimbă nimic',
  pret({ id: 1, plan: 'premium' }) === 0 && pret({ id: 1, plan: 'pro' }) === 0);
T('cu ofertă, prețul e al ofertei',
  pret({ custom_plan: { priceNoneRON: 30 } }) === 150, String(pret({ custom_plan: { priceNoneRON: 30 } })));
T('oferta cu preț pe CAN se socotește pe fiecare fel de vehicul',
  pret({ custom_plan: { priceNoneRON: 30, priceCanRON: 45 } }, { none: 1, can: 2, fms: 0 }) === 120);
T('`ofertaFirmei` întoarce null fără ofertă', preturi.ofertaFirmei({ plan: 'premium' }) === null);

console.log('\n3. Modulele și agenții nu mai depind de plan');
['standard', 'start', 'pro', 'premium', 'enterprise', undefined].forEach(function (pl) {
  const f = preturi.featuresFor({ plan: pl });
  T('agenții porniți pe „' + (pl || 'fără plan') + '"', f.agents === true);
  T('și modulele cu plată oprite pe „' + (pl || 'fără plan') + '"',
    f.ai_assistant === false && f.tahograf === false && f.etransport === false && f.etoll === false);
});
T('oferta aprinde modulul, nu planul',
  preturi.featuresFor({ plan: 'start', settings: { features: { ai_assistant: true } } }).ai_assistant === true);
T('toți cei 6 agenți, la orice firmă', preturi.enabledAgentsFor({ plan: 'start' }).length === 6);

console.log('\n4. Codul nu mai citește coloana `plan`');
T('serverul nu mai citește `co.plan` / `c.plan`',
  !/\b(co|c)\.plan\b(?!_)/.test(server.replace(/custom_plan/g, '')), (server.match(/\b(co|c)\.plan\b/) || [''])[0]);
T('nu mai există rută de plan', !/\/api\/companies\/:id\/plan'/.test(server) && !/'\/api\/plans'/.test(server));
T('în locul ei e ruta de ofertă', /app\.put\('\/api\/companies\/:id\/oferta', requireAuth, requireSuperadmin/.test(server));
T('baza scrie oferta, nu planul', /async function setCompanyOferta/.test(db) && !/async function setCompanyPlan/.test(db));
T('coloana `plan` rămâne în tabel (nu distrugem date vechi)', /plan VARCHAR\(40\)/.test(db));

console.log('\n5. Stripe a fost scos de tot');
T('nu mai există fișierul billing.js', !fs.existsSync(P('billing.js')));
T('serverul nu-l mai cere', !/require\('\.\/billing'\)/.test(server));
T('nicio rută de plată cu cardul',
  !/billing\/checkout|billing\/portal|billing\/webhook|pay-link/.test(server.replace(/\/\/[^\n]*/g, '')));
T('nicio cheie Stripe citită din mediu', !/STRIPE_[A-Z_]+/.test(server) && !/STRIPE_[A-Z_]+/.test(html));
T('pagina nu mai are buton de plată cu cardul',
  !/raxInvoicePayLink|raxPayNow|raxCheckout|raxBillingPortal/.test(html));

console.log('\n6. Cuvântul „plan" nu mai apare pe niciun ecran');
// Ne uităm doar la ce AJUNGE la om: etichete, titluri, texte — nu la comentariile din cod.
const vizibil = html
  .split('\n').filter(function (r) { return !/^\s*(\/\/|\*|<!--)/.test(r); }).join('\n')
  .replace(/\/\*[\s\S]*?\*\//g, '');
const gasite = [];
// „Plan service / mentenanță" e cu totul altceva (planul de revizii al unui vehicul) — nu-l vânăm.
const fara = vizibil.replace(/Plan service[^<]*/g, '');
[/>\s*Plan\b/g, /'Plan'/g, /"Plan"/g, /Plan curent/g, /Plan \/ abonament/g, /planul t[ăa]u/gi, /alege[a-z]* un plan/gi]
  .forEach(function (re) { const m = fara.match(re); if (m) gasite.push.apply(gasite, m); });
T('nicio etichetă „Plan" rămasă în interfață', gasite.length === 0, gasite.join(' | '));
T('ecranul clientului vorbește despre contract, nu despre plan',
  /Abonamentul t[ăa]u e cel din contract/.test(html));
T('fișa firmei arată „Oferta firmei", nu „Plan / abonament"',
  /">Oferta firmei<\/div>/.test(html) && !/Plan \/ abonament/.test(html));
T('nu mai există butoane de presetare (Start / Pro / Premium)',
  !/_RAX_PRESETS|raxAboPlanChange/.test(html));

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
