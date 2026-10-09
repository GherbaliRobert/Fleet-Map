import { useState, useEffect } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { vehicles, vehiclesLoading, offlineMinutes, logout, me, ecranAscuns, showToast } from '../app/store';
import type { Position } from '../api/endpoints';
import { VehicleCard } from '../components/VehicleCard';
import { VehicleMap } from '../components/VehicleMap';
import { Icon } from '../components/Icon';
import { raCauta } from '../lib/format';
import { salveazaDeLaServer } from '../lib/export';
import {
  numaraStari, potrivesteStarea, stareDinAdresa, CADRANE, type StareFiltru,
  mapSel, eAles, schimbaAlegerea, grupeFlota, incarcaGrupe,
} from '../components/locFlota';
import './vehicles.css';
import './detail.css'; // .sheet-ov / .sheet
import '../components/locFlota.css';
import { nrDe } from '../lib/numar';

const dupaNume = (a: Position, b: Position) => (a.name || a.imei).localeCompare(b.name || b.imei);

export function Vehicles() {
  const loc = useLocation();
  // Filtru de stare venit din alt ecran (ex: /vehicles?status=moving din Statistici)
  const statusParam = new URLSearchParams((loc.url || '').split('?')[1] || '').get('status') || '';
  const dinAdresa = stareDinAdresa(statusParam);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<StareFiltru>(dinAdresa || 'all');
  // Venind din Statistici (ex: ?status=moving) deschidem direct HARTA, filtrată pe acea stare
  const [showMap, setShowMap] = useState(!!dinAdresa);
  const [follow, setFollow] = useState(true); // urmărire: reîncadrează harta pe toate mașinile (toggle off = pan liber)
  // „Arată pe hartă" din lista cu bife: `n` crește la fiecare atingere, ca harta să se recentreze și a doua oară.
  const [focus, setFocus] = useState<{ imei: string; n: number } | null>(null);
  const [alegere, setAlegere] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState('');
  useEffect(() => {
    if (dinAdresa) { setFilter(dinAdresa); setShowMap(true); }
  }, [statusParam]);

  const off = offlineMinutes.value;
  const list = vehicles.value;
  const sel = mapSel.value;
  const toateImei = list.map((v) => v.imei);
  // Ca pe web: cadranele numără TOATĂ flota; alegerea, căutarea și cadranul apăsat restrâng doar ce vezi.
  const counts = numaraStari(list, off);
  const alese = sel ? list.filter((v) => sel.has(v.imei)) : list;
  const ascunse = list.length - alese.length;

  // Ordinea: alegerea (bifele) → căutarea → cadranul. „Dintre cele alese, cele în mișcare".
  // Pe telefon cadranul și căutarea filtrează și harta — dar amândouă rămân mereu la vedere, deasupra ei.
  const filtered = alese
    .filter((v) => raCauta(q, v.name, v.plate, v.imei))
    .filter((v) => potrivesteStarea(v, filter, off))
    .sort(dupaNume);

  // Exportul listei de vehicule: ca pe web (Management → Vehicule), doar pentru cine poate modifica flota
  // și n-are ecranul „Vehicule" tăiat din rol.
  const poateExporta = !!me.value?.permissions?.manageFleet && !ecranAscuns('vehicule');

  function deschideAlegerea() {
    setAlegere(true);
    incarcaGrupe().catch(() => {});
  }
  // Atingerea numelui din foaie: aduce vehiculul în centrul hărții. Dacă e ascuns de bife sau de cadran,
  // îl facem vizibil — l-ai cerut explicit, n-ar avea sens să centrăm harta pe un loc gol.
  function arataPeHarta(imei: string) {
    const v = list.find((x) => x.imei === imei);
    if (!eAles(imei)) schimbaAlegerea([imei], true, toateImei);
    if (v && !potrivesteStarea(v, filter, off)) setFilter('all');
    if (v && !raCauta(q, v.name, v.plate, v.imei)) setQ('');
    setAlegere(false);
    setFollow(false);
    setShowMap(true);
    setFocus((f) => ({ imei, n: (f ? f.n : 0) + 1 }));
    if (v && (v.latitude == null || v.longitude == null)) showToast('Vehiculul nu are încă o poziție pe hartă.');
  }

  async function exporta(fmt: 'xlsx' | 'pdf' | 'csv') {
    if (exporting) return;
    setExporting(fmt);
    try {
      // Numele îl dă serverul („RA-Track - Raport Situația flotei - 24.09.2026.xlsx", din sendReport);
      // cel de aici e doar rezerva pentru cazul rar în care antetul lipsește.
      const azi = new Date().toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' });
      if (fmt === 'csv') await salveazaDeLaServer('/api/devices/export.csv', 'vehicule.csv');
      else await salveazaDeLaServer('/api/devices/export?format=' + fmt, `RA-Track - Raport Situația flotei - ${azi}.${fmt}`);
      setExportOpen(false);
    } catch (e: any) { showToast(e?.message || 'Exportul n-a mers', true); }
    finally { setExporting(''); }
  }

  const textAlese = alese.length === 0 ? 'Niciun vehicul ales'
    : nrDe(alese.length, 'vehicul ales', 'vehicule alese');
  const textAscunse = ascunse <= 0 ? '' : ascunse === 1 ? ' · 1 ascuns' : ' · ' + ascunse + ' ascunse';

  return (
    <div class="screen">
      <header class="app-header">
        <div class="h-title">Vehicule</div>
        {poateExporta && (
          <button class="h-btn" onClick={() => setExportOpen(true)} aria-label="Exportă lista de vehicule" title="Exportă">
            <Icon name="download" />
          </button>
        )}
        <button class="h-btn" onClick={() => setShowMap((m) => !m)} aria-label="hartă/listă">
          <Icon name={showMap ? 'list' : 'map'} />
        </button>
        <button class="h-btn" onClick={() => logout()} aria-label="ieșire"><Icon name="logout" /></button>
      </header>

      {/* O singură căutare, mereu la vedere (și pe hartă), cu X de golire — ca să nu rămână niciodată un
          filtru ascuns. Lângă ea, pastila „câte vehicule vezi din total", care deschide lista cu bife. */}
      <div class="loc-bar">
        <div class="loc-search">
          <Icon name="search" size={18} />
          <input placeholder="Caută vehicul, nr., IMEI" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          {q && <button class="loc-x" onClick={() => setQ('')} aria-label="Golește căutarea"><Icon name="x" size={18} /></button>}
        </div>
        <button class="loc-pill" onClick={deschideAlegerea} aria-label="Alege vehiculele afișate" title="Vehicule afișate — apasă pentru a alege">
          <Icon name="list" size={15} />
          <span><b>{alese.length}</b><span class="tot">/{list.length}</span></span>
          <Icon name="chevronR" size={14} style="transform:rotate(90deg)" />
        </button>
      </div>
      {/* Când e activă o alegere, se SPUNE. Altfel omul crede că i-au dispărut vehiculele. */}
      {sel && (
        <div class="loc-selbar">
          <Icon name="eye" size={16} />
          <span>{textAlese}{textAscunse}</span>
          <button onClick={() => { mapSel.value = null; }}>Arată tot</button>
        </div>
      )}

      {/* Cadranele SUNT filtrul — aceleași cinci ca pe web, vizibile și pe hartă. */}
      <div class="vstats">
        <button class={'vstat total' + (filter === 'all' ? ' on' : '')} style="--cip:var(--accent)" onClick={() => setFilter('all')}>
          <span class="n">{counts.total}</span><span class="l">Total vehicule</span>
        </button>
        {CADRANE.map((f) => (
          <button class={'vstat' + (filter === f.k ? ' on' : '')} style={'--cip:' + f.culoare} onClick={() => setFilter(f.k)}>
            <span class="n">{counts[f.k]}</span><span class="l">{f.label}</span>
          </button>
        ))}
      </div>

      {showMap ? (
        <div class="vmap-wrap">
          <VehicleMap vehicles={filtered} offlineMin={off} follow={follow} onFocus={() => setFollow(false)}
            focusImei={focus ? focus.imei : undefined} focusSeq={focus ? focus.n : 0} grupareOprita={!!sel}
            onSelect={(imei) => loc.route('/vehicles/' + encodeURIComponent(imei))} />
          <button class={'vmap-follow' + (follow ? ' on' : '')} onClick={() => setFollow((f) => !f)} aria-label="urmărește mașinile">
            {follow ? 'Urmărire ✓' : 'Urmărire'}
          </button>
        </div>
      ) : (
        <div class="content has-tabbar">
          {vehiclesLoading.value && list.length === 0 ? (
            <div class="center-msg"><div class="spin" style="margin:0 auto" /></div>
          ) : filtered.length === 0 ? (
            <div class="center-msg">
              {list.length === 0 ? 'Niciun vehicul disponibil.'
                : (sel && alese.length === 0) ? 'Niciun vehicul ales. Apasă „Arată tot" ca să vezi toată flota.'
                : 'Niciun rezultat.'}
            </div>
          ) : (
            <div class="vlist">
              {filtered.map((v) => (
                <VehicleCard v={v} offlineMin={off} onClick={() => loc.route('/vehicles/' + encodeURIComponent(v.imei))} />
              ))}
            </div>
          )}
        </div>
      )}

      {alegere && (
        <AlegeVehicule list={list} q={q} setQ={setQ} onClose={() => setAlegere(false)} onArata={arataPeHarta} />
      )}

      {exportOpen && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !exporting) setExportOpen(false); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b>Exportă vehiculele</b>
              <button class="h-btn" onClick={() => setExportOpen(false)} aria-label="Închide"><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              <button class="loc-exp" disabled={!!exporting} onClick={() => exporta('xlsx')}>
                <Icon name="fileBar" size={22} /><div><b>Excel</b><small>Situația flotei (vehiculele active), cu logo RA Track</small></div>
                {exporting === 'xlsx' && <div class="spin" />}
              </button>
              <button class="loc-exp" disabled={!!exporting} onClick={() => exporta('pdf')}>
                <Icon name="report" size={22} /><div><b>PDF</b><small>Situația flotei (vehiculele active), cu logo RA Track</small></div>
                {exporting === 'pdf' && <div class="spin" />}
              </button>
              {/* Toate trei au doar vehiculele active: clientul nu vede arhivatele (18.09), iar serverul le lasă
                  deoparte pe ambele rute. (Importul înapoi e doar la super-admin — deci nu-l pomenim clientului.) */}
              <button class="loc-exp" disabled={!!exporting} onClick={() => exporta('csv')}>
                <Icon name="list" size={22} /><div><b>CSV</b><small>Toate câmpurile fișei, pentru vehiculele active</small></div>
                {exporting === 'csv' && <div class="spin" />}
              </button>
              <div class="loc-exp-note">Intră toate vehiculele active pe care le vezi în cont, indiferent de căutare sau de bife.</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Foaia „Vehicule pe hartă": Toate / Niciuna, grupele cu bifă pe grupă, „Fără grup" ───
// Când cauți, lista devine plată (ca pe web). Bifele țin doar cât e deschisă aplicația.
function AlegeVehicule({ list, q, setQ, onClose, onArata }: {
  list: Position[]; q: string; setQ: (s: string) => void; onClose: () => void; onArata: (imei: string) => void;
}) {
  const [deschise, setDeschise] = useState<Record<string, boolean>>({});
  const sel = mapSel.value; // citit aici ca foaia să se redeseneze la fiecare bifă
  const toate = list.map((v) => v.imei);
  const nAlese = sel ? list.filter((v) => sel.has(v.imei)).length : list.length;
  const g = grupeFlota.value;

  const randVehicul = (v: Position) => (
    <div class="loc-row" key={v.imei}>
      <label class="loc-cb"><input type="checkbox" checked={eAles(v.imei)}
        onChange={(e) => schimbaAlegerea([v.imei], (e.target as HTMLInputElement).checked, toate)} /></label>
      <button class="loc-name" onClick={() => onArata(v.imei)} aria-label={'Arată pe hartă: ' + (v.plate || v.name || v.imei)}>
        <span class="t">{v.name || v.imei}</span>
        {v.plate ? <span class="plate">{v.plate}</span> : null}
        <span class="go"><Icon name="mapPin" size={16} /></span>
      </button>
    </div>
  );

  function blocGrupa(id: string, nume: string, culoare: string, vs: Position[]) {
    if (!vs.length) return null;
    const n = vs.filter((v) => eAles(v.imei)).length;
    const stare = n === 0 ? 'none' : n === vs.length ? 'all' : 'some';
    const open = !!deschise[id];
    const imeis = vs.map((v) => v.imei);
    return (
      <div class="loc-grp" key={'g' + id}>
        <div class="loc-row">
          <label class="loc-cb"><input type="checkbox" checked={stare === 'all'}
            ref={(el) => { if (el) el.indeterminate = stare === 'some'; }}
            onChange={(e) => schimbaAlegerea(imeis, (e.target as HTMLInputElement).checked, toate)} /></label>
          <button class="loc-name" onClick={() => setDeschise((d) => ({ ...d, [id]: !d[id] }))} aria-expanded={open}>
            <span class="dot" style={{ background: culoare || '#888' }} />
            <span class="t">{nume}</span>
            <span class="cnt">{vs.length}</span>
          </button>
          <button class={'exp' + (open ? ' open' : '')} onClick={() => setDeschise((d) => ({ ...d, [id]: !d[id] }))}
            aria-label={open ? 'Ascunde vehiculele grupei' : 'Vezi vehiculele grupei'}>
            <Icon name="chevronR" size={18} />
          </button>
        </div>
        {open && <div class="loc-grp-veh">{vs.slice().sort(dupaNume).map(randVehicul)}</div>}
      </div>
    );
  }

  let corp: any;
  if (q.trim()) {
    const gasite = list.filter((v) => raCauta(q, v.name, v.plate, v.imei)).sort(dupaNume);
    corp = gasite.length
      ? <>{gasite.slice(0, 300).map(randVehicul)}{gasite.length > 300 && <div class="loc-sh-note">… primele 300. Scrie mai mult ca să găsești restul.</div>}</>
      : <div class="loc-sh-note">Niciun vehicul găsit.</div>;
  } else if (!g) {
    corp = <div class="loc-sh-note"><div class="spin" style="margin:0 auto 8px" />Se încarcă grupurile…</div>;
  } else if (!g.grupe.length) {
    corp = list.length ? list.slice().sort(dupaNume).map(randVehicul) : <div class="loc-sh-note">Niciun vehicul.</div>;
  } else {
    const valide = new Set(g.grupe.map((x) => Number(x.id)));
    const pe: Record<string, Position[]> = {};
    const fara: Position[] = [];
    for (const v of list) {
      const gid = g.grupaDupaImei[v.imei];
      if (gid == null || !valide.has(gid)) fara.push(v);
      else (pe[gid] = pe[gid] || []).push(v);
    }
    corp = (
      <>
        {g.grupe.map((x) => blocGrupa(String(x.id), x.name || ('Grup ' + x.id), x.color || '#888', pe[String(x.id)] || []))}
        {blocGrupa('_fara', 'Fără grup', '#888', fara)}
      </>
    );
  }

  return (
    <div class="sheet-ov loc-sheet" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h">
          <b>Vehicule pe hartă</b>
          <span class="loc-sh-cnt">{nAlese}/{list.length}</span>
          <button class="h-btn" onClick={onClose} aria-label="Închide"><Icon name="x" /></button>
        </div>
        <div class="loc-sh-tools">
          <div class="loc-search">
            <Icon name="search" size={18} />
            <input placeholder="Caută vehicul, nr., IMEI" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
            {q && <button class="loc-x" onClick={() => setQ('')} aria-label="Golește căutarea"><Icon name="x" size={18} /></button>}
          </div>
          <div class="loc-sh-btns">
            <button onClick={() => { mapSel.value = null; }}><Icon name="check" size={16} /> Toate</button>
            <button onClick={() => { mapSel.value = new Set(); }}><Icon name="x" size={16} /> Niciuna</button>
          </div>
        </div>
        <div class="sheet-body" style="padding-top:4px">{corp}</div>
      </div>
    </div>
  );
}
