// codec8e.js — Parser pentru Teltonika Codec 8 Extended
// Decodează pachetele AVL primite de la dispozitivele FMB140

// ─── Mod FMS / J1939 (ex: FMC650 cu sursă CAN = FMS) ───
// Pe FMS, AVL ID-urile au ALTE semnificații decât pe adaptorul LV-CAN200/ALL-CAN300 (același număr,
// alt sens). Valorile vin DEJA finale (multiplicator 1) — de aceea serverul NU aplică convertCanValue
// pentru device-urile FMS. Le mapăm la nume can_* existente, ca să se afișeze în categoriile din UI.
const FMS_NAMES = {
  84:    'can_accelerator_pedal',   // % (Accelerator pedal position)
  85:    'can_engine_load',         // % (Engine percent load)
  86:    'can_fuel_consumed',       // L (Engine total fuel used) — final, fără /100
  87:    'can_fuel_level_pct',      // % (Fuel Level)
  88:    'can_engine_rpm',          // RPM (Engine speed)
  104:   'can_engine_total_hours',  // h (Engine total hours of operation)
  113:   'can_distance_to_service', // km (Service distance)
  122:   'can_direction_indicator', // cod (Direction indicator)
  127:   'can_engine_temp',         // °C (Engine coolant temperature) — final, fără /10
  128:   'can_outside_temp',        // °C (Ambient air temperature)
  135:   'can_fuel_rate',           // L/h (Fuel Rate) — final, fără /10
  139:   'can_load_weight',         // kg (Combined vehicle weight)
  357:   'can_brake_pedal',         // % (Brake pedal position)
  10455: 'can_adblue_level_pct'     // % (AdBlue Level)
};
// Setat sincron la începutul fiecărui parse (Node single-thread, parse fără await) → citit de getIoName.
let _ifaceForParse = null;

function parseAvlPacket(buffer, iface) {
  _ifaceForParse = (iface === 'fms') ? 'fms' : null;
  try {
    const preamble = buffer.readUInt32BE(0);
    if (preamble !== 0x00000000) {
      return { error: 'Invalid preamble' };
    }

    const dataFieldLength = buffer.readUInt32BE(4);
    const codecId = buffer.readUInt8(8);

    // Codec 8 = 0x08, Codec 8 Extended = 0x8E
    if (codecId !== 0x08 && codecId !== 0x8E) {
      return { error: `Unsupported codec: 0x${codecId.toString(16)}` };
    }

    const isExtended = codecId === 0x8E;
    const numberOfRecords = buffer.readUInt8(9);

    let offset = 10;
    const records = [];

    for (let i = 0; i < numberOfRecords; i++) {
      const record = parseRecord(buffer, offset, isExtended);
      records.push(record.data);
      offset = record.nextOffset;
    }

    return {
      codecId,
      numberOfRecords,
      records
    };
  } catch (err) {
    return { error: `Parse error: ${err.message}` };
  }
}

function parseRecord(buffer, offset, isExtended) {
  // Timestamp — 8 bytes, milliseconds since epoch
  const timestampMs = buffer.readBigUInt64BE(offset);
  const timestamp = new Date(Number(timestampMs));
  offset += 8;

  // Priority — 1 byte
  const priority = buffer.readUInt8(offset);
  offset += 1;

  // GPS Element — 15 bytes
  const gps = parseGps(buffer, offset);
  offset += 15;

  // IO Element
  const io = parseIoElement(buffer, offset, isExtended);
  offset = io.nextOffset;

  return {
    data: {
      timestamp,
      priority,
      gps,
      io: io.elements
    },
    nextOffset: offset
  };
}

function parseGps(buffer, offset) {
  const longitude = buffer.readInt32BE(offset) / 10000000;
  offset += 4;

  const latitude = buffer.readInt32BE(offset) / 10000000;
  offset += 4;

  const altitude = buffer.readUInt16BE(offset);
  offset += 2;

  const angle = buffer.readUInt16BE(offset);
  offset += 2;

  const satellites = buffer.readUInt8(offset);
  offset += 1;

  const speed = buffer.readUInt16BE(offset);
  offset += 2;

  return { longitude, latitude, altitude, angle, satellites, speed };
}

