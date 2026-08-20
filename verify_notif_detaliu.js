// verify_notif_detaliu.js — ce ajunge în modalul unei notificări, cap-coadă, pe server pornit.
//
// Cele trei cazuri cerute de Robert (20.08): „intrarea în zonă să facă zoom pe zonă și să arate pe
// unde a intrat", „tensiunea scăzută și expirarea documentelor să fie mult mai specifice".
// Toate trei se sprijină pe /api/notifications/:id/context — dacă acela nu trimite geometria zonei,
// valoarea tensiunii sau actul propriu-zis, interfața n-are ce desena, oricât de bine ar fi scrisă.
//
// Rulează pe sandbox (preview-server.js, port 3020) — NU face parte din CI-ul fără server.
//   node preview-server.js   apoi   node verify_notif_detaliu.js
const net = require('net');
const IMEI = '860000000012345', TCP = 5041, B = 'http://localhost:3020';

let ok = 0, fail = 0;
const t = (n, c, det) => { if (c) { ok++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (det ? ' → ' + det : '')); } };

function pachet(ts, lat, lng, speed, extraIo) {
  const ones = [[239, 1]].concat(extraIo || []);
  const b1 = Buffer.concat([Buffer.from([ones.length])].concat(ones.map(([id, v]) => Buffer.from([id, v]))));
  const io = Buffer.concat([Buffer.from([0x00, ones.length]), b1, Buffer.from([0]), Buffer.from([0]), Buffer.from([0])]);
  const tsb = Buffer.alloc(8); tsb.writeBigUInt64BE(BigInt(ts), 0);
  const g = Buffer.alloc(15);
  g.writeInt32BE(Math.round(lng * 1e7), 0); g.writeInt32BE(Math.round(lat * 1e7), 4);
  g.writeUInt16BE(80, 8); g.writeUInt16BE(90, 10); g.writeUInt8(10, 12); g.writeUInt16BE(speed, 13);
  const rec = Buffer.concat([tsb, Buffer.from([0x01]), g, io]);
  const data = Buffer.concat([Buffer.from([0x08, 0x01]), rec, Buffer.from([0x01])]);
  const h = Buffer.alloc(8); h.writeUInt32BE(0, 0); h.writeUInt32BE(data.length, 4);
  return Buffer.concat([h, data, Buffer.alloc(4)]);
}
function trimite(p) {
  return new Promise((res) => {
    const s = net.connect(TCP, '127.0.0.1'); let pas = 0;
    s.on('connect', () => { const im = Buffer.from(IMEI, 'ascii'); const l = Buffer.alloc(2); l.writeUInt16BE(im.length, 0); s.write(Buffer.concat([l, im])); });
    s.on('data', () => { if (pas === 0) { pas = 1; s.write(p); return; } s.end(); res(true); });
    s.on('error', () => res(false));
    setTimeout(() => { try { s.destroy(); } catch (e) {} res(false); }, 4000);
  });
}
const asteapta = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const r = await fetch(B + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'admin', password: 'admin123' }) });
  const ck = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get('set-cookie')]).filter(Boolean).map((c) => c.split(';')[0]).join('; ');
  const H = { 'Content-Type': 'application/json', Cookie: ck };
  const J = async (u, o) => { const q = await fetch(B + u, Object.assign({ headers: H }, o || {})); const txt = await q.text(); try { return JSON.parse(txt); } catch (e) { return { _status: q.status, _raw: txt.slice(0, 200) }; } };

  // dispozitiv (mod strict: fără înregistrare, pachetele sunt respinse la handshake)
  await J('/api/devices', { method: 'POST', body: JSON.stringify({ imei: IMEI, name: 'Dacia Logan 3', plate: 'B 154 UIP', vehicle_type: 'Auto' }) });

  console.log('\n══ 1. ZONĂ: intrare cu geometrie ══\n');
  const g = await J('/api/geofences', { method: 'POST', body: JSON.stringify({ name: 'Clinceni', type: 'circle', color: '#3b82f6', coordinates: { center: [44.38505, 25.96987], radius: 600 } }) });
  await J('/api/alerts', { method: 'POST', body: JSON.stringify({ name: 'Intrare Clinceni', type: 'geofence_enter', imei: IMEI, condition: { geofenceIds: [g.id] }, enabled: true }) });
  const t0 = Date.now();
  await trimite(pachet(t0 - 4000, 44.41500, 25.99500, 40));   // afară
  await asteapta(1600);
  await trimite(pachet(t0, 44.38505, 25.96987, 19));          // înăuntru
  await asteapta(2600);

  let list = await J('/api/notifications?limit=30');
  let arr = Array.isArray(list) ? list : (list.items || []);
  const nz = arr.find((x) => (x.data || {}).geofenceId != null);
  t('notificarea de intrare în zonă s-a produs', !!nz);
  if (nz) {
    const c = await J('/api/notifications/' + nz.id + '/context');
    t('contextul aduce geometria zonei', !!(c.geofence && c.geofence.coordinates), JSON.stringify(c.geofence));
    t('centrul e PERECHE [lat, lng] — formatul pe care îl desenează harta', Array.isArray(c.geofence && c.geofence.coordinates && c.geofence.coordinates.center), JSON.stringify(c.geofence && c.geofence.coordinates));
    t('raza vine odată cu forma (altfel cercul n-are dimensiune)', Number(c.geofence.coordinates.radius) > 0, String(c.geofence.coordinates.radius));
    t('numele zonei, ca să scrie pe ce a intrat', !!c.geofence.name, c.geofence.name);
    t('punctul trecerii există (harta încadrează zona + punctul)', !!(c.event && c.event.lat != null), JSON.stringify(c.event));
  }

  console.log('\n══ 2. TENSIUNE SCĂZUTĂ: valoarea măsurată ══\n');
  await J('/api/alerts', { method: 'POST', body: JSON.stringify({ name: 'Baterie descărcată', type: 'low_voltage', imei: IMEI, condition: { minVoltage: 12 }, enabled: true }) });
  // AVL 66 = tensiune alimentare externă (mV). Trimis pe 2 octeți prin blocul „two bytes".
  const pachetTensiune = (() => {
    const tsb = Buffer.alloc(8); tsb.writeBigUInt64BE(BigInt(Date.now()), 0);
    const gps = Buffer.alloc(15);
    gps.writeInt32BE(Math.round(25.96987 * 1e7), 0); gps.writeInt32BE(Math.round(44.38505 * 1e7), 4);
    gps.writeUInt16BE(80, 8); gps.writeUInt16BE(90, 10); gps.writeUInt8(10, 12); gps.writeUInt16BE(0, 13);
    const b1 = Buffer.from([1, 239, 1]);                                   // 1 element de 1 octet: contact pornit
    const b2 = Buffer.concat([Buffer.from([1, 66]), (() => { const x = Buffer.alloc(2); x.writeUInt16BE(11400, 0); return x; })()]); // 11,4 V
    const io = Buffer.concat([Buffer.from([0x00, 2]), b1, b2, Buffer.from([0]), Buffer.from([0])]);
    const rec = Buffer.concat([tsb, Buffer.from([0x01]), gps, io]);
    const data = Buffer.concat([Buffer.from([0x08, 0x01]), rec, Buffer.from([0x01])]);
    const h = Buffer.alloc(8); h.writeUInt32BE(0, 0); h.writeUInt32BE(data.length, 4);
    return Buffer.concat([h, data, Buffer.alloc(4)]);
  })();
  await trimite(pachetTensiune);
  await asteapta(2600);
  list = await J('/api/notifications?limit=30');
  arr = Array.isArray(list) ? list : (list.items || []);
  const nv = arr.find((x) => ((x.data || {}).alertType === 'low_voltage') || /tensiune|baterie/i.test(x.title || ''));
  t('notificarea de tensiune s-a produs', !!nv, arr.map((x) => x.title).join(' | '));
  if (nv) {
    const c = await J('/api/notifications/' + nv.id + '/context');
    t('contextul aduce VALOAREA tensiunii (nu doar textul)', typeof c.voltage === 'number', String(c.voltage));
    t('are poziție → harta arată unde stă mașina', !!(c.event && c.event.lat != null));
  }

  console.log('\n══ 3. SCADENȚĂ DOCUMENT: actul propriu-zis ══\n');
  // Rezumatul „acte fara data" se trimite PE COMPANIE (server.js sare peste randurile cu
  // company_id NULL) — deci vehiculul trebuie sa aiba o companie, altfel testam o cale moarta.
  const co = await J('/api/companies', { method: 'POST', body: JSON.stringify({ name: 'Proba SRL' }) });
  t('compania de proba s-a creat', !!(co && co.id), JSON.stringify(co).slice(0, 120));
  await J('/api/devices/' + IMEI + '/company', { method: 'PUT', body: JSON.stringify({ company_id: co.id }) });
  const peste5 = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const doc = await J('/api/documents', { method: 'POST', body: JSON.stringify({
    imei: IMEI, doc_type: 'RCA', number: 'CU/10309310', issuer: 'GROUPAMA',
    issue_date: new Date(Date.now() - 360 * 86400000).toISOString().slice(0, 10),
    expiry_date: peste5, cost: 812.5,
    file_b64: Buffer.from('%PDF-1.4 proba').toString('base64'), file_mime: 'application/pdf', file_name: 'rca.pdf',
  }) });
  t('actul s-a salvat', !!(doc && doc.id), JSON.stringify(doc).slice(0, 140));
  // un act FĂRĂ dată → intră în rezumatul săptămânal
  await J('/api/documents', { method: 'POST', body: JSON.stringify({ imei: IMEI, doc_type: 'ITP', number: 'X-1' }) });
  await J('/api/notifications/check-expiries', { method: 'POST', body: '{}' });
  await asteapta(1800);

  list = await J('/api/notifications?limit=30');
  arr = Array.isArray(list) ? list : (list.items || []);
  const nd = arr.find((x) => (x.data || {}).docId != null);
  t('notificarea de scadență s-a produs', !!nd, arr.map((x) => x.title).join(' | '));
  if (nd) {
    const c = await J('/api/notifications/' + nd.id + '/context');
    t('contextul aduce ACTUL, nu doar textul', !!c.document, JSON.stringify(c.document));
    t('tipul actului', c.document.docType === 'RCA', c.document.docType);
    t('numărul actului', c.document.number === 'CU/10309310', c.document.number);
    t('emitentul', c.document.issuer === 'GROUPAMA', c.document.issuer);
    t('zilele rămase, RECALCULATE la azi', c.document.days === 5, String(c.document.days));
    t('costul', Number(c.document.cost) === 812.5, String(c.document.cost));
    t('știe că are scan atașat („Vezi actul")', c.document.hasFile === true, String(c.document.hasFile));
    t('știe vehiculul (butonul „Documentele vehiculului")', c.document.imei === IMEI, c.document.imei);
    t('eticheta vehiculului, nu IMEI-ul', /B 154 UIP|Dacia/.test(String(c.document.vehicle || '')), c.document.vehicle);
    t('NU trimite fișierul în context (ar fi sute de KB la fiecare deschidere)', c.document.file_b64 === undefined && c.document.fileB64 === undefined);
  }
  const nfd = arr.find((x) => String((x.data || {}).key || '').startsWith('vdoc-nodate-'));
  t('rezumatul „acte fără dată" s-a produs', !!nfd);
  if (nfd) {
    const c = await J('/api/notifications/' + nfd.id + '/context');
    t('contextul listează actele fără dată, nu doar numărul lor', Array.isArray(c.documentsFaraData) && c.documentsFaraData.length > 0, JSON.stringify(c.documentsFaraData));
    if (Array.isArray(c.documentsFaraData) && c.documentsFaraData.length) {
      t('fiecare are vehiculul, ca să știi unde să completezi', !!c.documentsFaraData[0].imei, JSON.stringify(c.documentsFaraData[0]));
    }
  }

  console.log('\n' + ok + '/' + (ok + fail) + ' verificări trecute\n');
  process.exit(fail ? 1 : 0);
})();
