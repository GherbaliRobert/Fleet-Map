// io_signals.js — semnalele CAN NUMERICE care se pot pune într-un raport de istoric. SURSĂ UNICĂ.
//
// De ce există. Aplicația mai are trei liste de IO-uri, fiecare cu rostul ei:
//   • `codec8e.js`   — ce ID trimite aparatul și cum se cheamă cheia (can_engine_rpm…)
//   • `io_catalog.js`— fișa Teltonika, indexată pe ID-ul AVL (nu pe cheie!)
//   • `io_format.js` — cum se SCRIE o valoare pe ecran („87.0 °C")
// Niciuna nu răspunde la întrebarea de care are nevoie un raport: *care semnale sunt numere pe care
// merită să le urmărești în timp, în ce unitate și cum se grupează pentru omul care bifează*.
// Aici stau exact alea. Etichetele NU se rescriu: vin din `io_format.formatIoLabel`.
//
// ⚠ Cheia `scala`: unele valori sunt deja convertite la parsare (`can_fuel_level_liters` vine în
// litri), altele nu (`external_voltage` rămâne în milivolți). De-aia scala e scrisă pe cheie, nu
// calculată din multiplicatorul catalogului — altfel unele s-ar împărți de două ori. E aceeași
// capcană descrisă în antetul lui `io_format.js`, și e verificată în `verify_can_report.js`, care
// compară fiecare intrare de aici cu ce ar scrie `formatIoValue` pe aceeași valoare.

// grup — cum se strâng bifele în interfață; unitate/scala/zecimale — pentru coloane și grafice.
const SEMNALE = [
  // ── Motor ──
  { cheie: 'can_engine_rpm',              grup: 'motor',   unitate: 'RPM',  scala: 1,      zec: 0 },
  { cheie: 'can_engine_temp',             grup: 'motor',   unitate: '°C',   scala: 1,      zec: 1 },
  { cheie: 'can_engine_load',             grup: 'motor',   unitate: '%',    scala: 1,      zec: 0 },
  { cheie: 'can_accelerator_pedal',       grup: 'motor',   unitate: '%',    scala: 1,      zec: 0 },
  { cheie: 'can_engine_oil_temp',         grup: 'motor',   unitate: '°C',   scala: 1,      zec: 1 },
  { cheie: 'can_engine_oil_pressure',     grup: 'motor',   unitate: 'kPa',  scala: 1,      zec: 0 },
  { cheie: 'can_intake_air_temp',         grup: 'motor',   unitate: '°C',   scala: 1,      zec: 1 },
  { cheie: 'can_engine_worktime',         grup: 'motor',   unitate: 'h',    scala: 1 / 60, zec: 1 },

  // ── Deplasare ──
  { cheie: 'can_vehicle_speed',           grup: 'mers',    unitate: 'km/h', scala: 1,      zec: 0 },
  { cheie: 'speed_io',                    grup: 'mers',    unitate: 'km/h', scala: 1,      zec: 0 },
  { cheie: 'can_total_mileage',           grup: 'mers',    unitate: 'km',   scala: 1,      zec: 1 },
  { cheie: 'can_trip_distance',           grup: 'mers',    unitate: 'km',   scala: 1,      zec: 1 },
  { cheie: 'total_odometer',              grup: 'mers',    unitate: 'km',   scala: 1 / 1000, zec: 1 },

  // ── Combustibil ──
  { cheie: 'can_fuel_level_liters',       grup: 'carb',    unitate: 'L',    scala: 1,      zec: 1 },
  { cheie: 'can_fuel_level_pct',          grup: 'carb',    unitate: '%',    scala: 1,      zec: 0 },
  { cheie: 'can_fuel_rate',               grup: 'carb',    unitate: 'L/h',  scala: 1,      zec: 1 },
  { cheie: 'can_fuel_consumed',           grup: 'carb',    unitate: 'L',    scala: 1,      zec: 1 },
  { cheie: 'fuel_level_liters',           grup: 'carb',    unitate: 'L',    scala: 1,      zec: 1 },
  { cheie: 'tank_level_liters',           grup: 'carb',    unitate: 'L',    scala: 1,      zec: 1 },
  { cheie: 'can_adblue_level_pct',        grup: 'carb',    unitate: '%',    scala: 1,      zec: 0 },
  { cheie: 'can_adblue_level_liters',     grup: 'carb',    unitate: 'L',    scala: 1,      zec: 1 },

  // ── Sonde de combustibil (separate de CAN) ──
  { cheie: 'ble_fuel_level_1',            grup: 'sonde',   unitate: 'L',    scala: 1,      zec: 1 },
  { cheie: 'ble_fuel_level_2',            grup: 'sonde',   unitate: 'L',    scala: 1,      zec: 1 },
  { cheie: 'lls_fuel_level_1',            grup: 'sonde',   unitate: 'L',    scala: 1,      zec: 1 },
  { cheie: 'lls_fuel_level_2',            grup: 'sonde',   unitate: 'L',    scala: 1,      zec: 1 },
  { cheie: 'ble_fuel_temp_1',             grup: 'sonde',   unitate: '°C',   scala: 1,      zec: 1 },
  { cheie: 'lls_fuel_temp_1',             grup: 'sonde',   unitate: '°C',   scala: 1,      zec: 1 },

  // ── Camion ──
  { cheie: 'can_axle1_load',              grup: 'camion',  unitate: 'kg',   scala: 1,      zec: 0 },
  { cheie: 'can_axle2_load',              grup: 'camion',  unitate: 'kg',   scala: 1,      zec: 0 },
  { cheie: 'can_axle3_load',              grup: 'camion',  unitate: 'kg',   scala: 1,      zec: 0 },
  { cheie: 'can_total_axle_load',         grup: 'camion',  unitate: 'kg',   scala: 1,      zec: 0 },
  { cheie: 'can_load_weight',             grup: 'camion',  unitate: 'kg',   scala: 1,      zec: 0 },
  { cheie: 'can_retarder_load',           grup: 'camion',  unitate: '%',    scala: 1,      zec: 0 },

  // ── Mediu și electric ──
  { cheie: 'can_outside_temp',            grup: 'divers',  unitate: '°C',   scala: 1,      zec: 1 },
  { cheie: 'external_voltage',            grup: 'divers',  unitate: 'V',    scala: 1 / 1000, zec: 2 },
  { cheie: 'battery_voltage',             grup: 'divers',  unitate: 'V',    scala: 1 / 1000, zec: 2 },
  { cheie: 'can_battery_temp',            grup: 'divers',  unitate: '°C',   scala: 1,      zec: 1 },
  { cheie: 'can_dtc_errors',              grup: 'divers',  unitate: 'erori', scala: 1,     zec: 0 },
  { cheie: 'gsm_signal',                  grup: 'divers',  unitate: '/5',   scala: 1,      zec: 0 },
  { cheie: 'satellites',                  grup: 'divers',  unitate: 'sat.', scala: 1,      zec: 0 },
];

