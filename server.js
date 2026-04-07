// server.js — Serverul principal: TCP (dispozitive) + HTTP (interfață web) + WebSocket (live)
const net = require('net');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const { parseAvlPacket, convertCanValue, expandCanFlags } = require('./codec8e');
const db = require('./db');

// ─── Configurare ───
const HTTP_PORT = parseInt(process.env.PORT || '3000');
const TCP_PORT = parseInt(process.env.TCP_PORT || '5027');

// Dacă TCP și HTTP ar folosi același port, mută HTTP pe altul (TCP are prioritate - proxy-ul GPS pointeaza acolo)
if (TCP_PORT === HTTP_PORT) {
  console.warn(`[WARN] TCP_PORT (${TCP_PORT}) == HTTP_PORT, mut HTTP pe ${HTTP_PORT + 1}`);
}
const ACTUAL_TCP_PORT = TCP_PORT;
const ACTUAL_HTTP_PORT = TCP_PORT === HTTP_PORT ? HTTP_PORT + 1 : HTTP_PORT;

// ─── Stare live (ultima poziție per IMEI, ținută în memorie) ───
const livePositions = new Map();
const activeConnections = new Map(); // IMEI -> socket info

// ─── Debug log (circular buffer) ───
const debugLog = [];
const DEBUG_MAX = 200;

function addDebugEntry(entry) {
  const item = { ...entry, time: new Date().toISOString() };
  debugLog.push(item);
  if (debugLog.length > DEBUG_MAX) debugLog.shift();
  broadcastWs({ type: 'debug', data: item });
}

// ══════════════════════════════════════════════
// 1. SERVER TCP — primește date de la FMB140
// ══════════════════════════════════════════════
const tcpServer = net.createServer((socket) => {
  let imei = null;
  let buffer = Buffer.alloc(0);
  const clientAddr = `${socket.remoteAddress}:${socket.remotePort}`;

  console.log(`[TCP] Conexiune nouă de la ${clientAddr}`);
  addDebugEntry({ event: 'connect', address: clientAddr });

  socket.on('data', async (data) => {
    buffer = Buffer.concat([buffer, data]);

    try {
      // Pasul 1: Dispozitivul trimite IMEI-ul
      if (!imei) {
        // Primii 2 bytes = lungimea IMEI, restul = IMEI ca text ASCII
        if (buffer.length < 2) return;

        const imeiLength = buffer.readUInt16BE(0);
        if (buffer.length < 2 + imeiLength) return;

        imei = buffer.slice(2, 2 + imeiLength).toString('ascii');
        buffer = buffer.slice(2 + imeiLength);

        console.log(`[TCP] Dispozitiv identificat: IMEI ${imei} de la ${clientAddr}`);
        addDebugEntry({ event: 'imei', imei, address: clientAddr });

        // Înregistrează dispozitivul în DB
        await db.upsertDevice(imei);

        // Salvează conexiunea activă
        activeConnections.set(imei, {
          address: clientAddr,
          connectedAt: new Date()
        });

        // Răspunde cu 0x01 = accept
        socket.write(Buffer.from([0x01]));
        return;
      }

      // Pasul 2: Dispozitivul trimite pachete AVL
      // Verifică dacă avem destule date (minim 12 bytes: preamble + size + codec + count)
      if (buffer.length < 12) return;

      const dataFieldLength = buffer.readUInt32BE(4);
      const totalPacketLength = 8 + dataFieldLength + 4; // preamble(4) + size(4) + data + crc(4)

      if (buffer.length < totalPacketLength) return;

      const packet = buffer.slice(0, totalPacketLength);
      buffer = buffer.slice(totalPacketLength);

      const parsed = parseAvlPacket(packet);

      if (parsed.error) {
        console.error(`[TCP] Eroare parsare de la ${imei}: ${parsed.error}`);
        addDebugEntry({ event: 'error', imei, error: parsed.error });
        socket.write(Buffer.alloc(4, 0)); // răspunde cu 0
        return;
      }

      console.log(`[TCP] ${imei}: ${parsed.numberOfRecords} recorduri primite`);
      addDebugEntry({
        event: 'data',
        imei,
        codecId: parsed.codecId,
        numberOfRecords: parsed.numberOfRecords,
        records: parsed.records
      });

      // Aplica conversii CAN (liters*10 -> liters, °C*10 -> °C, etc.)
      for (const record of parsed.records) {
        if (record.io) {
          for (const key of Object.keys(record.io)) {
            if (key.startsWith('can_')) {
              record.io[key] = convertCanValue(key, record.io[key]);
            }
          }
          // Decodifica flag-urile CAN in parametri individuali
          expandCanFlags(record.io);
        }
      }

      // Salvează în baza de date
      await db.insertPositions(imei, parsed.records);

      // Actualizează poziția live
      const lastRecord = parsed.records[parsed.records.length - 1];
      if (lastRecord && lastRecord.gps.latitude !== 0) {
        const existing = livePositions.get(imei) || {};
        const liveData = {
          imei,
          timestamp: lastRecord.timestamp,
          latitude: lastRecord.gps.latitude,
          longitude: lastRecord.gps.longitude,
          speed: lastRecord.gps.speed,
          angle: lastRecord.gps.angle,
          satellites: lastRecord.gps.satellites,
          io: lastRecord.io,
          name: existing.name || null,
          vehicle_type: existing.vehicle_type || null,
          plate: existing.plate || null
        };
        livePositions.set(imei, liveData);

        // Trimite update live prin WebSocket
        broadcastWs({ type: 'position', data: liveData });

        // Evaluare alerte automate
        evaluateAlerts(imei, liveData).catch(err => {
          console.error(`[ALERTS] Eroare evaluare alerte pentru ${imei}: ${err.message}`);
        });

        // Track tare automat pentru camioane
        trackTareCandidate(imei, lastRecord.io || {}).catch(() => {});
      }

      // Răspunde cu numărul de recorduri acceptate (4 bytes)
      const response = Buffer.alloc(4);
      response.writeUInt32BE(parsed.numberOfRecords);
      socket.write(response);
    } catch (err) {
      console.error(`[TCP] Eroare procesare de la ${imei || clientAddr}: ${err.message}`);
    }
  });

  socket.on('close', () => {
    console.log(`[TCP] Deconectat: ${imei || clientAddr}`);
    addDebugEntry({ event: 'disconnect', imei: imei || null, address: clientAddr });
    if (imei) {
      activeConnections.delete(imei);
      const lastPos = livePositions.get(imei);
      if (lastPos) {
        lastPos.speed = 0;
        livePositions.set(imei, lastPos);
      }
      broadcastWs({ type: 'disconnect', data: { imei } });
    }
  });

  socket.on('error', (err) => {
    console.error(`[TCP] Eroare socket ${imei || clientAddr}: ${err.message}`);
  });

  // Timeout — închide conexiunea dacă nu primim date 10 min
  socket.setTimeout(600000);
  socket.on('timeout', () => {
    console.log(`[TCP] Timeout: ${imei || clientAddr}`);
    socket.end();
  });
});

