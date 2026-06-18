import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import './detail.css';
import './admin.css';

const STATUS: Record<string, { label: string; cls: string }> = {
  activ: { label: 'Activ', cls: 'ok' },
  finalizat: { label: 'Finalizat', cls: '' },
  expirat: { label: 'Expirat', cls: 'bad' },
  anulat: { label: 'Anulat', cls: 'bad' },
};
function fmtDt(s: string | null) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('ro-RO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch { return String(s).slice(0, 16); }
}

export function ETransport() {
  const loc = useLocation();
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    Api.etransport()
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((e: any) => { setErr(e?.status === 403 ? 'Modulul e-Transport nu este activ pe planul companiei tale.' : (e?.message || 'Eroare la încărcare')); setItems([]); });
  }, []);

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')}><Icon name="chevronL" /></button>
        <div class="h-title">e-Transport (ANAF)</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && items.length === 0 && !err && <div class="adm-empty"><Icon name="truck" size={40} class="ic" /><div>Niciun transport (UIT) înregistrat.</div></div>}
        {items != null && items.length > 0 && (
          <>
            <div class="muted" style="font-size:12.5px;margin-bottom:12px">Coduri UIT și starea transmisiei pozițiilor către ANAF. Gestionarea completă (creare/start/stop) e în aplicația web.</div>
            <div class="adm-list">
              {items.map((t) => {
                const s = STATUS[t.status] || { label: t.status || '—', cls: '' };
                return (
                  <div class="adm-item" style="align-items:flex-start">
                    <span class="ic-wrap"><Icon name="truck" size={19} /></span>
                    <span class="mid">
                      <div class="nm" style="font-family:inherit">UIT {t.uit || '—'}</div>
                      <div class="sub">{t.plate || t.imei || '—'} · {fmtDt(t.start_at)}{t.end_at ? ' → ' + fmtDt(t.end_at) : ''}</div>
                      <div class="sub" style="margin-top:2px">Ultima transmisie ANAF: {fmtDt(t.last_sent_at)}</div>
                    </span>
                    <span class="rt"><span class={'adm-pill ' + s.cls}>{s.label}</span></span>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
