import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { raCauta } from '../lib/format';
import { Icon } from '../components/Icon';
import './admin.css';
import './detail.css'; // .sheet*

// Dispozitive arhivate — DOAR super-admin (hotărât 18.09: clientul nu-și vede aparatele arhivate; ruta e
// păzită și în App.tsx). Restaurare + ștergere definitivă, plus termenul până la care se mai păstrează istoricul.
const actBtn = 'background:var(--bg-dark);border:1px solid var(--border);border-radius:8px;padding:7px 10px;font-size:12px;font-weight:700;display:inline-flex;align-items:center;gap:5px;color:var(--accent)';
// „Restaurează" plin, ca pe web (btn-primary: verde cu scris închis). Scris verde pe fundalul deschis al
// temei luminoase ieșea la ~1,6:1 — același „Restaurează invizibil" reparat pe web pe 17.09.
const restoreBtn = actBtn + ';background:var(--accent);border-color:var(--accent);color:#06210F';

// Cât mai are istoricul. Cifra vine de la SERVER (`purge_zile`, `purge_inceput`) — termenul e o setare de
// server, deci ecranul nu-și face propria socoteală. Pragul și cuvintele sunt cele de pe web.
const PRAG_ZILE = 60;
function termen(d: any): { t: string; c: string; rau: boolean } | null {
  const z = d.purge_zile;
  if (z == null) return null; // n-are nicio poziție păstrată
  if (z <= 0) return { t: 'istoricul s-a șters', c: 'var(--text-muted)', rau: false };
  if (z <= PRAG_ZILE) return { t: 'istoricul se șterge în ' + z + (z === 1 ? ' zi' : ' zile'), c: 'var(--orange)', rau: true };
  if (d.purge_inceput) return { t: 'cele mai vechi date au început să se șteargă', c: 'var(--orange)', rau: true };
  return null;
}
// „2 ani" din numărul de zile trimis de server (implicit 730), ca nota să nu mintă dacă termenul se schimbă.
function durata(zile: number): string {
  if (zile % 365 === 0) { const a = zile / 365; return a === 1 ? '1 an' : a + ' ani'; }
  return zile + ' de zile';
}
function zi(s: any) { if (!s) return '–'; try { return new Date(s).toLocaleDateString('ro-RO'); } catch { return '–'; } }

export function AdminArchived() {
  const loc = useLocation();
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState('');
  const [q, setQ] = useState('');
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

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Dispozitive arhivate</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && items.length === 0 && !err && (
          <div class="adm-empty">
            <Icon name="trash" size={40} class="ic" />
            <div style="font-weight:700">Niciun aparat arhivat</div>
            <div style="font-size:12.5px;margin-top:6px;line-height:1.6">Arhivezi un aparat când se încheie un contract: nu mai primește date, dar istoricul lui de până atunci se păstrează <b>{durata(totalZile)}</b>.</div>
          </div>
        )}
        {items != null && items.length > 0 && (
          <>
            <div class="muted" style="font-size:12.5px;line-height:1.5;margin-bottom:10px">
              Dispozitivele arhivate <b>nu mai primesc date noi</b> (contract încheiat). Istoricul lor de până atunci e păstrat <b>{durata(totalZile)}</b>.
            </div>
            {peDuca > 0 && (
              <div style="font-size:12.5px;line-height:1.5;margin-bottom:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--orange);color:var(--orange);background:color-mix(in srgb, var(--orange) 10%, transparent)">
                <b>{peDuca}{peDuca === 1 ? ' aparat are istoricul pe ducă.' : ' aparate au istoricul pe ducă.'}</b> După termen se șterge definitiv — dacă mai ai nevoie de date, scoate-le acum dintr-un raport.
              </div>
            )}
            <div class="adm-filter"><input value={q} onInput={(e: any) => setQ(e.target.value)} placeholder="Caută nume / număr / IMEI / firmă…" /></div>
            {shown.length === 0 && <div class="adm-empty">Niciun aparat arhivat care să se potrivească.</div>}
            <div class="adm-list">
              {shown.map((d) => {
                const te = termen(d);
                const poz = (Number(d.archived_positions) || 0).toLocaleString('ro-RO');
                const per = (d.first_ts && d.last_ts) ? zi(d.first_ts) + ' – ' + zi(d.last_ts) : '';
                return (
                  <div class="adm-item" style="cursor:default;align-items:flex-start">
                    <span class="ic-wrap"><Icon name="cpu" size={19} /></span>
                    <span class="mid">
                      <div class="nm">{d.name || d.plate || d.imei}{d.name && d.plate ? ' · ' + d.plate : ''}</div>
                      <div class="sub">{(d.company_name || 'Fără firmă') + ' · IMEI ' + d.imei}</div>
                      <div class="sub">{poz} poziții{per ? ' · ' + per : ''}</div>
                      {te && <div class="sub" style={'font-weight:700;white-space:normal;color:' + te.c}>{te.t}</div>}
                    </span>
                    <span class="rt" style="display:flex;gap:6px;flex-shrink:0">
                      <button style={restoreBtn} disabled={busy === d.imei} onClick={() => restore(d.imei)}><Icon name="refresh" size={14} /> Restaurează</button>
                      <button style={actBtn + ';color:var(--red)'} disabled={busy === d.imei} onClick={() => { setDel(d); setScris(''); }} aria-label="Șterge definitiv"><Icon name="trash" size={14} /></button>
                    </span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {del && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !busy) setDel(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="trash" size={18} color="var(--red)" /> Ștergere definitivă</b><button class="h-btn" onClick={() => setDel(null)}><Icon name="x" /></button></div>
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
