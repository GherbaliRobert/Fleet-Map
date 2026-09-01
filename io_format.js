// io_format.js — cum se scrie pe ecran o valoare de IO și cum se numește. SURSĂ UNICĂ.
//
// Erau scrise în `public/index.html`, ca funcții din pagină. Când a trebuit aceeași fereastră și pe
// telefon, singurele variante erau: să le copiez în TypeScript (adică două liste care o iau razna
// una față de cealaltă, exact ce am evitat la steagurile CAN), sau să le scot de-aici. Le-am scos.
//
// Cine le folosește:
//   • web      — `/js/io-format.js` → `window.RA_IOFMT` (pagina doar deleagă)
//   • server   — `require('./io_format')`, pentru ruta care explică IO-urile unui vehicul
//   • telefon  — indirect, prin ruta aia; NU-și ține copie proprie
//
// Capcană de reținut: multiplicatorul din `io_catalog.js` (0.001 pentru volți etc.) e conversia din
// valoarea BRUTĂ a trackerului. O parte din chei sunt deja convertite de `codec8e.convertCanValue`
// la parsare (`can_fuel_level_liters` vine deja în litri), altele nu (`external_voltage` rămâne în
// milivolți). De-aia formatarea e scrisă pe chei, nu calculată din multiplicator — altfel unele
// valori ar fi împărțite de două ori.