function parseIoElement(buffer, offset, isExtended) {
  const elements = {};

  // Event IO ID
  if (isExtended) {
    elements.eventIoId = buffer.readUInt16BE(offset);
    offset += 2;
  } else {
    elements.eventIoId = buffer.readUInt8(offset);
    offset += 1;
  }

  // Total IO count
  if (isExtended) {
    elements.totalCount = buffer.readUInt16BE(offset);
    offset += 2;
  } else {
    elements.totalCount = buffer.readUInt8(offset);
    offset += 1;
  }

  // 1-byte IO elements
  const result1 = parseIoGroup(buffer, offset, 1, isExtended);
  Object.assign(elements, result1.values);
  offset = result1.nextOffset;

  // 2-byte IO elements
  const result2 = parseIoGroup(buffer, offset, 2, isExtended);
  Object.assign(elements, result2.values);
  offset = result2.nextOffset;

  // 4-byte IO elements
  const result4 = parseIoGroup(buffer, offset, 4, isExtended);
  Object.assign(elements, result4.values);
  offset = result4.nextOffset;

  // 8-byte IO elements
  const result8 = parseIoGroup(buffer, offset, 8, isExtended);
  Object.assign(elements, result8.values);
  offset = result8.nextOffset;

  // Codec 8E has variable-length IO elements (NX)
  if (isExtended) {
    const nxResult = parseIoGroupNX(buffer, offset);
    Object.assign(elements, nxResult.values);
    offset = nxResult.nextOffset;
  }

  return { elements, nextOffset: offset };
}

function parseIoGroup(buffer, offset, byteSize, isExtended) {
  let count;
  if (isExtended) {
    count = buffer.readUInt16BE(offset);
    offset += 2;
  } else {
    count = buffer.readUInt8(offset);
    offset += 1;
  }

  const values = {};
  for (let i = 0; i < count; i++) {
    let id;
    if (isExtended) {
      id = buffer.readUInt16BE(offset);
      offset += 2;
    } else {
      id = buffer.readUInt8(offset);
      offset += 1;
    }

    let value;
    switch (byteSize) {
      case 1: value = buffer.readUInt8(offset); break;
      case 2: value = buffer.readUInt16BE(offset); break;
      case 4: value = buffer.readUInt32BE(offset); break;
      case 8: value = Number(buffer.readBigUInt64BE(offset)); break;
    }
    offset += byteSize;

    values[getIoName(id)] = value;
  }

  return { values, nextOffset: offset };
}

function parseIoGroupNX(buffer, offset) {
  const count = buffer.readUInt16BE(offset);
  offset += 2;

  const values = {};
  for (let i = 0; i < count; i++) {
    const id = buffer.readUInt16BE(offset);
    offset += 2;

    const length = buffer.readUInt16BE(offset);
    offset += 2;

    // Citim valoarea ca hex string
    const value = buffer.slice(offset, offset + length).toString('hex');
    offset += length;

    values[getIoName(id)] = value;
  }

  return { values, nextOffset: offset };
}

