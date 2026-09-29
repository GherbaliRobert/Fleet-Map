// Fișa mașinii → „Sonda combustibil" (calibrare voltaj → litri) și „Sonde (avansat)" — aceleași file ca
// pe web (public/index.html → #edit-tab-calibration, #edit-tab-sensors, FUEL_PRESETS, collectFuelSensors).
//
// Capcana de pierdere de date: PUT /tank-calibration și PUT /fuel-sensors ÎNLOCUIESC lista întreagă. Web-ul le
// trimite mereu, dar el are câmpurile deja umplute. Pe telefon se trimit DOAR după ce secțiunea a fost
// încărcată din server ȘI omul a schimbat ceva în ea — un apel făcut orbește ar șterge calibrarea.
import { Icon } from './Icon';

// Variantele de sondă — COPIE a listei FUEL_PRESETS din public/index.html (serverul nu are încă un catalog).
// Dacă schimbi o variantă, schimb-o în AMBELE locuri.
export const FUEL_PRESETS: { v: string; label: string; source: string; mode: 'direct' | 'calibration' }[] = [
  { v: 'escort_ain1', label: 'Escort analogic (AIN1)', source: 'analog_input_1', mode: 'calibration' },
  { v: 'escort_ain2', label: 'Escort analogic (AIN2)', source: 'analog_input_2', mode: 'calibration' },
  { v: 'dominator_lls1', label: 'EuroSens Dominator — LLS 1 (digital)', source: 'lls_fuel_level_1', mode: 'direct' },
  { v: 'dominator_lls2', label: 'EuroSens Dominator — LLS 2 (digital)', source: 'lls_fuel_level_2', mode: 'direct' },
  { v: 'escort_ble1', label: 'Escort TD-BLE — sondă 1', source: 'ble_fuel_level_1', mode: 'direct' },
  { v: 'escort_ble2', label: 'Escort TD-BLE — sondă 2', source: 'ble_fuel_level_2', mode: 'direct' },
  { v: 'degree_lvl1', label: 'EuroSens Degree BLE — nivel 1', source: 'ble_fuel_level_1', mode: 'direct' },
  { v: 'degree_freq1', label: 'EuroSens Degree BLE — frecvență 1', source: 'ble_fuel_frequency_1', mode: 'calibration' },
  { v: 'can', label: 'CAN (J1939)', source: 'can_fuel_level_liters', mode: 'direct' },
  { v: 'generic', label: 'Generic / personalizat', source: '', mode: 'direct' },
];
export const FUEL_SOURCES = ['analog_input_1', 'analog_input_2', 'lls_fuel_level_1', 'lls_fuel_level_2', 'ble_fuel_level_1', 'ble_fuel_level_2', 'ble_fuel_level_3', 'ble_fuel_level_4', 'ble_fuel_frequency_1', 'ble_fuel_frequency_2', 'ble_fuel_frequency_3', 'ble_fuel_frequency_4', 'can_fuel_level_liters', 'fms_fuel_level'];

function presetDin(source: string, mode: string): string {
  const p = FUEL_PRESETS.find((x) => x.source && x.source === source && x.mode === (mode || 'direct'));
  return p ? p.v : 'generic';
}
// Numele pe înțeles al sursei, pentru foaia „Senzori" (fără „analog_input_1" în fața clientului, când se poate).
export function numeSursa(source: string, mode: string): string {
  const p = FUEL_PRESETS.find((x) => x.source && x.source === source && x.mode === (mode || 'direct'))
    || FUEL_PRESETS.find((x) => x.source && x.source === source);
  return p ? p.label : (source || '—');
}

const num = (s: any) => { const n = parseFloat(String(s == null ? '' : s).replace(',', '.')); return isNaN(n) ? null : n; };

