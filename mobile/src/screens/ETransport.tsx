import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me } from '../app/store';
import { Icon } from '../components/Icon';
import './detail.css';
import './admin.css';
import './tacho.css'; // .th-badge / .th-note — aceleași benzi ca la Tahograf

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
  // Ecranul ăsta e al FIRMEI. Super-adminul primea aici transporturile tuturor firmelor, fără coloană
  // de firmă. Pe web, fondatorul are ecranul lui, pe firme (AI & Module → e-Transport).
  const isSuper = !!me.value?.isSuper;
  const poateModifica = !!me.value?.permissions?.manageFleet;
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  // Dacă pleacă ceva spre ANAF: { pornit, test }. null = încă nu știm → nu promitem nimic, în niciun sens.
  const [anaf, setAnaf] = useState<{ pornit: boolean; test?: boolean } | null>(null);

  useEffect(() => {
    // Starea ANAF e a PLATFORMEI (un singur token, al nostru) — o vede și fondatorul, în cuvintele lui.
    Api.etransportScadentar().then((d) => setAnaf(d && d.anaf ? d.anaf : null)).catch(() => {});
    if (isSuper) return; // fondatorul vede nota de mai jos, nu transporturile tuturor firmelor amestecate
    // Planurile nu mai există (26.08) — modulele se pornesc din ofertă. Și nu orice 403 e „modul oprit":
    // un rol fără dreptul de rapoarte primește tot 403, dar cu alt motiv.
    Api.etransport()
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch((e: any) => {
        setErr(e?.status !== 403 ? (e?.message || 'Eroare la încărcare')
          : e?.message === 'feature_disabled' ? 'Modulul e-Transport nu e pornit pentru firma ta.'
            : 'Rolul tău nu are acces la acest ecran.');
        setItems([]);
      });
  }, []);

  // Banda de sus, cu textul de pe web. Fără raportare pornită, tot ce urmează e evidență internă, nu
  // conformitate — iar omul trebuie s-o afle, altfel crede că e în regulă la ANAF.
  const pornit = !!(anaf && anaf.pornit);
  const banda = anaf == null ? null : isSuper
    ? (pornit
      ? <div class="th-badge warn" style="margin-bottom:12px"><Icon name="alert" size={15} /> Trimitem la ANAF{anaf.test ? ' — pe mediul de TEST, nu pe cel real' : ''}, dar sub UN SINGUR CIF: al nostru. Până când fiecare client are tokenul și CIF-ul lui, nu porni modulul la clienți — ar declara sub CIF-ul nostru.</div>
      : <div class="th-badge warn" style="margin-bottom:12px"><Icon name="alert" size={15} /> Nu pleacă nimic la ANAF — nu e setat tokenul nostru. Pentru clienți, modulul e deocamdată o evidență a codurilor UIT, nu conformitate.</div>)
    : (pornit
      ? <div class="th-badge ok" style="margin-bottom:12px"><Icon name="check" size={15} /> Raportăm pozițiile la ANAF pentru tine{anaf.test ? ' — deocamdată pe mediul de test al ANAF, nu pe cel real' : ''}</div>
      : <div class="th-badge warn" style="margin-bottom:12px"><Icon name="alert" size={15} /> Raportarea către ANAF nu e pornită încă — ne ocupăm noi de ea. Până atunci, aici ții evidența codurilor UIT și a termenelor.</div>);

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')}><Icon name="chevronL" /></button>
        <div class="h-title">e-Transport (ANAF)</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        {isSuper ? (
          <>
            {banda}
            <div class="th-note">
              Aici e ecranul firmei. Situația pe firme (cine are transporturi de rezolvat, cine are modulul) o vezi pe web, în <b>AI & Module → e-Transport</b>.
              <br /><br />Transporturile le adaugă și le șterge firma.
            </div>
          </>
        ) : (
          <>
            {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
            {!err && banda}
            {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
            {items != null && items.length === 0 && !err && <div class="adm-empty"><Icon name="truck" size={40} class="ic" /><div>Niciun transport (UIT) înregistrat.</div></div>}
            {items != null && items.length > 0 && (
              <>
                <div class="muted" style="font-size:12.5px;margin-bottom:12px">
                  {pornit ? 'Coduri UIT și starea transmisiei pozițiilor către ANAF.' : 'Codurile UIT ale transporturilor tale și termenele lor.'}
                  {/* Doar cine are dreptul „modifică flota" adaugă și șterge (și pe web serverul cere asta) —
                      unui dispecer sau unui rol de vizualizare fraza i-ar promite ceva ce nu poate face. */}
                  {poateModifica ? ' Adaugi și ștergi transporturi din aplicația web.' : ''}
                </div>
                <div class="adm-list">
                  {items.map((t) => {
                    const s = STATUS[t.status] || { label: t.status || '—', cls: '' };
                    // Termenul legal al codului UIT (valabil_pana) — „termenele" promise în fraza de sus. Doar
                    // la transporturile active e o urgență; la cele încheiate un cod expirat e normal.
                    const pana = t.valabil_pana ? new Date(t.valabil_pana).getTime() : NaN;
                    const expirat = (t.status || 'activ') === 'activ' && !isNaN(pana) && pana < Date.now();
                    return (
                      <div class="adm-item" style="align-items:flex-start">
                        <span class="ic-wrap"><Icon name="truck" size={19} /></span>
                        <span class="mid">
                          <div class="nm">UIT {t.uit || '—'}</div>
                          <div class="sub">{t.plate || t.imei || '—'} · {fmtDt(t.start_at)}{t.end_at ? ' → ' + fmtDt(t.end_at) : ''}</div>
                          {t.valabil_pana && (
                            <div class="sub" style={'margin-top:2px' + (expirat ? ';color:var(--red);font-weight:700' : '')}>
                              {expirat ? 'Codul UIT a expirat la ' : 'Codul UIT e valabil până la '}{fmtDt(t.valabil_pana)}
                            </div>
                          )}
                          {/* „Ultima transmisie ANAF" doar când raportarea chiar e pornită — altfel rândul
                              ar sugera o transmisie care nu există. */}
                          {pornit && <div class="sub" style="margin-top:2px">Ultima transmisie ANAF: {fmtDt(t.last_sent_at)}</div>}
                        </span>
                        <span class="rt"><span class={'adm-pill ' + s.cls}>{s.label}</span></span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
