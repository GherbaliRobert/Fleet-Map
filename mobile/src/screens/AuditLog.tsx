import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { AntetFondator } from '../components/FondatorUi';
import './admin.css';
import './fondator.css';

// „Jurnal audit" (Sistem) — jurnalul platformei, cross-tenant: cine, ce, pe ce, de unde (ca pe web, openAudit).
// DOAR super-admin (serverul cere requireSuperadmin). Pe telefon, un cartonaș pe intrare; detaliile (JSON) se
// desfac la atingere, iar lista se lungește cu „Încarcă mai multe" (serverul dă cel mult 500 odată).
const PAS = 100;
function cand(v: any) { try { return new Date(v).toLocaleString('ro-RO'); } catch { return String(v || ''); } }
function detalii(v: any): string {
  if (v == null || v === '') return '';
  if (typeof v === 'string') { try { return JSON.stringify(JSON.parse(v), null, 2); } catch { return v; } }
  try { return JSON.stringify(v, null, 2); } catch { return String(v); }
}

export function AuditLog() {
  const loc = useLocation();
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [gata, setGata] = useState(false); // serverul n-a mai avut ce da
  const [open, setOpen] = useState<Record<string, boolean>>({});

  async function incarca(dela: number) {
    setBusy(true);
    try {
      const r = await Api.auditLog(PAS, dela);
      const l = Array.isArray(r) ? r : [];
      setRows((cur) => (dela === 0 ? l : (cur || []).concat(l)));
      setGata(l.length < PAS);
      setErr('');
    } catch (e: any) {
      if (dela === 0) { setRows([]); setErr(e?.status === 403 ? 'Acces interzis.' : 'Indisponibil (eroare de rețea).'); }
      else setErr('Nu am putut încărca mai multe (eroare de rețea).');
    } finally { setBusy(false); }
  }
  useEffect(() => { incarca(0); }, []);

  const lista = rows || [];
  return (
    <div class="screen">
      <AntetFondator titlu="Jurnal audit" onBack={() => loc.route('/meniu')} onRefresh={() => { setOpen({}); incarca(0); }} />
      <div class="content has-tabbar" style="padding-bottom:24px">
        {rows == null && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {rows != null && err && lista.length === 0 && <div class="adm-empty">{err}</div>}
        {rows != null && !err && lista.length === 0 && <div class="adm-empty">Nicio intrare.</div>}
        {lista.length > 0 && (
          <div class="fd-gr">
            {lista.map((r, i) => {
              const k = String(r.id != null ? r.id : i);
              const det = detalii(r.details);
              const e = !!open[k];
              return (
                <button type="button" class="fd-rand" style="flex-direction:column;gap:3px" onClick={() => det && setOpen((m) => ({ ...m, [k]: !e }))}>
                  <div style="display:flex;gap:8px;align-items:center;width:100%">
                    <span class="fd-pill on" style="flex:0 0 auto">{r.action || '—'}</span>
                    <span class="nm" style="flex:1;min-width:0">{(r.entity || '') + (r.entity_id ? ' #' + r.entity_id : '')}</span>
                    {det && <Icon name={e ? 'arrowDown' : 'chevronR'} size={15} color="var(--text-muted)" />}
                  </div>
                  <div class="sub">{cand(r.created_at)} · {r.username || '-'}{r.ip ? ' · ' + r.ip : ''}</div>
                  {det && !e && <div class="sub" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%">{det.replace(/\s+/g, ' ')}</div>}
                  {det && e && <pre style="margin:4px 0 0;width:100%;box-sizing:border-box;white-space:pre-wrap;word-break:break-word;font-size:11.5px;line-height:1.45;color:var(--text-secondary);background:var(--bg-dark);border:1px solid var(--border);border-radius:8px;padding:8px;font-family:inherit">{det}</pre>}
                </button>
              );
            })}
          </div>
        )}
        {lista.length > 0 && err && <div class="fd-note" style="color:var(--fd-bad)">{err}</div>}
        {lista.length > 0 && !gata && (
          <button type="button" class="fd-btn" style="width:100%;min-height:44px" disabled={busy} onClick={() => incarca(lista.length)}>
            {busy ? 'Se încarcă…' : 'Încarcă mai multe'}
          </button>
        )}
      </div>
    </div>
  );
}