// ─── Sonda simplă: perechi Voltaj (V) → Litri ───
export type RandCal = { v: string; l: string };
// /full → tank_calibration poate veni ca text JSON sau ca listă.
export function calibDinFull(raw: any): { voltage: number; liters: number }[] {
  let a: any = raw;
  if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = null; } }
  if (!Array.isArray(a)) return [];
  return a.filter((p) => p && p.voltage != null && p.liters != null).map((p) => ({ voltage: Number(p.voltage), liters: Number(p.liters) }));
}
export function calibDeTrimis(rows: RandCal[]): { voltage: number; liters: number }[] {
  const out: { voltage: number; liters: number }[] = [];
  for (const r of rows) { const v = num(r.v), l = num(r.l); if (v != null && l != null) out.push({ voltage: v, liters: l }); }
  return out.sort((a, b) => a.voltage - b.voltage); // interpolarea cere punctele în ordinea voltajului
}

// ─── Sonde (avansat) ───
export interface SondaEdit { name: string; source: string; mode: 'direct' | 'calibration'; capacity: string; cal: { raw: string; liters: string }[] }
export function sondeDinServer(list: any[]): SondaEdit[] {
  return (Array.isArray(list) ? list : []).map((s: any) => ({
    name: String((s && s.name) || ''),
    source: String((s && s.source) || ''),
    mode: s && s.mode === 'calibration' ? 'calibration' : 'direct',
    capacity: s && s.capacity != null ? String(s.capacity) : '',
    cal: (s && Array.isArray(s.calibration) ? s.calibration : []).map((c: any) => ({ raw: c.raw != null ? String(c.raw) : '', liters: c.liters != null ? String(c.liters) : '' })),
  }));
}
// Forma de pe web (collectFuelSensors): {name, source, mode, capacity, calibration?}. Fără sursă → nu se trimite.
export function sondeDeTrimis(list: SondaEdit[]): any[] {
  const out: any[] = [];
  for (const s of list) {
    const o: any = { name: s.name.trim(), source: s.source, mode: s.mode, capacity: num(s.capacity) };
    if (s.mode === 'calibration') {
      o.calibration = [];
      for (const c of s.cal) { const raw = num(c.raw), liters = num(c.liters); if (raw != null && liters != null) o.calibration.push({ raw, liters }); }
      o.calibration.sort((a: any, b: any) => a.raw - b.raw);
    }
    if (o.source) out.push(o);
  }
  return out;
}

const inp = 'min-height:44px;width:100%;box-sizing:border-box;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:10px;padding:0 10px;font-size:15px;font-family:inherit';
const info = 'background:var(--bg-dark);border-radius:10px;padding:10px 12px;margin-bottom:10px;font-size:12px;color:var(--text-muted);line-height:1.5';
const btnSec = 'min-height:44px;border-radius:10px;border:1px dashed var(--accent);background:transparent;color:var(--accent);font-weight:800;font-size:14px;font-family:inherit;display:inline-flex;align-items:center;justify-content:center;gap:6px;width:100%';
const btnDel = 'flex:0 0 auto;width:44px;height:44px;border-radius:10px;border:1px solid var(--border);background:var(--bg-card);color:var(--red);display:flex;align-items:center;justify-content:center';

