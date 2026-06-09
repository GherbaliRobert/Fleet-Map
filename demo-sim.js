// demo-sim.js — simulează vehicule care se mișcă pe hartă pentru COMPANIA DEMO.
// Generează poziții live periodice (fără hardware), ca prospecții să vadă aplicația „vie".
const DEMO_IMEIS = ['DEMO0001', 'DEMO0002', 'DEMO0003', 'DEMO0004', 'DEMO0005'];
// bucle simple în jurul unor orașe din România
const ROUTES = [
  { city: 'București', center: [44.4268, 26.1025], r: 0.055 },
  { city: 'Cluj-Napoca', center: [46.7712, 23.6236], r: 0.045 },
  { city: 'Timișoara', center: [45.7489, 21.2087], r: 0.050 },
  { city: 'Iași', center: [47.1585, 27.6014], r: 0.045 },
  { city: 'Brașov', center: [45.6427, 25.5887], r: 0.040 }
];

let started = false;
function start({ livePositions, broadcastWs, insertPositions }) {
  if (started) return;
  started = true;
  const phase = {};
  // fază inițială deterministă (fără Math.random la boot, dar variată per index)
  DEMO_IMEIS.forEach((imei, i) => { phase[imei] = (i * 1.7) % (Math.PI * 2); });
  let tick = 0;
  setInterval(async () => {
    tick++;
    for (let i = 0; i < DEMO_IMEIS.length; i++) {
      const imei = DEMO_IMEIS[i];
      const route = ROUTES[i % ROUTES.length];
      phase[imei] += 0.05 + i * 0.004;
      const ph = phase[imei];
      const lat = route.center[0] + route.r * Math.cos(ph);
      const lng = route.center[1] + route.r * Math.sin(ph) * 1.4;
      const speed = 28 + Math.round(22 * Math.abs(Math.sin(ph * 1.3)));
      const angle = Math.round(((ph * 180 / Math.PI) % 360 + 360) % 360);
      const ts = new Date().toISOString();
      const fuel = 220 - (tick % 200);
      const io = { ignition: 1, can_fuel_level_liters: fuel, can_vehicle_speed: speed };
      const pos = {
        imei, timestamp: ts, latitude: lat, longitude: lng, speed, angle, satellites: 12, io,
        name: route.city, vehicle_type: 'truck', plate: 'DEMO-' + (i + 1)
      };
      livePositions.set(imei, pos);
      try { broadcastWs({ type: 'position', data: pos }); } catch (e) { /* ignore */ }
      // persistă rar, ca să existe istoric/rute pentru demo
      if (tick % 5 === 0) {
        try { await insertPositions(imei, [{ timestamp: ts, gps: { latitude: lat, longitude: lng, altitude: 110, angle, speed, satellites: 12 }, priority: 0, io }]); }
        catch (e) { /* ignore */ }
      }
    }
  }, 3000);
  console.log('[DEMO] Simulator pornit (' + DEMO_IMEIS.length + ' vehicule demo, la 3s)');
}

module.exports = { start, DEMO_IMEIS, ROUTES };