// Mapare AVL ID -> nume citibil. iface='fms' → folosește harta FMS (FMC650 cu sursă CAN=FMS),
// altfel maparea standard/LV-CAN. Dacă iface nu e dat, se ia din _ifaceForParse (setat de parseAvlPacket).
function getIoName(id, iface) {
  const useIface = (iface !== undefined) ? iface : _ifaceForParse;
  if (useIface === 'fms' && FMS_NAMES[id] !== undefined) return FMS_NAMES[id];
  const names = {
    // System
    239: 'ignition',
    240: 'movement',
    80:  'data_mode',
    21:  'gsm_signal',
    200: 'sleep_mode',
    69:  'gnss_status',
    181: 'gnss_pdop',
    182: 'gnss_hdop',
    66:  'external_voltage',
    24:  'speed_io',
    67:  'battery_voltage',
    68:  'battery_current',
    241: 'active_gsm_operator',
    16:  'total_odometer',
    1:   'digital_input_1',
    2:   'digital_input_2',
    3:   'digital_input_3',
    9:   'analog_input_1',
    6:   'analog_input_2',
    12:  'fuel_used_gps_total',
    11:  'iccid',
    10:  'sd_status',
    179: 'digital_output_1',
    180: 'digital_output_2',
    113: 'battery_level',
    199: 'trip_odometer',
    // FMS/J1939 CAN (trucks/buses)
    29:  'fms_fuel_level',
    30:  'fms_fuel_consumed',
    31:  'fms_fuel_rate',
    32:  'fms_speed',
    33:  'fms_rpm',
    35:  'fms_coolant_temp',
    36:  'fms_pedal_position',
    37:  'fms_engine_hours',
    38:  'fms_total_mileage',
    // ALL-CAN300 / LV-CAN200 (official IO element list)
    81:  'can_vehicle_speed',           // km/h
    82:  'can_accelerator_pedal',       // %
    83:  'can_fuel_consumed',           // liters * 100
    84:  'can_fuel_level_liters',       // liters * 10
    85:  'can_engine_rpm',              // RPM
    87:  'can_total_mileage',           // meters
    89:  'can_fuel_level_pct',          // %
    90:  'can_door_status',             // bitmask (256=FL, 512=FR, 1024=RL, 2048=RR, 4096=hood, 8192=trunk)
    100: 'can_program_number',          // 0-999
    101: 'can_module_id',               // module identification
    102: 'can_engine_worktime',         // minutes
    103: 'can_engine_worktime_counted', // minutes (counted)
    105: 'can_total_mileage_counted',   // meters (counted)
    107: 'can_fuel_consumed_counted',   // liters * 100
    110: 'can_fuel_rate',               // (liters * 10) / h
    111: 'can_adblue_level_pct',        // %
    112: 'can_adblue_level_liters',     // liters * 10
    114: 'can_engine_load',             // % (0-125)
    115: 'can_engine_temp',             // °C * 10 (signed)
    118: 'can_axle1_load',              // kg
    119: 'can_axle2_load',              // kg
    120: 'can_axle3_load',              // kg
    121: 'can_axle4_load',              // kg
    122: 'can_axle5_load',              // kg
    123: 'can_control_state_flags',     // bitmask
    124: 'can_agricultural_flags',      // bitmask
    132: 'can_security_state_flags',    // bitmask
    133: 'can_tacho_distance',          // meters
    134: 'can_trip_distance',           // meters
    135: 'can_tacho_speed',             // km/h
    151: 'can_battery_temp',            // °C * 10 (signed)
    152: 'can_battery_level_pct',       // %
    160: 'can_dtc_errors',              // fault count
    187: 'can_load_weight',             // kg (gross combined vehicle weight)
    188: 'can_retarder_load',           // % (0-125)
    // MAN TGS / Camioane specifice (LV-CAN200/ALL-CAN300 truck params)
    189: 'can_intake_air_temp',         // °C * 10 (signed) - intake air temperature
    190: 'can_engine_oil_temp',         // °C * 10 (signed) - oil temperature
    191: 'can_outside_temp',            // °C * 10 (signed)
    192: 'can_distance_to_service',     // km
    // Service parameters (new CAN adapter IDs)
    858: 'can_service_distance',        // km to next service
    859: 'can_service_time_to_due',     // days until next service
    860: 'can_service_time_from_last',  // days since last service
    861: 'can_service_distance_since',  // km since last service
    // PTO (Power Take Off) - direct ID for modern firmware
    946: 'can_pto_state',               // 0 = Off, 1 = On
    // LLS Fuel sensors (RS232/RS485 - Escort TD-150 cu RS-485)
    201: 'lls_fuel_level_1',            // litri (LLS sensor 1)
    202: 'lls_fuel_temp_1',             // °C (LLS sensor 1)
    203: 'lls_fuel_level_2',            // litri (LLS sensor 2)
    204: 'lls_fuel_temp_2',             // °C (LLS sensor 2)
    // BLE Fuel sensors (Escort TD-BLE wireless)
    270: 'ble_fuel_level_1',            // litri (BLE sensor 1)
    271: 'ble_fuel_frequency_1',        // Hz (raw frequency)
    272: 'ble_fuel_temp_1',             // °C (signed, /10)
    273: 'ble_battery_voltage_1',       // mV
    276: 'ble_fuel_level_2',            // litri (BLE sensor 2)
    277: 'ble_fuel_frequency_2',        // Hz
    278: 'ble_fuel_temp_2',             // °C
    279: 'ble_battery_voltage_2',       // mV
    282: 'ble_fuel_level_3',            // litri (BLE sensor 3)
    283: 'ble_fuel_frequency_3',        // Hz
    284: 'ble_fuel_temp_3',             // °C
    285: 'ble_battery_voltage_3',       // mV
    288: 'ble_fuel_level_4',            // litri (BLE sensor 4)
    289: 'ble_fuel_frequency_4',        // Hz
    290: 'ble_fuel_temp_4',             // °C
    291: 'ble_battery_voltage_4',       // mV
    193: 'can_pto_active',              // 0/1 - Power Take Off active
    194: 'can_pto_engagement_count',    // counter
    195: 'can_brake_pad_axle1',         // % wear
    196: 'can_brake_pad_axle2',         // % wear
    197: 'can_brake_pad_axle3',         // % wear
    198: 'can_brake_pad_axle4',         // % wear
    199: 'trip_odometer',               // already mapped above (system)
    // ─── CORECTAT pe specul OFICIAL Teltonika FMC650 (wiki.teltonika-gps.com) ───
    // Vechea mapare 202-216 (oil/coolant/washer/tahograf) era GREȘITĂ și producea valori
    // aberante (ex: „Lichid spalare 246479620" = de fapt GSM Cell ID la ID 205). Conform
    // spec-ului, 201-216 = senzori LLS + GSM Cell/Area + RFID + Ultrasonic.
    // 201-204 (LLS 1/2 nivel/temp) sunt definite mai sus și NU se mai suprascriu.
    205: 'gsm_cell_id',                 // GSM Cell ID
    206: 'gsm_area_code',               // GSM Area Code
    207: 'rfid',                        // RFID
    208: 'ultrasonic_status_1',         // Ultrasonic Software Status 1
    209: 'ultrasonic_status_2',         // Ultrasonic Software Status 2
    210: 'lls_fuel_level_3',            // LLS 3 Fuel Level
    211: 'lls_fuel_temp_3',             // LLS 3 Temperature (°C)
    212: 'lls_fuel_level_4',            // LLS 4 Fuel Level
    213: 'lls_fuel_temp_4',             // LLS 4 Temperature (°C)
    214: 'lls_fuel_level_5',            // LLS 5 Fuel Level
    // 215, 216 → io_215/io_216 (necunoscute) — de confirmat din configurator, fără mapare greșită
    // Truck VIN si identificare
    217: 'can_vin',                     // string (VIN number)
    218: 'can_engine_total_fuel_used', // liters * 100 (lifetime)
    219: 'can_total_engine_revolutions',
    // Sarcina si transport
    220: 'can_total_axle_load',         // kg (sum)
    221: 'can_load_factor',             // % capacity
    222: 'can_trailer_connected',       // 0/1
    223: 'can_trailer_weight',          // kg
    // System IO
    232: 'can_battery_soc',             // % (EV battery state of charge)
    235: 'can_odo_high_res',            // high resolution odometer
    // ALL-CAN300 state flags
    652: 'can_security_flag_ext',       // extended security flag
    658: 'can_indicator_left',          // left turn indicator
    659: 'can_indicator_right',         // right turn indicator
    660: 'can_indicator_hazard',        // hazard lights
    661: 'can_indicator_lights',        // lights status
    898: 'can_handbrake',               // handbrake status
    // Manual CAN data
    900: 'can_manual_0',                // manual CAN element 0
    902: 'can_manual_2',                // manual CAN element 2
    904: 'can_manual_4',                // manual CAN element 4
    // Green driving
    253: 'green_driving_type',
    254: 'green_driving_value',
    // Events
    250: 'trip',
    255: 'over_speeding',
    252: 'unplug',
    247: 'crash_detection',
    251: 'idling',
    246: 'towing',
    // Geofence
    175: 'auto_geofence',
    // GPS trajectory (Codec 8 Extended NX)
    387: 'gps_trajectory_encoded',      // ISO6709 coordinates hex
  };

  return names[id] || `io_${id}`;
}

