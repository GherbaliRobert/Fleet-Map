// tools/gen-io-catalog-extra.js — generează io_catalog_extra.js (etichetele românești pentru
// ID-urile din lista oficială care NU sunt în catalogul scris de mână).
//
// Catalogul de mână (io_catalog.js) rămâne sursa pentru intrările lui — aici se generează DOAR
// restul, ca editorul „Mapează" și DevConsole să aibă etichete pentru toate cele 640 de ID-uri,
// nu doar pentru primele ~140. Traducerea e pe dicționar de fraze + cuvinte: previzibilă și
// repetabilă; ce nu se potrivește rămâne pe numele oficial englezesc (informativ, nu greșit).
//
//   node tools/gen-io-catalog-extra.js
const fs = require('fs');
const path = require('path');
const spec = require('./fixtures/avl-fmc130.json');
const catalog = require('../io_catalog.js');
const extraNames = require('../io_names_extra.js');

// Fraze întregi (au prioritate — traducerea cuvânt cu cuvânt le-ar suna rău)
const FRAZE = [
  [/^number of dtc$/i, 'Număr erori DTC'],
  [/^engine load$/i, 'Sarcină motor'],
  [/^coolant temperature$/i, 'Temperatură lichid răcire'],
  [/^short fuel trim$/i, 'Corecție scurtă amestec'],
  [/^fuel pressure$/i, 'Presiune combustibil'],
  [/^intake map$/i, 'Presiune galerie admisie'],
  [/^engine rpm$/i, 'Turație motor'],
  [/^vehicle speed$/i, 'Viteză vehicul'],
  [/^timing advance$/i, 'Avans aprindere'],
  [/^intake air temperature$/i, 'Temperatură aer admisie'],
  [/^maf$/i, 'Debit masic aer (MAF)'],
  [/^throttle position$/i, 'Poziție clapetă accelerație'],
  [/^run time since engine start$/i, 'Timp de la pornirea motorului'],
  [/^distance traveled mil on$/i, 'Distanță cu martorul MIL aprins'],
  [/^relative fuel rail pressure$/i, 'Presiune relativă rampă combustibil'],
  [/^direct fuel rail pressure$/i, 'Presiune directă rampă combustibil'],
  [/^commanded egr$/i, 'EGR comandat'],
  [/^egr error$/i, 'Eroare EGR'],
  [/^fuel level$/i, 'Nivel combustibil'],
  [/^distance since codes clear$/i, 'Distanță de la ștergerea erorilor'],
  [/^barometric pressure$/i, 'Presiune barometrică'],
  [/^control module voltage$/i, 'Tensiune modul control'],
  [/^absolute load value$/i, 'Sarcină absolută'],
  [/^ambient air temperature$/i, 'Temperatură aer ambiant'],
  [/^time run with mil on$/i, 'Timp cu martorul MIL aprins'],
  [/^time since codes cleared$/i, 'Timp de la ștergerea erorilor'],
  [/^absolute fuel rail pressure$/i, 'Presiune absolută rampă combustibil'],
  [/^hybrid battery pack remaining life$/i, 'Nivel baterie hibrid'],
  [/^engine oil temperature$/i, 'Temperatură ulei motor'],
  [/^fuel injection timing$/i, 'Avans injecție'],
  [/^engine fuel rate$/i, 'Consum instantaneu motor'],
  [/^vin$/i, 'Serie șasiu (VIN)'],
  [/^eco score$/i, 'Scor condus economic'],
  [/^instant movement$/i, 'Mișcare instantanee'],
  [/^wake reason$/i, 'Motiv trezire dispozitiv'],
  [/^network type$/i, 'Tip rețea'],
  [/^user id$/i, 'ID utilizator'],
  [/^ground sense$/i, 'Detecție masă'],
  [/^barcode id$/i, 'Cod de bare scanat'],
  [/^bt status$/i, 'Stare Bluetooth'],
];

