// verify_tacho.js — citirea fișierelor de tahograf, probată pe fișiere construite de noi.
//
//   node verify_tacho.js
//
// N-avem încă un fișier .DDD real (firma n-are șoferi profesioniști). Ca să nu rămână citirea
// nedovedită, proba merge invers: **construiește** fișiere după structura din specificație, cu
// activități pe care le știm exact, apoi cere parserului să le citească înapoi. Dacă orele care ies
// nu sunt fix cele pe care le-am pus, ceva e greșit.
//
// Asta NU înlocuiește un fișier real — dacă structura din specificație a fost înțeleasă greșit, și
// constructorul, și cititorul o vor înțelege greșit la fel. Ce dovedește: că citirea e corectă în
// raport cu structura implementată, că matematica orelor e bună, că regulile 561/2006 se aplică
// unde trebuie, și — cel mai important — că pe orice fișier pe care NU-l înțelege, parserul spune
// „necitit" în loc să scoată cifre.

const t = require('./tacho.js');

let ok = 0, rele = 0;
const T = (n, c, d) => { if (c) ok++; else { rele++; console.log('  ✗ ' + n + (d !== undefined ? '  → ' + d : '')); } };
const sect = (s) => console.log('\n' + s);

// ─── constructor de fișiere ──────────────────────────────────────────────────────────────────────
const ZI = { ODIHNA: 0, DISPONIBIL: 1, MUNCA: 2, CONDUS: 3 };

