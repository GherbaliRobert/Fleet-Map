import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon, type IconName } from '../components/Icon';
import { Confirma } from '../components/FlotaUi';
import { raCauta } from '../lib/format';
import './admin.css';
import './detail.css';
import './firma.css';
import './companii.css';

// „Mută între companii" (fondatori) — al doilea cartonaș din Companii pe web (RAX_MOVE_CFG / raxMove*).
// Trei feluri: vehicule, utilizatori, șoferi — unul câte unul (butonul „Mută" din rând) sau în lot (bifele +
// bara de jos, o singură cerere). Aceleași rute ca web-ul, toate requireSuperadmin; regulile stau pe server
// (un aparat arhivat nu se mută, o firmă nu rămâne fără niciun administrator, demo-ul e doar pentru aparatele
// simulate). Compania demo nu apare: nici în liste, nici ca destinație. Adresa: /admin/muta.

type Fel = 'devices' | 'users' | 'drivers';
type Cfg = {
  et: string; label: string; icon: IconName; gol: string; id: (x: any) => string;
  nume: (x: any) => string; sub: (x: any) => string; pastreaza?: (x: any) => boolean; faraNeasignat?: boolean;
};
const CFG: Record<Fel, Cfg> = {
  devices: {
    et: 'Vehicule', label: 'vehicule', icon: 'car', gol: 'Niciun vehicul.', id: (d) => String(d.imei),
    nume: (d) => d.name || d.imei, sub: (d) => [d.plate, d.imei].filter(Boolean).join(' · '),
  },
  users: {
    et: 'Utilizatori', label: 'utilizatori', icon: 'user', gol: 'Niciun utilizator.', id: (u) => String(u.id),
    nume: (u) => u.full_name || u.username, sub: (u) => [u.username, u.role].filter(Boolean).join(' · '),
    pastreaza: (u) => u.role !== 'superadmin', // super-adminul e al platformei, nu se mută
    // „Neasignat" NU pentru utilizatori: un cont fără firmă ar sări peste abonament și module.
    faraNeasignat: true,
  },
  drivers: {
    et: 'Șoferi', label: 'șoferi', icon: 'idCard', gol: 'Niciun șofer.', id: (d) => String(d.id),
    nume: (d) => d.name || '#' + d.id, sub: (d) => [d.phone, d.license_number].filter(Boolean).join(' · '),
  },
};
const MAX = 80;

