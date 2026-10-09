import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { FmScreen, poartaFirma } from '../components/FirmaUi';
import { stareAparat, momentMs, TACUT_MIN, MUT_ORE } from '../lib/semnal';
import { salveazaPostDeLaServer, numeBrand } from '../lib/descarcaPost';

// „Aparate GPS" (web: Setări → Evidență), pentru adminul sau managerul firmei. Ecranul de ECHIPAMENTE, nu de
// mașini: pe hartă o mașină tăcută arată exact ca una parcată — aici se vede ce aparat a amuțit.
// Clientul NU înregistrează și NU modifică aparate (le punem noi), iar aparatele arhivate nu le vede (18.09):
// de aceea nu există fila „Arhivate", iar lista de mașini se cere fără ?includeArchived.
//
// De unde vin rândurile: DOAR din /api/devices — lista de mașini pe care serverul o filtrează deja pe firmă și
// pe mașinile atribuite contului. NU din /api/device-inventory: pe 24.09 ruta aceea nu filtra pe firmă și
// întorcea aparatele TUTUROR firmelor (reparat pe server pe 29.09 — filtrează pe firmă și pe mașinile contului).
// Oricum, /api/devices are deja tot ce trebuie aici (model, cartelă, stare,
// ultima poziție și last_seen); „ultima transmisie" o socotim ca serverul: cea mai nouă dintre cele două.
// Exportul cere pe nume exact rândurile de pe ecran, deci primește înapoi doar aparatele contului.
export function AparateGps() {
  const p = poartaFirma('manageFleet', 'Aparate GPS', 'Aparatele stau pe firme',
    'La noi, aparatele tuturor firmelor stau în Platformă → Dispozitive, cu semnalul fiecăruia.');
  if (p) return p;
  return <AparateGpsEcran />;
}

const fmtCand = (v: unknown) => {
  const t = typeof v === 'number' ? v : Date.parse(String(v || ''));
  return v && isFinite(t) ? new Date(t).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
};
// „Ultima transmisie" = cea mai nouă dintre ultima poziție și ultima conectare (last_seen, pentru aparatele
// care s-au conectat dar n-au trimis încă nicio poziție) — aceeași regulă ca în inventarul de pe server.
function ultimaTransmisie(d: any): number | null {
  const t = Math.max(momentMs(d && d.last_position_time) || 0, momentMs(d && d.last_seen) || 0);
  return t > 0 ? t : null;
}
const randAparat = (d: any) => ({
  imei: String(d.imei), plate: d.plate || null, name: d.name || null,
  gps_model: d.gps_model || null, sim_number: d.sim_number || null, status: d.status, last_tx: ultimaTransmisie(d),
});

// Căutarea prinde tot ce e scris pe rând: număr, nume, IMEI, model, cartelă (ca pe web).
function potrivit(r: any, q: string) {
  if (!q) return true;
  const s = q.toLowerCase().trim();
  return [r.plate, r.name, r.imei, r.gps_model, r.sim_number].filter(Boolean).some((x) => String(x).toLowerCase().indexOf(s) >= 0);
}