// Conversii valori CAN raw -> valori reale
function convertCanValue(name, rawValue) {
  switch (name) {
    case 'can_fuel_level_liters':       return rawValue / 10;        // liters
    case 'can_engine_temp':             return rawValue > 32767 ? (rawValue - 65536) / 10 : rawValue / 10; // °C (signed)
    case 'can_battery_temp':            return rawValue > 32767 ? (rawValue - 65536) / 10 : rawValue / 10; // °C (signed)
    case 'can_fuel_consumed':           return rawValue / 100;       // liters
    case 'can_fuel_consumed_counted':   return rawValue / 100;       // liters
    case 'can_fuel_rate':               return rawValue / 10;        // liters/h
    case 'can_adblue_level_liters':     return rawValue / 10;        // liters
    case 'can_total_mileage':           return rawValue / 1000;      // km
    case 'can_total_mileage_counted':   return rawValue / 1000;      // km
    case 'can_tacho_distance':          return rawValue / 1000;      // km
    case 'can_trip_distance':           return rawValue / 1000;      // km
    // Truck-specific conversions
    case 'can_intake_air_temp':         return rawValue > 32767 ? (rawValue - 65536) / 10 : rawValue / 10;
    case 'can_engine_oil_temp':         return rawValue > 32767 ? (rawValue - 65536) / 10 : rawValue / 10;
    case 'can_outside_temp':            return rawValue > 32767 ? (rawValue - 65536) / 10 : rawValue / 10;
    case 'can_engine_total_fuel_used':  return rawValue / 100;       // liters
    case 'can_distance_to_service':     return rawValue;             // km already
    // BLE fuel sensors temperature (signed, raw * 10)
    case 'ble_fuel_temp_1':
    case 'ble_fuel_temp_2':
    case 'ble_fuel_temp_3':
    case 'ble_fuel_temp_4':
    case 'lls_fuel_temp_1':
    case 'lls_fuel_temp_2':
      return rawValue > 32767 ? (rawValue - 65536) : rawValue;       // °C signed
    default:                            return rawValue;
  }
}

