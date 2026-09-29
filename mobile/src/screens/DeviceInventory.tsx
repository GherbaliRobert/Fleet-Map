import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { App as CapApp } from '@capacitor/app';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { stareAparat, momentMs, type StareAparat } from '../lib/semnal';
import { salveazaPostDeLaServer, numeBrand } from '../lib/descarcaPost';
import { AntetFondator } from '../components/FondatorUi';
import './admin.css';
import './detail.css'; // .sheet*
import './fondator.css';

// „Inventar dispozitive" (Gestiune) — registrul aparatelor NOASTRE, din toate firmele, ca pe web (_invRender):
// firmă, număr, IMEI, model, cartelă SIM, semnal, ultima transmisie. Căutare, ordonare, contor, avertismentul
// „⚠ N fără model/SIM" care lasă pe ecran doar aparatele incomplete, și exportul făcut de SERVER cu exact
// rândurile de pe ecran (nume brandat + logo, trecut prin sendReport). Pe fiecare rând, creionul deschide o foaie
// cu modelul și cartela — salvate pe /details, care schimbă doar câmpurile trimise (NU pe PUT /devices/:imei,
// care rescrie numele și numărul). Ruta e doar pentru super-admin; serverul scrie modelul/SIM-ul doar de la noi.
type Col = { k: string; label: string };
const COLS: Col[] = [
  { k: 'company_name', label: 'Firmă' },
  { k: 'plate', label: 'Nr. înmatriculare' },
  { k: 'imei', label: 'IMEI' },
  { k: 'gps_model', label: 'Model dispozitiv' },
  { k: 'sim_number', label: 'Cartelă SIM' },
  { k: 'semnal', label: 'Semnal' },
  { k: 'last_tx', label: 'Ultima transmisie' },
];
const semnal = (r: any): StareAparat => stareAparat(r.last_tx);
const culoare = (s: StareAparat) => (s.k === 'ok' ? 'var(--fd-ok)' : s.k === 'tacut' ? 'var(--fd-warn)' : 'var(--fd-bad)');
const data = (t: any) => { const ms = momentMs(t); return isFinite(ms) ? new Date(ms).toLocaleString('ro-RO') : '—'; };
function val(r: any, k: string): string {
  if (k === 'plate') return r.plate || r.name || '';
  if (k === 'semnal') return semnal(r).t;
  if (k === 'last_tx') return data(r.last_tx);
  return r[k] == null ? '' : String(r[k]);
}
const lipsa = (r: any) => !r.gps_model || !r.sim_number;
const PAS = 200;

