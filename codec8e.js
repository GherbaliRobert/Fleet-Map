// codec8e.js — Parser pentru Teltonika Codec 8 Extended
// Decodează pachetele AVL primite de la dispozitivele FMB140

function parseAvlPacket(buffer) {
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

// Mapare AVL ID -> nume citibil (cele mai comune pentru FMB140)
function getIoName(id) {
  const names = {
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
    // CAN Bus (FMS)
    83:  'fuel_used_gps',
    84:  'fuel_rate_gps',
    87:  'total_mileage',
    110: 'fuel_consumed',
    // CAN Bus data
    29:  'can_fuel_level',
    30:  'can_fuel_consumed',
    31:  'can_fuel_rate',
    32:  'can_speed',
    33:  'can_rpm',
    35:  'can_coolant_temp',
    36:  'can_pedal_position',
    37:  'can_engine_hours',
    38:  'can_total_mileage',
    // LV-CAN200 extended IO
    81:  'can_vehicle_speed',
    82:  'can_accelerator_pedal',
    85:  'can_fuel_level_liters',
    89:  'can_fuel_level_pct',
    90:  'can_engine_load',
    102: 'can_engine_temp',
    103: 'can_axle_weight',
    105: 'can_control_state',
    114: 'can_doors',
    115: 'can_brake_pedal',
    160: 'dtc_count',
    189: 'can_intake_air_temp',
    232: 'can_battery_soc',
    233: 'can_battery_temp',
    234: 'can_charging_status',
    235: 'can_odo_high_res',
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
  };

  return names[id] || `io_${id}`;
}

module.exports = { parseAvlPacket, getIoName };