// Decodare Security State Flags P2 (ID 132, 8 bytes)
function decodeSecurityFlags(value) {
  const flags = {};
  // value poate fi un numar mare (8 bytes) - il convertim in bytes
  const bytes = [];
  let v = typeof value === 'bigint' ? value : BigInt(value);
  for (let i = 0; i < 8; i++) {
    bytes.push(Number(v & 0xFFn));
    v >>= 8n;
  }
  // Nota: bytes sunt in ordine inversa (little-endian din BigInt)
  // Reconstruim in ordine corecta (byte 0 = MSB din valoare)
  const b = [];
  const hex = value.toString(16).padStart(16, '0');
  for (let i = 0; i < 8; i++) {
    b.push(parseInt(hex.substr(i * 2, 2), 16));
  }

  // Byte 0 - CAN connection status
  flags.can1_status = b[0] & 0x03;
  flags.can2_status = (b[0] >> 2) & 0x03;

  // Byte 1
  flags.engine_lock = !!(b[1] & 0x01);
  flags.hazard_lights = !!(b[1] & 0x02);
  flags.factory_armed = !!(b[1] & 0x04);

  // Byte 2
  flags.electric_engine = !!(b[2] & 0x02);
  flags.battery_charging = !!(b[2] & 0x04);
  flags.charging_cable = !!(b[2] & 0x08);
  flags.work_mode_private = !!(b[2] & 0x10);

  // Byte 3 - Ignition / Key / Webasto
  flags.key_in_ignition = !!(b[3] & 0x01);
  flags.ignition_on = !!(b[3] & 0x02);
  flags.dynamic_ignition = !!(b[3] & 0x04);
  flags.webasto = !!(b[3] & 0x08);
  flags.car_closed = !!(b[3] & 0x10);
  flags.closed_by_remote = !!(b[3] & 0x20);
  flags.factory_alarm = !!(b[3] & 0x40);
  flags.alarm_emulated = !!(b[3] & 0x80);

  // Byte 4 - Transmission
  flags.parking = !!(b[4] & 0x01);
  flags.neutral = !!(b[4] & 0x04);
  flags.drive = !!(b[4] & 0x08);
  flags.handbrake = !!(b[4] & 0x10);
  flags.footbrake = !!(b[4] & 0x20);
  flags.engine_working = !!(b[4] & 0x40);
  flags.reverse = !!(b[4] & 0x80);

  // Byte 5 - Doors
  flags.door_front_left = !!(b[5] & 0x01);
  flags.door_front_right = !!(b[5] & 0x02);
  flags.door_rear_left = !!(b[5] & 0x04);
  flags.door_rear_right = !!(b[5] & 0x08);
  flags.hood_open = !!(b[5] & 0x10);
  flags.trunk_open = !!(b[5] & 0x20);
  flags.roof_open = !!(b[5] & 0x40);

  return flags;
}

