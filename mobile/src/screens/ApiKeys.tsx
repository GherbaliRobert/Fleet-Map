import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { AntetFondator, Banda } from '../components/FondatorUi';
import './admin.css';
import './detail.css'; // .sheet*
import './fondator.css';

// „Chei API" (Sistem) — ca pe web (openApiKeys): cheile de integrare, cu cine le poartă și când s-au folosit.
// Hotărât pe 03.09: cheile le dăm NOI, la cerere. Ruta de pe telefon e doar pentru super-admin (App.tsx);
// serverul lasă și adminul de firmă (requireAdmin) — nu se atinge. Cheia în clar apare O SINGURĂ DATĂ.
//
// Numele rolurilor, ca pe web (ROLE_LABELS). Rolul propriu al firmei, dacă omul are unul, bate numele standard.
const ROL: Record<string, string> = { superadmin: 'Super-admin', company_admin: 'Admin companie', admin: 'Admin companie', manager: 'Manager', dispatcher: 'Dispecer', client: 'Client', viewer: 'Viewer' };
const rol = (r: any, propriu?: any) => String(propriu || ROL[r] || r || '');
const zi = (v: any) => { if (!v) return '–'; try { return new Date(v).toLocaleDateString('ro-RO'); } catch { return '–'; } };
const cand = (v: any) => { if (!v) return 'niciodată'; try { return new Date(v).toLocaleString('ro-RO'); } catch { return 'niciodată'; } };

// Documentația, aceleași rânduri ca pe web (API_DOCS).
const DOCS: { m: string; p: string; d: string; q?: string; ex?: string }[] = [
  { m: 'GET', p: '/api/me', d: 'Identitatea și permisiunile cheii curente.' },
  { m: 'GET', p: '/api/devices', d: 'Vehiculele accesibile, cu ultima poziție cunoscută.', ex: 'curl -H "X-API-Key: gpsk_xxx" https://ratrack.ro/api/devices' },
  { m: 'GET', p: '/api/live', d: 'Pozițiile live (din memorie, actualizate la fiecare pachet primit).' },
  { m: 'GET', p: '/api/history/:imei', q: 'from, to (ISO 8601)', d: 'Istoricul pozițiilor unui vehicul într-un interval. Include și datele arhivate.', ex: '/api/history/860...?from=2026-06-01T00:00:00Z&to=2026-06-02T00:00:00Z' },
  { m: 'GET', p: '/api/reports', d: 'Tipurile de rapoarte disponibile.' },
  { m: 'GET', p: '/api/reports/:type', q: 'from, to, imei', d: 'Generează un raport: trips, stops, speeding, fuel, geofence, driver, utilization.' },
  { m: 'GET', p: '/api/stats/:imei', d: 'Statistici zilnice (km parcurși, viteze, opriri).' },
  { m: 'GET', p: '/api/trips/:imei', q: 'from, to', d: 'Cursele detectate automat.' },
  { m: 'GET', p: '/api/geofences', d: 'Zonele geografice (geofence) definite.' },
  { m: 'GET', p: '/api/alerts/history', q: 'limit', d: 'Istoricul alertelor declanșate.' },
  { m: 'GET', p: '/api/export/:imei', q: 'from, to', d: 'Export CSV al traseului.' },
  { m: 'GET', p: '/api/hotspot', q: 'from, to, imei, mode', d: 'Puncte pentru heatmap (mode = stops | positions).' },
  { m: 'POST', p: '/api/zone-report', d: 'Analiză activitate într-o zonă desenată (body: poligon).' },
];