// o schimbare: la minutul M începe activitatea A (slotul 0 = șoferul)
function schimbare(minut, activitate, slot) {
  return ((slot || 0) << 15) | (activitate << 11) | (minut & 0x07FF);
}
function ziBinar(dataISO, km, schimbari, lungAnterioara) {
  const n = schimbari.length;
  const b = Buffer.alloc(12 + n * 2);
  b.writeUInt16BE(lungAnterioara, 0);
  b.writeUInt16BE(12 + n * 2, 2);
  b.writeUInt32BE(Math.floor(Date.parse(dataISO + 'T00:00:00Z') / 1000), 4);
  b.writeUInt16BE(0, 8);                       // contor prezență
  b.writeUInt16BE(km, 10);
  schimbari.forEach((s, i) => b.writeUInt16BE(s, 12 + i * 2));
  return b;
}
function blocActivitate(zile) {
  const bin = [];
  let lungAnt = 0;
  for (const z of zile) { const b = ziBinar(z.data, z.km, z.schimbari, lungAnt); bin.push(b); lungAnt = b.length; }
  const inel = Buffer.concat(bin);
  const pVechi = 0;
  let pNou = 0;
  for (let i = 0; i < bin.length - 1; i++) pNou += bin[i].length;
  const val = Buffer.alloc(4 + inel.length);
  val.writeUInt16BE(pVechi, 0);
  val.writeUInt16BE(pNou, 2);
  inel.copy(val, 4);
  return val;
}
function blocIdentificare(prenume, nume) {
  const b = Buffer.alloc(t._LEN_IDENTIFICATION, 0x00);
  b.write('RO', 0, 'latin1');
  b.write('1234567890123456', 1, 'latin1');
  b[65] = 0x01;                                  // pagina de cod
  b.write(nume.padEnd(35, '\0'), 66, 'latin1');
  b[101] = 0x01;
  b.write(prenume.padEnd(35, '\0'), 102, 'latin1');
  return b;
}
function bloc(fid, val, tip) {
  const h = Buffer.alloc(5);
  h.writeUInt16BE(fid, 0);
  h[2] = tip === undefined ? 0x00 : tip;
  h.writeUInt16BE(val.length, 3);
  return Buffer.concat([h, val]);
}
function fisierCard(prenume, nume, zile, extra) {
  const parti = [
    bloc(0x0520, blocIdentificare(prenume, nume)),
    bloc(0x0520, Buffer.alloc(64, 0xAB), 0x01),          // semnătură — se sare peste
    bloc(0x0504, blocActivitate(zile)),
    bloc(0x0504, Buffer.alloc(64, 0xCD), 0x01),
  ];
  if (extra) parti.push(extra);
  return Buffer.concat(parti);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
sect('1. O zi construită de noi se citește înapoi EXACT');
{
  // 00:00 odihnă · 06:30 muncă · 07:00 condus · 11:00 odihnă(45m) · 11:45 condus · 15:00 odihnă
  const zi = [{
    data: '2026-08-10', km: 612,
    schimbari: [
      schimbare(0, ZI.ODIHNA), schimbare(390, ZI.MUNCA), schimbare(420, ZI.CONDUS),
      schimbare(660, ZI.ODIHNA), schimbare(705, ZI.CONDUS), schimbare(900, ZI.ODIHNA),
    ],
  }];
  const r = t.parse(fisierCard('ION', 'MARINESCU', zi));
  T('e recunoscut ca fișier de card', r.kind === 'card șofer', r.kind);
  T('structura s-a verificat', r.incredere === 'confirmat', r.incredere + ' · ' + (r.parseNote || ''));
  T('numele e citit de la poziția fixă', r.driverName === 'ION MARINESCU', r.driverName);
  T('o singură zi', r.days.length === 1, r.days.length);
  const d = r.days[0] || {};
  T('data e corectă', d.date === '2026-08-10', d.date);
  T('km corecți', d.distanceKm === 612, d.distanceKm);
  // condus: 420→660 (240) + 705→900 (195) = 435
  T('minutele de condus, exact', d.drivingMin === 435, d.drivingMin);
  // muncă: 390→420 = 30
  T('minutele de muncă, exact', d.workMin === 30, d.workMin);
  // odihnă: 0→390 (390) + 660→705 (45) + 900→1440 (540) = 975
  T('minutele de odihnă, exact', d.restMin === 975, d.restMin);
  T('suma zilei e 1440 de minute',
    d.drivingMin + d.workMin + d.restMin + d.availMin === 1440,
    d.drivingMin + d.workMin + d.restMin + d.availMin);
  T('conducerea continuă maximă = 240 (pauza de 45 a resetat)', d.maxContDriveMin === 240, d.maxContDriveMin);
  T('fără abateri într-o zi cuminte', r.infringements.length === 0, JSON.stringify(r.infringements));
}

sect('2. Pauza prea scurtă NU resetează conducerea continuă');
{
  // condus 07:00–11:00 (240) · pauză 30 min · condus 11:30–12:22 (52) → 292 continuu = peste 4h30
  const zi = [{
    data: '2026-08-11', km: 400,
    schimbari: [
      schimbare(0, ZI.ODIHNA), schimbare(420, ZI.CONDUS), schimbare(660, ZI.ODIHNA),
      schimbare(690, ZI.CONDUS), schimbare(742, ZI.ODIHNA),
    ],
  }];
  const r = t.parse(fisierCard('VASILE', 'DOBRE', zi));
  const d = r.days[0];
  T('conducerea continuă se cumulează peste pauza scurtă', d.maxContDriveMin === 292, d.maxContDriveMin);
  T('abaterea de 4h30 e semnalată',
    r.infringements.some(i => /4h30/.test(i.rule)), JSON.stringify(r.infringements.map(i => i.rule)));
  T('e marcată „serioasă"', (r.infringements.find(i => /4h30/.test(i.rule)) || {}).severity === 'serioasă');
}

sect('3. Pauza divizată 15 + 30 resetează, cum zice legea');
{
  // condus 240 · pauză 15 · condus 30 · pauză 30 (reset) · condus 200
  const zi = [{
    data: '2026-08-12', km: 500,
    schimbari: [
      schimbare(0, ZI.ODIHNA), schimbare(300, ZI.CONDUS), schimbare(540, ZI.ODIHNA),
      schimbare(555, ZI.CONDUS), schimbare(585, ZI.ODIHNA), schimbare(615, ZI.CONDUS),
      schimbare(815, ZI.ODIHNA),
    ],
  }];
  const r = t.parse(fisierCard('GHEORGHE', 'POP', zi));
  const d = r.days[0];
  // înainte de reset: 240 + 30 = 270 (fix la limită, nu e abatere); după reset: 200
  T('maximul continuu e 270, nu 470', d.maxContDriveMin === 270, d.maxContDriveMin);
  T('270 de minute NU e abatere (limita e 4h30 = 270)',
    !r.infringements.some(i => /4h30/.test(i.rule)), JSON.stringify(r.infringements.map(i => i.rule)));
}

sect('4. Mai multe zile, în ordine, cu abateri săptămânale');
{
  // 7 zile a câte 9h30 condus = 66h30 pe săptămână → peste 56h
  const zile = [];
  for (let i = 0; i < 7; i++) {
    zile.push({
      data: '2026-08-' + String(10 + i).padStart(2, '0'), km: 700,
      schimbari: [
        schimbare(0, ZI.ODIHNA), schimbare(300, ZI.CONDUS), schimbare(570, ZI.ODIHNA),
        schimbare(615, ZI.CONDUS), schimbare(915, ZI.ODIHNA),
      ],
    });
  }
  const r = t.parse(fisierCard('MARIUS', 'ILIE', zile));
  T('toate cele 7 zile sunt citite', r.days.length === 7, r.days.length);
  T('zilele ies în ordine crescătoare',
    r.days.every((d, i, a) => i === 0 || a[i - 1].date < d.date), r.days.map(d => d.date).join(','));
  T('perioada acoperită e corectă', r.periodFrom === '2026-08-10' && r.periodTo === '2026-08-16',
    r.periodFrom + ' → ' + r.periodTo);
  const zi = r.days[0];
  T('condus pe zi = 570 min (9h30)', zi.drivingMin === 570, zi.drivingMin);
  T('totalul de conducere = 7 × 570', r.totals.conducereMin === 7 * 570, r.totals.conducereMin);
  T('abaterea săptămânală peste 56h e prinsă',
    r.infringements.some(i => /săptămânală peste 56h/.test(i.rule)),
    JSON.stringify([...new Set(r.infringements.map(i => i.rule))]));
  T('zilele extinse peste 2 pe săptămână sunt prinse',
    r.infringements.some(i => /2 zile extinse/.test(i.rule)));
  T('km se adună corect', r.totals.km === 7 * 700, r.totals.km);
}

sect('5. Conducere zilnică peste 10h = gravă');
{
  const zi = [{
    data: '2026-08-13', km: 900,
    schimbari: [schimbare(0, ZI.ODIHNA), schimbare(240, ZI.CONDUS), schimbare(900, ZI.ODIHNA)],
  }];
  const r = t.parse(fisierCard('ION', 'POPA', zi));
  T('660 de minute de condus', r.days[0].drivingMin === 660, r.days[0].drivingMin);
  const inf = r.infringements.find(i => /peste 10h/.test(i.rule));
  T('e semnalată', !!inf, JSON.stringify(r.infringements.map(i => i.rule)));
  T('e „gravă"', inf && inf.severity === 'gravă');
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
sect('6. Pe ce NU înțelege, refuză — nu inventează cifre');
{
  const refuza = (nume, buf) => {
    const r = t.parse(buf);
    const faraCifre = r.days.length === 0 && !(r.totals && r.totals.conducereMin > 0);
    T(nume, r.incredere === 'necitit' && faraCifre,
      r.incredere + ' · zile=' + r.days.length + ' · ' + (r.parseNote || '').slice(0, 70));
    T('  ' + nume + ' — spune de ce', !!r.parseNote && r.parseNote.length > 20);
  };

  refuza('octeți la întâmplare', Buffer.from(Array.from({ length: 400 }, (_, i) => (i * 97 + 13) & 0xFF)));
  refuza('fișier gol', Buffer.alloc(0));
  refuza('fișier de 8 octeți', Buffer.alloc(8, 0x11));
  refuza('text, nu binar', Buffer.from('nu sunt un fisier de tahograf, sunt un text oarecare'.repeat(6)));

  // fișier bun, tăiat la jumătate
  const bun = fisierCard('ION', 'TEST', [{ data: '2026-08-10', km: 100,
    schimbari: [schimbare(0, ZI.ODIHNA), schimbare(400, ZI.CONDUS), schimbare(700, ZI.ODIHNA)] }]);
  refuza('fișier bun, tăiat la jumătate', bun.slice(0, Math.floor(bun.length / 2)));

  // lanțul de zile rupt: stricăm lungimea zilei dinainte
  const rupt = Buffer.from(bun);
  {
    // găsim blocul de activitate (al treilea) și stricăm primul „prevLen" din a doua zi
    const b2 = Buffer.from(bun);
    // stricăm indicatorul către cea mai nouă zi → iese în afara inelului
    const idx = b2.indexOf(Buffer.from([0x05, 0x04, 0x00]));
    if (idx > 0) b2.writeUInt16BE(0xFFFF, idx + 5);
    refuza('indicator de zi în afara inelului', b2);
  }
  {
    // dată imposibilă (anul 1970)
    const b3 = Buffer.from(bun);
    const idx = b3.indexOf(Buffer.from([0x05, 0x04, 0x00]));
    if (idx > 0) b3.writeUInt32BE(0, idx + 5 + 4 + 4);   // data primei zile
    refuza('zi cu dată imposibilă', b3);
  }
  void rupt;
}

sect('7. Schimbări scrise în neregulă → refuzat');
{
  const zi = [{
    data: '2026-08-14', km: 100,
    schimbari: [schimbare(0, ZI.ODIHNA), schimbare(800, ZI.CONDUS), schimbare(300, ZI.ODIHNA)],
  }];
  const r = t.parse(fisierCard('ION', 'TEST', zi));
  T('nu acceptă minutele în dezordine', r.incredere === 'necitit', r.incredere);
  T('spune de ce', /ordine/.test(r.parseNote || ''), r.parseNote);
}

sect('8. Numele: doar de la poziția fixă, altfel deloc');
{
  T('nume valid', t._numeDinIdentificare(blocIdentificare('ANA', 'IONESCU')) === 'ANA IONESCU');
  T('bloc de altă lungime → fără nume', t._numeDinIdentificare(Buffer.alloc(80, 65)) === null);
  T('bloc cu octeți de control → fără nume',
    t._numeDinIdentificare((() => { const b = blocIdentificare('ANA', 'IONESCU'); b[70] = 0x07; return b; })()) === null);
  T('bloc gol → fără nume', t._numeDinIdentificare(Buffer.alloc(t._LEN_IDENTIFICATION, 0)) === null);
}

sect('9. Fișier din memoria vehiculului (VU)');
{
  const vin = 'WDB9634031L123456';
  const parti = [Buffer.from([0x76, 0x01]), Buffer.alloc(60, 0x11), Buffer.from(vin, 'latin1'),
    Buffer.alloc(40, 0x22), Buffer.from([0x76, 0x02]), Buffer.alloc(120, 0x33),
    Buffer.from([0x76, 0x05]), Buffer.alloc(80, 0x44)];
  const r = t.parse(Buffer.concat(parti));
  T('e recunoscut ca fișier de vehicul', r.kind === 'memoria vehiculului', r.kind);
  T('încredere „parțial", nu „confirmat"', r.incredere === 'partial', r.incredere);
  T('găsește seria de șasiu', r.vin === vin, r.vin);
  T('NU pretinde că a citit activitatea', r.days.length === 0 && !r.totals.conducereMin);
  T('spune limpede ce a făcut și ce nu', /90 de zile/.test(r.parseNote || '') && /nu se analizează/.test(r.parseNote || ''),
    r.parseNote);
  T('recunoaște secțiunile', Array.isArray(r.blocuri) && r.blocuri.length >= 3, JSON.stringify(r.blocuri));
}
{
  // două serii candidate → nu ghicim
  const doua = Buffer.concat([Buffer.from([0x76, 0x01]), Buffer.from('WDB9634031L123456'),
    Buffer.alloc(20, 0x11), Buffer.from('WMA06XZZ8CM543210'), Buffer.alloc(20, 0x22)]);
  T('două serii candidate → nu alege niciuna', t._cautaVin(doua) === null, t._cautaVin(doua));
  T('17 cifre nu trec drept serie', t._cautaVin(Buffer.from('  12345678901234567  ')) === null);
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
sect('10. Termenele de descărcare (28 de zile cardul, 90 memoria)');
{
  const AZI = '2026-08-26T10:00:00Z';
  T('pragurile sunt cele din regulament', t.TERMEN_CARD_ZILE === 28 && t.TERMEN_VU_ZILE === 90,
    t.TERMEN_CARD_ZILE + '/' + t.TERMEN_VU_ZILE);

  const s1 = t.scadenta('2026-08-20', 28, AZI);
  T('descărcat acum 6 zile → 22 rămase', s1.zileRamase === 22 && s1.stare === 'ok', JSON.stringify(s1));

  const s2 = t.scadenta('2026-07-26', 28, AZI);   // acum 31 de zile
  T('acum 31 de zile → 3 zile întârziere', s2.zileRamase === -3 && s2.stare === 'depasit', JSON.stringify(s2));
  T('textul e pe românește', s2.text === '3 zile întârziere', s2.text);

  const s3 = t.scadenta('2026-08-01', 28, AZI);   // acum 25 → 3 rămase
  T('la 3 zile de termen → „curând"', s3.stare === 'curand' && s3.zileRamase === 3, JSON.stringify(s3));

  const s4 = t.scadenta(null, 28, AZI);
  T('niciodată descărcat → stare proprie', s4.stare === 'niciodata' && s4.zileRamase === null, JSON.stringify(s4));
  T('„niciodată" nu se confundă cu „e în regulă"', s4.stare !== 'ok');

  const s5 = t.scadenta('2026-05-28', 90, AZI);   // acum 90 de zile fix
  T('exact la termen NU e încă întârziere', s5.zileRamase === 0 && s5.stare === 'curand', JSON.stringify(s5));

  const s6 = t.scadenta('2026-08-25', 28, AZI);
  T('o singură zi se scrie la singular', t.scadenta('2026-07-28', 28, AZI).text === '1 zi întârziere',
    t.scadenta('2026-07-28', 28, AZI).text);
  void s6;
}

sect('11. Golurile din arhivă — ce zile nu poți dovedi');
{
  const g = t.goluri([
    { from: '2026-06-01', to: '2026-06-28' },
    { from: '2026-07-05', to: '2026-08-01' },     // lipsesc 29.06 – 04.07 = 6 zile
    { from: '2026-08-02', to: '2026-08-26' },     // fără gol
  ]);
  T('găsește un singur gol', g.length === 1, JSON.stringify(g));
  T('golul e de 6 zile', g[0] && g[0].zile === 6, JSON.stringify(g[0]));
  T('începe a doua zi după ce s-a terminat descărcarea', g[0] && g[0].de === '2026-06-29', g[0] && g[0].de);
  T('se termină cu o zi înainte de următoarea', g[0] && g[0].pana === '2026-07-04', g[0] && g[0].pana);
  T('perioade lipite → niciun gol',
    t.goluri([{ from: '2026-06-01', to: '2026-06-28' }, { from: '2026-06-29', to: '2026-07-10' }]).length === 0);
  T('perioadele date în dezordine sunt sortate întâi',
    t.goluri([{ from: '2026-07-05', to: '2026-08-01' }, { from: '2026-06-01', to: '2026-06-28' }]).length === 1);
  T('o singură perioadă → niciun gol', t.goluri([{ from: '2026-06-01', to: '2026-06-28' }]).length === 0);
  T('listă goală → niciun gol', t.goluri([]).length === 0 && t.goluri(null).length === 0);
}

sect('12. Datele venite din baza de date (obiecte Date, nu text)');
{
  // PostgreSQL întoarce coloanele DATE ca obiecte `Date`. Codul care le trata ca text primea
  // „Tue Aug 25", ieșea o dată invalidă, iar scadențarul răspundea „null zile rămase" — tăcut.
  const AZI = '2026-08-26T10:00:00Z';
  const caDate = new Date(2026, 7, 20);           // 20 august 2026, ora locală
  T('obiect Date → „AAAA-LL-ZZ"', t.ziISO(caDate) === '2026-08-20', t.ziISO(caDate));
  T('text ISO rămâne neatins', t.ziISO('2026-08-20') === '2026-08-20');
  T('text ISO cu oră se taie corect', t.ziISO('2026-08-20T13:45:00.000Z') === '2026-08-20');
  T('null → null', t.ziISO(null) === null && t.ziISO('') === null && t.ziISO(undefined) === null);
  T('gunoi → null, nu o dată inventată', t.ziISO('nu-i o data') === null, t.ziISO('nu-i o data'));

  const s = t.scadenta(caDate, 28, AZI);
  T('scadența merge cu obiecte Date', s.zileRamase === 22 && s.stare === 'ok', JSON.stringify(s));
  T('o dată necitibilă NU trece drept „în regulă"',
    t.scadenta('nu-i o data', 28, AZI).stare === 'niciodata', t.scadenta('nu-i o data', 28, AZI).stare);

  const g = t.goluri([
    { from: new Date(2026, 5, 1), to: new Date(2026, 5, 28) },
    { from: new Date(2026, 6, 5), to: new Date(2026, 7, 1) },
  ]);
  T('golurile merg cu obiecte Date', g.length === 1 && g[0].zile === 6, JSON.stringify(g));
}

console.log('\n──────────────────────────────');
console.log(ok + ' verificări trecute, ' + rele + ' picate');
process.exit(rele ? 1 : 0);
