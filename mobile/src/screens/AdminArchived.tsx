import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { raCauta } from '../lib/format';
import { Icon } from '../components/Icon';
import { AntetFondator, Banda, GrupFirma, adresaFirmei } from '../components/FondatorUi';
import './admin.css';
import './detail.css'; // .sheet*
import './fondator.css';
import { nrDe } from '../lib/numar';

// Dispozitive arhivate — DOAR super-admin (hotărât 18.09: clientul nu-și vede aparatele arhivate; ruta e
// păzită și în App.tsx). Ca pe web (_arhRandeaza): grupate pe firme, cu „Deschide firma", „Istoric" (traseul
// aparatului arhivat), „Restaurează" și ștergerea definitivă cu numărul tastat. Termenul vine de la server.
const PRAG_ZILE = 60;
function termen(d: any): { t: string; c: string; rau: boolean } | null {
  const z = d.purge_zile;
  if (z == null) return null; // n-are nicio poziție păstrată
  if (z <= 0) return { t: 'istoricul s-a șters', c: 'var(--text-muted)', rau: false };
  if (z <= PRAG_ZILE) return { t: 'istoricul se șterge în ' + nrDe(z, 'zi', 'zile'), c: 'var(--fd-warn)', rau: true };
  if (d.purge_inceput) return { t: 'cele mai vechi date au început să se șteargă', c: 'var(--fd-warn)', rau: true };
  return null;
}
// „2 ani" din numărul de zile trimis de server (implicit 730), ca nota să nu mintă dacă termenul se schimbă.
function durata(zile: number): string {
  if (zile % 365 === 0) { const a = zile / 365; return a === 1 ? '1 an' : a + ' ani'; }
  return zile + ' de zile';
}
function zi(s: any) { if (!s) return '–'; try { return new Date(s).toLocaleDateString('ro-RO'); } catch { return '–'; } }

type Grup = { k: string; nume: string; coId: number | null; dev: any[] };
function grupuri(rows: any[]): Grup[] {
  const m: Record<string, Grup> = {};
  rows.forEach((d) => {
    const k = d.company_id == null ? '_fara' : String(d.company_id);
    if (!m[k]) m[k] = { k, nume: d.company_name || 'Fără firmă', coId: d.company_id == null ? null : d.company_id, dev: [] };
    m[k].dev.push(d);
  });
  // „Fără firmă" la urmă; restul, alfabetic.
  return Object.keys(m).map((k) => m[k]).sort((a, b) => (a.k === '_fara' ? 1 : b.k === '_fara' ? -1 : a.nume.localeCompare(b.nume, 'ro')));
}