// Cuvinte / bucăți (aplicate după fraze, în ordine)
const CUVINTE = [
  [/\bfuel\b/gi, 'combustibil'], [/\btemperature\b/gi, 'temperatură'], [/\blevel\b/gi, 'nivel'],
  [/\bpressure\b/gi, 'presiune'], [/\bspeed\b/gi, 'viteză'], [/\bstatus\b/gi, 'stare'],
  [/\bstate\b/gi, 'stare'], [/\bflags\b/gi, 'stegulețe'], [/\bcounter\b/gi, 'contor'],
  [/\bdoor\b/gi, 'ușă'], [/\bbattery\b/gi, 'baterie'], [/\bvoltage\b/gi, 'tensiune'],
  [/\bcurrent\b/gi, 'curent'], [/\bengine\b/gi, 'motor'], [/\boil\b/gi, 'ulei'],
  [/\bcoolant\b/gi, 'lichid răcire'], [/\bwear\b/gi, 'uzură'], [/\bbrake\b/gi, 'frână'],
  [/\bpad\b/gi, 'plăcuță'], [/\baxle\b/gi, 'axă'], [/\bload\b/gi, 'sarcină'],
  [/\bweight\b/gi, 'greutate'], [/\btotal\b/gi, 'total'], [/\bdistance\b/gi, 'distanță'],
  [/\bmileage\b/gi, 'kilometraj'], [/\bconsumption\b/gi, 'consum'], [/\bconsumed\b/gi, 'consumat'],
  [/\bdriving\b/gi, 'condus'], [/\bdriver\b/gi, 'șofer'], [/\bwheel\b/gi, 'roată'],
  [/\bsteering\b/gi, 'direcție'], [/\btrailer\b/gi, 'remorcă'], [/\btime\b/gi, 'timp'],
  [/\bworktime\b/gi, 'timp funcționare'], [/\bcounted\b/gi, 'contorizat'], [/\brange\b/gi, 'autonomie'],
  [/\bremaining\b/gi, 'rămas'], [/\btank\b/gi, 'rezervor'], [/\badblue\b/gi, 'AdBlue'],
  [/\bcng\b/gi, 'CNG'], [/\blpg\b/gi, 'GPL'], [/\bswitch\b/gi, 'comutator'],
  [/\bposition\b/gi, 'poziție'], [/\bpedal\b/gi, 'pedală'], [/\baccelerator\b/gi, 'accelerație'],
  [/\bhumidity\b/gi, 'umiditate'], [/\bsensor\b/gi, 'senzor'], [/\bfrequency\b/gi, 'frecvență'],
  [/\bmagnet\b/gi, 'magnet'], [/\bmovement\b/gi, 'mișcare'], [/\bpitch\b/gi, 'înclinare'],
  [/\broll\b/gi, 'ruliu'], [/\bangle\b/gi, 'unghi'], [/\bluminosity\b/gi, 'luminozitate'],
  [/\bbutton\b/gi, 'buton'], [/\bcount\b/gi, 'număr'], [/\bhours\b/gi, 'ore'],
  [/\brpm\b/gi, 'turație'], [/\bretarder\b/gi, 'retarder'], [/\bgear\b/gi, 'treaptă viteză'],
  [/\bcruise\b/gi, 'tempomat'], [/\bcontrol\b/gi, 'control'], [/\bsecurity\b/gi, 'securitate'],
  [/\bindicator\b/gi, 'martor'], [/\bagricultural\b/gi, 'agricol'], [/\bmachinery\b/gi, 'utilaj'],
  [/\bharvesting\b/gi, 'recoltare'], [/\bmoisture\b/gi, 'umiditate'], [/\bgrain\b/gi, 'cereale'],
  [/\butility\b/gi, 'utilitar'], [/\bcistern\b/gi, 'cisternă'], [/\bsection\b/gi, 'secțiune'],
  [/\bfilled\b/gi, 'umplut'], [/\bsalt\b/gi, 'sare'], [/\bspreading\b/gi, 'împrăștiere'],
  [/\bwidth\b/gi, 'lățime'], [/\bamount\b/gi, 'cantitate'], [/\bconcentration\b/gi, 'concentrație'],
];

function traducere(oficial) {
  for (const [re, ro] of FRAZE) if (re.test(oficial)) return ro;
  let t = oficial;
  for (const [re, ro] of CUVINTE) t = t.replace(re, ro);
  // capitalizare simplă: prima literă mare, restul cum a ieșit
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function categorie(grup, nume) {
  const g = String(grup || '');
  if (/OBD/i.test(g)) return 'OBD';
  if (/Bluetooth/i.test(g)) return 'BLE';
  if (/agricultural/i.test(nume) || /agricol/i.test(nume)) return 'Agricol';
  if (/LVCAN|ALLCAN|CANCONTROL|CAN adapters/i.test(g)) return 'CAN';
  if (/driver/i.test(nume)) return 'Sofer';
  return 'Sistem';
}

const iesite = [];
for (const e of spec) {
  if (catalog.IO_CATALOG_BY_ID[e.id]) continue;          // catalogul de mână are prioritate
  if (iesite.find((x) => x.id === e.id)) continue;       // dubluri de id în spec
  const gen = extraNames[e.id];
  const mult = parseFloat(e.mult);
  iesite.push({
    id: e.id,
    name: e.nume,
    name_ro: traducere(e.nume),
    unit: e.unit && e.unit !== '-' ? e.unit : '-',
    multiplier: Number.isFinite(mult) ? mult : 1,
    category: categorie(e.grup, e.nume),
    key: gen ? gen.name : null,                          // cheia din io_data (după codec8e)
    desc_ro: '',
  });
}

const corp = iesite.map((x) =>
  `  { id: ${x.id}, name: ${JSON.stringify(x.name)}, name_ro: ${JSON.stringify(x.name_ro)}, unit: ${JSON.stringify(x.unit)}, multiplier: ${x.multiplier}, category: ${JSON.stringify(x.category)}, key: ${JSON.stringify(x.key)}, desc_ro: "" },`
).join('\n');

fs.writeFileSync(path.join(__dirname, '..', 'io_catalog_extra.js'),
`// io_catalog_extra.js — GENERAT de tools/gen-io-catalog-extra.js din specul oficial FMC130.
// NU edita de mână. Catalogul scris de mână (io_catalog.js) are prioritate; aici e restul listei
// oficiale (${iesite.length} intrări), ca editorul „Mapează" și DevConsole să aibă etichete pentru tot.
module.exports = [
${corp}
];
`);
console.log('io_catalog_extra.js scris:', iesite.length, 'intrări');
