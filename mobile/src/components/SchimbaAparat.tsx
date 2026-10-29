import { useEffect, useState } from 'preact/hooks';
import { api } from '../api/client';
import { showToast } from '../app/store';
import { Icon } from './Icon';
import { Confirma } from './FlotaUi';
import '../screens/detail.css'; // .sheet*, .btn*

// „Schimbă aparatul" (Robert, 29.10) — aceeași fereastră ca în fișa mașinii de pe web, pe aceleași rute:
// GET / POST /api/devices/:imei/schimba-aparat (doar noi, super-admin). Aparatul nou PREIA mașina: istoricul, fișa, actele,
// reviziile, șoferul și abonamentul rămân pe ea. Telefonul nu verifică și nu socotește nimic: lista candidaților, textul de
// confirmare (pentru „defect" și pentru „retur") și refuzurile vin de la server (aparat_schimbat.js).
type Candidat = { imei: string; model: string | null; sursa: string; unde: string; confirmare: Record<string, string> };
type DateSchimb = {
  vehicul: { imei: string; nume: string }; aparatAcum: string; model: string | null; sim: string | null;
  vechiInStoc: boolean; nuSePoate: string | null; vechiul: { k: string; et: string }[]; candidati: Candidat[]; istoric: string[];
};

export function SchimbaAparat({ imei, onClose, onGata }: { imei: string; onClose: () => void; onGata: (text: string) => void }) {
  const [d, setD] = useState<DateSchimb | null>(null);
  const [err, setErr] = useState('');
  const [ales, setAles] = useState<Candidat | null>(null);
  const [vechiul, setVechiul] = useState('defect');
  const [sim, setSim] = useState('');
  const [motiv, setMotiv] = useState('');
  const [intreb, setIntreb] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<DateSchimb>('/api/devices/' + encodeURIComponent(imei) + '/schimba-aparat')
      .then((x) => { setD(x); setSim(x.sim || ''); })
      .catch((e: any) => setErr(e?.message || 'Nu am putut deschide.'));
  }, [imei]);

  async function schimba() {
    if (!ales) return;
    setBusy(true);
    try {
      const r: any = await api('/api/devices/' + encodeURIComponent(imei) + '/schimba-aparat',
        { method: 'POST', body: { nou: ales.imei, vechiul: d && d.vechiInStoc ? vechiul : 'defect', sim, motiv } });
      setIntreb(false);
      onGata(r && r.text ? r.text : 'Gata.');
    } catch (e: any) { showToast(e?.message || 'Nu s-a putut schimba aparatul.', true); setIntreb(false); }
    finally { setBusy(false); }
  }

  return (
    <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h"><b><Icon name="swap" size={18} color="var(--accent)" /> Schimbă aparatul</b><button class="h-btn" onClick={() => { if (!busy) onClose(); }} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body">
          {err && <div style="font-size:13px;color:var(--red)">{err}</div>}
          {!err && !d && <div style="font-size:13px;color:var(--text-muted)">Se încarcă…</div>}
          {d && (
            <div class="frm">
              <div style="font-size:12.5px;color:var(--text-muted)">{d.vehicul.nume}</div>
              <div class="fld"><label>Aparatul de acum</label>
                <div style="font-size:13px">{d.aparatAcum}{d.model ? ' · ' + d.model : ''}{d.sim ? ' · cartela ' + d.sim : ''}</div>
              </div>
              {d.nuSePoate ? (
                <div style="font-size:13px;line-height:1.5;color:var(--text-muted)">{d.nuSePoate}</div>
              ) : (
                <>
                  <div class="fld"><label>Aparatul nou</label>
                    {!d.candidati.length && (
                      <div style="font-size:13px;line-height:1.5;color:var(--text-muted)">Nu e niciun aparat liber. Trece aparatul nou în Gestiune → Stoc echipamente (în depozit sau la instalator), sau așteaptă să se conecteze: apare în „Neasignate”.</div>
                    )}
                    {d.candidati.map((c) => (
                      <label style={'display:flex;gap:9px;align-items:flex-start;padding:9px 10px;border:1px solid ' + (ales && ales.imei === c.imei ? 'var(--accent)' : 'var(--border)') + ';border-radius:10px;margin-bottom:6px'}>
                        <input type="radio" name="sch-nou" checked={!!ales && ales.imei === c.imei} onChange={() => setAles(c)} style="margin-top:3px" />
                        <span style="font-size:13px;line-height:1.4;overflow-wrap:anywhere"><b>{c.imei}</b>{c.model ? ' · ' + c.model : ''}
                          <span style="display:block;font-size:12px;color:var(--text-muted)">{c.unde}</span></span>
                      </label>
                    ))}
                  </div>
                  {d.vechiInStoc && (
                    <div class="fld"><label>Aparatul vechi</label>
                      <select value={vechiul} onChange={(e: any) => setVechiul(e.target.value)}>
                        {d.vechiul.map((v) => <option value={v.k}>{v.et}</option>)}
                      </select>
                    </div>
                  )}
                  <div class="fld"><label>Cartela SIM</label><input value={sim} placeholder="ex: 0757036943" onInput={(e: any) => setSim(e.target.value)} /></div>
                  <div class="fld"><label>Motiv (opțional)</label><input value={motiv} maxLength={300} placeholder="ex: nu mai pornește" onInput={(e: any) => setMotiv(e.target.value)} /></div>
                  <div class="frm-actions">
                    <button class="btn btn-primary" disabled={!ales || busy} onClick={() => setIntreb(true)}>Schimbă aparatul</button>
                  </div>
                </>
              )}
              {d.istoric && d.istoric.length > 0 && (
                <div class="fld"><label>Schimbări de până acum</label>
                  {d.istoric.map((s) => <div style="font-size:12px;color:var(--text-muted);overflow-wrap:anywhere">{s}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {intreb && ales && d && (
        <Confirma title="Schimbi aparatul?" text={ales.confirmare[d.vechiInStoc ? vechiul : 'defect'] || ''} okLabel="Schimbă aparatul" busy={busy}
          onOk={schimba} onCancel={() => { if (!busy) setIntreb(false); }} />
      )}
    </div>
  );
}
