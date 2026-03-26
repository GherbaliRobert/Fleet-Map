// server.js — Serverul principal: TCP (dispozitive) + HTTP (interfață web) + WebSocket (live)
const net = require('net');
const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const path = require('path');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcryptjs');
const { parseAvlPacket } = require('./codec8e');
const db = require('./db');

// ─── Configurare ───
const HTTP_PORT = parseInt(process.env.PORT || '3000');
const TCP_PORT = parseInt(process.env.RAILWAY_TCP_PROXY_PORT || process.env.TCP_PORT || '5027');

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

      // Salvează în baza de date
      await db.insertPositions(imei, parsed.records);

      // Actualizează poziția live
      const lastRecord = parsed.records[parsed.records.length - 1];
      if (lastRecord && lastRecord.gps.latitude !== 0) {
        const liveData = {
          imei,
          timestamp: lastRecord.timestamp,
          latitude: lastRecord.gps.latitude,
          longitude: lastRecord.gps.longitude,
          speed: lastRecord.gps.speed,
          angle: lastRecord.gps.angle,
          satellites: lastRecord.gps.satellites,
          io: lastRecord.io
        };
        livePositions.set(imei, liveData);

        // Trimite update live prin WebSocket
        broadcastWs({ type: 'position', data: liveData });
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
app.get('/api/live', requireAuth, (req, res) => {
  const positions = Array.from(livePositions.values());
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
    res.json({ ok: true });
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
  for (const pos of lastPositions) {
    livePositions.set(pos.imei, {
      imei: pos.imei,
      timestamp: pos.timestamp,
      latitude: pos.latitude,
      longitude: pos.longitude,
      speed: pos.speed,
      angle: pos.angle,
      satellites: pos.satellites,
      io: pos.io_data
    });
  }
  console.log(`[DB] ${lastPositions.length} dispozitive încărcate din istoric`);

  // Pornește serverul TCP
  tcpServer.listen(TCP_PORT, () => {
    console.log(`[TCP] Server activ pe portul ${TCP_PORT} — aștept dispozitive Teltonika`);
  });

  // Pornește serverul HTTP + WebSocket
  httpServer.listen(HTTP_PORT, () => {
    console.log(`[HTTP] Interfață web pe portul ${HTTP_PORT}`);
    console.log(`[WS] WebSocket activ`);
    console.log('');
    console.log('═══════════════════════════════════════');
    console.log('  GPS Tracker Server — PORNIT');
    console.log(`  TCP (dispozitive): port ${TCP_PORT}`);
    console.log(`  HTTP (hartă):      port ${HTTP_PORT}`);
    console.log('═══════════════════════════════════════');
  });
}

start().catch((err) => {
  console.error('Eroare la pornire:', err);
  process.exit(1);
});