// Decodare Control State Flags P2 (ID 123, 4 bytes)
function decodeControlFlags(value) {
  const flags = {};
  const b = [];
  const hex = value.toString(16).padStart(8, '0');
  for (let i = 0; i < 4; i++) {
    b.push(parseInt(hex.substr(i * 2, 2), 16));
  }

  // Byte 0 - Warning indicators
  flags.stop_indicator = !!(b[0] & 0x01);
  flags.oil_pressure_warning = !!(b[0] & 0x02);
  flags.coolant_warning = !!(b[0] & 0x04);
  flags.handbrake_warning = !!(b[0] & 0x08);
  flags.battery_warning = !!(b[0] & 0x10);
  flags.airbag_warning = !!(b[0] & 0x20);
  flags.eps_warning = !!(b[0] & 0x40);
  flags.esp_warning = !!(b[0] & 0x80);

  // Byte 1 - Engine / System warnings
  flags.check_engine = !!(b[1] & 0x01);
  flags.lights_failure = !!(b[1] & 0x02);
  flags.low_tire_pressure = !!(b[1] & 0x04);
  flags.brake_pad_wear = !!(b[1] & 0x08);
  flags.general_warning = !!(b[1] & 0x10);
  flags.abs_warning = !!(b[1] & 0x20);
  flags.low_fuel = !!(b[1] & 0x40);
  flags.maintenance = !!(b[1] & 0x80);

  // Byte 2 - Lights & Indicators
  flags.esp_active = !!(b[2] & 0x01);
  flags.glow_plug = !!(b[2] & 0x02);
  flags.dpf_warning = !!(b[2] & 0x04);
  flags.epc_warning = !!(b[2] & 0x08);
  flags.parking_lights = !!(b[2] & 0x10);
  flags.dipped_headlights = !!(b[2] & 0x20);
  flags.full_beam = !!(b[2] & 0x40);
  flags.front_fog_lights = !!(b[2] & 0x80);

  // Byte 3 - Active systems
  flags.ready_to_drive = !!(b[3] & 0x01);
  flags.cruise_control = !!(b[3] & 0x02);
  flags.auto_retarder = !!(b[3] & 0x04);
  flags.manual_retarder = !!(b[3] & 0x08);
  flags.air_conditioning = !!(b[3] & 0x10);
  flags.rear_fog_lights = !!(b[3] & 0x20);
  flags.passenger_seatbelt = !!(b[3] & 0x40);
  flags.driver_seatbelt = !!(b[3] & 0x80);

  return flags;
}

// Expandeaza flag-urile in IO data
function expandCanFlags(ioData) {
  if (ioData.can_security_state_flags !== undefined) {
    ioData._security_flags = decodeSecurityFlags(ioData.can_security_state_flags);
  }
  if (ioData.can_control_state_flags !== undefined) {
    ioData._control_flags = decodeControlFlags(ioData.can_control_state_flags);
  }
  return ioData;
}

module.exports = { parseAvlPacket, getIoName, convertCanValue, expandCanFlags, decodeSecurityFlags, decodeControlFlags };