export function DeviceInventory() {
  const loc = useLocation();
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [doarLipsa, setDoarLipsa] = useState(false);
  const [sort, setSort] = useState<{ k: string; dir: 1 | -1 }>({ k: 'company_name', dir: 1 });
  const [cate, setCate] = useState(PAS);
  const [exp, setExp] = useState('');
  const [ed, setEd] = useState<any | null>(null);
  const [fm, setFm] = useState({ gps_model: '', sim_number: '' });
  const [saving, setSaving] = useState(false);

  // O reîmprospătare din fundal care cade (rețea) nu șterge lista bună de pe ecran; doar prima încărcare arată eroarea.
  const areLista = useRef(false);
  function reload(tacut = false) {
    if (!tacut) setErr('');
    Api.deviceInventory().then((d) => { areLista.current = true; setRows(Array.isArray(d) ? d : []); setErr(''); })
      .catch((e: any) => {
        if (tacut && areLista.current) return;
        setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare de rețea.')); setRows((r) => r || []);
      });
  }
  // Semnalul se împrospătează la 60 de secunde cât stai pe ecran (ca pe web) și la revenirea în aplicație.
  useEffect(() => {
    reload();
    const t = setInterval(() => reload(true), 60000);
    const h = CapApp.addListener('appStateChange', ({ isActive }) => { if (isActive) reload(true); });
    return () => { clearInterval(t); h.then((x) => x.remove()); };
  }, []);

  const toate = rows || [];
  const nrLipsa = toate.filter(lipsa).length;
  const filtrat = doarLipsa || !!q.trim();
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const out = toate.filter((r) => {
      if (doarLipsa && !lipsa(r)) return false;
      if (!t) return true;
      return COLS.some((c) => val(r, c.k).toLowerCase().indexOf(t) >= 0);
    });
    const { k, dir } = sort;
    return out.sort((a, b) => {
      // „Semnal" se ordonează după ultima transmisie, nu după cuvinte („3 zile" lângă „8 luni").
      if (k === 'last_tx' || k === 'semnal') return dir * ((momentMs(a.last_tx) || 0) - (momentMs(b.last_tx) || 0));
      return dir * val(a, k).localeCompare(val(b, k), 'ro', { numeric: true });
    });
  }, [rows, q, doarLipsa, sort]);

  function curata() { setQ(''); setDoarLipsa(false); setCate(PAS); }

  // Exportul descarcă EXACT rândurile de pe ecran, în ordinea de pe ecran. Numele (brandat) vine din antetul serverului.
  async function exporta(format: 'xlsx' | 'pdf') {
    if (exp) return;
    setExp(format);
    try {
      await salveazaPostDeLaServer('/api/device-inventory/export', { format, imeis: shown.map((r) => String(r.imei)) }, numeBrand('Inventar dispozitive', format));
    } catch (e: any) { showToast('Exportul nu a mers: ' + (e?.message || 'eroare'), true); }
    finally { setExp(''); }
  }

  function deschide(r: any) { setEd(r); setFm({ gps_model: r.gps_model || '', sim_number: r.sim_number || '' }); }
  async function salveaza() {
    if (!ed) return;
    setSaving(true);
    try {
      const b = { gps_model: fm.gps_model.trim() || null, sim_number: fm.sim_number.trim() || null };
      await Api.updateDeviceDetails(ed.imei, b);
      setRows((cur) => (cur || []).map((x) => (x.imei === ed.imei ? { ...x, ...b } : x)));
      showToast('Salvat');
      setEd(null);
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); } finally { setSaving(false); }
  }

  const miss = 'color:var(--text-muted);font-style:italic';

  return (
    <div class="screen">
      <AntetFondator titlu="Inventar dispozitive" onBack={() => loc.route('/meniu')} onRefresh={() => reload()} />
      <div class="content has-tabbar" style="padding-bottom:24px">
        <input class="fd-search" value={q} onInput={(e: any) => { setQ(e.target.value); setCate(PAS); }} placeholder="Caută firmă / număr / IMEI / model / cartelă…" />
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px">
          <span style="font-size:12.5px;color:var(--text-muted);font-weight:700">
            {rows == null ? '…' : shown.length + (filtrat ? ' din ' + toate.length : '') + ' echipamente'}
          </span>
          {nrLipsa > 0 && (
            <button type="button" class={'fd-btn warn' + (doarLipsa ? ' on' : '')} onClick={() => { setDoarLipsa(!doarLipsa); setCate(PAS); }}>
              <Icon name="alert" size={14} /> {nrLipsa} fără model/SIM{doarLipsa ? ' · arăt doar pe astea' : ''}
            </button>
          )}
          {filtrat && <button type="button" class="fd-btn muted" onClick={curata}><Icon name="x" size={14} /> Șterge filtrele</button>}
        </div>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
          <label style="font-size:12px;color:var(--text-muted);font-weight:700;flex:0 0 auto">Ordonează după</label>
          <select value={sort.k} onChange={(e: any) => setSort({ k: e.target.value, dir: 1 })}
            style="flex:1;min-width:0;min-height:40px;background:var(--bg-panel);border:1px solid var(--border);color:var(--text-primary);border-radius:9px;padding:0 8px;font-size:14px;font-family:inherit">
            {COLS.map((c) => <option value={c.k}>{c.label}</option>)}
          </select>
          <button type="button" class="fd-btn" onClick={() => setSort({ k: sort.k, dir: sort.dir === 1 ? -1 : 1 })} aria-label="Schimbă sensul">
            {sort.dir === 1 ? '↑ crescător' : '↓ descrescător'}
          </button>
        </div>
        <div class="fd-acts" style="margin:0 0 12px">
          <button type="button" class="fd-btn primary" disabled={!!exp || !shown.length} onClick={() => exporta('xlsx')}><Icon name="download" size={14} /> {exp === 'xlsx' ? 'Se pregătește…' : 'Exportă Excel'}</button>
          <button type="button" class="fd-btn" disabled={!!exp || !shown.length} onClick={() => exporta('pdf')}><Icon name="download" size={14} /> {exp === 'pdf' ? 'Se pregătește…' : 'PDF'}</button>
        </div>

        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {rows == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {rows != null && !err && shown.length === 0 && <div class="adm-empty">Niciun dispozitiv{filtrat ? ' pentru filtrele curente.' : '.'}</div>}
        {shown.length > 0 && (
          <div class="fd-gr">
            {shown.slice(0, cate).map((r) => {
              const sg = semnal(r);
              return (
                <div class="fd-rand">
                  <span class="mid">
                    <div class="nm">{r.plate || r.name || '—'}</div>
                    <div class="sub">{r.company_name || '—'} · IMEI {r.imei}</div>
                    <div class="sub">Model: <span style={r.gps_model ? 'color:var(--text-secondary)' : miss}>{r.gps_model || 'necompletat'}</span></div>
                    <div class="sub">Cartelă SIM: <span style={r.sim_number ? 'color:var(--text-secondary)' : miss}>{r.sim_number || 'necompletat'}</span></div>
                    <div class="sub"><b style={'color:' + culoare(sg)}>{sg.t}</b> · {data(r.last_tx)}</div>
                  </span>
                  <span class="rt">
                    <button type="button" class="fd-btn" onClick={() => deschide(r)} aria-label="Completează modelul și cartela SIM"><Icon name="edit" size={15} /></button>
                  </span>
                </div>
              );
            })}
            {shown.length > cate && (
              <button type="button" class="fd-inca" style="width:100%;text-align:left;background:transparent;border:none;font-family:inherit" onClick={() => setCate(cate + PAS)}>
                și încă {shown.length - cate} — caută, sau atinge aici ca să le arăt
              </button>
            )}
          </div>
        )}
        <div class="fd-note" style="margin-top:12px">
          Modelul dispozitivului și cartela SIM le completăm NOI — nu vin de la aparat. Apasă creionul de pe un rând ca să le scrii.
          Semnalul și lista se împrospătează la 60 de secunde; „Exportă" descarcă exact rândurile de pe ecran.
        </div>
      </div>

      {ed && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !saving) setEd(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="cpu" size={18} color="var(--accent)" /> {ed.plate || ed.name || ed.imei}</b><button class="h-btn" onClick={() => setEd(null)} aria-label="Închide"><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div style="font-size:12.5px;color:var(--text-muted)">{ed.company_name || 'Fără firmă'} · IMEI {ed.imei}</div>
                <div class="fld"><label>Model dispozitiv</label><input value={fm.gps_model} placeholder="ex. Teltonika FMC130" onInput={(e: any) => setFm({ ...fm, gps_model: e.target.value })} /></div>
                <div class="fld"><label>Cartelă SIM</label><input value={fm.sim_number} inputMode="tel" placeholder="ex. 0740111222" onInput={(e: any) => setFm({ ...fm, sim_number: e.target.value })} /></div>
                <div style="font-size:11.5px;color:var(--text-muted);line-height:1.45">Se schimbă doar modelul și cartela; numele și numărul mașinii rămân cum sunt.</div>
                <div class="frm-actions"><button class="btn btn-primary" disabled={saving} onClick={salveaza}>{saving ? 'Se salvează…' : 'Salvează'}</button></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