function AparateGpsEcran() {
  const loc = useLocation();
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<'' | 'xlsx' | 'pdf'>('');
  const [acum, setAcum] = useState(Date.now());

  async function load() {
    setErr('');
    try {
      // Fără ?includeArchived: serverul lasă deja pe dinafară aparatele arhivate (clientul nu le vede, 18.09).
      const dev = await Api.devices();
      setRows((Array.isArray(dev) ? dev : []).filter((d: any) => d && d.imei && d.status !== 'archived').map(randAparat));
    } catch (e: any) {
      setErr(e?.message ? 'Nu s-a putut citi lista aparatelor. ' + e.message : 'Nu s-a putut citi lista aparatelor.');
      setRows(null);
    }
    setAcum(Date.now());
  }
  useEffect(() => { load(); }, []);

  const toate = rows || [];
  const stari = useMemo(() => toate.map((r) => stareAparat(r.last_tx, acum)), [rows, acum]);
  const nOk = stari.filter((s) => s.k === 'ok').length;
  const nRau = toate.length - nOk;

  // Cele care nu transmit stau primele: ele cer o acțiune, restul sunt doar o listă.
  const lista = useMemo(() => toate.filter((r) => potrivit(r, q)).sort((a, b) => {
    const sa = stareAparat(a.last_tx, acum).k === 'ok' ? 1 : 0, sb = stareAparat(b.last_tx, acum).k === 'ok' ? 1 : 0;
    if (sa !== sb) return sa - sb;
    return String(a.plate || a.name || a.imei).localeCompare(String(b.plate || b.name || b.imei), 'ro');
  }), [rows, q, acum]);

  // Exportul trece prin sendReport pe server (nume „RA-Track - Raport Inventar dispozitive - data" + logo).
  // Pleacă DOAR cu aparatele de pe ecran, în ordinea de pe ecran. O listă goală nu se trimite niciodată:
  // serverul ar înțelege „tot inventarul".
  async function exporta(fmt: 'xlsx' | 'pdf') {
    if (!lista.length || busy) return;
    setBusy(fmt);
    try {
      await salveazaPostDeLaServer('/api/device-inventory/export', { format: fmt, imeis: lista.map((r) => String(r.imei)) }, numeBrand('Inventar dispozitive', fmt));
    } catch (e: any) { showToast(e?.message || 'Exportul nu a mers', true); }
    finally { setBusy(''); }
  }

  const reincarca = (
    <button class="h-btn" onClick={() => { setRows(null); load(); }} aria-label="Reîncarcă"><Icon name="refresh" /></button>
  );

  return (
    <FmScreen titlu="Aparate GPS" dreapta={reincarca}>
      <p class="fm-note">Aparatele de pe mașinile tale: pe ce mașină e fiecare, ce model, ce cartelă are și când a transmis ultima dată. Pe hartă, o mașină tăcută arată la fel ca una parcată — aici se vede diferența.</p>
      {err && <div class="fm-msg rau" role="alert"><Icon name="alert" size={17} color="var(--red)" /><span>{err}</span></div>}
      {rows == null && !err && <div class="fm-empty"><div class="spin" style="margin:0 auto" /></div>}
      {rows != null && (
        <>
          <div class="fm-kpis">
            <div class="fm-kpi"><b>{toate.length}</b><span>aparate montate</span></div>
            <div class="fm-kpi"><b style="color:var(--fm-ok)">{nOk}</b><span>comunică acum</span></div>
            <div class="fm-kpi"><b style={nRau ? 'color:var(--orange)' : ''}>{nRau}</b><span>{nRau === 1 ? 'nu transmite' : 'nu transmit'}</span></div>
          </div>
          <div class="fm-bar">
            <div class="fm-search">
              <Icon name="search" size={17} class="ic" />
              <input class="fm-in" type="search" value={q} placeholder="Caută număr, IMEI, model, cartelă…"
                onInput={(e) => setQ((e.target as HTMLInputElement).value)} autocapitalize="none" autocomplete="off" spellcheck={false} />
            </div>
            <div class="fm-btns">
              <button class="fm-btn" style="flex:1" disabled={!lista.length || !!busy} onClick={() => exporta('xlsx')}>
                {busy === 'xlsx' ? <div class="spin" style="width:15px;height:15px;border-width:2px" /> : <Icon name="download" size={16} />} Excel
              </button>
              <button class="fm-btn" style="flex:1" disabled={!lista.length || !!busy} onClick={() => exporta('pdf')}>
                {busy === 'pdf' ? <div class="spin" style="width:15px;height:15px;border-width:2px" /> : <Icon name="download" size={16} />} PDF
              </button>
            </div>
          </div>

          {!lista.length ? (
            <div class="fm-empty">
              <Icon name="cpu" size={36} color="var(--text-muted)" />
              {q ? (
                <><b>Nicio potrivire pentru „{q}”</b>Încearcă doar numărul de înmatriculare sau ultimele cifre din IMEI.</>
              ) : (
                <><b>Niciun aparat înregistrat</b>Aparatele apar aici după ce sunt montate și legate de o mașină.</>
              )}
            </div>
          ) : (
            <div class="fm-list">
              {lista.map((r) => {
                const st = stareAparat(r.last_tx, acum);
                const sub = [r.gps_model || 'model necunoscut', 'IMEI ' + r.imei];
                if (r.sim_number) sub.push('SIM ' + r.sim_number);
                return (
                  <button class="fm-row" onClick={() => loc.route('/vehicles/' + encodeURIComponent(String(r.imei)))} aria-label={'Fișa mașinii ' + (r.plate || r.name || r.imei)}>
                    <span class="fm-dot" style={'background:' + st.c} />
                    <span class="mid">
                      <div class="nm">{r.plate || r.name || r.imei}</div>
                      <div class="sub">{sub.join(' · ')}</div>
                      <div style="display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-top:6px">
                        <span class="fm-pill" style={'color:' + st.c}>{st.t}</span>
                        <span style="font-size:12px;color:var(--text-muted)">ultima dată: {fmtCand(r.last_tx)}</span>
                      </div>
                    </span>
                    <Icon name="chevronR" size={18} color="var(--text-muted)" />
                  </button>
                );
              })}
            </div>
          )}
          {/* „Tăcut" nu înseamnă neapărat stricat — omul trebuie să știe ce citește înainte să sune pe cineva. */}
          <p class="fm-foot">Un aparat scrie <b>„comunică”</b> dacă a transmis în ultimele {TACUT_MIN} de minute. Peste {MUT_ORE} de ore de tăcere devine <b>„fără semnal”</b> — de obicei mașina e într-un loc fără acoperire, are bateria scoasă sau aparatul s-a defectat.</p>
        </>
      )}
    </FmScreen>
  );
}