export function MutaCompanii() {
  const loc = useLocation();
  const [fel, setFel] = useState<Fel>('devices');
  const [firme, setFirme] = useState<any[]>([]);
  const [date, setDate] = useState<Record<Fel, any[] | null>>({ devices: null, users: null, drivers: null });
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [bife, setBife] = useState<Record<Fel, Record<string, boolean>>>({ devices: {}, users: {}, drivers: {} });
  const [dest, setDest] = useState<Record<string, string>>({}); // destinația aleasă pe fiecare rând
  const [destLot, setDestLot] = useState('');
  const [intreb, setIntreb] = useState<{ t: string; ok: () => Promise<void> } | null>(null);
  const [busy, setBusy] = useState(false);

  function citesteFirme() { return Api.companies().then((l) => setFirme(Array.isArray(l) ? l : [])).catch(() => {}); }
  function citeste(f: Fel) {
    setErr('');
    // Fără arhivate: nu se mută (serverul le refuză și în lot), deci n-au ce căuta în listă și sub „Bifează tot".
    const p = f === 'devices' ? Api.devicesLite() : f === 'users' ? Api.usersLite() : Api.driversLite();
    return p.then((l) => setDate((d) => ({ ...d, [f]: Array.isArray(l) ? l : [] })))
      .catch((e: any) => { setErr(e?.message || 'Eroare la încărcare'); setDate((d) => ({ ...d, [f]: [] })); });
  }
  useEffect(() => { citesteFirme(); }, []);
  useEffect(() => { if (date[fel] == null) citeste(fel); setDest({}); }, [fel]);

  const cfg = CFG[fel];
  const demo = useMemo(() => new Set(firme.filter((c) => c.is_demo).map((c) => Number(c.id))), [firme]);
  const numeFirma = useMemo(() => { const m: Record<string, string> = {}; firme.forEach((c) => { m[String(c.id)] = c.name; }); return m; }, [firme]);
  const destinatii = firme.filter((c) => !c.is_demo);
  const toate = useMemo(() => (date[fel] || [])
    .filter(cfg.pastreaza || (() => true))
    .filter((x) => !(x.company_id != null && demo.has(Number(x.company_id)))), [date, fel, demo]);
  const lista = useMemo(() => toate.filter((x) => raCauta(q, cfg.nume(x), cfg.sub(x), x.company_id != null ? (numeFirma[String(x.company_id)] || '') : 'neasignat')), [toate, q, numeFirma]);
  const sel = bife[fel];
  const nSel = Object.keys(sel).filter((k) => sel[k]).length;

  function bifeaza(id: string) { setBife((b) => { const m = { ...b[fel] }; if (m[id]) delete m[id]; else m[id] = true; return { ...b, [fel]: m }; }); }
  function toti(on: boolean) {
    setBife((b) => {
      const m = { ...b[fel] };
      lista.forEach((x) => { const id = cfg.id(x); if (on) m[id] = true; else delete m[id]; });
      return { ...b, [fel]: m };
    });
  }
  const numeDest = (v: string) => (v === '' ? 'NEASIGNAT' : '„' + (numeFirma[v] || '#' + v) + '"');
  const laFinal = async () => { await Promise.all([citeste(fel), citesteFirme()]); };

  function mutaUnul(x: any) {
    const id = cfg.id(x);
    const acum = x.company_id != null ? String(x.company_id) : '';
    const v = dest[id] != null ? dest[id] : acum;
    if (v === acum) { showToast('Deja acolo', true); return; }
    setIntreb({
      t: 'Mută „' + cfg.nume(x) + '" la ' + numeDest(v) + '?',
      ok: async () => {
        const co = v === '' ? null : parseInt(v);
        if (fel === 'devices') await Api.moveDevice(id, co);
        else if (fel === 'users') await Api.moveUser(Number(id), co as number);
        else await Api.moveDriver(Number(id), co);
        setBife((b) => { const m = { ...b[fel] }; delete m[id]; return { ...b, [fel]: m }; });
        showToast('Mutat ✓');
        await laFinal();
      },
    });
  }
  function mutaLot() {
    const ids = Object.keys(sel).filter((k) => sel[k]);
    if (!ids.length) { showToast('Bifează întâi', true); return; }
    const v = destLot;
    if (cfg.faraNeasignat && v === '') { showToast('Alege firma de destinație.', true); return; }
    setIntreb({
      t: 'Mută ' + ids.length + ' ' + cfg.label + ' la ' + numeDest(v) + '?',
      ok: async () => {
        const co = v === '' ? null : parseInt(v);
        // O singură cerere în lot (tranzacțională), nu N cereri.
        const r: any = fel === 'devices' ? await Api.moveDevicesBulk(ids, co)
          : fel === 'users' ? await Api.moveUsersBulk(ids.map((x) => parseInt(x)), co as number)
            : await Api.moveDriversBulk(ids.map((x) => parseInt(x)), co);
        setBife((b) => ({ ...b, [fel]: {} }));
        showToast((r && r.moved != null ? r.moved : ids.length) + ' mutate ✓');
        await laFinal();
      },
    });
  }
  async function confirma() {
    if (!intreb) return;
    setBusy(true);
    try { await intreb.ok(); setIntreb(null); }
    catch (e: any) { showToast('Eroare: ' + (e?.message || 'necunoscută'), true); setIntreb(null); }
    finally { setBusy(false); }
  }

  const optiuni = (
    <>
      {!cfg.faraNeasignat && <option value="">— neasignat —</option>}
      {destinatii.map((c) => <option value={String(c.id)}>{c.name}</option>)}
    </>
  );
  const rows = date[fel];
  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Mută între companii</div>
        <button class="h-btn" onClick={laFinal} aria-label="Reîncarcă"><Icon name="refresh" size={20} /></button>
      </header>
      <div class="content co-page">
        <div class="fm-note">Alege tipul, bifează rândurile, selectează destinația în bara de jos și apasă „Mută selectate". Poți muta unul singur cu butonul „Mută" din rând.</div>
        <div class="co-tabs" role="tablist" style="margin-bottom:10px">
          {(Object.keys(CFG) as Fel[]).map((k) => (
            <button role="tab" aria-selected={fel === k} class={fel === k ? 'on' : ''} onClick={() => { setFel(k); setQ(''); }}>
              <Icon name={CFG[k].icon} size={15} />{CFG[k].et}
            </button>
          ))}
        </div>
        <div class="fm-search" style="margin-bottom:10px">
          <span class="ic"><Icon name="search" size={16} /></span>
          <input class="fm-in" type="search" value={q} onInput={(e: any) => setQ(e.target.value)} placeholder={'Caută ' + cfg.label + '…'} />
        </div>
        <div class="fm-btns" style="margin-bottom:10px;align-items:center">
          <button class="fm-btn" onClick={() => toti(true)}>Bifează tot</button>
          <button class="fm-btn" onClick={() => toti(false)}>Debifează tot</button>
          {nSel > 0 && <span style="font-size:13px;font-weight:700;color:var(--text-muted)">{nSel} selectate</span>}
        </div>

        {err && <div class="co-msg rau" style="margin-bottom:10px">{err}</div>}
        {rows == null && !err && <div class="fm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {rows != null && lista.length === 0 && <div class="fm-empty">{cfg.gol}</div>}
        <div class="fm-list">
          {lista.slice(0, MAX).map((x) => {
            const id = cfg.id(x);
            const on = !!sel[id];
            const acum = x.company_id != null ? String(x.company_id) : '';
            const numeAcum = x.company_id != null ? (numeFirma[acum] || '#' + acum) : 'neasignat';
            return (
              <div class="co-card" style="padding:4px 12px 12px">
                <button class={'co-chk' + (on ? ' on' : '')} style="border-bottom:none" role="checkbox" aria-checked={on} onClick={() => bifeaza(id)}>
                  <span class="bx">{on ? <Icon name="check" size={14} /> : null}</span>
                  <span class="mid"><b>{cfg.nume(x)}</b>{cfg.sub(x) ? <small>{cfg.sub(x)}</small> : null}<small>acum: {numeAcum}</small></span>
                </button>
                <div style="display:flex;gap:8px;align-items:center">
                  <select class="co-sel" style="flex:1;min-width:0" value={dest[id] != null ? dest[id] : acum}
                    onChange={(e: any) => { const v = e.target.value; setDest((d) => ({ ...d, [id]: v })); }}>
                    {cfg.faraNeasignat && acum === '' && <option value="">— alege firma —</option>}
                    {optiuni}
                  </select>
                  <button class="fm-btn acc" onClick={() => mutaUnul(x)}><Icon name="arrowRight" size={15} /> Mută</button>
                </div>
              </div>
            );
          })}
        </div>
        {lista.length > MAX && <div class="co-note" style="margin-top:8px">… primele {MAX}. Filtrează pentru mai multe.</div>}

        <div class="co-bulk">
          <div style="font-size:13px;font-weight:700">Mută cele bifate la:</div>
          <div class="r">
            <select class="co-sel" style="flex:1;min-width:0" value={destLot} onChange={(e: any) => setDestLot(e.target.value)}>
              {cfg.faraNeasignat && <option value="">— alege firma —</option>}
              {optiuni}
            </select>
            <button class="btn btn-primary" style="padding:10px 14px" disabled={!nSel} onClick={mutaLot}>Mută selectate</button>
          </div>
        </div>
      </div>

      {intreb && (
        <Confirma title="Muți?" text={intreb.t} okLabel="Mută" busy={busy} onOk={confirma} onCancel={() => { if (!busy) setIntreb(null); }} />
      )}
    </div>
  );
}
