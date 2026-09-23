import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon, type IconName } from '../components/Icon';
import './admin.css';
import './detail.css';

// Super-admin: Ofertare Live — pe telefon DOAR lista și starea ofertelor.
//
// Ofertele se fac, se modifică, se trimit și se descarcă de pe web. Telefonul avea un calculator
// propriu (prețurile din iulie, „Asistent AI" 150 lei fix, agenții cu 300 lei, PDF făcut în pagină):
// o ofertă deschisă și salvată de aici pierdea tot ce adăugase web-ul (grila RA Insight pe cont,
// tahograf, e-Transport, cursul înghețat, suma „La început"), iar hârtia ieșea pe lângă serverul de
// rapoarte. Calculatorul și PDF-ul au plecat de tot — nicio sumă nu se mai socotește aici; ce scrie pe
// ecran vine din oferta salvată.
type Et = { et: string; c: string; ic: IconName };
const OF_ET: Record<string, Et> = {
  ciorna: { et: 'Ciornă', c: 'var(--text-muted)', ic: 'edit' },
  trimisa: { et: 'Trimisă', c: 'var(--orange)', ic: 'arrowRight' },
  expirata: { et: 'Expirată', c: 'var(--red)', ic: 'clock' },
  acceptata: { et: 'Acceptată', c: 'var(--accent)', ic: 'check' },
  pierduta: { et: 'Pierdută', c: 'var(--text-muted)', ic: 'x' },
};
// „Expirată" nu e o stare ținută în bază: se socotește din termen, ca pe web (_ofStare).
function stare(o: any): string {
  const s = o.status || 'ciorna';
  if (s === 'trimisa' && o.valid_until && Number(o.valid_until) < Date.now()) return 'expirata';
  return s;
}
function zile(o: any): number | null {
  if (!o.valid_until) return null;
  return Math.ceil((Number(o.valid_until) - Date.now()) / 86400000);
}
// „20 de zile", dar „5 zile".
function de(n: number) { const x = Math.abs(Math.round(n)); if (x === 0) return ' '; const r = x % 100; return (r >= 1 && r <= 19) ? ' ' : ' de '; }
function subStare(o: any): string {
  const s = stare(o), z = zile(o);
  if (s === 'trimisa' && z != null) return z <= 0 ? 'expiră azi' : ('mai are ' + z + (z === 1 ? ' zi' : de(z) + 'zile'));
  if (s === 'expirata' && z != null) return 'de ' + Math.abs(z) + de(Math.abs(z)) + 'zile';
  if (s === 'pierduta' && o.lost_reason) return String(o.lost_reason).slice(0, 60);
  return '';
}
const lei = (v: any) => (Number(v) || 0).toLocaleString('ro-RO', { maximumFractionDigits: 0 }) + ' lei';
const eur = (v: any, fx: number) => ((Number(v) || 0) / (fx || 5)).toLocaleString('ro-RO', { maximumFractionDigits: 0 }) + ' €';
function fmtD(ms: any) { if (ms == null) return '—'; const d = new Date(Number(ms)); if (isNaN(d.getTime())) return '—'; return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear(); }

export function Offers() {
  const loc = useLocation();
  const [offers, setOffers] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [fxAzi, setFxAzi] = useState<number>(0);

  function loadList() {
    setErr('');
    Api.offers().then((r) => setOffers(Array.isArray(r) ? r : []))
      .catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setOffers([]); });
  }
  useEffect(() => {
    loadList();
    // Cursul de azi e doar rezerva pentru ofertele vechi, fără curs înghețat în ele.
    Api.fx().then((f: any) => setFxAzi(Number(f && f.eur) || 0)).catch(() => {});
  }, []);

  async function del(o: any) {
    if (!confirm('Ștergi această ofertă?')) return;
    try { await Api.deleteOffer(o.id); showToast('Ofertă ștearsă'); loadList(); } catch (e: any) { showToast(e?.message || 'Eroare', true); }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Ofertare Live</div>
        <button class="h-btn" onClick={loadList} aria-label="Reîncarcă"><Icon name="refresh" size={20} /></button>
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        <div style="font-size:12.5px;color:var(--text-muted);line-height:1.5;background:var(--bg-panel);border:1px solid var(--border);border-radius:11px;padding:10px 12px;margin-bottom:12px">
          Ofertele se fac, se trimit și se descarcă de pe web (Administrare → Business → Ofertare Live). Aici le vezi starea.
        </div>
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {offers == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {offers != null && offers.length === 0 && !err && <div class="adm-empty"><Icon name="report" size={40} class="ic" /><div>Nicio ofertă salvată încă.</div></div>}
        {offers != null && offers.length > 0 && (<>
          <div class="adm-sec2" style="margin-top:0">Oferte salvate ({offers.length})</div>
          {offers.map((o: any) => {
            const cfg = (o.config && o.config.cfg) || {};
            // Cursul ÎNGHEȚAT în ofertă; dacă lipsește (ofertă veche), cel de azi — atunci euro e o aproximare.
            const fx = Number(cfg.fxRate) || fxAzi || 5;
            const s = stare(o), m = OF_ET[s] || OF_ET.ciorna, sub = subStare(o);
            const once = Number(o.once_total) || 0;
            return (
              <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;padding:12px 13px;margin-bottom:8px">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <b style="font-size:13.5px">{o.name || '—'}</b>
                  {cfg.aiA ? <span style="font-size:9.5px;font-weight:700;line-height:1.35;color:var(--accent);border:1px solid var(--accent);border-radius:4px;padding:0 4px">AI</span> : null}
                  <span style="flex:1" />
                  <button class="adm-act danger" onClick={() => del(o)} aria-label="Șterge"><Icon name="trash" size={14} /></button>
                </div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:2px">{(o.client_name || '—') + ' · ' + fmtD(o.created_at)}</div>
                {o.contract_id ? <div style="font-size:11px;color:var(--accent);font-weight:700;margin-top:3px"><Icon name="check" size={11} color="var(--accent)" /> a devenit client</div> : null}
                <div style="display:flex;align-items:flex-start;gap:12px;margin-top:9px">
                  <div style="flex:1;min-width:0">
                    <div style={'display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;color:' + m.c}><Icon name={m.ic} size={12} color={m.c} />{m.et}</div>
                    {sub ? <div style="font-size:10.5px;color:var(--text-muted);margin-top:1px">{sub}</div> : null}
                  </div>
                  <div style="text-align:right">
                    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px">Lunar</div>
                    <div style="font-size:13px;font-weight:800">{lei(o.monthly_total)}</div>
                    <div style="font-size:10px;color:var(--text-muted)">{eur(o.monthly_total, fx)}</div>
                  </div>
                  <div style="text-align:right">
                    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px">La început</div>
                    {once > 0 ? (<>
                      <div style="font-size:13px;font-weight:800">{lei(once)}</div>
                      <div style="font-size:10px;color:var(--text-muted)">{eur(once, fx)}</div>
                    </>) : <div style="font-size:13px;color:var(--text-muted)">—</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </>)}
      </div>
    </div>
  );
}
