// tacho.js — parser BEST-EFFORT pentru fișiere tahograf .DDD (card șofer, Gen1/1B).
// ATENȚIE: scris după specificația UE FĂRĂ fișier real de test → de validat/ajustat pe date reale.
// Structură card: blocuri TLV [FID(2)][type(1)][len(2)][value]. type 0x00=date, 0x01=semnătură.

const FID_IDENTIFICATION = 0x0520;
const FID_DRIVER_ACTIVITY = 0x0504;
const FID_VEHICLES_USED = 0x0505;

const ACT = ['rest', 'available', 'work', 'driving']; // 00,01,10,11

function readBlocks(buf) {
  const blocks = []; let p = 0, guard = 0;
  while (p + 5 <= buf.length && guard++ < 5000) {
    const fid = buf.readUInt16BE(p), type = buf[p + 2], len = buf.readUInt16BE(p + 3), start = p + 5;
    if (start + len > buf.length) break;
    if (type === 0x00) blocks.push({ fid, value: buf.slice(start, start + len) });
    p = start + len;
  }
  return blocks;
}

function printableName(buf) {
  // extrage cea mai lungă secvență ASCII printabilă (best-effort pt. numele titularului)
  let best = '', cur = '';
  for (const b of buf) {
    if (b >= 32 && b <= 126) cur += String.fromCharCode(b);
    else { if (cur.trim().length > best.trim().length) best = cur; cur = ''; }
  }
  if (cur.trim().length > best.trim().length) best = cur;
  return best.replace(/\s+/g, ' ').trim().slice(0, 60) || null;
}

function parseActivity(buf) {
  if (buf.length < 6) return [];
  const newest = buf.readUInt16BE(2);
  const ring = buf.slice(4);
  const days = []; const seen = new Set();
  let pos = newest;
  for (let n = 0; n < 90; n++) {
    if (pos < 0 || pos + 12 > ring.length || seen.has(pos)) break;
    seen.add(pos);
    const prevLen = ring.readUInt16BE(pos), recLen = ring.readUInt16BE(pos + 2);
    const dateRaw = ring.readUInt32BE(pos + 4), distance = ring.readUInt16BE(pos + 10);
    if (recLen < 12 || pos + recLen > ring.length) break;
    const changes = [];
    for (let o = pos + 12; o + 2 <= pos + recLen; o += 2) {
      const w = ring.readUInt16BE(o);
      changes.push({ slot: (w >> 15) & 1, activity: (w >> 11) & 0x03, minutes: w & 0x07FF });
    }
    const date = (dateRaw > 0 && dateRaw < 4102444800) ? new Date(dateRaw * 1000).toISOString().slice(0, 10) : null;
    days.push({ date, distance, changes });
    if (!prevLen) break;
    pos -= prevLen;
    if (pos < 0) pos += ring.length; // buffer ciclic
  }
  return days.reverse();
}

function dayStats(day) {
  const ch = day.changes.filter(c => c.slot === 0).sort((a, b) => a.minutes - b.minutes);
  const dur = { rest: 0, available: 0, work: 0, driving: 0 };
  let maxCont = 0, cont = 0;
  for (let i = 0; i < ch.length; i++) {
    const startMin = ch[i].minutes, endMin = (i + 1 < ch.length) ? ch[i + 1].minutes : 1440;
    const d = Math.max(0, Math.min(1440, endMin) - startMin);
    const act = ACT[ch[i].activity]; dur[act] += d;
    if (ch[i].activity === 3) { cont += d; if (cont > maxCont) maxCont = cont; }
    else if (ch[i].activity === 0 && d >= 45) cont = 0;
  }
  return { date: day.date, distanceKm: day.distance, drivingMin: dur.driving, workMin: dur.work, availMin: dur.available, restMin: dur.rest, maxContDriveMin: maxCont };
}

function infringements(stats) {
  const out = [];
  for (const s of stats) {
    if (s.drivingMin > 540) out.push({ date: s.date, rule: 'Conducere zilnică > 9h', value: Math.round(s.drivingMin) + ' min' });
    if (s.maxContDriveMin > 270) out.push({ date: s.date, rule: 'Conducere continuă > 4h30 fără pauză 45min', value: Math.round(s.maxContDriveMin) + ' min' });
    if (s.restMin > 0 && s.restMin < 9 * 60 && (s.drivingMin + s.workMin) > 60) out.push({ date: s.date, rule: 'Odihnă zilnică < 9h', value: Math.round(s.restMin) + ' min' });
  }
  return out;
}

function parse(buf) {
  const result = { kind: 'necunoscut', driverName: null, days: [], totals: {}, infringements: [], parseNote: null };
  try {
    const blocks = readBlocks(buf);
    if (!blocks.length) { result.parseNote = 'Structură nerecunoscută (posibil fișier VU sau format necunoscut).'; return result; }
    const idBlock = blocks.find(b => b.fid === FID_IDENTIFICATION);
    const actBlock = blocks.find(b => b.fid === FID_DRIVER_ACTIVITY);
    if (idBlock) result.driverName = printableName(idBlock.value.slice(0, 140));
    if (!actBlock) { result.kind = blocks.length ? 'card (fără date activitate)' : 'necunoscut'; result.parseNote = 'Nu am găsit EF_Driver_Activity_Data (0x0504).'; return result; }
    result.kind = 'card șofer';
    const rawDays = parseActivity(actBlock.value);
    const stats = rawDays.filter(d => d.date).map(dayStats);
    result.days = stats;
    result.infringements = infringements(stats);
    const totDrive = stats.reduce((s, d) => s + d.drivingMin, 0), totWork = stats.reduce((s, d) => s + d.workMin, 0);
    const totRest = stats.reduce((s, d) => s + d.restMin, 0), totKm = stats.reduce((s, d) => s + (d.distanceKm || 0), 0);
    result.totals = { zile: stats.length, conducereMin: totDrive, muncaMin: totWork, odihnaMin: totRest, km: totKm, infractiuni: result.infringements.length };
    if (stats.length) { result.periodFrom = stats[0].date; result.periodTo = stats[stats.length - 1].date; }
    if (!stats.length) result.parseNote = 'Fișier citit, dar fără înregistrări zilnice valide (de validat structura pe fișier real).';
  } catch (e) {
    result.parseNote = 'Eroare la parsare (best-effort): ' + e.message;
  }
  return result;
}

module.exports = { parse };