export function AdminArchived() {
  const loc = useLocation();
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState('');
  const [manual, setManual] = useState<Record<string, boolean>>({});
  // Ștergerea definitivă cere tastarea numărului (sau a IMEI-ului) — ca pe web. Un „OK" apăsat din greșeală
  // pe telefon ar fi șters tot istoricul unui client, fără cale de întoarcere.
  const [del, setDel] = useState<any | null>(null);
  const [scris, setScris] = useState('');

  function reload() {
    setErr('');
    Api.archivedDevices().then((r) => setItems(Array.isArray(r) ? r : [])).catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setItems([]); });
  }
  useEffect(reload, []);

  async function restore(imei: string) {
    // Restaurarea repornește aparatul: reintră în lista celor acceptate și începe iar să stocheze date.
    if (!confirm('Restaurezi dispozitivul?\nVa reîncepe să primească și să stocheze date GPS.')) return;
    setBusy(imei);
    try { await Api.restoreDevice(imei); showToast('Dispozitiv restaurat'); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(''); }
  }

  // „Istoric": Traseul aparatului, pe o perioadă care se TERMINĂ la ultima lui poziție — altfel „Azi" ar fi gol.
  // /api/history citește și din arhivă. Pe ecran scrie „(arhivat)", ca să știi de ce n-are date noi.
  function istoric(d: any) {
    const t = new Date(d.last_ts || d.last_seen || Date.now()).getTime();
    const pana = isFinite(t) ? t : Date.now();
    const nume = (d.name || d.plate || d.imei) + (d.name && d.plate ? ' · ' + d.plate : '');
    loc.route('/vehicles/' + encodeURIComponent(d.imei) + '/route?pana=' + pana + '&arhivat=1&nume=' + encodeURIComponent(nume));
  }

  const deScris = del ? String((del.plate || '').trim() || del.imei) : '';
  const potrivit = !!del && scris.trim().toUpperCase() === deScris.toUpperCase();
  async function confirmaStergerea() {
    if (!del || !potrivit) return;
    const imei = del.imei;
    setBusy(imei);
    try { await Api.deleteDevice(imei, scris.trim()); showToast('Dispozitiv șters definitiv'); setDel(null); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare la ștergere', true); } finally { setBusy(''); }
  }

  const toate = items || [];
  const shown = toate.filter((d) => raCauta(q, d.name, d.plate, d.imei, d.company_name));
  const peDuca = toate.filter((d) => { const t = termen(d); return t && t.rau; }).length;
  const totalZile = Number((toate[0] && toate[0].purge_total_zile) || 730);
  const grup = grupuri(shown);

  function rand(d: any) {
    const te = termen(d);
    const poz = (Number(d.archived_positions) || 0).toLocaleString('ro-RO');
    const per = (d.first_ts && d.last_ts) ? zi(d.first_ts) + ' – ' + zi(d.last_ts) : '';
    return (
      <div class="fd-rand" style="flex-direction:column;gap:8px">
        <div style="min-width:0">
          <div class="nm">{d.name || d.plate || d.imei}{d.name && d.plate ? ' · ' + d.plate : ''}</div>
          <div class="sub">IMEI {d.imei}</div>
          <div class="sub">{poz} poziții{per ? ' · ' + per : ''}</div>
          {te && <div class="sub" style={'font-weight:700;color:' + te.c}>{te.t}</div>}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button type="button" class="fd-btn" onClick={() => istoric(d)}><Icon name="route" size={14} /> Istoric</button>
          {/* „Restaurează" plin, ca pe web (btn-primary): scris verde pe fundalul deschis ieșea invizibil. */}
          <button type="button" class="fd-btn primary" disabled={busy === d.imei} onClick={() => restore(d.imei)}><Icon name="refresh" size={14} /> Restaurează</button>
          <button type="button" class="fd-btn danger" disabled={busy === d.imei} onClick={() => { setDel(d); setScris(''); }}><Icon name="trash" size={14} /> Șterge</button>
        </div>
      </div>
    );
  }

  return (
    <div class="screen">
      <AntetFondator titlu="Dispozitive arhivate" onBack={() => loc.route('/meniu')} onRefresh={reload} />
      <div class="content has-tabbar" style="padding-bottom:24px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && items.length === 0 && !err && (
          <div class="adm-empty">
            <Icon name="archive" size={40} class="ic" />
            <div style="font-weight:700">Niciun aparat arhivat</div>
            <div style="font-size:12.5px;margin-top:6px;line-height:1.6">Arhivezi un aparat când se încheie un contract: nu mai primește date, dar istoricul lui de până atunci se păstrează <b>{durata(totalZile)}</b>.</div>
            <button type="button" class="fd-btn" style="margin-top:14px" onClick={() => loc.route('/admin/devices')}><Icon name="cpu" size={14} /> Deschide Dispozitive</button>
          </div>
        )}
        {items != null && items.length > 0 && (
          <>
            <div class="fd-note">
              Dispozitivele arhivate <b>nu mai primesc date noi</b> (contract încheiat). Istoricul lor de până atunci rămâne accesibil și e păstrat <b>{durata(totalZile)}</b>.
            </div>
            {peDuca > 0 && (
              <Banda ton="warn" icon="clock">
                <b>{peDuca}{peDuca === 1 ? ' aparat are istoricul pe ducă.' : ' aparate au istoricul pe ducă.'}</b> După termen se șterge definitiv — dacă mai ai nevoie de date, scoate-le acum dintr-un raport.
              </Banda>
            )}
            <input class="fd-search" value={q} onInput={(e: any) => setQ(e.target.value)} placeholder="Caută nume / număr / IMEI / firmă…" />
            {shown.length === 0 && <div class="adm-empty">Niciun aparat arhivat care să se potrivească.</div>}
            {grup.map((g) => {
              const pb = g.dev.filter((d) => { const t = termen(d); return t && t.rau; }).length;
              // Un grup cu ceva de rezolvat stă MEREU deschis, oricâte firme ar fi.
              const deschis = manual[g.k] != null ? manual[g.k] : (!!q.trim() || pb > 0 || grup.length <= 5);
              return (
                <GrupFirma key={g.k} nume={g.nume} deschis={deschis}
                  onToggle={() => setManual((m) => ({ ...m, [g.k]: !deschis }))}
                  onFirma={g.coId != null ? () => loc.route(adresaFirmei(g.coId as number)) : undefined}
                  sumar={<>{g.dev.length}{g.dev.length === 1 ? ' aparat' : ' aparate'}{pb ? <> · <b>{pb} cu istoricul pe ducă</b></> : null}</>}>
                  {g.dev.map(rand)}
                </GrupFirma>
              );
            })}
          </>
        )}
      </div>

      {del && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !busy) setDel(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="trash" size={18} color="var(--red)" /> Ștergere definitivă</b><button class="h-btn" onClick={() => setDel(null)} aria-label="Închide"><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div style="font-size:13.5px;line-height:1.55">
                  <b style="color:var(--red)">⚠️ ȘTERGERE DEFINITIVĂ</b><br />
                  <b>{del.name || del.plate || del.imei}{del.plate ? ' (' + del.plate + ')' : ''}</b><br />
                  {(Number(del.archived_positions) || 0).toLocaleString('ro-RO')} poziții + tot istoricul vor fi ȘTERSE PERMANENT din baza de date.<br />
                  <b>NU se poate anula.</b>
                </div>
                <div class="fld">
                  <label>Pentru confirmare, scrie exact {del.plate && String(del.plate).trim() ? 'numărul de înmatriculare' : 'IMEI-ul'}: <span style="color:var(--text-primary)">{deScris}</span></label>
                  <input value={scris} autoComplete="off" autoCapitalize="characters" spellcheck={false} placeholder={deScris}
                    onInput={(e: any) => setScris(e.target.value)} />
                </div>
                <div class="frm-actions">
                  <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" disabled={!!busy} onClick={() => setDel(null)}>Anulează</button>
                  <button class="btn" style="background:var(--red);color:#fff" disabled={!potrivit || !!busy} onClick={confirmaStergerea}>{busy ? 'Se șterge…' : 'Șterge definitiv'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