// ══════════════════════════════════════════════
// 2. SERVER HTTP — interfață web + API
// ══════════════════════════════════════════════
const app = express();
app.use(express.json());

// ─── Sesiuni ───
const sessionMiddleware = session({
  store: new PgSession({
    pool: db.pool,
    createTableIfMissing: true
  }),
  secret: process.env.SESSION_SECRET || 'gps-tracker-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 24 ore
    httpOnly: true,
    secure: false,
    sameSite: 'lax'
  }
});
app.use(sessionMiddleware);

app.use(express.static(path.join(__dirname, 'public')));

// ─── Middleware autentificare ───
function requireAuth(req, res, next) {
  if (req.session && req.session.userId) return next();
  res.status(401).json({ error: 'Neautorizat' });
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') return next();
  res.status(403).json({ error: 'Acces interzis' });
}

// ─── Rute autentificare ───

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username și parola sunt obligatorii' });
    }

    const user = await db.getUserByUsername(username);
    if (!user) {
      return res.status(401).json({ error: 'Username sau parola greșită' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Username sau parola greșită' });
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;

    res.json({ username: user.username, role: user.role });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

// Utilizatorul curent
app.get('/api/me', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({ username: req.session.username, role: req.session.role });
  }
  res.status(401).json({ error: 'Neautorizat' });
});

// ─── Managementul utilizatorilor (doar admin) ───

app.get('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await db.getUsers();
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username și parola sunt obligatorii' });
    }
    if (username.length < 3) {
      return res.status(400).json({ error: 'Username-ul trebuie să aibă minim 3 caractere' });
    }
    if (password.length < 4) {
      return res.status(400).json({ error: 'Parola trebuie să aibă minim 4 caractere' });
    }

    const existing = await db.getUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: 'Username-ul există deja' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await db.createUser(username, hash, role || 'viewer');
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/users/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (id === req.session.userId) {
      return res.status(400).json({ error: 'Nu te poți șterge pe tine' });
    }
    await db.deleteUser(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API-uri protejate ───

// API: Lista dispozitivelor cu ultima poziție
app.get('/api/devices', requireAuth, async (req, res) => {
  try {
    const devices = await db.getDevices();
    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Poziții live din memorie
app.get('/api/live', requireAuth, async (req, res) => {
  const positions = Array.from(livePositions.values());
  try {
    // Enrich with full device info (truck config, tank calibration, etc.)
    const result = await db.pool.query('SELECT imei, tare_weight, max_weight_legal, max_weight_construct, max_axle_loads, tank_calibration, fuel_price, cost_per_ton_km FROM devices');
    const devMap = new Map(result.rows.map(r => [r.imei, r]));
    for (const pos of positions) {
      const dev = devMap.get(pos.imei);
      if (dev) {
        pos.tare_weight = dev.tare_weight;
        pos.max_weight_legal = dev.max_weight_legal;
        pos.max_weight_construct = dev.max_weight_construct;
        pos.max_axle_loads = dev.max_axle_loads;
        pos.tank_calibration = dev.tank_calibration;
        pos.fuel_price = dev.fuel_price;
        pos.cost_per_ton_km = dev.cost_per_ton_km;
      }
    }
  } catch (e) { /* skip enrichment */ }
  res.json(positions);
});

// API: Conexiuni active
app.get('/api/connections', requireAuth, (req, res) => {
  const connections = Object.fromEntries(activeConnections);
  res.json(connections);
});

// API: Istoric traseu pentru un dispozitiv
app.get('/api/history/:imei', requireAuth, async (req, res) => {
  try {
    const { imei } = req.params;
    const from = req.query.from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = req.query.to || new Date().toISOString();
    const history = await db.getDeviceHistory(imei, from, to);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Actualizare info dispozitiv (nume, tip, nr. înmatriculare)
app.put('/api/devices/:imei', requireAuth, async (req, res) => {
  try {
    const { imei } = req.params;
    const { name, vehicle_type, plate } = req.body;
    await db.updateDeviceInfo(imei, name, vehicle_type, plate);
    // Update in-memory livePositions so WebSocket clients get the new name
    const pos = livePositions.get(imei);
    if (pos) {
      pos.name = name || null;
      pos.vehicle_type = vehicle_type || null;
      pos.plate = plate || null;
      livePositions.set(imei, pos);
      broadcastWs({ type: 'position', data: pos });
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get full device info (cu config camion)
app.get('/api/devices/:imei/full', requireAuth, async (req, res) => {
  try {
    const device = await db.getDeviceFull(req.params.imei);
    if (!device) return res.status(404).json({ error: 'Device not found' });
    res.json(device);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Update truck configuration (tara, limite, costuri)
app.put('/api/devices/:imei/truck-config', requireAuth, async (req, res) => {
  try {
    await db.updateTruckConfig(req.params.imei, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Update tank calibration (perechi voltage -> liters pentru sonda Escort)
app.put('/api/devices/:imei/tank-calibration', requireAuth, async (req, res) => {
  try {
    await db.updateTankCalibration(req.params.imei, req.body.calibration);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Raport transport (detectie automata curse incarcare/descarcare + tone-km)
app.get('/api/transport-report/:imei', requireAuth, async (req, res) => {
  try {
    const { imei } = req.params;
    const from = req.query.from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = req.query.to || new Date().toISOString();

    const device = await db.getDeviceFull(imei);
    if (!device) return res.status(404).json({ error: 'Device not found' });

    const history = await db.getDeviceHistory(imei, from, to);
    if (history.length === 0) {
      return res.json({
        imei, from, to,
        trips: [],
        summary: { tripCount: 0, totalTons: 0, totalTonKm: 0, emptyKm: 0, loadedKm: 0, fuelCost: 0, estimatedRevenue: 0 }
      });
    }

    const tare = device.tare_weight || 0;
    const LOAD_THRESHOLD = 1000; // kg - diferenta minima sa fie considerata incarcatura
    const LOAD_CHANGE_THRESHOLD = 2000; // kg - schimbare brusca = eveniment
    const STABILITY_WINDOW = 60; // secunde - cat trebuie sa fie stabila o greutate
    const fuelPrice = parseFloat(device.fuel_price) || 0;
    const costPerTonKm = parseFloat(device.cost_per_ton_km) || 0;

    // Trips detected: fiecare ciclu gol->plin->gol sau segment cu incarcatura stabila
    const trips = [];
    let currentTrip = null;
    let prevWeight = null;
    let prevPos = null;
    let totalLoadedKm = 0;
    let totalEmptyKm = 0;
    let totalFuelConsumed = 0;
    let firstFuelLevel = null;
    let lastFuelLevel = null;

    for (let i = 0; i < history.length; i++) {
      const row = history[i];
      const io = row.io_data || {};
      const ts = new Date(row.timestamp);

      // Calculate total weight from axles
      const a1 = io.can_axle1_load || 0;
      const a2 = io.can_axle2_load || 0;
      const a3 = io.can_axle3_load || 0;
      const a4 = io.can_axle4_load || 0;
      const a5 = io.can_axle5_load || 0;
      const totalWeight = a1 + a2 + a3 + a4 + a5 || io.can_load_weight || 0;

      // Distance from previous point
      let segmentDist = 0;
      if (prevPos) {
        segmentDist = haversineDistance(prevPos.latitude, prevPos.longitude, row.latitude, row.longitude);
        if (segmentDist > 10) segmentDist = 0; // filter GPS jumps
      }

      // Classify km as loaded vs empty based on current load
      if (totalWeight > 0 && tare > 0) {
        const load = totalWeight - tare;
        if (load > LOAD_THRESHOLD) {
          totalLoadedKm += segmentDist;
        } else {
          totalEmptyKm += segmentDist;
        }
      }

      // Fuel tracking
      const fuelLevel = io.can_fuel_level_liters;
      if (fuelLevel !== undefined && fuelLevel > 0) {
        if (firstFuelLevel === null) firstFuelLevel = fuelLevel;
        lastFuelLevel = fuelLevel;
      }

      // Detect load events (incarcare/descarcare)
      if (prevWeight !== null && totalWeight > 0) {
        const change = totalWeight - prevWeight;

        // Incarcare detectata (greutate creste brusc cu > 2t)
        if (change > LOAD_CHANGE_THRESHOLD && !currentTrip) {
          currentTrip = {
            loadStartTime: row.timestamp,
            loadStartLat: row.latitude,
            loadStartLng: row.longitude,
            loadedWeight: totalWeight - tare,
            totalWeight: totalWeight,
            distance: 0,
            unloadTime: null,
            unloadLat: null,
            unloadLng: null
          };
        }

        // Descarcare detectata (greutate scade brusc cu > 2t)
        if (change < -LOAD_CHANGE_THRESHOLD && currentTrip) {
          currentTrip.unloadTime = row.timestamp;
          currentTrip.unloadLat = row.latitude;
          currentTrip.unloadLng = row.longitude;
          currentTrip.durationSec = Math.round((new Date(row.timestamp) - new Date(currentTrip.loadStartTime)) / 1000);
          currentTrip.tonKm = Math.round((currentTrip.loadedWeight / 1000) * currentTrip.distance * 100) / 100;
          currentTrip.loadedTons = Math.round((currentTrip.loadedWeight / 1000) * 100) / 100;
          trips.push(currentTrip);
          currentTrip = null;
        }

        // Add distance to current trip (while loaded)
        if (currentTrip && segmentDist > 0) {
          currentTrip.distance += segmentDist;
        }
      }

      prevWeight = totalWeight;
      prevPos = row;
    }

    // Close any open trip
    if (currentTrip) {
      currentTrip.durationSec = Math.round((new Date(prevPos.timestamp) - new Date(currentTrip.loadStartTime)) / 1000);
      currentTrip.tonKm = Math.round((currentTrip.loadedWeight / 1000) * currentTrip.distance * 100) / 100;
      currentTrip.loadedTons = Math.round((currentTrip.loadedWeight / 1000) * 100) / 100;
      trips.push(currentTrip);
    }

    // Fuel consumption total
    if (firstFuelLevel !== null && lastFuelLevel !== null) {
      totalFuelConsumed = Math.max(0, firstFuelLevel - lastFuelLevel);
    }

    // Summary
    const totalTons = trips.reduce((sum, t) => sum + (t.loadedTons || 0), 0);
    const totalTonKm = trips.reduce((sum, t) => sum + (t.tonKm || 0), 0);
    const fuelCost = totalFuelConsumed * fuelPrice;
    const estimatedRevenue = totalTonKm * costPerTonKm;

    res.json({
      imei,
      from,
      to,
      tareWeight: tare,
      trips: trips.map(t => ({
        ...t,
        distance: Math.round(t.distance * 100) / 100
      })),
      summary: {
        tripCount: trips.length,
        totalTons: Math.round(totalTons * 100) / 100,
        totalTonKm: Math.round(totalTonKm * 100) / 100,
        loadedKm: Math.round(totalLoadedKm * 100) / 100,
        emptyKm: Math.round(totalEmptyKm * 100) / 100,
        totalKm: Math.round((totalLoadedKm + totalEmptyKm) * 100) / 100,
        fuelConsumed: Math.round(totalFuelConsumed * 10) / 10,
        fuelCost: Math.round(fuelCost * 100) / 100,
        estimatedRevenue: Math.round(estimatedRevenue * 100) / 100,
        profit: Math.round((estimatedRevenue - fuelCost) * 100) / 100
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Statistici
app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const stats = {
      totalDevices: livePositions.size,
      activeConnections: activeConnections.size,
      livePositions: livePositions.size
    };
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Dashboard KPI-uri fleet
app.get('/api/dashboard', requireAuth, async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const now = new Date();

    // Collect stats per device
    const deviceStats = [];
    let totalKm = 0;
    let totalFuel = 0;
    let totalAlerts = 0;
    let onlineCount = 0;
    let movingCount = 0;
    let totalEngineTime = 0;

    for (const [imei, data] of livePositions) {
      const isOnline = data.timestamp && (now - new Date(data.timestamp)) < 300000;
      const isMoving = isOnline && (data.speed || 0) > 3;
      if (isOnline) onlineCount++;
      if (isMoving) movingCount++;

      // Get today's history for this device
      try {
        const history = await db.getDeviceHistory(imei, todayStart.toISOString(), now.toISOString());
        let km = 0;
        let fuel = 0;
        let maxSpeed = 0;
        let engineTime = 0;
        let firstFuelLevel = null;
        let lastFuelLevel = null;

        for (let i = 0; i < history.length; i++) {
          const row = history[i];
          const io = row.io_data || {};

          if (i > 0) {
            const prev = history[i - 1];
            const dist = haversineDistance(prev.latitude, prev.longitude, row.latitude, row.longitude);
            if (dist < 10) km += dist;

            // Engine time
            const prevIo = prev.io_data || {};
            if (prevIo.ignition === 1 || io.ignition === 1) {
              const dt = (new Date(row.timestamp) - new Date(prev.timestamp)) / 1000;
              if (dt > 0 && dt < 3600) engineTime += dt;
            }
          }

          if ((row.speed || 0) > maxSpeed) maxSpeed = row.speed;

          // Fuel tracking
          const fl = io.can_fuel_level_liters;
          if (fl !== undefined && fl > 0) {
            if (firstFuelLevel === null) firstFuelLevel = fl;
            lastFuelLevel = fl;
          }
        }

        // Fuel consumed = drops only
        let deviceFuel = 0;
        let prevFL = null;
        for (const row of history) {
          const fl = (row.io_data || {}).can_fuel_level_liters;
          if (fl !== undefined && fl > 0) {
            if (prevFL !== null) {
              const diff = prevFL - fl;
              if (diff > 0.5) deviceFuel += diff;
            }
            prevFL = fl;
          }
        }

        km = Math.round(km * 100) / 100;
        deviceFuel = Math.round(deviceFuel * 10) / 10;
        totalKm += km;
        totalFuel += deviceFuel;
        totalEngineTime += engineTime;

        deviceStats.push({
          imei,
          name: data.name || imei,
          plate: data.plate || '',
          km,
          fuel: deviceFuel,
          maxSpeed,
          engineTime: Math.round(engineTime),
          fuelLevel: lastFuelLevel ? Math.round(lastFuelLevel * 10) / 10 : null,
          isOnline,
          isMoving
        });
      } catch (e) {
        // Skip device on error
      }
    }

    // Sort by km descending for top drivers
    const topKm = [...deviceStats].sort((a, b) => b.km - a.km).slice(0, 5);
    const topFuel = [...deviceStats].sort((a, b) => b.fuel - a.fuel).slice(0, 5);

    // Get recent alerts
    try {
      const alertRows = await db.getAlertHistory(20);
      totalAlerts = alertRows ? alertRows.length : 0;
    } catch (e) { /* no alerts table yet */ }

    res.json({
      totalDevices: livePositions.size,
      onlineCount,
      movingCount,
      offlineCount: livePositions.size - onlineCount,
      totalKm: Math.round(totalKm * 10) / 10,
      totalFuel: Math.round(totalFuel * 10) / 10,
      totalEngineTime: Math.round(totalEngineTime),
      totalAlerts,
      topKm,
      topFuel,
      devices: deviceStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Statistici zilnice per dispozitiv (km, viteza medie/max, opriri, timp mers/stationat, consum)
app.get('/api/stats/:imei', requireAuth, async (req, res) => {
  try {
    const { imei } = req.params;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const now = new Date();

    const history = await db.getDeviceHistory(imei, todayStart.toISOString(), now.toISOString());

    if (history.length === 0) {
      return res.json({
        imei,
        date: todayStart.toISOString().slice(0, 10),
        totalKm: 0,
        avgSpeed: 0,
        maxSpeed: 0,
        movingTime: 0,
        stoppedTime: 0,
        stops: 0,
        lastIgnitionOn: null,
        lastIgnitionOff: null,
        fuelConsumed: null,
        engineHours: null,
        recordCount: 0
      });
    }

    let totalDistance = 0;
    let maxSpeed = 0;
    let speedSum = 0;
    let speedCount = 0;
    let movingTime = 0;
    let stoppedTime = 0;
    let stops = 0;
    let wasMoving = false;
    let lastIgnitionOn = null;
    let lastIgnitionOff = null;
    let firstFuel = null;
    let lastFuel = null;

    for (let i = 0; i < history.length; i++) {
      const row = history[i];
      const spd = row.speed || 0;

      // Distance
      if (i > 0) {
        const prev = history[i - 1];
        const d = haversineDistance(prev.latitude, prev.longitude, row.latitude, row.longitude);
        if (d < 10) totalDistance += d; // filtreaza salturi GPS > 10km

        // Time
        const dt = (new Date(row.timestamp) - new Date(prev.timestamp)) / 1000;
        if (dt > 0 && dt < 3600) { // ignora gap-uri > 1h
          if (spd > 3) {
            movingTime += dt;
          } else {
            stoppedTime += dt;
          }
        }
      }

      // Speed
      if (spd > 3) {
        speedSum += spd;
        speedCount++;
        if (spd > maxSpeed) maxSpeed = spd;
        if (!wasMoving) wasMoving = true;
      } else {
        if (wasMoving) {
          stops++;
          wasMoving = false;
        }
      }

      // Ignition tracking
      const io = row.io_data || {};
      if (io.ignition === 1 || io.ignition === true) {
        if (!lastIgnitionOn) lastIgnitionOn = row.timestamp;
        lastIgnitionOn = row.timestamp;
      } else if (io.ignition === 0 || io.ignition === false) {
        lastIgnitionOff = row.timestamp;
      }

      // Fuel tracking (CAN)
      if (io.can_fuel_consumed !== undefined) {
        if (firstFuel === null) firstFuel = io.can_fuel_consumed;
        lastFuel = io.can_fuel_consumed;
      }
    }

    res.json({
      imei,
      date: todayStart.toISOString().slice(0, 10),
      totalKm: Math.round(totalDistance * 100) / 100,
      avgSpeed: speedCount > 0 ? Math.round(speedSum / speedCount) : 0,
      maxSpeed,
      movingTime: Math.round(movingTime),
      stoppedTime: Math.round(stoppedTime),
      stops,
      lastIgnitionOn,
      lastIgnitionOff,
      fuelConsumed: (firstFuel !== null && lastFuel !== null) ? Math.round((lastFuel - firstFuel) / 10 * 100) / 100 : null,
      engineHours: null,
      recordCount: history.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Raport detaliat cu detectie automata rute
app.get('/api/report/:imei', requireAuth, async (req, res) => {
  try {
    const { imei } = req.params;
    const from = req.query.from || new Date(new Date().setHours(0,0,0,0)).toISOString();
    const to = req.query.to || new Date().toISOString();
    const history = await db.getDeviceHistory(imei, from, to);

    if (history.length === 0) {
      return res.json({ imei, from, to, routes: [], summary: { totalKm: 0, totalTime: 0, movingTime: 0, stoppedTime: 0, avgSpeed: 0, maxSpeed: 0, stops: 0, fuelConsumed: null, routeCount: 0 } });
    }

    // Detectie automata rute bazat pe ignition ON/OFF si miscare
    const routes = [];
    let currentRoute = null;
    const STOP_THRESHOLD = 180; // 3 minute fara miscare = oprire
    const SPEED_THRESHOLD = 3; // km/h

    let lastMovingTime = null;
    let globalMaxSpeed = 0;
    let globalSpeedSum = 0;
    let globalSpeedCount = 0;
    let globalTotalKm = 0;
    let globalMovingTime = 0;
    let globalStoppedTime = 0;
    let globalStops = 0;
    let globalEngineOnTime = 0;
    let globalEngineIdleTime = 0;
    let firstIgnitionOnTime = null;
    let lastIgnitionOffTime = null;

    // Daily engine hours tracking
    const dailyEngine = {};
    const dailyActivity = {}; // track first ignition on and last ignition off per day

    for (let i = 0; i < history.length; i++) {
      const row = history[i];
      const spd = row.speed || 0;
      const ts = new Date(row.timestamp);
      const io = row.io_data || {};
      const isMoving = spd > SPEED_THRESHOLD;
      const ignitionOn = io.ignition === 1 || io.ignition === true;

      // Track first/last ignition times
      if (ignitionOn) {
        if (!firstIgnitionOnTime) firstIgnitionOnTime = ts;
        lastIgnitionOffTime = ts;

        const dayKey = ts.toISOString().slice(0, 10);
        if (!dailyActivity[dayKey]) dailyActivity[dayKey] = { firstOn: ts, lastOff: ts };
        if (!dailyActivity[dayKey].firstOn || ts < dailyActivity[dayKey].firstOn) dailyActivity[dayKey].firstOn = ts;
        if (ts > dailyActivity[dayKey].lastOff) dailyActivity[dayKey].lastOff = ts;
      }

      // Track global stats
      if (spd > globalMaxSpeed) globalMaxSpeed = spd;
      if (isMoving) { globalSpeedSum += spd; globalSpeedCount++; }

      // Distance from previous point
      let segmentDist = 0;
      if (i > 0) {
        const prev = history[i - 1];
        const prevIo = prev.io_data || {};
        const prevIgnition = prevIo.ignition === 1 || prevIo.ignition === true;
        segmentDist = haversineDistance(prev.latitude, prev.longitude, row.latitude, row.longitude);
        if (segmentDist > 10) segmentDist = 0; // filter GPS jumps

        const dt = (ts - new Date(prev.timestamp)) / 1000;
        if (dt > 0 && dt < 3600) {
          if (isMoving) globalMovingTime += dt;
          else globalStoppedTime += dt;

          // Engine hours tracking (ignition ON = motor pornit)
          if (prevIgnition || ignitionOn) {
            globalEngineOnTime += dt;
            const dayKey = new Date(prev.timestamp).toISOString().slice(0, 10);
            if (!dailyEngine[dayKey]) dailyEngine[dayKey] = { engineOn: 0, driving: 0, idle: 0 };
            dailyEngine[dayKey].engineOn += dt;
            if (isMoving) {
              dailyEngine[dayKey].driving += dt;
            } else {
              globalEngineIdleTime += dt;
              dailyEngine[dayKey].idle += dt;
            }
          }
        }
      }
      globalTotalKm += segmentDist;

      if (isMoving || (io.ignition === 1 && spd > 0)) {
        lastMovingTime = ts;

        if (!currentRoute) {
          // Start new route
          currentRoute = {
            startTime: row.timestamp,
            startLat: row.latitude,
            startLng: row.longitude,
            endTime: row.timestamp,
            endLat: row.latitude,
            endLng: row.longitude,
            distance: 0,
            maxSpeed: spd,
            speedSum: spd,
            speedCount: 1,
            points: 1,
            stops: 0
          };
        } else {
          // Continue route
          currentRoute.endTime = row.timestamp;
          currentRoute.endLat = row.latitude;
          currentRoute.endLng = row.longitude;
          currentRoute.distance += segmentDist;
          if (spd > currentRoute.maxSpeed) currentRoute.maxSpeed = spd;
          currentRoute.speedSum += spd;
          currentRoute.speedCount++;
          currentRoute.points++;
        }
      } else {
        // Vehicle stopped
        if (currentRoute && lastMovingTime) {
          const stopDuration = (ts - lastMovingTime) / 1000;
          if (stopDuration > STOP_THRESHOLD) {
            // End route
            currentRoute.duration = Math.round((new Date(currentRoute.endTime) - new Date(currentRoute.startTime)) / 1000);
            currentRoute.avgSpeed = currentRoute.speedCount > 0 ? Math.round(currentRoute.speedSum / currentRoute.speedCount) : 0;
            currentRoute.distance = Math.round(currentRoute.distance * 100) / 100;
            delete currentRoute.speedSum;
            delete currentRoute.speedCount;
            delete currentRoute.points;

            if (currentRoute.distance > 0.05 || currentRoute.duration > 60) {
              routes.push(currentRoute);
              globalStops++;
            }
            currentRoute = null;
            lastMovingTime = null;
          } else if (currentRoute) {
            // Short stop - keep in current route
            currentRoute.endTime = row.timestamp;
            currentRoute.endLat = row.latitude;
            currentRoute.endLng = row.longitude;
          }
        }
      }
    }

    // Close any open route
    if (currentRoute) {
      currentRoute.duration = Math.round((new Date(currentRoute.endTime) - new Date(currentRoute.startTime)) / 1000);
      currentRoute.avgSpeed = currentRoute.speedCount > 0 ? Math.round(currentRoute.speedSum / currentRoute.speedCount) : 0;
      currentRoute.distance = Math.round(currentRoute.distance * 100) / 100;
      delete currentRoute.speedSum;
      delete currentRoute.speedCount;
      delete currentRoute.points;
      if (currentRoute.distance > 0.05 || currentRoute.duration > 60) {
        routes.push(currentRoute);
      }
    }

    // Fuel consumption: folosim formula simpla (start - end + alimentari)
    // pentru a evita zgomotul senzorului CAN (care oscileaza +/- 0.5L)
    let fuelConsumed = null;
    let totalRefueled = 0;
    let hasFuelData = false;
    let firstFuelLevel = null;
    let lastFuelLevel = null;

    // Daily fuel breakdown (per day)
    const dailyFuel = {};
    const REFUEL_THRESHOLD = 5; // L - orice crestere brusca >5L e considerata alimentare

    // Helper: smooth readings by taking a rolling window minimum to filter noise
    // But pentru calcul corect folosim direct primele/ultimele citiri + detectare alimentari
    let prevLevel = null;

    for (const row of history) {
      const io = row.io_data || {};
      const fuelLevel = io.can_fuel_level_liters;

      if (fuelLevel !== undefined && fuelLevel !== null && fuelLevel > 0) {
        hasFuelData = true;
        if (firstFuelLevel === null) firstFuelLevel = fuelLevel;
        lastFuelLevel = fuelLevel;

        const dayKey = new Date(row.timestamp).toISOString().slice(0, 10);
        if (!dailyFuel[dayKey]) {
          dailyFuel[dayKey] = { first: fuelLevel, last: fuelLevel, refueled: 0 };
        }
        dailyFuel[dayKey].last = fuelLevel;

        // Detect refuel events (fuel level jump > threshold)
        if (prevLevel !== null) {
          const increase = fuelLevel - prevLevel;
          if (increase > REFUEL_THRESHOLD) {
            totalRefueled += increase;
            dailyFuel[dayKey].refueled += increase;
          }
        }
        prevLevel = fuelLevel;
      }
    }

    if (hasFuelData && firstFuelLevel !== null && lastFuelLevel !== null) {
      // Consum total = start - end + alimentari (daca nu s-a alimentat, e direct diferenta)
      const consumed = firstFuelLevel - lastFuelLevel + totalRefueled;
      fuelConsumed = Math.max(0, Math.round(consumed * 10) / 10);
    }

    // Calcul consum per zi folosind aceeasi formula (first - last + refueled)
    for (const dayKey of Object.keys(dailyFuel)) {
      const d = dailyFuel[dayKey];
      d.consumed = Math.max(0, Math.round((d.first - d.last + d.refueled) * 10) / 10);
    }

    // Build daily fuel summary with engine hours
    const allDays = new Set([...Object.keys(dailyFuel), ...Object.keys(dailyEngine), ...Object.keys(dailyActivity)]);
    const dailySummary = Array.from(allDays).sort().map(date => {
      const fuel = dailyFuel[date] || {};
      const engine = dailyEngine[date] || {};
      const activity = dailyActivity[date] || {};
      // Work window = first ignition ON to last ignition OFF
      const workWindow = (activity.firstOn && activity.lastOff) ? Math.round((activity.lastOff - activity.firstOn) / 1000) : 0;
      // Stationare reala = work window - driving time
      const realIdle = workWindow > 0 ? Math.max(0, workWindow - Math.round(engine.driving || 0)) : 0;
      return {
        date,
        startLevel: fuel.first ? Math.round(fuel.first * 10) / 10 : null,
        endLevel: fuel.last ? Math.round(fuel.last * 10) / 10 : null,
        consumed: fuel.consumed || 0,
        refueled: fuel.refueled ? Math.round(fuel.refueled * 10) / 10 : 0,
        engineOn: Math.round(engine.engineOn || 0),
        driving: Math.round(engine.driving || 0),
        idle: Math.round(engine.idle || 0),
        workWindow,
        realIdle,
        firstOn: activity.firstOn ? activity.firstOn.toISOString() : null,
        lastOff: activity.lastOff ? activity.lastOff.toISOString() : null
      };
    });

    // Average fuel consumption (L/100km)
    const avgConsumption = (fuelConsumed && globalTotalKm > 1) ? Math.round((fuelConsumed / globalTotalKm) * 100 * 10) / 10 : null;

    const summary = {
      totalKm: Math.round(globalTotalKm * 100) / 100,
      totalTime: Math.round(globalMovingTime + globalStoppedTime),
      movingTime: Math.round(globalMovingTime),
      stoppedTime: Math.round(globalStoppedTime),
      avgSpeed: globalSpeedCount > 0 ? Math.round(globalSpeedSum / globalSpeedCount) : 0,
      maxSpeed: globalMaxSpeed,
      stops: globalStops,
      fuelConsumed,
      avgConsumption,
      fuelStartLevel: firstFuelLevel !== null ? Math.round(firstFuelLevel * 10) / 10 : null,
      fuelEndLevel: lastFuelLevel !== null ? Math.round(lastFuelLevel * 10) / 10 : null,
      totalRefueled: totalRefueled > 0 ? Math.round(totalRefueled * 10) / 10 : null,
      engineOnTime: Math.round(globalEngineOnTime),
      engineIdleTime: Math.round(globalEngineIdleTime),
      workWindow: (firstIgnitionOnTime && lastIgnitionOffTime) ? Math.round((lastIgnitionOffTime - firstIgnitionOnTime) / 1000) : 0,
      realStoppedTime: (firstIgnitionOnTime && lastIgnitionOffTime) ? Math.max(0, Math.round((lastIgnitionOffTime - firstIgnitionOnTime) / 1000) - Math.round(globalMovingTime)) : 0,
      dailyFuel: dailySummary,
      routeCount: routes.length
    };

    res.json({ imei, from, to, routes, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Soferi CRUD ───

app.get('/api/drivers', requireAuth, async (req, res) => {
  try { res.json(await db.getDrivers()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/drivers', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.createDriver(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/drivers/:id', requireAuth, requireAdmin, async (req, res) => {
  try { await db.updateDriver(req.params.id, req.body); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/drivers/:id', requireAuth, requireAdmin, async (req, res) => {
  try { await db.deleteDriver(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Grupe CRUD ───

app.get('/api/groups', requireAuth, async (req, res) => {
  try { res.json(await db.getGroups()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/groups', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.createGroup(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/groups/:id', requireAuth, requireAdmin, async (req, res) => {
  try { await db.updateGroup(req.params.id, req.body); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/groups/:id', requireAuth, requireAdmin, async (req, res) => {
  try { await db.deleteGroup(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Geofences CRUD ───

app.get('/api/geofences', requireAuth, async (req, res) => {
  try { res.json(await db.getGeofences()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/geofences', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.createGeofence(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/geofences/:id', requireAuth, requireAdmin, async (req, res) => {
  try { await db.deleteGeofence(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Alerte CRUD ───

app.get('/api/alerts', requireAuth, async (req, res) => {
  try { res.json(await db.getAlerts()); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/alerts', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.createAlert(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/alerts/:id', requireAuth, requireAdmin, async (req, res) => {
  try { await db.deleteAlert(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/alerts/history', requireAuth, async (req, res) => {
  try { res.json(await db.getAlertHistory(parseInt(req.query.limit) || 50)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Trips ───

app.get('/api/trips/:imei', requireAuth, async (req, res) => {
  try {
    const from = req.query.from || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = req.query.to || new Date().toISOString();
    res.json(await db.getTrips(req.params.imei, from, to));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Mentenanta CRUD ───

app.get('/api/maintenance', requireAuth, async (req, res) => {
  try { res.json(await db.getMaintenance(req.query.imei)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/maintenance', requireAuth, async (req, res) => {
  try { res.json(await db.createMaintenance(req.body)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/maintenance/:id', requireAuth, async (req, res) => {
  try { await db.updateMaintenance(req.params.id, req.body); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/maintenance/:id', requireAuth, requireAdmin, async (req, res) => {
  try { await db.deleteMaintenance(req.params.id); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Export CSV ───

// ─── Detectie automata tara camion ───
// Tracking ultimele N citiri ale sarcinii totale per vehicul
const tareSamples = new Map(); // imei -> [{weight, timestamp}, ...]
const TARE_SAMPLE_LIMIT = 100;

async function trackTareCandidate(imei, ioData) {
  const a1 = ioData.can_axle1_load || 0;
  const a2 = ioData.can_axle2_load || 0;
  const a3 = ioData.can_axle3_load || 0;
  const a4 = ioData.can_axle4_load || 0;
  const a5 = ioData.can_axle5_load || 0;
  const total = a1 + a2 + a3 + a4 + a5 || ioData.can_load_weight || 0;
  if (total <= 0) return;

  let samples = tareSamples.get(imei) || [];
  samples.push({ weight: total, timestamp: Date.now() });
  if (samples.length > TARE_SAMPLE_LIMIT) samples = samples.slice(-TARE_SAMPLE_LIMIT);
  tareSamples.set(imei, samples);

  // Detectie tara: cea mai mica valoare aparuta de minim 10 ori in ultimele 100 citiri
  // (vehiculul a fost gol de cel putin 10 ori)
  if (samples.length >= 30) {
    const minWeight = Math.min(...samples.map(s => s.weight));
    const closeToMin = samples.filter(s => Math.abs(s.weight - minWeight) < 200).length;

    if (closeToMin >= 10) {
      // Update tara automata daca nu e setata sau valoarea noua e mai mica
      try {
        const device = await db.getDeviceFull(imei);
        if (device && (!device.tare_weight || minWeight < device.tare_weight - 500)) {
          await db.pool.query(
            'UPDATE devices SET tare_weight = $2 WHERE imei = $1 AND (tare_weight IS NULL OR tare_weight > $2)',
            [imei, Math.round(minWeight)]
          );
          console.log(`[TARE] Auto-detected tare for ${imei}: ${minWeight} kg`);
        }
      } catch (e) { /* skip */ }
    }
  }
}

// ─── Evaluare Alerte Automate ───
const alertCooldowns = new Map(); // key: alertId_imei, value: timestamp

function isPointInPolygon(point, polygon) {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isPointInCircle(lat, lng, centerLat, centerLng, radiusKm) {
  return haversineDistance(lat, lng, centerLat, centerLng) <= radiusKm;
}

// Track geofence state per device for enter/exit detection
const geofenceStates = new Map(); // key: imei_geofenceId, value: boolean (inside)

async function evaluateAlerts(imei, data) {
  try {
    const alerts = await db.getAlerts();
    if (!alerts || alerts.length === 0) return;

    const speed = data.speed || 0;
    const io = data.io || {};
    const lat = data.latitude;
    const lng = data.longitude;

    for (const alert of alerts) {
      if (!alert.enabled) continue;
      if (alert.imei && alert.imei !== imei) continue; // Device-specific alert

      const cond = alert.condition || {};
      const cooldownKey = alert.id + '_' + imei;
      const lastTriggered = alertCooldowns.get(cooldownKey);
      if (lastTriggered && (Date.now() - lastTriggered) < 300000) continue; // 5 min cooldown

      let triggered = false;
      let alertData = {};

      switch (alert.type) {
        case 'overspeed':
          if (cond.maxSpeed && speed > cond.maxSpeed) {
            triggered = true;
            alertData = { speed, limit: cond.maxSpeed };
          }
          break;

        case 'fuel_drop':
          if (cond.dropLiters && io.can_fuel_level_liters !== undefined) {
            // Compare with previous reading stored in livePositions
            const prev = livePositions.get(imei);
            if (prev && prev.io && prev.io.can_fuel_level_liters !== undefined) {
              const drop = prev.io.can_fuel_level_liters - io.can_fuel_level_liters;
              if (drop > cond.dropLiters) {
                triggered = true;
                alertData = { previousLevel: prev.io.can_fuel_level_liters, currentLevel: io.can_fuel_level_liters, drop };
              }
            }
          }
          break;

        case 'ignition_on':
          if (io.ignition === 1) {
            triggered = true;
            alertData = { event: 'Motor pornit' };
          }
          break;

        case 'ignition_off':
          if (io.ignition === 0) {
            const prev = livePositions.get(imei);
            if (prev && prev.io && prev.io.ignition === 1) {
              triggered = true;
              alertData = { event: 'Motor oprit' };
            }
          }
          break;

        case 'dtc_error':
          if (io.can_dtc_errors && io.can_dtc_errors > 0) {
            triggered = true;
            alertData = { dtcCount: io.can_dtc_errors };
          }
          break;

        case 'geofence_exit':
        case 'geofence_enter':
          if (cond.geofenceId && lat && lng) {
            try {
              const geofences = await db.getGeofences();
              const gf = geofences.find(g => g.id === cond.geofenceId);
              if (gf && gf.coordinates) {
                const coords = typeof gf.coordinates === 'string' ? JSON.parse(gf.coordinates) : gf.coordinates;
                let isInside = false;

                if (gf.type === 'circle' && coords.center && coords.radius) {
                  isInside = isPointInCircle(lat, lng, coords.center[0], coords.center[1], coords.radius / 1000);
                } else if (Array.isArray(coords)) {
                  isInside = isPointInPolygon([lat, lng], coords);
                }

                const stateKey = imei + '_' + gf.id;
                const wasInside = geofenceStates.get(stateKey);

                if (alert.type === 'geofence_exit' && wasInside === true && !isInside) {
                  triggered = true;
                  alertData = { geofence: gf.name || gf.id, event: 'Iesire din zona' };
                } else if (alert.type === 'geofence_enter' && wasInside === false && isInside) {
                  triggered = true;
                  alertData = { geofence: gf.name || gf.id, event: 'Intrare in zona' };
                }

                geofenceStates.set(stateKey, isInside);
              }
            } catch (e) { /* geofence check failed */ }
          }
          break;

        case 'engine_temp':
          if (cond.maxTemp && io.can_engine_temp && io.can_engine_temp > cond.maxTemp) {
            triggered = true;
            alertData = { temp: io.can_engine_temp, limit: cond.maxTemp };
          }
          break;

        case 'overload_legal':
        case 'overload_construct': {
          // Calculate total weight from axles
          const a1 = io.can_axle1_load || 0;
          const a2 = io.can_axle2_load || 0;
          const a3 = io.can_axle3_load || 0;
          const a4 = io.can_axle4_load || 0;
          const a5 = io.can_axle5_load || 0;
          const totalKg = a1 + a2 + a3 + a4 + a5 || io.can_load_weight || 0;
          if (totalKg > 0 && cond.maxKg && totalKg > cond.maxKg) {
            triggered = true;
            alertData = { totalKg, limit: cond.maxKg, axles: [a1, a2, a3, a4, a5] };
          }
          break;
        }

        case 'axle_overload': {
          // Per-axle limit check
          const axleLimits = cond.axleLimits || {};
          for (const axleNum of [1, 2, 3, 4, 5]) {
            const load = io['can_axle' + axleNum + '_load'];
            const limit = axleLimits['axle' + axleNum];
            if (load && limit && load > limit) {
              triggered = true;
              alertData = { axle: axleNum, load, limit };
              break;
            }
          }
          break;
        }

        case 'pto_active':
          if (io.can_pto_active === 1 || io.can_pto_active === true) {
            triggered = true;
            alertData = { event: 'PTO activat' };
          }
          break;

        case 'brake_pad_wear': {
          const minWear = cond.minPercent || 20;
          for (const axleNum of [1, 2, 3, 4]) {
            const wear = io['can_brake_pad_axle' + axleNum];
            if (wear !== undefined && wear < minWear) {
              triggered = true;
              alertData = { axle: axleNum, wear, threshold: minWear };
              break;
            }
          }
          break;
        }

        case 'service_due':
          if (io.can_distance_to_service !== undefined && io.can_distance_to_service < (cond.warnKm || 1000)) {
            triggered = true;
            alertData = { distanceToService: io.can_distance_to_service, threshold: cond.warnKm || 1000 };
          }
          break;
      }

      if (triggered) {
        alertCooldowns.set(cooldownKey, Date.now());
        alertData.imei = imei;
        alertData.vehicleName = data.name || imei;
        alertData.lat = lat;
        alertData.lng = lng;
        alertData.timestamp = new Date().toISOString();

        // Save to DB
        try {
          await db.insertAlertEvent(alert.id, imei, alertData);
        } catch (e) { /* DB error */ }

        // Broadcast alert via WebSocket
        broadcastWs({
          type: 'alert',
          data: {
            alertId: alert.id,
            alertName: alert.name,
            alertType: alert.type,
            ...alertData
          }
        });

        console.log(`[ALERT] ${alert.name} triggered for ${imei}: ${JSON.stringify(alertData)}`);
      }
    }
  } catch (err) {
    console.error(`[ALERTS] Error: ${err.message}`);
  }
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

app.get('/api/export/:imei', requireAuth, async (req, res) => {
  try {
    const { imei } = req.params;
    const from = req.query.from || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const to = req.query.to || new Date().toISOString();
    const history = await db.getDeviceHistory(imei, from, to);

    if (history.length === 0) {
      return res.status(404).json({ error: 'Nu sunt date pentru perioada selectata' });
    }

    // Collect all IO keys from all records
    const allIoKeys = new Set();
    for (const row of history) {
      if (row.io_data) {
        Object.keys(row.io_data).forEach(k => allIoKeys.add(k));
      }
    }
    const ioKeys = Array.from(allIoKeys).sort();

    // CSV header
    const baseHeaders = ['Data/Ora', 'Latitudine', 'Longitudine', 'Viteza (km/h)', 'Altitudine (m)', 'Unghi', 'Sateliti'];
    const headers = [...baseHeaders, ...ioKeys, 'Distanta parcursa (km)'];

    // Calculate stats
    let totalDistance = 0;
    let maxSpeed = 0;
    let movingTime = 0;
    let stoppedTime = 0;
    let stops = 0;
    let wasMoving = false;

    const rows = history.map((row, i) => {
      // Distance
      let dist = 0;
      if (i > 0) {
        dist = haversineDistance(
          history[i - 1].latitude, history[i - 1].longitude,
          row.latitude, row.longitude
        );
        totalDistance += dist;

        // Time calculation
        const timeDiff = (new Date(row.timestamp) - new Date(history[i - 1].timestamp)) / 1000;
        if (row.speed > 3) {
          movingTime += timeDiff;
          if (!wasMoving) wasMoving = true;
        } else {
          stoppedTime += timeDiff;
          if (wasMoving) { stops++; wasMoving = false; }
        }
      }

      if (row.speed > maxSpeed) maxSpeed = row.speed;

      const baseCols = [
        new Date(row.timestamp).toLocaleString('ro-RO'),
        row.latitude,
        row.longitude,
        row.speed,
        row.altitude,
        row.angle,
        row.satellites
      ];

      // IO data columns
      const ioCols = ioKeys.map(key => {
        const val = row.io_data?.[key];
        return val !== undefined ? val : '';
      });

      return [...baseCols, ...ioCols, totalDistance.toFixed(3)];
    });

    // Summary rows
    const avgSpeed = history.length > 0
      ? (history.reduce((sum, r) => sum + r.speed, 0) / history.length).toFixed(1)
      : 0;

    const formatTime = (seconds) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      return `${h}h ${m}m`;
    };

    const emptyIoCols = ioKeys.map(() => '');

    rows.push([]);
    rows.push(['=== SUMAR ===', '', '', '', '', '', '', ...emptyIoCols, '']);
    rows.push(['Total distanta (km)', totalDistance.toFixed(2), '', '', '', '', '', ...emptyIoCols, '']);
    rows.push(['Viteza medie (km/h)', avgSpeed, '', '', '', '', '', ...emptyIoCols, '']);
    rows.push(['Viteza maxima (km/h)', maxSpeed, '', '', '', '', '', ...emptyIoCols, '']);
    rows.push(['Timp in miscare', formatTime(movingTime), '', '', '', '', '', ...emptyIoCols, '']);
    rows.push(['Timp oprit', formatTime(stoppedTime), '', '', '', '', '', ...emptyIoCols, '']);
    rows.push(['Numar opriri', stops, '', '', '', '', '', ...emptyIoCols, '']);
    rows.push(['Perioada', `${new Date(from).toLocaleString('ro-RO')} - ${new Date(to).toLocaleString('ro-RO')}`, '', '', '', '', '', ...emptyIoCols, '']);
    rows.push(['Puncte GPS', history.length, '', '', '', '', '', ...emptyIoCols, '']);

    // Build CSV
    const escapeCsv = (val) => {
      const str = String(val ?? '');
      return str.includes(',') || str.includes('"') || str.includes('\n')
        ? `"${str.replace(/"/g, '""')}"`
        : str;
    };

    const csv = [
      headers.map(escapeCsv).join(','),
      ...rows.map(row => row.map(escapeCsv).join(','))
    ].join('\n');

    const filename = `traseu_${imei}_${new Date(from).toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('\uFEFF' + csv); // BOM for Excel UTF-8
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Debug API (doar admin) ───

app.get('/api/debug/log', requireAuth, requireAdmin, (req, res) => {
  res.json(debugLog);
});

app.get('/api/debug/raw/:imei', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { imei } = req.params;
    const limit = parseInt(req.query.limit) || 20;
    const result = await db.pool.query(
      'SELECT timestamp, latitude, longitude, altitude, angle, speed, satellites, priority, io_data, created_at FROM positions WHERE imei = $1 ORDER BY timestamp DESC LIMIT $2',
      [imei, limit]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════
// 3. WEBSOCKET — actualizări live către browser
// ══════════════════════════════════════════════
const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer });

wss.on('connection', (ws) => {
  console.log('[WS] Client conectat la live feed');

  // Trimite toate pozițiile curente la conectare
  const positions = Array.from(livePositions.values());
  ws.send(JSON.stringify({ type: 'init', data: positions }));

  ws.on('close', () => {
    console.log('[WS] Client deconectat');
  });
});

function broadcastWs(message) {
  const data = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(data);
    }
  });
}

// ══════════════════════════════════════════════
// 4. PORNIRE
// ══════════════════════════════════════════════
async function start() {
  // Inițializează baza de date
  await db.initDb();

  // Creează sau actualizează userul admin
  const adminPass = process.env.ADMIN_PASSWORD || 'admin123';
  const adminUser = await db.getUserByUsername('admin');
  if (!adminUser) {
    const hash = await bcrypt.hash(adminPass, 10);
    await db.createUser('admin', hash, 'admin');
    console.log('[AUTH] Utilizator admin creat');
  } else if (process.env.ADMIN_PASSWORD) {
    // Reseteaza parola admin la cea din env var
    const hash = await bcrypt.hash(adminPass, 10);
    await db.updateUserPassword(adminUser.id, hash);
    console.log('[AUTH] Parola admin actualizata din ADMIN_PASSWORD');
  }

  // Încarcă ultimele poziții din DB în memorie
  const lastPositions = await db.getLastPositions();
  const allDevices = await db.getDevices();
  const deviceInfoMap = {};
  for (const dev of allDevices) {
    deviceInfoMap[dev.imei] = { name: dev.name, vehicle_type: dev.vehicle_type, plate: dev.plate };
  }
  for (const pos of lastPositions) {
    const info = deviceInfoMap[pos.imei] || {};
    livePositions.set(pos.imei, {
      imei: pos.imei,
      timestamp: pos.timestamp,
      latitude: pos.latitude,
      longitude: pos.longitude,
      speed: pos.speed,
      angle: pos.angle,
      satellites: pos.satellites,
      io: pos.io_data,
      name: info.name || null,
      vehicle_type: info.vehicle_type || null,
      plate: info.plate || null
    });
  }
  console.log(`[DB] ${lastPositions.length} dispozitive încărcate din istoric`);

  // Pornește serverul TCP
  tcpServer.listen(ACTUAL_TCP_PORT, () => {
    console.log(`[TCP] Server activ pe portul ${ACTUAL_TCP_PORT} — aștept dispozitive Teltonika`);
  });

  // Pornește serverul HTTP + WebSocket
  httpServer.listen(ACTUAL_HTTP_PORT, () => {
    console.log(`[HTTP] Interfață web pe portul ${ACTUAL_HTTP_PORT}`);
    console.log(`[WS] WebSocket activ`);
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('  GPS Tracker Server — PORNIT');
    console.log(`  TCP (dispozitive): port ${ACTUAL_TCP_PORT}`);
    console.log(`  HTTP (hartă):      port ${ACTUAL_HTTP_PORT}`);
    console.log('═══════════════════════════════════════');
  });
}

start().catch((err) => {
  console.error('Eroare la pornire:', err);
  process.exit(1);
});
