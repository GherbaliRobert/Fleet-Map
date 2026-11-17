// test_agents.js — unit tests pentru agenții AI (fără server/rețea).
// Acoperă RA Watch (offline / ralanti / tahograf neconfigurat) și RA Care (service).
// Notă: buildCtx suprascrie ctx.hist cu db.getDeviceHistory → mock-uim db.getDeviceHistory, NU ctx.hist.
const agents = require('./agents.js');
let pass = 0, fail = 0;
function ok(c, m, d) { if (c) { pass++; console.log('  PASS ' + m); } else { fail++; console.log('  FAIL ' + m + (d !== undefined ? '  → ' + d : '')); } }

const NOW = Date.parse('2026-06-15T12:00:00Z');
const realNow = Date.now;

async function watch(base) { return agents.runAgent('watch', base); }
async function care(base) { return agents.runAgent('care', base); }
function has(r, prefix) { return (r.findings || []).some(f => f.fkey && f.fkey.startsWith(prefix)); }

(async () => {
  // Fixăm „acum" ca testele să fie deterministe (agenții folosesc Date.now()).
  Date.now = () => NOW;

  console.log('\n— RA Watch: offline —');
  {
    const live = new Map([['OFF1', { name: 'Dubă', timestamp: new Date(NOW - 90 * 60000).toISOString(), io: { ignition: 0 } }]]);
    const base = { imeis: ['OFF1'], livePositions: live, db: { getDeviceHistory: async () => [], getDeviceFull: async () => ({ vehicle_type: 'Autoturism' }) } };
    const r = await watch(base);
    ok(has(r, 'offline_'), 'vehicul fără semnal de 90 min → finding offline_');
  }
  {
    const live = new Map([['ON1', { name: 'Dubă', timestamp: new Date(NOW - 2 * 60000).toISOString(), io: { ignition: 1 } }]]);
    const base = { imeis: ['ON1'], livePositions: live, db: { getDeviceHistory: async () => [], getDeviceFull: async () => ({ vehicle_type: 'Autoturism' }) } };
    const r = await watch(base);
    ok(!has(r, 'offline_'), 'vehicul activ acum 2 min → FĂRĂ finding offline_');
  }

  console.log('\n— RA Watch: ralanti prelungit —');
  {
    // 140 min de ignition=1, speed=0, puncte la 2 min (fără gap > 5 min) → peste pragul 120 min
    const hist = [];
    for (let m = 0; m <= 140; m += 2) hist.push({ timestamp: new Date(NOW - (140 - m) * 60000).toISOString(), speed: 0, io_data: { ignition: 1 } });
    const live = new Map([['IDL1', { name: 'Camion', timestamp: new Date(NOW).toISOString(), io: { ignition: 1 } }]]);
    const base = { imeis: ['IDL1'], livePositions: live, db: { getDeviceHistory: async () => hist, getDeviceFull: async () => ({ vehicle_type: 'Autoturism' }) } };
    const r = await watch(base);
    ok(has(r, 'idle_'), 'ralanti continuu 140 min → finding idle_');
  }

  console.log('\n— RA Watch: tahograf neconfigurat (camion online, fără IO tahograf) —');
  {
    const hist = [
      { timestamp: new Date(NOW - 5 * 60000).toISOString(), io_data: { ignition: 1 } },
      { timestamp: new Date(NOW - 3 * 60000).toISOString(), io_data: { ignition: 1 } },
      { timestamp: new Date(NOW - 1 * 60000).toISOString(), io_data: { ignition: 1 } },
    ];
    const live = new Map([['TG1', { name: 'MAN TGS', timestamp: new Date(NOW).toISOString(), io: { ignition: 1 } }]]);
    const base = { imeis: ['TG1'], livePositions: live, db: { getDeviceHistory: async () => hist, getDeviceFull: async () => ({ vehicle_type: 'Camion' }) } };
    const r = await watch(base);
    ok(has(r, 'tacho_missing_'), 'camion + contact ON + 0 IO tahograf → finding tacho_missing_');
  }
  {
    // Același scenariu dar CU semnal tahograf (io_192) → NU trebuie să alerteze
    const hist = [
      { timestamp: new Date(NOW - 5 * 60000).toISOString(), io_data: { ignition: 1, io_192: 12345 } },
      { timestamp: new Date(NOW - 3 * 60000).toISOString(), io_data: { ignition: 1, io_192: 12350 } },
      { timestamp: new Date(NOW - 1 * 60000).toISOString(), io_data: { ignition: 1, io_192: 12355 } },
    ];
    const live = new Map([['TG2', { name: 'MAN TGS', timestamp: new Date(NOW).toISOString(), io: { ignition: 1, io_192: 12355 } }]]);
    const base = { imeis: ['TG2'], livePositions: live, db: { getDeviceHistory: async () => hist, getDeviceFull: async () => ({ vehicle_type: 'Camion' }) } };
    const r = await watch(base);
    ok(!has(r, 'tacho_missing_'), 'camion CU IO tahograf → FĂRĂ finding tacho_missing_');
  }

  console.log('\n— RA Care: distanță până la service —');
  {
    const live = new Map([['SRV1', { name: 'Camion', timestamp: new Date(NOW).toISOString(), io: { can_distance_to_service: -80 } }]]);
    const base = { imeis: ['SRV1'], livePositions: live, companyId: 1, db: { getDeviceHistory: async () => [], getDeviceFull: async () => ({ vehicle_type: 'Camion' }) } };
    const r = await care(base);
    const f = (r.findings || []).find(x => x.fkey && x.fkey.startsWith('care_service_'));
    ok(f && /DEP[ĂA]ȘIT|dep[ăa]șit/i.test(f.title), 'service depășit (-80 km) → finding critic');
  }
  {
    const live = new Map([['SRV2', { name: 'Camion', timestamp: new Date(NOW).toISOString(), io: { can_distance_to_service: 50000 } }]]);
    const base = { imeis: ['SRV2'], livePositions: live, companyId: 1, db: { getDeviceHistory: async () => [], getDeviceFull: async () => ({ vehicle_type: 'Camion' }) } };
    const r = await care(base);
    ok(!has(r, 'care_service_'), 'service departe (50.000 km) → FĂRĂ finding');
  }

  console.log('\n— Cifrele din textele agenților, românește (17.11: RA Client scria „Azi: 1240 km") —');
  {
    ok(agents.nrRo(1240) === '1.240' && agents.nrRo(123456.7) === '123.457' && agents.nrRo(999) === '999' && agents.nrRo(-1500) === '-1.500',
      'nrRo: punctul miilor („1.240", „123.457", „-1.500")');
    ok(agents.nrRo(12.46, 1) === '12,5' && agents.nrRo(-0.04, 1) === '0,0' && agents.nrRo(1234567.89, 1) === '1.234.567,9', 'nrRo: virgula zecimalelor („12,5")');
    const live = new Map([['SRV3', { name: 'B 77 TIR', timestamp: new Date(NOW).toISOString(), io: { can_distance_to_service: -1240 } }]]);
    const base = { imeis: ['SRV3'], livePositions: live, companyId: 1, db: { getDeviceHistory: async () => [], getDeviceFull: async () => ({ vehicle_type: 'Camion' }) } };
    const r = await care(base);
    const f = (r.findings || []).find(x => x.fkey && x.fkey.startsWith('care_service_'));
    ok(f && f.title === 'B 77 TIR: service DEPĂȘIT cu 1.240 km', 'RA Care: „service DEPĂȘIT cu 1.240 km"', f && f.title);
    // Nicio cifră lipită direct în text fără nrRo (Math.round(...) + ' km' / ' L' / ' min' / ' lei', toFixed(...) + ' L').
    const SRC = require('fs').readFileSync(require('path').join(__dirname, 'agents.js'), 'utf8');
    const lipite = SRC.match(/(Math\.round\([^;]*?\)|toFixed\(\d\)) \+ ' (km|L|min|lei|h)\b/g) || [];
    ok(lipite.length === 0, 'textele agenților trec cifrele prin nrRo' + (lipite.length ? ': ' + lipite.join(' | ') : ''));
  }

  Date.now = realNow;
  console.log('\nRESULT: ' + pass + ' pass / ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
})().catch(e => { Date.now = realNow; console.error('ERR', e.message); process.exit(1); });