const GRUPURI = [
  { cheie: 'motor',  eticheta: 'Motor' },
  { cheie: 'mers',   eticheta: 'Deplasare' },
  { cheie: 'carb',   eticheta: 'Combustibil' },
  { cheie: 'sonde',  eticheta: 'Sonde de combustibil' },
  { cheie: 'camion', eticheta: 'Camion' },
  { cheie: 'divers', eticheta: 'Mediu și alimentare' },
];

// Semnalele propuse implicit când omul n-a bifat nimic (inclusiv la un raport programat, unde
// interfața nu trimite bifele). Alese ca să spună ceva util pe ORICE mașină, nu doar pe camioane.
const IMPLICITE = ['can_engine_rpm', 'can_engine_temp', 'can_vehicle_speed', 'can_fuel_level_liters'];

const _peCheie = {};
SEMNALE.forEach((s) => { _peCheie[s.cheie] = s; });

/** Semnalul, după cheie. `null` dacă nu e unul pe care îl oferim în raport. */
function semnal(cheie) { return _peCheie[cheie] || null; }

/** E o cheie pe care avem voie s-o punem în interogare? Poarta contra injecției SQL. */
function permis(cheie) { return Object.prototype.hasOwnProperty.call(_peCheie, cheie); }

/**
 * Curăță o listă de chei venită din interfață: păstrează doar cele cunoscute, fără dubluri, cu un
 * plafon. Fără chei valide → cele implicite (altfel raportul ar ieși gol și ar părea stricat).
 */
function curata(lista, maxim) {
  const M = maxim || 10;
  const brut = Array.isArray(lista) ? lista : String(lista || '').split(',');
  const out = [];
  for (const x of brut) {
    const k = String(x || '').trim();
    if (permis(k) && out.indexOf(k) < 0) out.push(k);
    if (out.length >= M) break;
  }
  return out.length ? out : IMPLICITE.slice();
}

/** Valoarea afișabilă (în unitatea din tabel), din valoarea brută stocată. */
function valoare(cheie, brut) {
  const s = _peCheie[cheie];
  const n = parseFloat(brut);
  if (!s || !Number.isFinite(n)) return null;
  const v = n * s.scala;
  const f = Math.pow(10, s.zec);
  return Math.round(v * f) / f;
}

module.exports = { SEMNALE, GRUPURI, IMPLICITE, semnal, permis, curata, valoare };