// ─── Editorul „Sonda combustibil" ───
export function SondaSimplaForm({ rows, setRows }: { rows: RandCal[]; setRows: (r: RandCal[]) => void }) {
  const pune = (i: number, k: 'v' | 'l', val: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
  return (
    <div>
      <div style={info}>
        <Icon name="alert" size={13} color="var(--accent)" /> Calibrare sondă litrometrică (Escort TD-150 sau similar). Introdu perechi
        Voltaj (AIN1) → Litri. Exemplu: 0.5V = 0L, 1.2V = 10L etc. Sistemul folosește interpolare liniară.
      </div>
      {rows.map((r, i) => (
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px" key={i}>
          <input type="number" inputMode="decimal" step="0.01" placeholder="Voltaj (V)" value={r.v} style={inp}
            onInput={(e) => pune(i, 'v', (e.target as HTMLInputElement).value)} aria-label={'Voltaj punctul ' + (i + 1)} />
          <span style="color:var(--text-muted)">→</span>
          <input type="number" inputMode="decimal" step="0.1" placeholder="Litri" value={r.l} style={inp}
            onInput={(e) => pune(i, 'l', (e.target as HTMLInputElement).value)} aria-label={'Litri punctul ' + (i + 1)} />
          <button type="button" style={btnDel} onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label="Șterge punctul"><Icon name="trash" size={17} /></button>
        </div>
      ))}
      {!rows.length && <div style="font-size:12px;color:var(--orange);margin:2px 0 8px">Fără niciun punct, calibrarea se șterge la salvare.</div>}
      <button type="button" style={btnSec} onClick={() => setRows([...rows, { v: '', l: '' }])}><Icon name="plus" size={16} /> Adaugă punct</button>
      <div style={info + ';margin-top:10px;margin-bottom:0'}>
        <b style="color:var(--accent)">Exemplu calibrare VW T5 (rezervor 80 L):</b><br />
        0.5V=0L, 1.2V=10L, 2.0V=20L, 2.8V=30L, 3.6V=40L, 4.4V=50L, 5.1V=60L, 5.9V=70L, 6.7V=80L<br />
        Punctele se ordonează singure după voltaj, la salvare.
      </div>
    </div>
  );
}

// ─── Editorul „Sonde (avansat)" ───
export function SondeAvansatForm({ list, setList }: { list: SondaEdit[]; setList: (l: SondaEdit[]) => void }) {
  const schimba = (i: number, patch: Partial<SondaEdit>) => setList(list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const lbl = 'display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:700;color:var(--text-muted);margin-bottom:8px';
  return (
    <div>
      <div style={info}>
        <Icon name="alert" size={13} color="var(--accent)" /> Mapează sondele litrometrice / senzorii IoT (Escort, EuroSens Dominator,
        EuroSens Degree) la câmpurile dispozitivului. Nivelul normalizat (litri) e folosit în rapoarte, alerte și detecția de scădere combustibil.
      </div>
      {list.map((s, i) => {
        const pr = presetDin(s.source, s.mode);
        const surse = FUEL_SOURCES.includes(s.source) || !s.source ? FUEL_SOURCES : [s.source, ...FUEL_SOURCES];
        return (
          <div style="border:1px solid var(--border);border-radius:12px;padding:12px;margin-bottom:10px" key={i}>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <b style="flex:1;font-size:13.5px">{s.name.trim() || 'Sondă ' + (i + 1)}</b>
              <button type="button" style={btnDel} onClick={() => setList(list.filter((_, j) => j !== i))} aria-label="Scoate sonda"><Icon name="trash" size={17} /></button>
            </div>
            <label style={lbl}>Nume sondă
              <input style={inp} value={s.name} placeholder="ex: Rezervor principal" onInput={(e) => schimba(i, { name: (e.target as HTMLInputElement).value })} />
            </label>
            <label style={lbl}>Tip senzor
              <select style={inp} value={pr} onChange={(e) => {
                const p = FUEL_PRESETS.find((x) => x.v === (e.target as HTMLSelectElement).value); if (!p) return;
                schimba(i, p.source ? { source: p.source, mode: p.mode } : { mode: p.mode });
              }}>
                {FUEL_PRESETS.map((p) => <option value={p.v}>{p.label}</option>)}
              </select>
            </label>
            <label style={lbl}>Sursă (câmp)
              <select style={inp} value={s.source} onChange={(e) => schimba(i, { source: (e.target as HTMLSelectElement).value })}>
                {surse.map((src) => <option value={src}>{src}</option>)}
                <option value="">(altul)</option>
              </select>
            </label>
            <label style={lbl}>Mod
              <select style={inp} value={s.mode} onChange={(e) => schimba(i, { mode: (e.target as HTMLSelectElement).value === 'calibration' ? 'calibration' : 'direct' })}>
                <option value="direct">Direct (deja litri)</option>
                <option value="calibration">Calibrare (tabel)</option>
              </select>
            </label>
            <label style={lbl}>Capacitate (L)
              <input style={inp} type="number" inputMode="decimal" value={s.capacity} onInput={(e) => schimba(i, { capacity: (e.target as HTMLInputElement).value })} />
            </label>
            {!s.source && <div style="font-size:12px;color:var(--orange);margin-bottom:8px">Fără sursă, sonda nu se salvează.</div>}
            {s.mode === 'calibration' && (
              <div style="margin-top:4px">
                <div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Tabel calibrare — valoare brută (mV / Hz / etc.) → litri:</div>
                {s.cal.map((c, k) => (
                  <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px" key={k}>
                    <input type="number" inputMode="decimal" step="any" placeholder="brut" value={c.raw} style={inp}
                      onInput={(e) => schimba(i, { cal: s.cal.map((x, j) => (j === k ? { ...x, raw: (e.target as HTMLInputElement).value } : x)) })} />
                    <span style="color:var(--text-muted)">→</span>
                    <input type="number" inputMode="decimal" step="any" placeholder="litri" value={c.liters} style={inp}
                      onInput={(e) => schimba(i, { cal: s.cal.map((x, j) => (j === k ? { ...x, liters: (e.target as HTMLInputElement).value } : x)) })} />
                    <button type="button" style={btnDel} onClick={() => schimba(i, { cal: s.cal.filter((_, j) => j !== k) })} aria-label="Șterge punctul"><Icon name="trash" size={17} /></button>
                  </div>
                ))}
                <button type="button" style={btnSec} onClick={() => schimba(i, { cal: [...s.cal, { raw: '', liters: '' }] })}><Icon name="plus" size={16} /> punct</button>
              </div>
            )}
          </div>
        );
      })}
      <button type="button" style={btnSec} onClick={() => setList([...list, { name: '', source: '', mode: 'direct', capacity: '', cal: [] }])}>
        <Icon name="plus" size={16} /> Adaugă sondă
      </button>
    </div>
  );
}

// ─── Foaia „Senzori" din fișă (doar citire) ───
// Înainte citea câmpuri care nu există (type/id/io) și scria „—" pe fiecare rând.
export function SenzoriVedere({ sensors, calib }: { sensors: any[]; calib: { voltage: number; liters: number }[] }) {
  if (!sensors.length && !calib.length) return <div class="center-msg">Niciun senzor configurat pe acest vehicul.</div>;
  const kv = (k: string, v: any) => <div class="kv"><span class="k">{k}</span><span class="v">{v}</span></div>;
  return (
    <>
      {sensors.map((s: any, i: number) => {
        const cal = Array.isArray(s && s.calibration) ? s.calibration : [];
        return (
          <div style="margin-bottom:12px">
            <div style="font-size:13.5px;font-weight:800;margin:4px 0 2px;display:flex;align-items:center;gap:6px">
              <Icon name="droplet" size={15} color="var(--accent)" /> {(s && s.name) || 'Sondă ' + (i + 1)}
            </div>
            {kv('Tip', numeSursa(s && s.source, s && s.mode))}
            {s && s.source && numeSursa(s.source, s.mode) !== s.source ? kv('Sursă', s.source) : null}
            {kv('Mod', s && s.mode === 'calibration' ? 'Calibrare (tabel) · ' + cal.length + (cal.length === 1 ? ' punct' : ' puncte') : 'Direct (deja litri)')}
            {s && s.capacity ? kv('Capacitate', Number(s.capacity) + ' L') : null}
          </div>
        );
      })}
      {calib.length > 0 && (
        <div style="margin-bottom:6px">
          <div style="font-size:13.5px;font-weight:800;margin:4px 0 2px;display:flex;align-items:center;gap:6px">
            <Icon name="droplet" size={15} color="var(--accent)" /> Sondă (calibrare voltaj → litri)
          </div>
          {kv('Puncte de calibrare', calib.length)}
          {kv('Interval', Math.min(...calib.map((c) => c.voltage)) + ' – ' + Math.max(...calib.map((c) => c.voltage)) + ' V')}
          {kv('Litri la plin', Math.max(...calib.map((c) => c.liters)) + ' L')}
        </div>
      )}
    </>
  );
}