function formatIoValue(key, value) {
  if (value === undefined || value === null) return '-';
  // Alimentare
  if (key === 'external_voltage' || key === 'battery_voltage') return (value / 1000).toFixed(2) + ' V';
  if (key === 'battery_current') return value + ' mA';
  if (key === 'battery_level') return value + ' %';
  // Stare
  if (key === 'ignition') return value ? 'ON' : 'OFF';
  if (key === 'movement') return value ? 'DA' : 'NU';
  if (key.startsWith('digital_input_') || key.startsWith('digital_output_')) return value ? 'ON' : 'OFF';
  if (key === 'gsm_signal') return value + ' / 5';
  // CAN Motor
  if (key === 'can_engine_rpm') return value + ' RPM';
  if (key === 'can_engine_temp') return value.toFixed ? value.toFixed(1) + ' \u00B0C' : value + ' \u00B0C';
  if (key === 'can_engine_load' || key === 'can_retarder_load') return value + ' %';
  if (key === 'can_engine_worktime' || key === 'can_engine_worktime_counted') return Math.floor(value/60) + 'h ' + (value%60) + 'm';
  // CAN Viteza
  if (key === 'can_vehicle_speed' || key === 'speed_io') return value + ' km/h';
  if (key === 'can_accelerator_pedal') return value + ' %';
  // CAN Combustibil (valorile vin deja convertite din server)
  if (key === 'can_fuel_level_liters') return value.toFixed ? value.toFixed(1) + ' L' : value + ' L';
  if (key === 'can_fuel_level_pct' || key === 'can_adblue_level_pct') return value + ' %';
  if (key === 'can_fuel_consumed' || key === 'can_fuel_consumed_counted') return value.toFixed ? value.toFixed(1) + ' L' : value + ' L';
  if (key === 'can_fuel_rate') return value.toFixed ? value.toFixed(1) + ' L/h' : value + ' L/h';
  if (key === 'can_adblue_level_liters') return value.toFixed ? value.toFixed(1) + ' L' : value + ' L';
  if (key === 'fuel_rate_gps') return (value / 10).toFixed(1) + ' L/h';
  if (key === 'fuel_used_gps_total') return (value / 1000).toFixed(1) + ' L';
  // CAN Distanta (valorile vin deja convertite din server)
  if (key === 'can_total_mileage' || key === 'can_total_mileage_counted' || key === 'can_trip_distance') return value.toFixed ? value.toFixed(1) + ' km' : value + ' km';
  if (key === 'total_odometer' || key === 'total_mileage') return (value / 1000).toFixed(1) + ' km';
  if (key === 'trip_odometer') return (value / 1000).toFixed(1) + ' km';
  // CAN Vehicul
  if (key === 'can_door_status') {
    if (value === 0) return 'Toate inchise';
    const doors = [];
    if (value & 256) doors.push('FS');
    if (value & 512) doors.push('FD');
    if (value & 1024) doors.push('SS');
    if (value & 2048) doors.push('SD');
    if (value & 4096) doors.push('Capota');
    if (value & 8192) doors.push('Portbagaj');
    return doors.join(', ') || value;
  }
  if (key === 'can_load_weight' || key.startsWith('can_axle')) return value + ' kg';
  // CAN Stare
  if (key === 'can_program_number') return value;
  if (key === 'can_dtc_errors') return value + ' erori';
  // Baterie
  if (key === 'can_battery_temp') return value.toFixed ? value.toFixed(1) + ' \u00B0C' : value + ' \u00B0C';
  if (key === 'can_battery_level_pct' || key === 'can_battery_soc') return value + ' %';
  // Camion - Sarcina axe
  if (key.match(/^can_axle[1-5]_load$/) || key === 'can_total_axle_load' || key === 'can_load_weight' || key === 'can_trailer_weight') {
    return value > 0 ? (value / 1000).toFixed(2) + ' t' : value + ' kg';
  }
  if (key === 'can_load_factor') return value + ' %';
  if (key === 'can_trailer_connected') return value ? 'CONECTATA' : 'NU';
  // Camion - Specific
  if (key === 'can_pto_active' || key === 'can_pto_state') return value ? 'ACTIV' : 'OFF';
  if (key === 'can_pto_engagement_count') return value + 'x';
  if (key === 'can_engine_oil_temp' || key === 'can_intake_air_temp' || key === 'can_outside_temp') {
    return (typeof value === 'number' ? value.toFixed(1) : value) + ' \u00B0C';
  }
  if (key === 'can_engine_oil_level' || key === 'can_coolant_level' || key === 'can_washer_fluid_level') return value + ' %';
  if (key === 'can_engine_oil_pressure') return value + ' kPa';
  // Camion - Mentenanta
  if (key === 'can_distance_to_service' || key === 'can_service_distance' || key === 'can_service_distance_since') {
    if (value <= 0) return '⚠ EXPIRAT (' + Math.abs(value) + ' km)';
    if (value < 1000) return '⚠ ' + value + ' km';
    return value + ' km';
  }
  if (key === 'can_service_time_to_due') {
    if (value <= 0) return '⚠ EXPIRAT';
    if (value < 30) return '⚠ ' + value + ' zile';
    return value + ' zile (~' + Math.round(value/30) + ' luni)';
  }
  if (key === 'can_service_time_from_last') {
    return value + ' zile (~' + Math.round(value/30) + ' luni)';
  }
  if (key.match(/^can_brake_pad_axle[1-4]$/)) {
    if (value < 20) return '⚠ ' + value + ' %';
    return value + ' %';
  }
  // Tahograf
  if (key === 'can_tacho_overspeed') return value ? '⚠ DA' : 'NU';
  if (key === 'can_tacho_driver1_card' || key === 'can_tacho_driver2_card') return value ? 'INSERATA' : 'LIPSA';
  if (key.match(/^can_tacho_driver[12]_(drive|break|continuous)_time$/)) {
    return Math.floor(value/60) + 'h ' + (value%60) + 'm';
  }
  // VIN
  if (key === 'can_vin') return String(value).substring(0, 17);
  // Indicatoare / Flags
  if (key === 'can_handbrake') return value ? 'TRAS' : 'Eliberat';
  if (key === 'can_indicator_left' || key === 'can_indicator_right' || key === 'can_indicator_hazard' || key === 'can_indicator_lights' || key === 'can_security_flag_ext') return value ? 'ON' : 'OFF';
  // Decoded Security Flags (_sf_)
  if (key.startsWith('_sf_door_') || key === '_sf_hood_open' || key === '_sf_trunk_open' || key === '_sf_roof_open') return value ? 'DESCHISA' : 'Inchisa';
  if (key === '_sf_key_in_ignition' || key === '_sf_ignition_on' || key === '_sf_dynamic_ignition') return value ? 'DA' : 'NU';
  if (key === '_sf_engine_working') return value ? 'PORNIT' : 'OPRIT';
  if (key === '_sf_webasto') return value ? 'ACTIV' : 'OFF';
  if (key === '_sf_car_closed' || key === '_sf_closed_by_remote') return value ? 'DA' : 'NU';
  if (key === '_sf_parking') return value ? 'ACTIV' : 'OFF';
  if (key === '_sf_neutral' || key === '_sf_drive' || key === '_sf_reverse') return value ? 'DA' : 'NU';
  if (key === '_sf_handbrake') return value ? 'TRAS' : 'Eliberat';
  if (key === '_sf_footbrake') return value ? 'APASAT' : 'Eliberat';
  if (key === '_sf_factory_armed' || key === '_sf_factory_alarm' || key === '_sf_alarm_emulated' || key === '_sf_engine_lock') return value ? 'ACTIV' : 'OFF';
  if (key === '_sf_hazard_lights' || key === '_sf_battery_charging') return value ? 'ON' : 'OFF';
  // Decoded Control Flags (_cf_)
  if (key === '_cf_check_engine') return value ? '⚠ ACTIV' : 'OK';
  if (key === '_cf_dpf_warning') return value ? '⚠ DPF' : 'OK';
  if (key === '_cf_epc_warning') return value ? '⚠ EPC' : 'OK';
  if (key === '_cf_abs_warning') return value ? '⚠ ABS' : 'OK';
  if (key === '_cf_esp_warning') return value ? '⚠ ESP' : 'OK';
  if (key === '_cf_airbag_warning') return value ? '⚠ AIRBAG' : 'OK';
  if (key === '_cf_eps_warning') return value ? '⚠ EPS' : 'OK';
  if (key === '_cf_oil_pressure_warning') return value ? '⚠ ULEI' : 'OK';
  if (key === '_cf_coolant_warning') return value ? '⚠ LICHID' : 'OK';
  if (key === '_cf_battery_warning') return value ? '⚠ BATERIE' : 'OK';
  if (key === '_cf_low_fuel') return value ? '⚠ NIVEL SCAZUT' : 'OK';
  if (key === '_cf_low_tire_pressure') return value ? '⚠ PRESIUNE' : 'OK';
  if (key === '_cf_brake_pad_wear') return value ? '⚠ UZURA' : 'OK';
  if (key === '_cf_stop_indicator') return value ? '⚠ STOP' : 'OK';
  if (key === '_cf_glow_plug') return value ? 'ACTIV' : 'OFF';
  if (key === '_cf_maintenance') return value ? '⚠ NECESARA' : 'OK';
  if (key === '_cf_general_warning' || key === '_cf_lights_failure') return value ? '⚠ ACTIV' : 'OK';
  if (key === '_cf_driver_seatbelt') return value ? 'Pusa' : 'Nepusa';
  if (key === '_cf_passenger_seatbelt') return value ? 'Pusa' : 'Nepusa';
  if (key === '_cf_parking_lights' || key === '_cf_dipped_headlights' || key === '_cf_full_beam' || key === '_cf_front_fog_lights' || key === '_cf_rear_fog_lights') return value ? 'ON' : 'OFF';
  if (key === '_cf_cruise_control' || key === '_cf_air_conditioning' || key === '_cf_esp_active' || key === '_cf_ready_to_drive') return value ? 'ACTIV' : 'OFF';
  // FMS
  if (key === 'fms_rpm') return value + ' RPM';
  if (key === 'fms_speed') return value + ' km/h';
  if (key === 'fms_coolant_temp') return value + ' \u00B0C';
  if (key === 'fms_fuel_level') return value + ' %';
  if (key === 'fms_engine_hours') return (value / 3600).toFixed(1) + ' h';
  if (key === 'fms_total_mileage') return (value / 1000).toFixed(1) + ' km';
  // Alte
  if (key === 'analog_input_1' || key === 'analog_input_2') return (value / 1000).toFixed(2) + ' V';
  if (key === 'tank_level_liters') return (typeof value === 'number' ? value.toFixed(1) : value) + ' L';
  // Senzori BLE combustibil (Escort TD-BLE)
  if (key.match(/^ble_fuel_level_[1-4]$/)) return (typeof value === 'number' ? value.toFixed(1) : value) + ' L';
  if (key.match(/^ble_fuel_temp_[1-4]$/)) return value + ' \u00B0C';
  if (key.match(/^ble_fuel_frequency_[1-4]$/)) return value + ' Hz';
  if (key.match(/^ble_battery_voltage_[1-4]$/)) return (value / 1000).toFixed(2) + ' V';
  // Senzori LLS (RS-485)
  if (key.match(/^lls_fuel_level_[1-2]$/)) return (typeof value === 'number' ? value.toFixed(1) : value) + ' L';
  if (key.match(/^lls_fuel_temp_[1-2]$/)) return value + ' \u00B0C';
  if (key === 'gnss_pdop' || key === 'gnss_hdop') return (value / 10).toFixed(1);
  if (key === 'gnss_status') return ['OFF', 'ON fara fix', 'ON cu fix'][value] || value;
  if (key === 'sleep_mode') return ['Nu', 'GPS Sleep', 'Deep Sleep', 'Online Sleep'][value] || value;
  if (key === 'data_mode') return ['Home', 'Roaming', 'Necunoscut'][value] || value;
  if (key === 'trip') return value ? 'In calatorie' : 'Oprit';
  if (key === 'over_speeding' || key === 'crash_detection' || key === 'idling' || key === 'towing' || key === 'unplug') return value ? 'DA' : 'Nu';
  return value;
}

