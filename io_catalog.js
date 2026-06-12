// Catalog AVL IO Teltonika (Codec 8/8E) — 138 ID-uri din documentația oficială wiki.teltonika-gps.com
// FMB003 / FMB920 / FMC130 / FMM family. Override-uri global: companies.settings… nu, în settings global (key='io_catalog_overrides').
// Cheie: id numeric. Format per intrare:
//   { id, name, name_ro, unit, multiplier, category, desc_ro }
// Aplicația folosește acest catalog ca default; super-admin poate suprascrie/extinde din UI.

const IO_CATALOG = [
  // ─── I/O Digital/Analog (1-10, 179-180, 380-381) ─────────────────────────
  { id: 1, name: 'Digital Input 1', name_ro: 'Intrare digitală 1', unit: '0/1', multiplier: 1, category: 'I/O Digital', desc_ro: 'Stare intrare digitală 1 (contact, buton panic, etc.)' },
  { id: 2, name: 'Digital Input 2', name_ro: 'Intrare digitală 2', unit: '0/1', multiplier: 1, category: 'I/O Digital', desc_ro: 'Stare intrare digitală 2' },
  { id: 3, name: 'Digital Input 3', name_ro: 'Intrare digitală 3', unit: '0/1', multiplier: 1, category: 'I/O Digital', desc_ro: 'Stare intrare digitală 3' },
  { id: 4, name: 'Pulse Counter DIN1', name_ro: 'Contor pulsuri DIN1', unit: 'pulsuri', multiplier: 1, category: 'I/O Digital', desc_ro: 'Număr pulsuri pe intrarea digitală 1' },
  { id: 5, name: 'Pulse Counter DIN2', name_ro: 'Contor pulsuri DIN2', unit: 'pulsuri', multiplier: 1, category: 'I/O Digital', desc_ro: 'Număr pulsuri pe intrarea digitală 2' },
  { id: 6, name: 'Analog Input 2', name_ro: 'Intrare analogică 2', unit: 'V', multiplier: 0.001, category: 'I/O Analog', desc_ro: 'Tensiune pe intrarea analogică 2 (mV bruți)' },
  { id: 9, name: 'Analog Input 1', name_ro: 'Intrare analogică 1', unit: 'V', multiplier: 0.001, category: 'I/O Analog', desc_ro: 'Tensiune pe intrarea analogică 1 (mV bruți)' },
  { id: 10, name: 'SD Status', name_ro: 'Stare card SD', unit: '0/1', multiplier: 1, category: 'Sistem', desc_ro: 'Card de memorie prezent (1) sau absent (0)' },
  { id: 179, name: 'Digital Output 1', name_ro: 'Ieșire digitală 1', unit: '0/1', multiplier: 1, category: 'I/O Digital', desc_ro: 'Stare ieșire digitală 1 (releu/blocare motor)' },
  { id: 180, name: 'Digital Output 2', name_ro: 'Ieșire digitală 2', unit: '0/1', multiplier: 1, category: 'I/O Digital', desc_ro: 'Stare ieșire digitală 2' },
  { id: 380, name: 'Digital Output 3', name_ro: 'Ieșire digitală 3', unit: '0/1', multiplier: 1, category: 'I/O Digital', desc_ro: 'Stare ieșire digitală 3' },
  { id: 381, name: 'Ground Sense', name_ro: 'Detecție masă', unit: '0/1', multiplier: 1, category: 'I/O Digital', desc_ro: 'Detecție conexiune la masa vehiculului' },
  { id: 329, name: 'AIN Speed', name_ro: 'Viteză analogică', unit: '-', multiplier: 1, category: 'I/O Analog', desc_ro: 'Viteză calculată din senzor analog (tahometru)' },

  // ─── Alimentare/Baterie (66-68, 113) ─────────────────────────────────────
  { id: 66, name: 'External Voltage', name_ro: 'Tensiune externă', unit: 'V', multiplier: 0.001, category: 'Alimentare', desc_ro: 'Tensiune sursă externă (acumulator vehicul)' },
  { id: 67, name: 'Battery Voltage', name_ro: 'Tensiune baterie internă', unit: 'V', multiplier: 0.001, category: 'Alimentare', desc_ro: 'Tensiune baterie internă a dispozitivului' },
  { id: 68, name: 'Battery Current', name_ro: 'Curent baterie', unit: 'A', multiplier: 0.001, category: 'Alimentare', desc_ro: 'Curent încărcare/descărcare baterie internă' },
  { id: 113, name: 'Battery Level', name_ro: 'Nivel baterie', unit: '%', multiplier: 1, category: 'Alimentare', desc_ro: 'Nivel baterie internă în procente' },

  // ─── GSM/Network (11, 14, 21, 205, 206, 237, 241, 249, 636) ──────────────
  { id: 11, name: 'ICCID1', name_ro: 'ICCID SIM1', unit: '-', multiplier: 1, category: 'GSM', desc_ro: 'Identificator unic al cartelei SIM principale' },
  { id: 14, name: 'ICCID2', name_ro: 'ICCID SIM2', unit: '-', multiplier: 1, category: 'GSM', desc_ro: 'Identificator cartelă SIM secundară' },
  { id: 21, name: 'GSM Signal', name_ro: 'Semnal GSM', unit: '1-5', multiplier: 1, category: 'GSM', desc_ro: 'Intensitate semnal GSM scara 1 (slab) - 5 (excelent)' },
  { id: 205, name: 'GSM Cell ID', name_ro: 'ID celulă GSM', unit: '-', multiplier: 1, category: 'GSM', desc_ro: 'Identificator celulă GSM la care e conectat' },
  { id: 206, name: 'GSM Area Code', name_ro: 'Cod zonă GSM', unit: '-', multiplier: 1, category: 'GSM', desc_ro: 'Location Area Code al rețelei GSM' },
  { id: 237, name: 'Network Type', name_ro: 'Tip rețea', unit: 'cod', multiplier: 1, category: 'GSM', desc_ro: 'Tehnologie mobilă: 0=3G, 1=GSM/2G, 2=4G, 3=LTE CAT-M1, 4=LTE NB, 99=Necunoscut' },
  { id: 241, name: 'Active GSM Operator', name_ro: 'Operator GSM activ', unit: 'MCCMNC', multiplier: 1, category: 'GSM', desc_ro: 'Codul MCC+MNC al operatorului mobil curent' },
  { id: 249, name: 'Jamming', name_ro: 'Bruiaj', unit: '0/1', multiplier: 1, category: 'GSM', desc_ro: 'Detecție bruiaj GSM în jurul dispozitivului' },
  { id: 636, name: 'UMTS/LTE Cell ID', name_ro: 'ID celulă 3G/4G', unit: '-', multiplier: 1, category: 'GSM', desc_ro: 'Identificator celulă rețea 3G/4G/LTE' },

  // ─── GPS/GNSS (24, 60, 69, 80, 181-182, 387) ─────────────────────────────
  { id: 24, name: 'Speed', name_ro: 'Viteză', unit: 'km/h', multiplier: 1, category: 'GPS', desc_ro: 'Viteza vehiculului calculată din GNSS' },
  { id: 60, name: 'GNSS Jamming', name_ro: 'Bruiaj GNSS', unit: '0/1', multiplier: 1, category: 'GPS', desc_ro: 'Detecție bruiaj semnal GNSS (1 = detectat)' },
  { id: 69, name: 'GNSS Status', name_ro: 'Stare GNSS', unit: 'cod', multiplier: 1, category: 'GPS', desc_ro: 'Stare modul GNSS: 0=off, 1=on fără fix, 2=on cu fix, 3=sleep' },
  { id: 80, name: 'Data Mode', name_ro: 'Mod date', unit: 'cod', multiplier: 1, category: 'Sistem', desc_ro: 'Mod operare: 0=Home Stop, 1=Home Moving, 2=Roaming Stop, 3=Roaming Moving, 4=Unknown Stop, 5=Unknown Moving' },
  { id: 181, name: 'GNSS PDOP', name_ro: 'PDOP GNSS', unit: '-', multiplier: 0.1, category: 'GPS', desc_ro: 'Position Dilution of Precision (mai mic = mai bun)' },
  { id: 182, name: 'GNSS HDOP', name_ro: 'HDOP GNSS', unit: '-', multiplier: 0.1, category: 'GPS', desc_ro: 'Horizontal Dilution of Precision' },
  { id: 387, name: 'ISO6709 Coordinates', name_ro: 'Coordonate ISO6709', unit: '-', multiplier: 1, category: 'GPS', desc_ro: 'Poziție în format ISO 6709 (grade/minute/secunde)' },

  // ─── Accelerometru (17-19) ───────────────────────────────────────────────
  { id: 17, name: 'Axis X', name_ro: 'Accelerometru X', unit: 'mG', multiplier: 1, category: 'Accelerometru', desc_ro: 'Accelerație pe axa X (miligravitații)' },
  { id: 18, name: 'Axis Y', name_ro: 'Accelerometru Y', unit: 'mG', multiplier: 1, category: 'Accelerometru', desc_ro: 'Accelerație pe axa Y (miligravitații)' },
  { id: 19, name: 'Axis Z', name_ro: 'Accelerometru Z', unit: 'mG', multiplier: 1, category: 'Accelerometru', desc_ro: 'Accelerație pe axa Z (miligravitații)' },

  // ─── Movement / Trip / Sistem (16, 199, 200, 239, 240, 248, 250-252, 303, 637) ───
  { id: 16, name: 'Total Odometer', name_ro: 'Odometru total', unit: 'm', multiplier: 1, category: 'Mers', desc_ro: 'Distanță totală parcursă de vehicul (metri)' },
  { id: 199, name: 'Trip Odometer', name_ro: 'Odometru cursă', unit: 'm', multiplier: 1, category: 'Mers', desc_ro: 'Distanță parcursă în cursa curentă' },
  { id: 200, name: 'Sleep Mode', name_ro: 'Mod somn', unit: 'cod', multiplier: 1, category: 'Sistem', desc_ro: 'Consum redus: 0=nu doarme, 1=GPS sleep, 2=Deep, 3=Online deep, 4=Ultra deep' },
  { id: 239, name: 'Ignition', name_ro: 'Contact', unit: '0/1', multiplier: 1, category: 'Sistem', desc_ro: 'Starea contactului vehiculului: 0=oprit, 1=pornit' },
  { id: 240, name: 'Movement', name_ro: 'Mișcare', unit: '0/1', multiplier: 1, category: 'Sistem', desc_ro: 'Indicator mișcare vehicul detectată de accelerometru' },
  { id: 248, name: 'Immobilizer', name_ro: 'Imobilizator', unit: '0/1', multiplier: 1, category: 'Sistem', desc_ro: 'Stare imobilizator (împreună cu iButton autorizat)' },
  { id: 250, name: 'Trip', name_ro: 'Cursă', unit: 'cod', multiplier: 1, category: 'Mers', desc_ro: 'Eveniment start/stop cursă (1=start, 2=stop)' },
  { id: 251, name: 'Idling', name_ro: 'Ralanti', unit: '0/1', multiplier: 1, category: 'Mers', desc_ro: 'Vehicul oprit cu motorul pornit (idling)' },
  { id: 252, name: 'Unplug', name_ro: 'Deconectare alimentare', unit: '0/1', multiplier: 1, category: 'Alarme', desc_ro: 'Deconectare sursă externă de alimentare' },
  { id: 303, name: 'Instant Movement', name_ro: 'Mișcare instantanee', unit: '0/1', multiplier: 1, category: 'Sistem', desc_ro: 'Stare mișcare detectată instantaneu' },
  { id: 637, name: 'Wake Reason', name_ro: 'Motiv trezire', unit: 'cod', multiplier: 1, category: 'Sistem', desc_ro: 'Sursa care a trezit dispozitivul din sleep' },

  // ─── CAN-bus FMS J1939 + Motor (81-110, 388-401, 256) ─────────────────────
  { id: 81, name: 'Vehicle Speed (CAN)', name_ro: 'Viteză vehicul (CAN)', unit: 'km/h', multiplier: 1, category: 'CAN', desc_ro: 'Viteza vehiculului din magistrala CAN/FMS' },
  { id: 82, name: 'Accelerator Pedal Position', name_ro: 'Poziție pedală accelerație', unit: '%', multiplier: 1, category: 'CAN', desc_ro: 'Poziție pedală accelerație din CAN (0-100%)' },
  { id: 83, name: 'Total Fuel Used', name_ro: 'Combustibil total consumat', unit: 'l', multiplier: 0.5, category: 'CAN', desc_ro: 'Combustibil total consumat raportat de CAN/FMS' },
  { id: 84, name: 'Fuel level (CAN, %)', name_ro: 'Nivel combustibil CAN (%)', unit: '%', multiplier: 0.4, category: 'CAN', desc_ro: 'Nivel combustibil rezervor din CAN (procent)' },
  { id: 85, name: 'Engine RPM', name_ro: 'Turație motor', unit: 'RPM', multiplier: 1, category: 'CAN', desc_ro: 'Turație motor din CAN/FMS' },
  { id: 87, name: 'Total Mileage (CAN)', name_ro: 'Kilometraj total CAN', unit: 'm', multiplier: 1, category: 'CAN', desc_ro: 'Distanță totală parcursă raportată de CAN/FMS' },
  { id: 89, name: 'Fuel level (CAN, l)', name_ro: 'Nivel combustibil CAN (l)', unit: 'l', multiplier: 1, category: 'CAN', desc_ro: 'Nivel combustibil în rezervor (litri) raportat de CAN' },
  { id: 90, name: 'Door Status', name_ro: 'Stare uși', unit: 'bitmask', multiplier: 1, category: 'CAN', desc_ro: 'Bitmask stare uși (deschise/închise) din CAN' },
  { id: 100, name: 'Program Number', name_ro: 'Program / tracție', unit: 'cod', multiplier: 1, category: 'CAN', desc_ro: 'Identificator program CAN (FMS / OEM specific)' },
  { id: 101, name: 'Module ID', name_ro: 'ID modul CAN', unit: '-', multiplier: 1, category: 'CAN', desc_ro: 'Identificator modul CAN folosit' },
  { id: 102, name: 'Engine Worktime', name_ro: 'Ore funcționare motor', unit: 'min', multiplier: 1, category: 'CAN', desc_ro: 'Timp total funcționare motor (minute)' },
  { id: 103, name: 'Engine Worktime (counted)', name_ro: 'Ore motor (sesiune)', unit: 'min', multiplier: 1, category: 'CAN', desc_ro: 'Timp funcționare motor de la pornirea sesiunii' },
  { id: 105, name: 'Total Mileage (counted)', name_ro: 'Kilometraj contorizat', unit: 'm', multiplier: 1, category: 'CAN', desc_ro: 'Distanță parcursă de la pornire/contor' },
  { id: 107, name: 'Fuel Consumed (counted)', name_ro: 'Combustibil contorizat', unit: 'l', multiplier: 0.5, category: 'CAN', desc_ro: 'Combustibil consumat de la pornire/contor' },
  { id: 108, name: 'Fuel Rate', name_ro: 'Consum instantaneu CAN', unit: 'l/h', multiplier: 0.05, category: 'CAN', desc_ro: 'Consum combustibil instantaneu din CAN' },
  { id: 256, name: 'VIN', name_ro: 'Cod VIN', unit: '-', multiplier: 1, category: 'CAN', desc_ro: 'Vehicle Identification Number citit din OBD/CAN' },
  { id: 388, name: 'AdBlue Level (%)', name_ro: 'Nivel AdBlue %', unit: '%', multiplier: 1, category: 'CAN', desc_ro: 'Nivel rezervor AdBlue (uree) în procente' },
  { id: 389, name: 'AdBlue Level (l)', name_ro: 'Nivel AdBlue litri', unit: 'l', multiplier: 1, category: 'CAN', desc_ro: 'Nivel rezervor AdBlue (uree) în litri' },
  { id: 390, name: 'Engine Coolant Temperature', name_ro: 'Temperatură lichid răcire', unit: '°C', multiplier: 1, category: 'Motor', desc_ro: 'Temperatură lichid răcire motor din CAN/OBD' },
  { id: 391, name: 'Engine Oil Pressure', name_ro: 'Presiune ulei motor', unit: 'kPa', multiplier: 1, category: 'Motor', desc_ro: 'Presiune ulei motor' },
  { id: 392, name: 'Engine Oil Level', name_ro: 'Nivel ulei motor', unit: '%', multiplier: 1, category: 'Motor', desc_ro: 'Nivel ulei motor în procente' },
  { id: 393, name: 'Engine Oil Temperature', name_ro: 'Temperatură ulei motor', unit: '°C', multiplier: 1, category: 'Motor', desc_ro: 'Temperatură ulei motor' },
  { id: 394, name: 'Engine Torque', name_ro: 'Cuplu motor', unit: '%', multiplier: 1, category: 'Motor', desc_ro: 'Cuplu motor curent ca procent din maxim' },
  { id: 397, name: 'Cruise Time', name_ro: 'Timp cruise control', unit: 'min', multiplier: 1, category: 'CAN', desc_ro: 'Timp total în care a fost activ cruise control-ul' },
  { id: 400, name: 'Brake Pedal Position', name_ro: 'Poziție pedală frână', unit: '0/1', multiplier: 1, category: 'CAN', desc_ro: 'Pedală frână apăsată (din CAN)' },
  { id: 401, name: 'Clutch Pedal Position', name_ro: 'Poziție pedală ambreiaj', unit: '0/1', multiplier: 1, category: 'CAN', desc_ro: 'Pedală ambreiaj apăsată' },

  // ─── Tahograf (184-198, 403-409) ──────────────────────────────────────────
  { id: 184, name: 'Tacho Total Vehicle Distance', name_ro: 'Distanță totală tahograf', unit: 'm', multiplier: 1, category: 'Tahograf', desc_ro: 'Distanță totală raportată de tahograful digital' },
  { id: 185, name: 'Tacho Vehicle Speed', name_ro: 'Viteză tahograf', unit: 'km/h', multiplier: 1, category: 'Tahograf', desc_ro: 'Viteză din tahograful digital' },
  { id: 186, name: 'Tacho Driver Card Presence', name_ro: 'Card șofer prezent', unit: 'bitmask', multiplier: 1, category: 'Tahograf', desc_ro: 'Bitmask prezență carduri șofer 1/2 în tahograf' },
  { id: 187, name: 'Tacho Driver1 States', name_ro: 'Stare șofer 1', unit: 'cod', multiplier: 1, category: 'Tahograf', desc_ro: 'Activitate șofer 1: rest/disponibil/muncă/condus' },
  { id: 188, name: 'Tacho Driver2 States', name_ro: 'Stare șofer 2', unit: 'cod', multiplier: 1, category: 'Tahograf', desc_ro: 'Activitate șofer 2: rest/disponibil/muncă/condus' },
  { id: 189, name: 'Tacho Overspeed', name_ro: 'Depășire viteză tahograf', unit: '0/1', multiplier: 1, category: 'Tahograf', desc_ro: 'Indicator depășire limită de viteză în tahograf' },
  { id: 195, name: 'Tacho Driver1 Continuous Driving', name_ro: 'Șofer1 condus continuu', unit: 'min', multiplier: 1, category: 'Tahograf', desc_ro: 'Timp continuu de condus pentru șoferul 1' },
  { id: 196, name: 'Tacho Driver1 Cumulative Break', name_ro: 'Șofer1 pauză cumulată', unit: 'min', multiplier: 1, category: 'Tahograf', desc_ro: 'Pauză cumulată pentru șoferul 1' },
  { id: 197, name: 'Tacho Driver1 Selected Activity', name_ro: 'Șofer1 activitate selectată', unit: 'cod', multiplier: 1, category: 'Tahograf', desc_ro: 'Activitate selectată curent pentru șofer 1' },
  { id: 198, name: 'Tacho Driver1 Cumulative Driving', name_ro: 'Șofer1 condus cumulat', unit: 'min', multiplier: 1, category: 'Tahograf', desc_ro: 'Timp cumulat de condus pe ziua curentă pentru șofer 1' },
  { id: 403, name: 'Driver Name', name_ro: 'Nume șofer', unit: '-', multiplier: 1, category: 'Tahograf', desc_ro: 'Nume șofer citit de pe cardul de tahograf' },
  { id: 404, name: 'Driver Card License Type', name_ro: 'Categorie permis', unit: 'cod', multiplier: 1, category: 'Tahograf', desc_ro: 'Tipul/categoria permisului de conducere' },
  { id: 405, name: 'Driver Gender', name_ro: 'Gen șofer', unit: 'cod', multiplier: 1, category: 'Tahograf', desc_ro: '0=Nespecificat, 1=Masculin, 2=Feminin' },
  { id: 406, name: 'Driver Card ID', name_ro: 'ID card șofer', unit: '-', multiplier: 1, category: 'Tahograf', desc_ro: 'Identificator unic al cardului de tahograf' },
  { id: 407, name: 'Driver Card Expiration', name_ro: 'Expirare card șofer', unit: 'an', multiplier: 1, category: 'Tahograf', desc_ro: 'An expirare card tahograf' },
  { id: 408, name: 'Driver Card Place of Issue', name_ro: 'Loc eliberare card', unit: 'cod', multiplier: 1, category: 'Tahograf', desc_ro: 'Cod jurisdicție emitentă a cardului' },
  { id: 409, name: 'Driver Status Event', name_ro: 'Eveniment login șofer', unit: 'cod', multiplier: 1, category: 'Tahograf', desc_ro: '0=fără card, 1=login, 2=logout' },

  // ─── Dallas Temperature (71-77, 79) ──────────────────────────────────────
  { id: 71, name: 'Dallas Temperature ID 4', name_ro: 'ID senzor temp Dallas 4', unit: '-', multiplier: 1, category: 'Dallas', desc_ro: 'Identificator unic 1-wire senzor temperatură 4' },
  { id: 72, name: 'Dallas Temperature 1', name_ro: 'Temperatură Dallas 1', unit: '°C', multiplier: 0.1, category: 'Dallas', desc_ro: 'Temperatură senzor 1-wire 1' },
  { id: 73, name: 'Dallas Temperature 2', name_ro: 'Temperatură Dallas 2', unit: '°C', multiplier: 0.1, category: 'Dallas', desc_ro: 'Temperatură senzor 1-wire 2' },
  { id: 74, name: 'Dallas Temperature 3', name_ro: 'Temperatură Dallas 3', unit: '°C', multiplier: 0.1, category: 'Dallas', desc_ro: 'Temperatură senzor 1-wire 3' },
  { id: 75, name: 'Dallas Temperature 4', name_ro: 'Temperatură Dallas 4', unit: '°C', multiplier: 0.1, category: 'Dallas', desc_ro: 'Temperatură senzor 1-wire 4' },
  { id: 76, name: 'Dallas Temperature ID 1', name_ro: 'ID senzor temp Dallas 1', unit: '-', multiplier: 1, category: 'Dallas', desc_ro: 'Identificator unic 1-wire senzor temperatură 1' },
  { id: 77, name: 'Dallas Temperature ID 2', name_ro: 'ID senzor temp Dallas 2', unit: '-', multiplier: 1, category: 'Dallas', desc_ro: 'Identificator unic 1-wire senzor temperatură 2' },
  { id: 79, name: 'Dallas Temperature ID 3', name_ro: 'ID senzor temp Dallas 3', unit: '-', multiplier: 1, category: 'Dallas', desc_ro: 'Identificator unic 1-wire senzor temperatură 3' },

  // ─── iButton / RFID (78, 207-208) ────────────────────────────────────────
  { id: 78, name: 'iButton', name_ro: 'iButton', unit: '-', multiplier: 1, category: 'iButton', desc_ro: 'ID iButton-ului prezentat (identificare șofer)' },
  { id: 207, name: 'RFID', name_ro: 'RFID', unit: '-', multiplier: 1, category: 'iButton', desc_ro: 'ID card RFID prezentat (identificare șofer)' },
  { id: 208, name: 'Authorized iButton', name_ro: 'iButton autorizat', unit: '0/1', multiplier: 1, category: 'iButton', desc_ro: 'iButton prezentat este în lista autorizați' },

  // ─── BLE Sensori (22-30, 86, 99, 110, 238, 263-264, 384) ──────────────────
  { id: 22, name: 'BLE1 Temperature', name_ro: 'Temperatură BLE1', unit: '°C', multiplier: 0.01, category: 'BLE', desc_ro: 'Temperatură citită de la senzorul BLE 1' },
  { id: 23, name: 'BLE2 Temperature', name_ro: 'Temperatură BLE2', unit: '°C', multiplier: 0.01, category: 'BLE', desc_ro: 'Temperatură citită de la senzorul BLE 2' },
  { id: 25, name: 'BLE3 Temperature', name_ro: 'Temperatură BLE3', unit: '°C', multiplier: 0.01, category: 'BLE', desc_ro: 'Temperatură senzor BLE 3' },
  { id: 26, name: 'BLE4 Temperature', name_ro: 'Temperatură BLE4', unit: '°C', multiplier: 0.01, category: 'BLE', desc_ro: 'Temperatură senzor BLE 4' },
  { id: 27, name: 'BLE1 Humidity', name_ro: 'Umiditate BLE1', unit: '%', multiplier: 1, category: 'BLE', desc_ro: 'Umiditate relativă de la senzor BLE 1' },
  { id: 28, name: 'BLE2 Humidity', name_ro: 'Umiditate BLE2', unit: '%', multiplier: 1, category: 'BLE', desc_ro: 'Umiditate relativă de la senzor BLE 2' },
  { id: 29, name: 'BLE3 Humidity', name_ro: 'Umiditate BLE3', unit: '%', multiplier: 1, category: 'BLE', desc_ro: 'Umiditate relativă de la senzor BLE 3' },
  { id: 30, name: 'BLE4 Humidity', name_ro: 'Umiditate BLE4', unit: '%', multiplier: 1, category: 'BLE', desc_ro: 'Umiditate relativă de la senzor BLE 4' },
  { id: 86, name: 'BLE Humidity (legacy)', name_ro: 'Umiditate BLE (legacy)', unit: '%', multiplier: 1, category: 'BLE', desc_ro: 'Umiditate (compatibilitate firmware vechi)' },
  { id: 99, name: 'BLE Fuel Level 1', name_ro: 'Nivel combustibil BLE 1', unit: 'l', multiplier: 1, category: 'BLE', desc_ro: 'Nivel combustibil de la senzor BLE 1' },
  { id: 110, name: 'Fuel Level (BLE)', name_ro: 'Nivel combustibil BLE', unit: 'l', multiplier: 1, category: 'BLE', desc_ro: 'Nivel combustibil de la senzor BLE generic' },
  { id: 238, name: 'User ID', name_ro: 'ID utilizator BT', unit: '-', multiplier: 1, category: 'BLE', desc_ro: 'MAC al dispozitivului Bluetooth NMEA conectat' },
  { id: 263, name: 'BT Status', name_ro: 'Stare Bluetooth', unit: 'cod', multiplier: 1, category: 'BLE', desc_ro: '0=off, 1=on fără device, 2=BTv3 conectat, 3=BLE conectat, 4=BLE+BT' },
  { id: 264, name: 'Barcode ID', name_ro: 'Cod bare', unit: '-', multiplier: 1, category: 'BLE', desc_ro: 'Cod bare scanat de scanner BT extern' },
  { id: 384, name: 'BLE Temperature 5-8', name_ro: 'Temperatură BLE 5-8', unit: '°C', multiplier: 0.01, category: 'BLE', desc_ro: 'Set extins de temperaturi de la senzori BLE' },

  // ─── LLS Combustibil (12-13, 15, 201-204, 210-215, 327, 483) ─────────────
  { id: 12, name: 'Fuel Used GPS', name_ro: 'Combustibil consumat (GPS)', unit: 'l', multiplier: 0.001, category: 'Combustibil', desc_ro: 'Estimare cumulativă consum din date GPS' },
  { id: 13, name: 'Fuel Rate GPS', name_ro: 'Consum mediu (GPS)', unit: 'l/100km', multiplier: 0.01, category: 'Combustibil', desc_ro: 'Rată medie consum combustibil bazată pe GPS' },
  { id: 15, name: 'Eco Score', name_ro: 'Scor Eco', unit: 'score', multiplier: 0.01, category: 'Eco-driving', desc_ro: 'Scor eco-driving calculat din evenimente raportat la distanță' },
  { id: 201, name: 'LLS 1 Fuel Level', name_ro: 'Nivel combustibil LLS1', unit: 'l/kvanti', multiplier: 1, category: 'Combustibil', desc_ro: 'Nivel combustibil senzor analog/RS232 LLS 1' },
  { id: 202, name: 'LLS 1 Temperature', name_ro: 'Temperatură LLS1', unit: '°C', multiplier: 1, category: 'Combustibil', desc_ro: 'Temperatură combustibil senzor LLS 1' },
  { id: 203, name: 'LLS 2 Fuel Level', name_ro: 'Nivel combustibil LLS2', unit: 'l/kvanti', multiplier: 1, category: 'Combustibil', desc_ro: 'Nivel combustibil senzor LLS 2' },
  { id: 204, name: 'LLS 2 Temperature', name_ro: 'Temperatură LLS2', unit: '°C', multiplier: 1, category: 'Combustibil', desc_ro: 'Temperatură combustibil senzor LLS 2' },
  { id: 210, name: 'LLS 3 Fuel Level', name_ro: 'Nivel combustibil LLS3', unit: 'l/kvanti', multiplier: 1, category: 'Combustibil', desc_ro: 'Nivel combustibil senzor LLS 3' },
  { id: 211, name: 'LLS 3 Temperature', name_ro: 'Temperatură LLS3', unit: '°C', multiplier: 1, category: 'Combustibil', desc_ro: 'Temperatură combustibil senzor LLS 3' },
  { id: 212, name: 'LLS 4 Fuel Level', name_ro: 'Nivel combustibil LLS4', unit: 'l/kvanti', multiplier: 1, category: 'Combustibil', desc_ro: 'Nivel combustibil senzor LLS 4' },
  { id: 213, name: 'LLS 4 Temperature', name_ro: 'Temperatură LLS4', unit: '°C', multiplier: 1, category: 'Combustibil', desc_ro: 'Temperatură combustibil senzor LLS 4' },
  { id: 214, name: 'LLS 5 Fuel Level', name_ro: 'Nivel combustibil LLS5', unit: 'l/kvanti', multiplier: 1, category: 'Combustibil', desc_ro: 'Nivel combustibil senzor LLS 5' },
  { id: 215, name: 'LLS 5 Temperature', name_ro: 'Temperatură LLS5', unit: '°C', multiplier: 1, category: 'Combustibil', desc_ro: 'Temperatură combustibil senzor LLS 5' },
  { id: 327, name: 'UL202 Fuel Level (mm)', name_ro: 'Nivel combustibil UL202', unit: 'mm', multiplier: 0.1, category: 'Combustibil', desc_ro: 'Nivel combustibil senzor ultrasonic UL202-02 (mm)' },
  { id: 483, name: 'UL202 Sensor Status', name_ro: 'Stare senzor UL202', unit: 'cod', multiplier: 1, category: 'Combustibil', desc_ro: 'Cod stare operațională senzor ultrasonic UL202-02' },

  // ─── Alarme / Eco-driving (190-191, 219-220, 236, 246-247, 253-255) ──────
  { id: 190, name: 'Green Driving Type', name_ro: 'Tip eveniment Green Driving', unit: 'cod', multiplier: 1, category: 'Eco-driving', desc_ro: 'Tip eveniment: 1=accelerație, 2=frânare, 3=viraj brusc (firmware vechi)' },
  { id: 191, name: 'Green Driving Value', name_ro: 'Valoare Green Driving', unit: 'g', multiplier: 0.01, category: 'Eco-driving', desc_ro: 'Magnitudinea evenimentului (firmware vechi)' },
  { id: 219, name: 'Towing Detection', name_ro: 'Detecție tractare', unit: '0/1', multiplier: 1, category: 'Alarme', desc_ro: 'Detecție remorcare/tractare neautorizată' },
  { id: 220, name: 'Crash Detection', name_ro: 'Detecție accident', unit: 'cod', multiplier: 1, category: 'Alarme', desc_ro: 'Detecție eveniment de coliziune/accident' },
  { id: 236, name: 'Alarm', name_ro: 'Alarmă', unit: '0/1', multiplier: 1, category: 'Alarme', desc_ro: 'Eveniment de alarmă generic emis de dispozitiv' },
  { id: 246, name: 'Towing', name_ro: 'Tractare', unit: '0/1', multiplier: 1, category: 'Alarme', desc_ro: 'Eveniment de tractare/remorcare detectat' },
  { id: 247, name: 'Crash Detection (extended)', name_ro: 'Detecție accident (extins)', unit: 'cod', multiplier: 1, category: 'Alarme', desc_ro: 'Eveniment coliziune cu trace detaliat' },
  { id: 253, name: 'Green Driving Type', name_ro: 'Tip eveniment Green Driving', unit: 'cod', multiplier: 1, category: 'Eco-driving', desc_ro: 'Tip eveniment: 1=accelerație bruscă, 2=frânare bruscă, 3=viraj brusc' },
  { id: 254, name: 'Green Driving Value', name_ro: 'Magnitudine Green Driving', unit: 'g/rad', multiplier: 0.01, category: 'Eco-driving', desc_ro: 'Magnitudinea evenimentului de driving brusc' },
  { id: 255, name: 'Overspeeding', name_ro: 'Depășire viteză', unit: 'km/h', multiplier: 1, category: 'Eco-driving', desc_ro: 'Eveniment depășire limită de viteză configurată' },

  // ─── OEM OBD (500, 501, 10000) ──────────────────────────────────────────
  { id: 500, name: 'MSP500 Vendor Name', name_ro: 'MSP500 vânzător', unit: '-', multiplier: 1, category: 'OEM OBD', desc_ro: 'Numele integratorului MSP500' },
  { id: 501, name: 'MSP500 Vehicle Number', name_ro: 'MSP500 nr. vehicul', unit: '-', multiplier: 1, category: 'OEM OBD', desc_ro: 'Număr de flotă vehicul (MSP500)' },
  { id: 10000, name: 'OEM OBD parameter', name_ro: 'Parametru OEM OBD', unit: '-', multiplier: 1, category: 'OEM OBD', desc_ro: 'Interval 10000-10999: parametru specific mărcii mașinii (OEM PID via OBD/CAN). Sensul depinde de modelul mașinii și fișierul OEM Teltonika.' }
];

// Hartă rapidă id → entry
const IO_CATALOG_BY_ID = {};
IO_CATALOG.forEach(function (e) { IO_CATALOG_BY_ID[e.id] = e; });

// Categoriile distincte (pentru filtrare în UI)
const IO_CATEGORIES = Array.from(new Set(IO_CATALOG.map(function (e) { return e.category; }))).sort();

module.exports = { IO_CATALOG: IO_CATALOG, IO_CATALOG_BY_ID: IO_CATALOG_BY_ID, IO_CATEGORIES: IO_CATEGORIES };
