#!/usr/bin/env node
// tools/liste-teltonika.js — face copia de pornire a listelor Teltonika (28.09).
//
//   node tools/liste-teltonika.js LV-CAN200_list_….xlsx FMX150_Supported_Vehicles_….xlsx ALLCAN300_list_….xlsx
//
// Citește fișierele cu ACEEAȘI funcție ca încărcarea din aplicație (compatibilitate.citesteExcel) și
// scrie liste/teltonika.json.gz. Serverul o folosește până se încarcă din aplicație o listă mai nouă.
// Prefixul pus de unele unelte de trimis fișiere („335169bf-LV-CAN200…") se scoate din nume.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const compat = require('../compatibilitate');

(async () => {
  const fisiere = process.argv.slice(2);
  if (!fisiere.length) { console.error('Dă-mi fișierele Excel ale listelor.'); process.exit(1); }
  const out = {};
  for (const f of fisiere) {
    const nume = path.basename(f).replace(/^[0-9a-f]{8}-/i, '');
    const r = await compat.citesteExcel(fs.readFileSync(f), nume);
    out[r.tip] = { fisier: nume, data: compat.dataDinNume(nume), randuri: r.randuri };
    console.log(r.tip + ': ' + r.randuri.length + ' de vehicule, din ' + (out[r.tip].data || 'o zi necunoscută') + ' (' + nume + ')');
  }
  const tinta = path.join(__dirname, '..', 'liste', 'teltonika.json.gz');
  fs.mkdirSync(path.dirname(tinta), { recursive: true });
  // Ordinea cheilor fixă și fără dată în arhivă: același fișier de intrare dă aceiași octeți.
  const json = JSON.stringify(Object.keys(compat.LISTE).reduce((o, k) => { if (out[k]) o[k] = out[k]; return o; }, {}));
  fs.writeFileSync(tinta, zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 }));
  console.log('→ ' + path.relative(process.cwd(), tinta) + ' (' + Math.round(fs.statSync(tinta).size / 1024) + ' KB)');
})().catch((e) => { console.error(e.message); process.exit(1); });