// `catalogById` = { "100": {name_ro, name}, … } — catalogul Teltonika, dacă e disponibil. Pe web vine
// din window.IO_CAT_BY_ID, pe server din io_catalog.js. Lipsește → cheia se înfrumusețează, ca înainte.
function formatIoLabel(key, catalogById) {
  const labels = {
    // Security flags
    '_sf_door_front_left': 'Usa fata stanga',
    '_sf_door_front_right': 'Usa fata dreapta',
    '_sf_door_rear_left': 'Usa spate stanga',
    '_sf_door_rear_right': 'Usa spate dreapta',
    '_sf_hood_open': 'Capota motor',
    '_sf_trunk_open': 'Portbagaj',
    '_sf_roof_open': 'Trapa',
    '_sf_key_in_ignition': 'Cheie in contact',
    '_sf_ignition_on': 'Contact pornit',
    '_sf_engine_working': 'Motor',
    '_sf_webasto': 'Webasto',
    '_sf_car_closed': 'Masina incuiata',
    '_sf_closed_by_remote': 'Incuiata cu telecomanda',
    '_sf_parking': 'Parking (P)',
    '_sf_neutral': 'Neutru (N)',
    '_sf_drive': 'Drive (D)',
    '_sf_reverse': 'Marsarier (R)',
    '_sf_handbrake': 'Frana de mana',
    '_sf_footbrake': 'Frana de picior',
    '_sf_factory_armed': 'Alarma fabrică armata',
    '_sf_factory_alarm': 'Alarma fabrica activa',
    '_sf_alarm_emulated': 'Alarma emulata',
    '_sf_engine_lock': 'Blocare motor',
    '_sf_hazard_lights': 'Avarii',
    '_sf_battery_charging': 'Încărcare baterie',
    // Control flags
    '_cf_check_engine': 'CHECK ENGINE (MIL)',
    '_cf_dpf_warning': 'Filtru particule (DPF)',
    '_cf_epc_warning': 'Control electronic (EPC)',
    '_cf_abs_warning': 'ABS',
    '_cf_esp_warning': 'ESP',
    '_cf_esp_active': 'ESP activ',
    '_cf_airbag_warning': 'Airbag',
    '_cf_eps_warning': 'Servodirectie (EPS)',
    '_cf_oil_pressure_warning': 'Presiune ulei',
    '_cf_coolant_warning': 'Temp. lichid racire',
    '_cf_battery_warning': 'Baterie',
    '_cf_low_fuel': 'Nivel combustibil scazut',
    '_cf_low_tire_pressure': 'Presiune anvelope',
    '_cf_brake_pad_wear': 'Uzura placute frana',
    '_cf_stop_indicator': 'Indicator STOP',
    '_cf_glow_plug': 'Bujii incandescente',
    '_cf_maintenance': 'Revizie necesara',
    '_cf_general_warning': 'Avertizare generala',
    '_cf_lights_failure': 'Defect becuri',
    '_cf_driver_seatbelt': 'Centura sofer',
    '_cf_passenger_seatbelt': 'Centura pasager',
    '_cf_parking_lights': 'Lumini pozitie',
    '_cf_dipped_headlights': 'Faza scurta',
    '_cf_full_beam': 'Faza lunga',
    '_cf_front_fog_lights': 'Proiectoare fata',
    '_cf_rear_fog_lights': 'Proiectoare spate',
    '_cf_cruise_control': 'Cruise control',
    '_cf_air_conditioning': 'Aer conditionat',
    '_cf_ready_to_drive': 'Ready to drive',
    // Sonda combustibil
    'tank_level_liters': '⛽ Sonda Escort',
    'can_fuel_level_liters': '⛽ CAN Bus',
    'can_fuel_level_pct': '⛽ CAN Bus (%)',
    'analog_input_1': 'AIN1 (sonda voltaj)',
    'analog_input_2': 'AIN2',
    // Senzori BLE (Escort TD-BLE wireless)
    'ble_fuel_level_1': 'Sonda BLE 1 - Nivel',
    'ble_fuel_temp_1': 'Sonda BLE 1 - Temp',
    'ble_fuel_frequency_1': 'Sonda BLE 1 - Frecv',
    'ble_battery_voltage_1': 'Sonda BLE 1 - Baterie',
    'ble_fuel_level_2': 'Sonda BLE 2 - Nivel',
    'ble_fuel_temp_2': 'Sonda BLE 2 - Temp',
    'ble_fuel_frequency_2': 'Sonda BLE 2 - Frecv',
    'ble_battery_voltage_2': 'Sonda BLE 2 - Baterie',
    'ble_fuel_level_3': 'Sonda BLE 3 - Nivel',
    'ble_fuel_temp_3': 'Sonda BLE 3 - Temp',
    'ble_fuel_frequency_3': 'Sonda BLE 3 - Frecv',
    'ble_battery_voltage_3': 'Sonda BLE 3 - Baterie',
    'ble_fuel_level_4': 'Sonda BLE 4 - Nivel',
    'ble_fuel_temp_4': 'Sonda BLE 4 - Temp',
    'ble_fuel_frequency_4': 'Sonda BLE 4 - Frecv',
    'ble_battery_voltage_4': 'Sonda BLE 4 - Baterie',
    // Senzori LLS (RS-485)
    'lls_fuel_level_1': 'LLS 1 - Nivel',
    'lls_fuel_temp_1': 'LLS 1 - Temp',
    'lls_fuel_level_2': 'LLS 2 - Nivel',
    'lls_fuel_temp_2': 'LLS 2 - Temp',
    // CAN
    'can_dtc_errors': 'Erori DTC',
    'can_program_number': 'Program CAN',
    'can_module_id': 'Modul ID',
    // Camion - Axe (8x4 = 2 directoare fata + 2 motoare spate)
    'can_axle1_load': 'Axa 1 (directoare)',
    'can_axle2_load': 'Axa 2 (directoare)',
    'can_axle3_load': 'Axa 3 (motoare)',
    'can_axle4_load': 'Axa 4 (motoare)',
    'can_axle5_load': 'Axa 5 (remorca)',
    'can_total_axle_load': 'Total sarcina axe',
    'can_load_weight': 'Greutate totala',
    'can_load_factor': 'Procent capacitate',
    'can_trailer_connected': 'Remorca',
    'can_trailer_weight': 'Greutate remorca',
    // Camion - Specific
    'can_pto_active': 'PTO (priza putere)',
    'can_pto_state': 'PTO (priza putere)',
    'can_pto_engagement_count': 'Activari PTO',
    'can_retarder_load': 'Retarder',
    'can_engine_oil_temp': 'Temp. ulei motor',
    'can_engine_oil_level': 'Nivel ulei motor',
    'can_engine_oil_pressure': 'Presiune ulei',
    'can_intake_air_temp': 'Temp. aer admisie',
    'can_outside_temp': 'Temp. exterioara',
    // Semnale de bază — lipseau, deci se generau din cheie („Can Engine Rpm"). Sunt cele mai
    // des văzute din toată aplicația: panoul CAN, raportul „CAN detaliat", explicațiile IO.
    'can_engine_rpm': 'Turatie motor',
    'can_engine_temp': 'Temp. lichid racire',
    'can_engine_load': 'Sarcina motor',
    'can_accelerator_pedal': 'Pedala acceleratie',
    'can_engine_worktime': 'Ore motor (contor)',
    'can_engine_worktime_counted': 'Ore motor (de la montare)',
    'can_vehicle_speed': 'Viteza (din masina)',
    'speed_io': 'Viteza (din GPS)',
    'can_total_mileage': 'Kilometraj bord',
    'can_total_mileage_counted': 'Kilometraj de la montare',
    'can_trip_distance': 'Distanta cursa',
    'total_odometer': 'Kilometraj GPS',
    'trip_odometer': 'Kilometraj cursa (GPS)',
    'can_fuel_level_liters': 'Nivel carburant (CAN)',
    'can_fuel_level_pct': 'Nivel carburant (CAN, %)',
    'can_fuel_rate': 'Consum instantaneu',
    'can_fuel_consumed': 'Carburant consumat (contor)',
    'fuel_level_liters': 'Nivel carburant',
    'can_battery_temp': 'Temp. baterie',
    'external_voltage': 'Tensiune alimentare',
    'battery_voltage': 'Tensiune baterie interna',
    'gsm_signal': 'Semnal GSM',
    'satellites': 'Sateliti',
    'ble_fuel_temp_1': 'Sonda BLE 1 - Temperatura',
    'ble_fuel_temp_2': 'Sonda BLE 2 - Temperatura',
    'can_coolant_level': 'Nivel lichid racire',
    'can_washer_fluid_level': 'Lichid spalare',
    // Camion - Mentenanta
    'can_distance_to_service': 'Distanta la revizie',
    'can_service_distance': 'Km pana la revizie',
    'can_service_time_to_due': 'Zile pana la revizie',
    'can_service_time_from_last': 'Zile de la ultima revizie',
    'can_service_distance_since': 'Km de la ultima revizie',
    'can_brake_pad_axle1': 'Placute frana axa 1',
    'can_brake_pad_axle2': 'Placute frana axa 2',
    'can_brake_pad_axle3': 'Placute frana axa 3',
    'can_brake_pad_axle4': 'Placute frana axa 4',
    // Tahograf
    'can_tacho_distance': 'Distanta tahograf',
    'can_tacho_speed': 'Viteza tahograf',
    'can_tacho_overspeed': 'Depasire viteza tahograf',
    'can_tacho_driver1_card': 'Card sofer 1',
    'can_tacho_driver2_card': 'Card sofer 2',
    'can_tacho_driver1_drive_time': 'Timp condus sofer 1',
    'can_tacho_driver2_drive_time': 'Timp condus sofer 2',
    'can_tacho_driver1_break_time': 'Pauza sofer 1',
    'can_tacho_driver2_break_time': 'Pauza sofer 2',
    'can_tacho_driver1_continuous': 'Condus continuu sofer 1',
    'can_tacho_driver2_continuous': 'Condus continuu sofer 2',
    // AdBlue
    'can_adblue_level_pct': 'AdBlue (%)',
    'can_adblue_level_liters': 'AdBlue (litri)',
    // VIN
    'can_vin': 'Numar VIN',
  };
  if (labels[key]) return labels[key];
  // Catalog Teltonika: dacă cheia e de forma io_NNN și avem catalogul încărcat → folosesc name_ro din catalog
  var m = /^io_(\d+)$/.exec(key);
  if (m && catalogById) {
    var entry = catalogById[m[1]];
    if (entry) return entry.name_ro || entry.name || 'IO ' + m[1];
  }
  return key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Legacy IO panel (kept for backward compat but now uses detail panel)

module.exports = { formatIoValue, formatIoLabel };
