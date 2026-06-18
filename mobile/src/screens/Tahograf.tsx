import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import './detail.css';
import './admin.css';
import './reports.css';

function fmtDate(s: string | null) { if (!s) return '—'; try { return new Date(s).toLocaleDateString('ro-RO'); } catch { return String(s).slice(0, 10); } }
function hm(min: number) { if (min == null) return '—'; const h = Math.floor(min / 60); const m = Math.round(min % 60); return h + 'h ' + m + 'm'; }

export function Tahograf() {
  const loc = useLocation();
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    Api.tachoFiles()
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((e: any) => { setErr(e?.status === 403 ? 'Modulul tahograf nu este activ pe planul companiei tale.' : (e?.message || 'Eroare la încărcare')); setItems([]); });
  }, []);

  async function open(id: number) {
    setLoadingDetail(true); setDetail({ loading: true });
    try { setDetail(await Api.tachoFile(id)); }
    catch (e: any) { setDetail(null); }
    finally { setLoadingDetail(false); }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')}><Icon name="chevronL" /></button>
        <div class="h-title">Tahograf</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && items.length === 0 && !err && <div class="adm-empty"><Icon name="disc" size={40} class="ic" /><div>Niciun fișier tahograf încărcat. Încarcă .DDD din aplicația web.</div></div>}
        {items != null && items.length > 0 && (
          <>
            <div class="muted" style="font-size:12.5px;margin-bottom:12px">Fișiere tahograf (.DDD) analizate. Atinge pentru infracțiuni și activitate. Încărcarea fișierelor se face în aplicația web.</div>
            <div class="adm-list">
              {items.map((f) => {
                const grave = (f.parsed && f.parsed.totals && f.parsed.totals.infractiuniGrave) || 0;
                const total = (f.parsed && f.parsed.totals && f.parsed.totals.infractiuni) || 0;
                return (
                  <button class="adm-item" onClick={() => open(f.id)} style="align-items:flex-start">
                    <span class="ic-wrap"><Icon name="disc" size={19} /></span>
                    <span class="mid">
                      <div class="nm">{f.driver_name || f.filename || 'Fișier tahograf'}</div>
                      <div class="sub">{f.kind || '—'} · {fmtDate(f.period_from)} – {fmtDate(f.period_to)}</div>
                    </span>
                    <span class="rt">
                      <span class={'adm-pill ' + (grave > 0 ? 'bad' : total > 0 ? 'warn' : 'ok')}>{total > 0 ? total + ' infr.' : 'OK'}</span>
                      <Icon name="chevronR" size={18} color="var(--text-muted)" />
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {detail && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="disc" size={18} color="var(--accent)" /> {detail.driver_name || detail.filename || 'Tahograf'}</b><button class="h-btn" onClick={() => setDetail(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              {(loadingDetail || detail.loading) ? <div class="spin" style="margin:24px auto" /> : (() => {
                const p = detail.parsed || {};
                const t = p.totals || {};
                const infr = Array.isArray(p.infringements) ? p.infringements : [];
                return (
                  <>
                    <div class="rp-summary" style="margin-bottom:14px">
                      <div class="rp-kpi"><div class="v">{hm(t.conducereMin || 0)}</div><div class="l">Conducere</div></div>
                      <div class="rp-kpi"><div class="v">{hm(t.odihnaMin || 0)}</div><div class="l">Odihnă</div></div>
                      <div class="rp-kpi"><div class="v">{t.km != null ? Math.round(t.km) : '—'}</div><div class="l">km</div></div>
                      <div class="rp-kpi"><div class="v">{t.zile ?? '—'}</div><div class="l">Zile</div></div>
                    </div>
                    <div class="np-card" style="margin-bottom:0">
                      <div class="np-head"><span class="np-lbl">Infracțiuni</span><span class={'adm-pill ' + (infr.length ? 'bad' : 'ok')}>{infr.length || 0}</span></div>
                      {infr.length === 0
                        ? <div class="muted" style="font-size:13px;margin-top:10px">Nicio infracțiune detectată.</div>
                        : <div class="np-sub">{infr.map((i: any) => (
                            <div style="display:flex;gap:8px;align-items:flex-start">
                              <span class={'adm-pill ' + (i.severity === 'gravă' ? 'bad' : 'warn')} style="flex:0 0 auto">{i.severity || 'minoră'}</span>
                              <span style="font-size:13px">{i.text || i.rule || i.type || 'Infracțiune'}{i.date ? ' · ' + fmtDate(i.date) : ''}</span>
                            </div>
                          ))}</div>}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