export function ApiKeys() {
  const loc = useLocation();
  const [keys, setKeys] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [nou, setNou] = useState(false);
  const [userId, setUserId] = useState('');
  const [nume, setNume] = useState('');
  const [busy, setBusy] = useState(false);
  const [cheie, setCheie] = useState<{ key: string; name: string; user: string } | null>(null);
  const [docs, setDocs] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  function reload() {
    setErr('');
    Api.apiKeys().then((k) => setKeys(Array.isArray(k) ? k : [])).catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare de rețea.')); setKeys([]); });
  }
  useEffect(() => {
    reload();
    Api.users().then((u) => setUsers(Array.isArray(u) ? u : [])).catch(() => setUsers([]));
  }, []);

  async function genereaza() {
    if (!userId) { showToast('Alege un utilizator', true); return; }
    setBusy(true);
    try {
      const r = await Api.createApiKey(Number(userId), nume.trim());
      setNou(false); setNume(''); setUserId('');
      setCheie({ key: r.key, name: r.name || nume.trim(), user: r.user });
      reload();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(false); }
  }
  async function revoca(k: any) {
    if (!confirm('Revoci această cheie? Integrarea care o folosește va pierde accesul imediat.\n(Cheia rămâne în listă, marcată „revocată", pentru audit.)')) return;
    try { await Api.revokeApiKey(k.id); showToast('Cheie revocată'); reload(); } catch (e: any) { showToast(e?.message || 'Eroare', true); }
  }
  async function sterge(k: any) {
    if (!confirm('Ștergi DEFINITIV această cheie?\nÎnregistrarea dispare complet (ireversibil). Integrarea care o folosește pierde accesul.')) return;
    try { await Api.deleteApiKey(k.id); showToast('Cheie ștearsă'); reload(); } catch (e: any) { showToast(e?.message || 'Eroare', true); }
  }
  // Copierea: clipboard-ul, iar dacă WebView-ul îl refuză, cheia rămâne selectată ca s-o copiezi de mână.
  async function copiaza() {
    if (!cheie) return;
    try { await navigator.clipboard.writeText(cheie.key); showToast('Cheie copiată'); }
    catch {
      const el = ref.current;
      if (el) { const r = document.createRange(); r.selectNodeContents(el); const s = window.getSelection(); if (s) { s.removeAllRanges(); s.addRange(r); } }
      showToast('Nu am putut copia — ține apăsat pe cheie și copiaz-o.', true);
    }
  }

  const lista = keys || [];
  return (
    <div class="screen">
      <AntetFondator titlu="Chei API" onBack={() => loc.route('/meniu')}
        dreapta={<button class="h-btn" onClick={() => setDocs(true)} aria-label="Documentație API"><Icon name="book" size={20} /></button>} />
      <div class="content has-tabbar" style="padding-bottom:24px">
        <div class="fd-note">
          O cheie API permite accesul programatic și moștenește rolul + accesul pe vehicule al utilizatorului asociat.
          Trimite cheia în header: <b>Authorization: Bearer &lt;cheie&gt;</b> sau <b>X-API-Key: &lt;cheie&gt;</b>.
        </div>
        <button type="button" class="btn btn-primary btn-block" style="margin-bottom:12px" onClick={() => setNou(true)}><Icon name="plus" size={16} /> Generează cheie nouă</button>

        {cheie && (
          <div class="fd-card" style="border-color:var(--accent)">
            <div style="font-size:12.5px;color:var(--fd-warn);font-weight:700">⚠ Copiază cheia acum — nu se mai poate vedea după închidere:</div>
            <div class="fd-cheie" ref={ref}>{cheie.key}</div>
            <div style="font-size:12px;color:var(--text-muted)">{cheie.name || '(fără nume)'} · {cheie.user}</div>
            <div class="fd-acts">
              <button type="button" class="fd-btn primary" onClick={copiaza}><Icon name="copy" size={14} /> Copiază</button>
              <button type="button" class="fd-btn" onClick={() => { if (confirm('Ai copiat cheia? După închidere nu se mai poate vedea.')) setCheie(null); }}><Icon name="x" size={14} /> Închide</button>
            </div>
          </div>
        )}

        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {keys == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {keys != null && !err && lista.length === 0 && <div class="adm-empty">Nicio cheie creată.</div>}
        {lista.length > 0 && (
          <div class="fd-gr">
            {lista.map((k) => (
              <div class="fd-rand" style={'flex-direction:column;gap:6px' + (k.revoked ? ';opacity:.6' : '')}>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                  <span class="nm">{k.name || '(fără nume)'}</span>
                  <span style="font-size:12px;color:var(--text-muted)">{k.prefix}…</span>
                  <span class={'fd-pill ' + (k.revoked ? 'bad' : 'on')}>{k.revoked ? 'revocată' : 'activă'}</span>
                </div>
                <div class="sub"><Icon name="user" size={12} style="vertical-align:-1px" /> {k.username} · {rol(k.role)} · <Icon name="building" size={12} style="vertical-align:-1px" /> {k.company_name || <em>platformă</em>}</div>
                <div class="sub">Creată: {zi(k.created_at)} · Ultima utilizare: {cand(k.last_used)}</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                  {!k.revoked && <button type="button" class="fd-btn warn" onClick={() => revoca(k)}><Icon name="ban" size={14} /> Revocă</button>}
                  <button type="button" class="fd-btn danger" onClick={() => sterge(k)}><Icon name="trash" size={14} /> Șterge definitiv</button>
                </div>
              </div>
            ))}
          </div>
        )}
        <Banda ton="info" icon="alertO">Cheile le dăm noi, la cerere. „Revocă" oprește cheia și o păstrează în listă pentru audit; „Șterge definitiv" o scoate de tot.</Banda>
      </div>

      {nou && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !busy) setNou(false); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="key" size={18} color="var(--accent)" /> Generează cheie nouă</b><button class="h-btn" onClick={() => setNou(false)} aria-label="Închide"><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Utilizator (rol + acces moștenit)</label>
                  <select value={userId} onChange={(e: any) => setUserId(e.target.value)}>
                    <option value="">— alege —</option>
                    {users.map((u) => <option value={String(u.id)}>{u.username} ({rol(u.role, u.role_slug_name)}){u.company_name ? ' · ' + u.company_name : ''}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Nume / descriere</label><input value={nume} placeholder="ex: integrare ERP" onInput={(e: any) => setNume(e.target.value)} /></div>
                <div style="font-size:11.5px;color:var(--text-muted);line-height:1.45">Cheia apare o singură dată, imediat după generare. Copiaz-o atunci.</div>
                <div class="frm-actions"><button class="btn btn-primary" disabled={busy || !userId} onClick={genereaza}>{busy ? 'Se generează…' : 'Generează'}</button></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {docs && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget) setDocs(false); }}>
          <div class="sheet" style="max-height:88vh">
            <div class="sheet-h"><b><Icon name="book" size={18} color="var(--accent)" /> Documentație API</b><button class="h-btn" onClick={() => setDocs(false)} aria-label="Închide"><Icon name="x" /></button></div>
            <div class="sheet-body">
              {DOCS.map((x) => (
                <div style="padding:10px 0;border-bottom:1px solid var(--border)">
                  <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                    <span class={'fd-pill ' + (x.m === 'GET' ? 'on' : 'warn')}>{x.m}</span>
                    <b style="font-size:13px;overflow-wrap:anywhere">{x.p}</b>
                  </div>
                  <div style="font-size:12.5px;color:var(--text-secondary);margin-top:4px;line-height:1.45">{x.d}</div>
                  {x.q && <div style="font-size:12px;color:var(--text-muted);margin-top:3px"><b>Parametri:</b> {x.q}</div>}
                  {x.ex && <div class="fd-cheie" style="color:var(--text-secondary);font-size:12px">{x.ex}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
