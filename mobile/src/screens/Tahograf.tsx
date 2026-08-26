import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import './detail.css';
import './admin.css';
import './reports.css';
import './tacho.css';

function fmtDate(s: string | null) { if (!s) return '—'; try { return new Date(s).toLocaleDateString('ro-RO'); } catch { return String(s).slice(0, 10); } }
// Pe telefon rândul e îngust: „2026-07-31" tăia sfârșitul subtitlului. Data scurtă, românește.
function ziScurta(s: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? `${m[3]}.${m[2]}.${m[1].slice(2)}` : (s || '—');
}
function hm(min: number) { if (min == null) return '—'; const h = Math.floor(min / 60); const m = Math.round(min % 60); return h + 'h ' + m + 'm'; }

// Aceleași stări ca pe web: depășit / niciodată descărcat = roșu, aproape = portocaliu, restul verde.
function stareCls(s: string) { return (s === 'depasit' || s === 'niciodata') ? 'over' : s === 'curand' ? 'soon' : 'ok'; }
function stareCol(s: string) { return (s === 'depasit' || s === 'niciodata') ? 'var(--red)' : s === 'curand' ? '#f5b43c' : 'var(--accent)'; }

export function Tahograf() {
  const loc = useLocation();
  const [tab, setTab] = useState<'due' | 'files'>('due');
  const [due, setDue] = useState<any | null>(null);
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [detail, setDetail] = useState<any | null>(null);
  const [ist, setIst] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const nuEActiv = (e: any) => e?.status === 403;
    Api.tachoScadentar()
      .then(setDue)
      .catch((e: any) => { setErr(nuEActiv(e) ? 'Modulul tahograf nu este activ pe planul companiei tale.' : (e?.message || 'Eroare la încărcare')); setDue({}); });
    Api.tachoFiles()
      .then((d) => setItems(Array.isArray(d) ? d : []))
      .catch(() => setItems([]));
  }, []);

  async function open(id: number) {
    setLoadingDetail(true); setDetail({ loading: true });
    try { setDetail(await Api.tachoFile(id)); }
    catch { setDetail(null); }
    finally { setLoadingDetail(false); }
  }
  // Istoricul unui șofer / vehicul + GOLURILE: zilele pe care nu le poți dovedi la un control.
  async function openIstoric(driverId: number | null, imei: string | null, titlu: string) {
    setIst({ loading: true, titlu });
    try { setIst({ ...(await Api.tachoIstoric(driverId, imei)), titlu }); }
    catch (e: any) { setIst({ titlu, eroare: e?.message || 'Eroare la încărcare' }); }
  }

  function randDue(x: any, imei: string | null, sub: string, ic: 'user' | 'truck') {
    const pct = x.stare === 'niciodata' ? 100
      : Math.max(2, Math.min(100, Math.round(((x.prag - (x.zileRamase || 0)) / x.prag) * 100)));
    const mare = x.stare === 'niciodata' ? '—' : String(Math.abs(x.zileRamase));
    const mic = x.stare === 'niciodata' ? 'niciodată' : (x.zileRamase < 0 ? 'zile întârziere' : 'zile rămase');
    return (
      <button class={'th-due ' + stareCls(x.stare)} onClick={() => openIstoric(imei ? null : x.id, imei, x.nume)}>
        <Icon name={ic} size={19} class="ic" />
        <span class="mid">
          <div class="nm">{x.nume}</div>
          <div class="sub">{sub}</div>
          <div class="th-bar"><i style={`width:${pct}%;background:${stareCol(x.stare)}`} /></div>
        </span>
        <span class="rt" style={`color:${stareCol(x.stare)}`}><b>{mare}</b><span>{mic}</span></span>
      </button>
    );
  }

  // Cine NU e în listă și de ce. Cei fără categorii completate se numesc pe nume: e singurul caz în
  // care lipsa din listă poate ascunde un șofer profesionist real.
  function randExcluse(cuSoferi: boolean, cuVehicule: boolean) {
    const e = (due && due.excluse) || {};
    const fc: string[] = e.soferiFaraCategorie || [];
    const q: string[] = [];
    if (cuSoferi && e.soferiNeprofesionisti) q.push(e.soferiNeprofesionisti + (e.soferiNeprofesionisti === 1 ? ' șofer fără categorie de tahograf' : ' șoferi fără categorie de tahograf'));
    if (cuVehicule && e.vehiculeFaraTahograf) q.push(e.vehiculeFaraTahograf + (e.vehiculeFaraTahograf === 1 ? ' vehicul fără tahograf' : ' vehicule fără tahograf'));
    return (
      <>
        {cuSoferi && fc.length > 0 && (
          <div class="th-excl name">
            {fc.length} {fc.length === 1 ? 'șofer nu are' : 'șoferi nu au'} categoriile de pe permis completate: {fc.slice(0, 4).join(', ')}{fc.length > 4 ? ' +' + (fc.length - 4) : ''} — dacă vreunul e profesionist, completează-i categoriile din Șoferi, altfel nu apare aici.
          </div>
        )}
        {q.length > 0 && <div class="th-excl quiet">Nu apar aici: {q.join(' și ')} — n-au ce descărca.</div>}
      </>
    );
  }

  const soferi = (due && due.soferi) || [];
  const vehicule = (due && due.vehicule) || [];
  const sumar = (due && due.sumar) || {};
  const nume = (l: any[]) => l.length <= 3 ? l.map((x) => x.nume).join(', ') : l.slice(0, 3).map((x) => x.nume).join(', ') + ' +' + (l.length - 3);
  const depasite = soferi.concat(vehicule).filter((x: any) => x.stare === 'depasit');
  const niciodata = soferi.concat(vehicule).filter((x: any) => x.stare === 'niciodata');

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')}><Icon name="chevronL" /></button>
        <div class="h-title">Tahograf</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {!err && (
          <div class="th-tabs">
            <button class={'th-tab' + (tab === 'due' ? ' on' : '')} onClick={() => setTab('due')}>De descărcat</button>
            <button class={'th-tab' + (tab === 'files' ? ' on' : '')} onClick={() => setTab('files')}>Fișiere</button>
          </div>
        )}

        {!err && tab === 'due' && due == null && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {!err && tab === 'due' && due != null && (
          <>
            <div class="th-sum">
              {depasite.length > 0 && <div class="th-badge bad"><Icon name="alert" size={15} /> Termen depășit: {nume(depasite)}</div>}
              {niciodata.length > 0 && <div class="th-badge bad"><Icon name="ban" size={15} /> Niciodată descărcat: {nume(niciodata)}</div>}
              {sumar.curand > 0 && <div class="th-badge warn"><Icon name="clock" size={15} /> {sumar.curand} în următoarele 5 zile</div>}
              {/* Pe o listă goală, „totul e la zi" e o minciună liniștitoare: nu e nimic la zi, nu e
                  nimic de descărcat. Aceeași distincție ca pe web. */}
              {!depasite.length && !niciodata.length && !sumar.curand && (
                soferi.length + vehicule.length > 0
                  ? <div class="th-badge ok"><Icon name="check" size={15} /> Toate descărcările sunt la zi</div>
                  : <div class="th-badge warn"><Icon name="alert" size={15} /> Nimic de descărcat — niciun șofer cu card de tahograf și niciun vehicul cu tahograf</div>
              )}
            </div>

            <div class="th-gh"><Icon name="idCard" size={14} /> Carduri de șofer <em>la {due.praguri?.card} de zile</em></div>
            {soferi.length
              ? soferi.map((x: any) => randDue(x, null, (x.categorii ? x.categorii + ' · ' : '') + (x.ultima ? 'ultima descărcare ' + ziScurta(x.ultima) : 'nicio descărcare'), 'user'))
              : <div class="th-note">Niciun șofer profesionist. Card de tahograf au doar șoferii cu o categorie de marfă sau persoane pe permis (C, C1, CE, D, D1, DE). Le bifezi în Șoferi, la fișa omului.</div>}

            <div class="th-gh"><Icon name="truck" size={14} /> Memoria vehiculelor <em>la {due.praguri?.vu} de zile</em></div>
            {vehicule.length
              ? vehicule.map((x: any) => randDue(x, x.imei, (x.model ? x.model + ' · ' : '') + (x.ultima ? 'ultima descărcare ' + ziScurta(x.ultima) : 'nicio descărcare'), 'truck'))
              : <div class="th-note">Niciun vehicul cu tahograf în flotă. Se recunosc după „Categorie" din fișa vehiculului: Camion, TIR, Autotractor, Autobuz, Autocar.</div>}

            {randExcluse(true, true)}
            <div class="th-excl quiet" style="margin-top:14px">Încărcarea fișierelor .DDD se face din aplicația web.</div>
          </>
        )}

        {!err && tab === 'files' && items == null && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {!err && tab === 'files' && items != null && items.length === 0 && <div class="adm-empty"><Icon name="disc" size={40} class="ic" /><div>Niciun fișier tahograf încărcat. Încarcă .DDD din aplicația web.</div></div>}
        {!err && tab === 'files' && items != null && items.length > 0 && (
          <div class="adm-list">
            {items.map((f) => {
              const necitit = f.incredere === 'necitit';
              const grave = (f.parsed && f.parsed.totals && f.parsed.totals.infractiuniGrave) || 0;
              const total = (f.parsed && f.parsed.totals && f.parsed.totals.infractiuni) || 0;
              return (
                <button class="adm-item" onClick={() => open(f.id)} style="align-items:flex-start">
                  <span class="ic-wrap"><Icon name={necitit ? 'ban' : 'disc'} size={19} /></span>
                  <span class="mid">
                    <div class="nm">{f.driver_name || f.filename || 'Fișier tahograf'}</div>
                    {/* Un fișier necitit NU e o descărcare — se vede la fel de clar ca pe web, altfel
                        rândul ar arăta ca o dovadă pe care n-o ai. */}
                    <div class="sub">{necitit ? 'nu s-a putut citi — nu contează ca descărcare' : `${f.kind || '—'} · ${fmtDate(f.period_from)} – ${fmtDate(f.period_to)}`}</div>
                  </span>
                  <span class="rt">
                    <span class={'adm-pill ' + (necitit ? 'bad' : grave > 0 ? 'bad' : total > 0 ? 'warn' : 'ok')}>{necitit ? 'necitit' : total > 0 ? total + ' infr.' : 'OK'}</span>
                    <Icon name="chevronR" size={18} color="var(--text-muted)" />
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {ist && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) setIst(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="disc" size={18} color="var(--accent)" /> {ist.titlu}</b><button class="h-btn" onClick={() => setIst(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              {ist.loading ? <div class="spin" style="margin:24px auto" /> : ist.eroare ? <div class="adm-empty" style="color:var(--red)">{ist.eroare}</div> : (
                <>
                  <div class="th-gh" style="margin-top:0"><Icon name="fileBar" size={14} /> Descărcări <em>{(ist.fisiere || []).length}</em></div>
                  {(ist.fisiere || []).length === 0 && <div class="th-note">Nicio descărcare.</div>}
                  {(ist.fisiere || []).map((f: any) => {
                    const necitit = f.incredere === 'necitit';
                    const per = (f.period_from && f.period_to) ? (ziScurta(String(f.period_from).slice(0, 10)) + ' → ' + ziScurta(String(f.period_to).slice(0, 10))) : 'fără perioadă';
                    const tt = f.totals || {};
                    return (
                      <button class={'th-due ' + (necitit ? 'over' : 'ok')} onClick={() => open(f.id)}>
                        <Icon name={necitit ? 'ban' : 'disc'} size={18} class="ic" />
                        <span class="mid">
                          <div class="nm">{f.filename}</div>
                          <div class="sub">{per}{necitit ? ' · nu s-a putut citi' : (tt.zile ? ` · ${tt.zile} zile · ${Math.round((tt.conducereMin || 0) / 60)}h condus` : '')}</div>
                        </span>
                        <Icon name="chevronR" size={16} color="var(--text-muted)" />
                      </button>
                    );
                  })}
                  {(ist.goluri || []).length > 0 && (
                    <>
                      {/* Titlu portocaliu, nu verde: rândurile de dedesubt sunt o problemă, nu o rubrică. */}
                      <div class="th-gh warn"><Icon name="alert" size={14} /> Zile pe care nu le poți dovedi</div>
                      {ist.goluri.map((g: any) => (
                        <div class="th-gap">
                          <Icon name="calendar" size={17} color="#f5b43c" />
                          <span><b>{g.zile} {g.zile === 1 ? 'zi lipsă' : 'zile lipsă'}</b><span>{ziScurta(g.de)} → {ziScurta(g.pana)} — nu există nicio descărcare pentru perioada asta</span></span>
                        </div>
                      ))}
                    </>
                  )}
                  {!(ist.goluri || []).length && ist.acoperit > 1 && (
                    <div class="th-badge ok" style="margin-top:10px"><Icon name="check" size={15} /> Arhivă fără goluri</div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) setDetail(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="disc" size={18} color="var(--accent)" /> {detail.driver_name || detail.filename || 'Tahograf'}</b><button class="h-btn" onClick={() => setDetail(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              {(loadingDetail || detail.loading) ? <div class="spin" style="margin:24px auto" /> : (() => {
                const p = detail.parsed || {};
                const t = p.totals || {};
                const infr = Array.isArray(p.infringements) ? p.infringements : [];
                // Regula de aur a secțiunii: dintr-un fișier necitit NU iese nicio cifră. Aici o
                // respectăm arătând motivul, nu patru zerouri care ar trece drept măsurători.
                if (p.incredere === 'necitit') {
                  return <div class="th-note"><b style="color:var(--red)">Fișierul nu a putut fi citit.</b><br />{p.parseNote || 'Structura nu se potrivește cu un fișier de tahograf.'}<br /><br />Nu scoatem ore dintr-un fișier pe care nu-l înțelegem și nu îl socotim ca descărcare făcută.</div>;
                }
                return (
                  <>
                    <div class="rp-summary" style="margin-bottom:14px">
                      <div class="rp-kpi"><div class="v">{hm(t.conducereMin || 0)}</div><div class="l">Conducere</div></div>
                      <div class="rp-kpi"><div class="v">{hm(t.odihnaMin || 0)}</div><div class="l">Odihnă</div></div>
                      <div class="rp-kpi"><div class="v">{t.km != null ? Math.round(t.km) : '—'}</div><div class="l">km</div></div>
                      <div class="rp-kpi"><div class="v">{t.zile ?? '—'}</div><div class="l">Zile</div></div>
                    </div>
                    <div class="np-card" style="margin-bottom:0">
                      <div class="np-head"><span class="np-lbl">Abateri</span><span class={'adm-pill ' + (infr.length ? 'bad' : 'ok')}>{infr.length || 0}</span></div>
                      {infr.length === 0
                        ? <div class="muted" style="font-size:13px;margin-top:10px">Nicio abatere detectată.</div>
                        : <div class="np-sub">{infr.map((i: any) => (
                            <div style="display:flex;gap:8px;align-items:flex-start">
                              <span class={'adm-pill ' + (i.severity === 'gravă' ? 'bad' : 'warn')} style="flex:0 0 auto">{i.severity || 'minoră'}</span>
                              <span style="font-size:13px">{i.text || i.rule || i.type || 'Abatere'}{i.date ? ' · ' + fmtDate(i.date) : ''}</span>
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
