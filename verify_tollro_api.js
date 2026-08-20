// verify_tollro_api.js — TollRo prin rutele reale, pe server pornit.
//
// Cerința lui Robert (20.08): „atenție la vehicule, poți selecta doar vehiculele din flotă".
// Aici se verifică exact asta — plus că profilul de taxare vine din fișă, nu de la client (altfel
// oricine ar putea trimite `masaKg: 40000` și ar afla tarife pentru un camion inexistent).
//
// Rulează pe sandbox (preview-server.js, port 3020) — NU face parte din CI-ul fără server.
//   node preview-server.js   apoi   node verify_tollro_api.js
const B = 'http://localhost:3020';

let ok = 0, fail = 0;
const t = (n, c, d) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (d ? ' → ' + d : '')); } };

async function login(u, p) {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) });
  if (!r.ok) return null;
  return (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
}

(async () => {
  const ck = await login('admin', 'admin123');
  const H = { 'Content-Type': 'application/json', Cookie: ck };
  const J = async (u, o) => {
    const q = await fetch(B + u, Object.assign({ headers: H }, o || {}));
    const txt = await q.text();
    let j = null; try { j = JSON.parse(txt); } catch (e) {}
    return { status: q.status, body: j, raw: txt.slice(0, 200) };
  };
  const POST = (u, b) => J(u, { method: 'POST', body: JSON.stringify(b) });

  const CAMION = '860000000099001', MASINA = '860000000099002', STRAIN = '860000000099003';

  console.log('\n══ Pregătire flotă ══\n');
  await POST('/api/devices', { imei: CAMION, name: 'MAN TGS', plate: 'B 160 UIP', vehicle_type: 'Camion' });
  await J('/api/devices/' + CAMION + '/details', { method: 'PUT', body: JSON.stringify({ max_weight_legal: 30000, emission_class: 'Euro 6', vin: 'WMA39SZZ7LM855374' }) });
  await POST('/api/devices', { imei: MASINA, name: 'Dacia Logan', plate: 'B 154 UIP', vehicle_type: 'Auto' });
  await J('/api/devices/' + MASINA + '/details', { method: 'PUT', body: JSON.stringify({ max_weight_legal: 1800, emission_class: 'Euro 6' }) });
  let r = await J('/api/tollro/profil/' + CAMION);
  t('profilul camionului se citește din fișă', r.status === 200 && r.body.vehicul.masaKg === 30000, JSON.stringify(r.body).slice(0, 160));
  t('norma Euro vine tot din fișă', r.body.vehicul.euro === 'Euro 6', String(r.body.vehicul.euro));
  t('VIN-ul e cel din fișă, nu tastat', r.body.vehicul.vin === 'WMA39SZZ7LM855374', String(r.body.vehicul.vin));
  t('încadrarea: 0,48 / 0,24 lei/km', r.body.incadrare && r.body.incadrare.leiPerKm.autostrada === 0.48 && r.body.incadrare.leiPerKm.national === 0.24, JSON.stringify(r.body.incadrare));

  console.log('\n══ Calculul ══\n');
  r = await POST('/api/tollro/estimate', { imei: CAMION, km: { autostrada: 55.3, national: 148.3, alte: 24.9 } });
  t('ruta din captură → 62,13 lei', r.status === 200 && r.body.rezultat.total === 62.13, JSON.stringify(r.body.rezultat && r.body.rezultat.total));
  t('răspunsul conține și vehiculul, ca să se vadă pe ce s-a calculat', !!(r.body.vehicul && r.body.vehicul.numar), JSON.stringify(r.body.vehicul));

  r = await POST('/api/tollro/estimate', { imei: MASINA, km: { autostrada: 500 } });
  t('autoturismul → NU se taxează TollRo', r.body.rezultat.aplicabil === false && r.body.rezultat.total === 0, JSON.stringify(r.body.rezultat));
  t('și se explică de ce', /rovinie/i.test(r.body.rezultat.motiv || ''), r.body.rezultat.motiv);

  console.log('\n══ Profilul NU se poate trimite de la client ══\n');
  // Chiar dacă cineva trimite alte date de vehicul în corp, serverul le ignoră: masa și norma se
  // citesc din fișă. Altfel calculatorul ar deveni un serviciu public de tarife.
  r = await POST('/api/tollro/estimate', { imei: MASINA, masaKg: 40000, euro: 'Euro 3', km: { autostrada: 100 } });
  t('masa trimisă de client e ignorată', r.body.rezultat.aplicabil === false, JSON.stringify(r.body.rezultat).slice(0, 140));

  console.log('\n══ Doar vehiculele din flotă ══\n');
  r = await POST('/api/tollro/estimate', { imei: STRAIN, km: { autostrada: 100 } });
  t('IMEI care nu e în flotă → refuzat', r.status === 403 || r.status === 404, String(r.status));
  r = await J('/api/tollro/profil/' + STRAIN);
  t('și profilul lui e refuzat', r.status === 403 || r.status === 404, String(r.status));
  r = await POST('/api/tollro/estimate', { km: { autostrada: 100 } });
  t('fără vehicul → refuzat (nu există „calcul generic")', r.status === 403, String(r.status));
  r = await POST('/api/tollro/din-istoric', { imei: STRAIN, from: '2026-08-01T00:00:00', to: '2026-08-02T00:00:00' });
  t('istoricul unui vehicul străin → refuzat', r.status === 403 || r.status === 404, String(r.status));

  console.log('\n══ Gărzi pe istoric ══\n');
  r = await POST('/api/tollro/din-istoric', { imei: CAMION, from: '2026-01-01T00:00:00', to: '2026-08-01T00:00:00' });
  t('interval de 7 luni → refuzat explicit, nu așteptare', r.status === 400 && /8 zile/.test(r.body.error || ''), r.body && r.body.error);
  r = await POST('/api/tollro/din-istoric', { imei: CAMION });
  t('fără interval → refuzat', r.status === 400, String(r.status));
  r = await POST('/api/tollro/din-istoric', { imei: CAMION, from: '2026-08-01T00:00:00', to: '2026-08-02T00:00:00' });
  t('vehicul fără traseu → mesaj clar, nu eroare', r.status === 200 && /traseu|deplasat/i.test((r.body.error || '') + ''), JSON.stringify(r.body).slice(0, 160));

  console.log('\n══ Completarea de mână (MTMA + axe lipsă din fișă) ══\n');
  // Cazul real: cineva adaugă un camion, nu apucă să-i treacă masa, iar calculul se bloca.
  const FARA = '860000000099004';
  await POST('/api/devices', { imei: FARA, name: 'Camion nou', plate: 'B 999 XYZ', vehicle_type: 'Camion' });
  // Proba TREBUIE să fie repetabilă: la finalul ei masa ajunge în fișă, iar a doua rulare ar fi
  // găsit-o completată și ar fi verificat cu totul altceva. Golim câmpurile din start.
  await J('/api/devices/' + FARA + '/details', { method: 'PUT', body: JSON.stringify({ max_weight_legal: '', axle_count: '' }) });
  r = await J('/api/tollro/profil/' + FARA);
  t('vehicul fără masă în fișă → nu se poate încadra', r.body.incadrare === null, JSON.stringify(r.body.incadrare));

  r = await POST('/api/tollro/estimate', { imei: FARA, km: { autostrada: 100 } });
  t('fără masă și fără completare → refuz explicit', r.body.rezultat.aplicabil === false, JSON.stringify(r.body.rezultat).slice(0, 120));

  r = await POST('/api/tollro/estimate', { imei: FARA, manual: { masaKg: 30000, axe: 4 }, km: { autostrada: 100 } });
  t('cu masa completată de mână → calculul merge', r.body.rezultat.aplicabil === true, JSON.stringify(r.body.rezultat).slice(0, 120));
  t('100 km × 0,48 = 48 lei (Euro necunoscut? nu — fișa n-are normă → tarif maxim)', r.body.rezultat.total === 62, String(r.body.rezultat.total));
  t('se raportează CE s-a completat de mână', r.body.completatManual && r.body.completatManual.masaKg === true, JSON.stringify(r.body.completatManual));
  t('axele completate ajung în profil', r.body.vehicul.axe === 4, String(r.body.vehicul.axe));

  // Completarea NU se salvează singură — fișa rămâne neatinsă până apeși butonul.
  r = await J('/api/tollro/profil/' + FARA);
  t('completarea nu s-a scris singură în fișă', r.body.vehicul.masaKg == null, String(r.body.vehicul.masaKg));

  console.log('\n══ Fișa NU se poate „negocia" din browser ══\n');
  // Camionul ARE 30 t în fișă. O „completare" de 5 t trebuie ignorată — altfel taxa ar deveni
  // negociabilă din browser, iar cifra din ofertă n-ar mai avea legătură cu vehiculul.
  r = await POST('/api/tollro/estimate', { imei: CAMION, manual: { masaKg: 5000, axe: 2 }, km: { autostrada: 100 } });
  t('masa din fișă (30 t) învinge completarea (5 t)', r.body.vehicul.masaKg === 30000, String(r.body.vehicul.masaKg));
  t('deci tariful rămâne cel de peste 12 t → 48 lei', r.body.rezultat.total === 48, String(r.body.rezultat.total));
  t('și nu raportează nimic drept completat', !r.body.completatManual || !r.body.completatManual.masaKg, JSON.stringify(r.body.completatManual));

  // Valori absurde: mai bine refuz decât un calcul pe o masă imposibilă.
  r = await POST('/api/tollro/estimate', { imei: FARA, manual: { masaKg: 900000 }, km: { autostrada: 100 } });
  t('masă absurdă (900 t) → respinsă, nu folosită', r.body.rezultat.aplicabil === false, JSON.stringify(r.body.rezultat).slice(0, 100));
  r = await POST('/api/tollro/estimate', { imei: FARA, manual: { masaKg: 30000, axe: 99 }, km: { autostrada: 100 } });
  t('număr de axe absurd → ignorat, restul merge', r.body.rezultat.aplicabil === true && r.body.vehicul.axe == null, String(r.body.vehicul.axe));

  console.log('\n══ Salvarea în fișă ══\n');
  r = await J('/api/tollro/profil/' + FARA, { method: 'PUT', body: JSON.stringify({ masaKg: 26000, axe: 3 }) });
  t('salvarea merge', r.status === 200 && r.body.ok === true, JSON.stringify(r.body).slice(0, 120));
  r = await J('/api/tollro/profil/' + FARA);
  t('masa e acum în fișă', r.body.vehicul.masaKg === 26000, String(r.body.vehicul.masaKg));
  t('axele sunt acum în fișă', r.body.vehicul.axe === 3, String(r.body.vehicul.axe));
  t('și vehiculul se încadrează singur de-acum', !!r.body.incadrare, JSON.stringify(r.body.incadrare));
  r = await J('/api/tollro/profil/' + STRAIN, { method: 'PUT', body: JSON.stringify({ masaKg: 26000 }) });
  t('nu poți scrie în fișa unui vehicul străin', r.status === 403 || r.status === 404, String(r.status));
  r = await J('/api/tollro/profil/' + FARA, { method: 'PUT', body: JSON.stringify({}) });
  t('salvare goală → refuzată', r.status === 400, String(r.status));

  console.log('\n══ Grila de tarife ══\n');
  r = await J('/api/tollro/config');
  t('catalogul se citește', r.status === 200 && Array.isArray(r.body.categorii) && r.body.grila, String(r.status));
  t('super-adminul o poate edita', r.body.editabil === true);
  t('treapta 7,5–12 t e marcată ca nepublicată', r.body.grila.tarife.c2.euro6.presupus === true, JSON.stringify(r.body.grila.tarife.c2.euro6));
  r = await J('/api/tollro/config', { method: 'PUT', body: JSON.stringify({ grila: { aplicabilDin: '2026-11-15', tarife: { c3: { euro6: { autostrada: 0.5, national: 0.25 } } } } }) });
  t('salvarea grilei merge', r.status === 200 && r.body.grila.tarife.c3.euro6.autostrada === 0.5, JSON.stringify(r.body).slice(0, 140));
  r = await POST('/api/tollro/estimate', { imei: CAMION, km: { autostrada: 100 } });
  t('calculul folosește IMEDIAT grila nouă (100 km × 0,5 = 50 lei)', r.body.rezultat.total === 50, String(r.body.rezultat.total));
  // înapoi la implicit, ca proba să fie repetabilă
  await J('/api/tollro/config', { method: 'PUT', body: JSON.stringify({ grila: {} }) });
  r = await POST('/api/tollro/estimate', { imei: CAMION, km: { autostrada: 100 } });
  t('revenirea la grila implicită (100 km × 0,48 = 48 lei)', r.body.rezultat.total === 48, String(r.body.rezultat.total));

  console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('EROARE', e); process.exit(2); });
