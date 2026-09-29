import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import type { ComponentChildren } from 'preact';
import { Preferences } from '@capacitor/preferences';
import { Api } from '../api/endpoints';
import { Icon, type IconName } from '../components/Icon';
import { AntetFondator, Banda, adresaFirmei } from '../components/FondatorUi';
import {
  nr, intrebari, lunaNume, costLunaLei, cifreLuna, costFirmaLei, profitFirmaLei,
  estimare, costLunaIstLei, baniLuna, profitLunaIst, neincasatLunaLei, luniCuViata, statIstoric,
} from '../components/insightBani';
import './admin.css';
import './fondator.css';

// „Utilizare RA Insight" (AI & Module) — dashboard-ul de pe web (raxLoadAiUsage), pe o coloană: avertismentele,
// banii lunii curente, clienții, istoricul pe 12 luni (buton „Istoric", oprit din start, alegerea se ține minte) și
// „Firmă cu firmă". Aceleași cifre după care se face factura; toate sumele în lei și €, după cursul trimis de server.
// Telefonul nu socotește bani: vezi components/insightBani.ts (serverul câștigă când trimite cifra gata socotită).
const PREF_ISTORIC = 'raAiuIstoric';
const n = (v: any) => Number(v) || 0;

function Lei({ v, fx }: { v: any; fx: number }) {
  return <>{nr(v)} lei <span style="font-weight:400;color:var(--text-muted);font-size:.82em">({nr(n(v) / fx)} €)</span></>;
}
function dataScurta(t: any) { if (!t) return '—'; try { return new Date(t).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short' }); } catch { return '—'; } }

// Starea firmei, în trei cuvinte. Ordinea contează: „fond terminat" bate „folosește".
function stare(r: any): { t: string; c: string } {
  if (!r.enabled) return { t: 'fără RA Insight', c: 'var(--text-muted)' };
  if (r.epuizat) return { t: 'fond terminat', c: 'var(--fd-bad)' };
  if (r.used > 0) return { t: 'folosește', c: 'var(--fd-ok)' };
  if (r.conturi > 0) return { t: 'conturi date, zero întrebări', c: 'var(--fd-warn)' };
  return { t: 'niciun cont dat', c: 'var(--fd-warn)' };
}

function Kpi({ cap, icon, val, sub, jos, ton, lat }: { cap: string; icon: IconName; val: ComponentChildren; sub?: ComponentChildren; jos?: ComponentChildren; ton?: string; lat?: boolean }) {
  return (
    <div class={'fd-kpi' + (ton ? ' ' + ton : '') + (lat ? ' lat' : '')}>
      <div class="cap"><Icon name={icon} size={12} /> {cap}</div>
      <div class="v" style={ton === 'ok' ? 'color:var(--fd-ok)' : ton === 'bad' ? 'color:var(--fd-bad)' : ''}>{val}</div>
      {sub ? <div class="sub">{sub}</div> : null}
      {jos ? <div class="jos">{jos}</div> : null}
    </div>
  );
}

// Graficul lunilor: bare facturat vs. încasat (luna estimată e portocalie). Cât timp nu facturăm nimănui, un grafic
// de bani e o grilă goală — atunci arătăm întrebările puse lună de lună. Desenat din bare simple, pe ambele teme.
function Grafic({ luni }: { luni: any[] }) {
  const l = luni.filter((m) => n(m.intrebari) > 0 || n(m.facturatLei) !== 0 || n(m.estimatLei) > 0);
  if (!l.length) return null;
  const areBani = l.some((m) => n(m.facturatLei) !== 0 || n(m.estimatLei) > 0);
  const val1 = l.map((m) => Math.max(0, areBani ? baniLuna(m) : n(m.intrebari)));
  const val2 = l.map((m) => Math.max(0, areBani ? n(m.incasatLei) : 0));
  const max = Math.max(1, ...val1, ...val2);
  const H = 120;
  return (
    <div class="fd-card">
      <div style={'font-size:12px;font-weight:800;margin-bottom:8px;color:' + (areBani ? 'var(--text-muted)' : 'var(--fd-warn)')}>
        {areBani ? 'Facturat vs. încasat, pe lună' : 'Întrebări pe lună — bani n-avem încă de arătat'}
      </div>
      <div style="display:flex;gap:10px;overflow-x:auto;padding-bottom:4px">
        {l.map((m, i) => {
          const est = areBani && estimare(m) > 0;
          return (
            <div style="flex:0 0 auto;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:34px">
              <div style={'font-size:10px;font-weight:700;color:var(--text-secondary);white-space:nowrap'}>{areBani ? nr(val1[i]) : val1[i]}</div>
              <div style={'display:flex;align-items:flex-end;gap:3px;height:' + H + 'px'}>
                <div style={'width:12px;border-radius:4px 4px 0 0;height:' + Math.max(2, Math.round((val1[i] / max) * H)) + 'px;background:' + (est ? 'color-mix(in srgb, var(--orange) 45%, transparent)' : 'color-mix(in srgb, var(--accent) 40%, transparent)') + ';border:1.5px solid ' + (est ? 'var(--orange)' : 'var(--accent)')} />
                {areBani && <div style={'width:12px;border-radius:4px 4px 0 0;height:' + Math.max(2, Math.round((val2[i] / max) * H)) + 'px;background:var(--accent)'} />}
              </div>
              <div style="font-size:10px;color:var(--text-muted);white-space:nowrap">{lunaNume(m.luna)}</div>
            </div>
          );
        })}
      </div>
      {areBani && (
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:11px;color:var(--text-muted);margin-top:6px">
          <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;border:1.5px solid var(--accent);background:color-mix(in srgb, var(--accent) 40%, transparent);margin-right:4px" />Facturat</span>
          <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:var(--accent);margin-right:4px" />Încasat</span>
          <span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;border:1.5px solid var(--orange);margin-right:4px" />estimat, încă nefacturat</span>
        </div>
      )}
    </div>
  );
}

export function AiUsage() {
  const loc = useLocation();
  const [d, setD] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [ist, setIst] = useState(false);
  const [deschise, setDeschise] = useState<Record<string, boolean>>({});

  function reload() {
    setErr('');
    Api.aiUsage().then((x) => {
      setD(x);
      // Desfăcute din start firmele care CHIAR au RA Insight — pentru ele venim aici. Restul, strânse.
      const o: Record<string, boolean> = {};
      ((x && x.rows) || []).forEach((r: any) => { o[String(r.id)] = !!(r.enabled || r.used > 0); });
      setDeschise(o);
    }).catch((e: any) => setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'indisponibil')));
  }
  useEffect(() => {
    reload();
    // „Istoric" e oprit din start; alegerea se ține minte pe telefonul ăsta.
    Preferences.get({ key: PREF_ISTORIC }).then((r) => setIst(r.value === '1')).catch(() => {});
  }, []);
  function comutaIstoric() {
    const v = !ist; setIst(v);
    Preferences.set({ key: PREF_ISTORIC, value: v ? '1' : '0' }).catch(() => {});
  }

  const s = (d && d.summary) || {};
  const rows: any[] = (d && d.rows) || [];
  const istoric: any[] = (d && d.istoric) || [];
  const fx = n(d && d.fxEur) || 5;
  const toateDeschise = rows.length > 0 && rows.every((r) => deschise[String(r.id)]);
  function toate(on: boolean) { const o: Record<string, boolean> = {}; rows.forEach((r) => { o[String(r.id)] = on; }); setDeschise(o); }

  // ── Avertismentele: ce nu e în regulă și trebuie spus tare ──
  const cuPret = rows.filter((x) => n(x.pretCont) > 0).length;
  const cuModul = rows.filter((x) => x.enabled).length;
  const costLuna = costLunaLei(s, fx);
  // Prețul pe cont se pune din fișa firmei, fila „Abonament & plăți" (pe web: Conturi & Abonamente — ecran pe care
  // telefonul nu-l are). O singură firmă fără preț → banda o deschide direct; mai multe → lista de firme.
  const faraPret = rows.filter((x) => x.enabled && !(n(x.pretCont) > 0));
  const spreFaraPret = () => loc.route(faraPret.length === 1 ? adresaFirmei(faraPret[0].id, 'abonament') : '/admin/companies');
  const UNDE_PRET = <>din <b>Companii → firma → Abonament &amp; plăți</b></>;

  // ── Cifrele lunii curente (toate sumele din insightBani.ts, ca să le prindă proba de paritate cu web-ul) ──
  const cl = cifreLuna(s, istoric, fx);
  const venit = cl.venitLei, profit = cl.profitLei, marja = cl.marja, peCont = cl.peContLei, peIntrebare = cl.peIntrebareLei, tnd = cl.tendinta;
  const conturi = n(s.conturi);
  const conturiAcum = rows.reduce((a, x) => a + n(x.conturi), 0);
  const nrInt = n(s.totalCalls), fond = n(s.fond);
  const pct = fond > 0 ? Math.min(100, Math.round((nrInt / fond) * 100)) : null;
  const culFond = fond && nrInt >= fond ? 'var(--red)' : pct != null && pct >= 80 ? 'var(--orange)' : 'var(--accent)';

  // ── Istoricul ──
  const luni = luniCuViata(istoric);
  const st = statIstoric(luni, fx, d && d.istoricStat);
  const neincasatTot = st.neincasatLei;

  // Butonul spre fila „Abonament & plăți" a firmei, unde se pune prețul pe cont și fondul de întrebări.
  const spreAbonament = (r: any) => (
    <button type="button" class="fd-btn acc" style="margin-top:6px" onClick={() => loc.route(adresaFirmei(r.id, 'abonament'))}>
      <Icon name="coins" size={14} /> Deschide Abonament &amp; plăți
    </button>
  );

  function socoteala(r: any) {
    const l: ComponentChildren[] = [];
    if (r.peCont > 0 && r.conturi === 0 && r.deFacturat === 0) {
      l.push(<>Firma are RA Insight în ofertă, dar <b>nu a dat niciun cont</b> — deocamdată nu poate întreba nimeni și nu se facturează nimic.</>);
      l.push(<>Un cont ar aduce {intrebari(r.peCont)} pe lună{r.pretCont > 0 ? <>, la <Lei v={r.pretCont} fx={fx} /></> : null}. Se aprinde din <b>Utilizatori</b>, de administratorul firmei.</>);
    } else if (r.peCont > 0) {
      l.push(<><b>{r.conturi}</b> {r.conturi === 1 ? 'cont' : 'conturi'} × <b>{intrebari(r.peCont)}</b> = <b>{intrebari(r.fond)}</b> pe lună</>);
      if (r.deFacturat > r.conturi) l.push(<>Se facturează <b>{r.deFacturat}</b> conturi — atâtea a avut <b>cel mult</b> luna asta (unul a fost stins pe parcurs, dar l-a folosit)</>);
      if (r.pretCont > 0) l.push(<><b>{r.deFacturat}</b> × <Lei v={r.pretCont} fx={fx} /> = <Lei v={r.venitLei} fx={fx} /> pe lună</>);
      else l.push(<><span style="color:var(--fd-warn)">Fără preț pe cont în contract — nu se facturează nimic.</span> Se pune din fișa firmei, fila <b>Abonament &amp; plăți</b>.<br />{spreAbonament(r)}</>);
    } else if (r.vechi) {
      l.push(<>Contract vechi, cu <b>cotă fixă pe firmă</b>: {intrebari(r.fond)} pe lună, indiferent de câte conturi are.</>);
      l.push(<>La reînnoire se trece pe conturi.</>);
    } else if (r.enabled) {
      l.push(<><span style="color:var(--fd-warn)">Fără fond stabilit — întreabă <b>nelimitat</b>, pe banii noștri.</span> Se pune din fișa firmei, fila <b>Abonament &amp; plăți</b>.<br />{spreAbonament(r)}</>);
    } else {
      l.push(<>Firma nu are RA Insight în ofertă.</>);
    }
    return l.map((x) => <div style="margin:3px 0">• {x}</div>);
  }
  function oameni(r: any) {
    if (!r.oameni || !r.oameni.length) return <div style="color:var(--text-muted)">Niciun cont cu RA Insight.</div>;
    return r.oameni.map((o: any) => (
      <div style="display:flex;gap:8px;align-items:baseline;padding:6px 0;border-top:1px solid var(--border);flex-wrap:wrap">
        <span style="flex:1 1 140px;min-width:0;overflow-wrap:anywhere">{o.nume}</span>
        {o.loc
          ? (o.activ ? <span style="color:var(--fd-ok);font-weight:700">● cont</span> : <span style="color:var(--text-muted)">● cont, om dezactivat</span>)
          : <span style="color:var(--fd-bad);font-weight:700">fără cont</span>}
        <span style={o.used ? '' : 'color:var(--text-muted)'}>{intrebari(o.used)}</span>
        <span style="color:var(--text-muted)">{dataScurta(o.lastUsed)}</span>
      </div>
    ));
  }
  function semnale(r: any) {
    const l: { c: string; t: ComponentChildren }[] = [];
    if (r.folosFaraCont) l.push({ c: 'var(--fd-bad)', t: r.folosFaraCont + (r.folosFaraCont === 1 ? ' om a întrebat fără să aibă cont' : ' oameni au întrebat fără să aibă cont') + ' — ar trebui să fie imposibil, verifică.' });
    if (r.epuizat) l.push({ c: 'var(--fd-bad)', t: 'Fondul lunii s-a terminat. Clientul primește doar întrebările gratuite până pe 1.' });
    else if (r.pct != null && r.pct >= 80) l.push({ c: 'var(--fd-warn)', t: 'A consumat ' + r.pct + '% din fond — mai are ' + intrebari(r.ramase) + '.' });
    if (r.contFaraFolos) l.push({ c: 'var(--fd-warn)', t: r.contFaraFolos + (r.contFaraFolos === 1 ? ' cont plătit, nefolosit' : ' conturi plătite, nefolosite') + ' luna asta — merită un telefon.' });
    if (r.contPeInactiv) l.push({ c: 'var(--text-muted)', t: r.contPeInactiv + (r.contPeInactiv === 1 ? ' cont e pe un om dezactivat' : ' conturi sunt pe oameni dezactivați') + ' — nu se facturează.' });
    return l.map((x) => <div style={'color:' + x.c + ';margin-top:6px;font-size:12.5px;line-height:1.45'}><Icon name="alertO" size={13} style="vertical-align:-2px;margin-right:4px" />{x.t}</div>);
  }

  return (
    <div class="screen">
      <AntetFondator titlu="Utilizare RA Insight" onBack={() => loc.route('/meniu')} onRefresh={reload} />
      <div class="content has-tabbar" style="padding-bottom:24px">
        {err && <div class="adm-empty" style="color:var(--red)">Eroare: {err}</div>}
        {!d && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {d && (
          <>
            <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px">
              <span class="fd-sec" style="margin:0;flex:1 1 auto"><Icon name="sparkles" size={13} /> RA Insight — dashboard</span>
              <button type="button" class={'fd-btn' + (ist ? ' primary' : '')} onClick={comutaIstoric}><Icon name="chart" size={14} /> Istoric{ist ? '' : ' (oprit)'}</button>
              <button type="button" class="fd-btn" onClick={() => toate(!toateDeschise)}>{toateDeschise ? 'Strânge toate' : 'Desfășoară toate'}</button>
            </div>

            {cuModul > 0 && cuPret === 0 && (
              <Banda ton="bad" onClick={spreFaraPret}><b>Nicio firmă nu plătește RA Insight.</b> {intrebari(nrInt)} luna asta ne costă <Lei v={costLuna} fx={fx} />, fără niciun venit. Prețul pe cont se pune pe fiecare firmă, {UNDE_PRET}.</Banda>
            )}
            {!(cuModul > 0 && cuPret === 0) && cuModul > cuPret && (
              <Banda ton="warn" onClick={spreFaraPret}>{cuModul - cuPret}{cuModul - cuPret === 1 ? ' firmă are RA Insight fără preț pe cont' : ' firme au RA Insight fără preț pe cont'} — întreabă pe gratis. Se pune {UNDE_PRET}.</Banda>
            )}
            {n(s.epuizate) > 0 && (
              <Banda ton="bad">{s.epuizate}{s.epuizate === 1 ? ' firmă și-a terminat' : ' firme și-au terminat'} fondul lunii — primesc doar întrebările gratuite până pe 1.</Banda>
            )}

            <div class="fd-sec">Banii, luna curentă</div>
            <div class="fd-kpis">
              <Kpi lat cap="Încasăm" icon="download" val={<Lei v={venit} fx={fx} />} ton={venit > 0 ? 'ok' : ''}
                sub={conturi > 0 ? <>{conturi} {conturi === 1 ? 'cont' : 'conturi'}{peCont ? ' × ' + nr(peCont) + ' lei în medie' : ''}</> : 'niciun cont de facturat'}
                jos={tnd ? <><span style={'font-weight:700;color:' + (tnd.pct >= 0 ? 'var(--fd-ok)' : 'var(--fd-bad)')}>{tnd.pct >= 0 ? '▲ +' : '▼ '}{tnd.pct}%</span> față de luna trecută{tnd.estimat ? <span style="color:var(--fd-warn)"> (estimat)</span> : null}</> : undefined} />
              <Kpi cap="Ne costă" icon="cpu" val={<Lei v={costLuna} fx={fx} />}
                sub={<>{intrebari(nrInt)}{peIntrebare ? ' · ' + nr(peIntrebare) + ' lei una' : ''}</>} jos="plata către model" />
              <Kpi cap="Profit" icon="coins" val={<Lei v={profit} fx={fx} />} ton={venit > 0 ? (profit >= 0 ? 'ok' : 'bad') : 'bad'}
                sub={venit > 0 ? 'marjă ' + marja + '%' : 'încă nu facturăm RA Insight nimănui'} jos="din RA Insight, nu din tot RA Tracks" />
            </div>

            <div class="fd-sec">Clienții</div>
            <div class="fd-kpis">
              <Kpi cap="Firme cu RA Insight" icon="building" val={<>{n(s.withFeature)} <span class="mic">din {n(s.companies)}</span></>}
                sub={n(s.active) + ' îl folosesc efectiv'}
                jos={cuPret < n(s.withFeature) ? <span style="color:var(--fd-warn)">{n(s.withFeature) - cuPret} fără preț pe cont</span> : 'toate au preț pe cont'} />
              <Kpi cap="Conturi de facturat" icon="idCard" val={String(conturi)}
                sub={<>{conturiAcum}{conturiAcum === 1 ? ' aprins acum' : ' aprinse acum'}{conturi > conturiAcum ? ' · ' + (conturi - conturiAcum) + (conturi - conturiAcum === 1 ? ' stins' : ' stinse') + ' pe parcurs' : ''}</>}
                jos={peCont ? <>un cont aduce <Lei v={peCont} fx={fx} /></> : 'fără preț pe cont'} />
              <Kpi lat cap="Întrebări" icon="report" val={<>{nrInt}{fond ? <span class="mic"> din {fond}</span> : null}</>} ton={fond && nrInt >= fond ? 'bad' : ''}
                sub={fond ? <div class="fd-fond"><div style={'width:' + pct + '%;background:' + culFond} /></div> : 'fără fond stabilit'}
                jos={fond ? (nrInt >= fond ? 'fondul s-a terminat' : (fond - nrInt) + ' rămase din fondul lunii') : 'nimeni nu e limitat'} />
            </div>

            {ist && (
              luni.length === 0 ? (
                <>
                  <div class="fd-sec">Istoric</div>
                  <div class="fd-note">Încă nu e nimic de arătat aici. Se umple singur: <b>luna curentă</b> apare imediat ce prima firmă are un cont de RA Insight cu preț în contract, iar <b>lunile trecute</b>, pe măsură ce ies facturile.</div>
                </>
              ) : (
                <>
                  <div class="fd-sec">Istoric — ultimele {luni.length}{luni.length === 1 ? ' lună' : ' luni'}</div>
                  <div class="fd-kpis">
                    <Kpi cap="Facturat" icon="report" val={<Lei v={st.facturatLei} fx={fx} />} sub="în toată perioada" jos="fără TVA, doar rândurile de RA Insight" />
                    <Kpi cap="Intrat în cont" icon="coins" val={<Lei v={st.incasatLei} fx={fx} />} ton={neincasatTot > 0.01 ? 'warn' : 'ok'}
                      sub={neincasatTot > 0.01 ? nr(neincasatTot) + ' lei încă neplătiți de clienți' : 'tot ce am facturat a fost plătit'}
                      jos={st.rataIncasare == null ? undefined : 'rată de încasare ' + st.rataIncasare + '%'} />
                    <Kpi lat cap="Profit" icon="coins" val={<Lei v={st.profitLei} fx={fx} />} ton={st.profitLei >= 0 ? 'ok' : 'bad'}
                      sub={st.marja == null ? undefined : 'marjă ' + st.marja + '%'} jos="după plata către model" />
                  </div>
                  <Grafic luni={luni} />
                  <div class="fd-card">
                    {luni.map((m) => {
                      const est = estimare(m);
                      const ramas = profitLunaIst(m, fx);
                      const neinc = neincasatLunaLei(m);
                      const bani = baniLuna(m);
                      const cost = costLunaIstLei(m, fx);
                      return (
                        <div class={'fd-luna' + (est ? ' est' : '')}>
                          <div class="r1"><span>{lunaNume(m.luna)}</span><span style={'color:' + (ramas >= 0 ? 'var(--fd-ok)' : 'var(--fd-bad)')}>profit <Lei v={ramas} fx={fx} /></span></div>
                          <div class="r2">
                            <span>{n(m.intrebari) ? intrebari(m.intrebari) : '— întrebări'}</span>
                            <span>a costat {cost ? <Lei v={cost} fx={fx} /> : '—'}</span>
                            <span>facturat {bani ? <b style="color:var(--text-primary)"><Lei v={bani} fx={fx} /></b> : '—'}{n(m.conturi) ? ' · ' + m.conturi + (m.conturi === 1 ? ' cont' : ' conturi') : ''}</span>
                            <span>intrat în cont {n(m.incasatLei) ? <Lei v={m.incasatLei} fx={fx} /> : '—'}</span>
                            {est ? <span style="color:var(--fd-warn)">estimat — încă nefacturat</span> : null}
                            {neinc > 0.01 ? <span style="color:var(--fd-warn)">{nr(neinc)} lei neîncasați</span> : null}
                          </div>
                        </div>
                      );
                    })}
                    <div class="fd-luna" style="border-top:2px solid var(--border)">
                      <div class="r1"><span>Total</span><span style={'color:' + (st.profitLei >= 0 ? 'var(--fd-ok)' : 'var(--fd-bad)')}>profit <Lei v={st.profitLei} fx={fx} /></span></div>
                      <div class="r2">
                        <span>{intrebari(st.intrebari)}</span>
                        <span>a costat <Lei v={st.costLei} fx={fx} /></span>
                        <span>facturat <b style="color:var(--text-primary)"><Lei v={st.facturatLei} fx={fx} /></b></span>
                        <span>intrat în cont <Lei v={st.incasatLei} fx={fx} /></span>
                      </div>
                    </div>
                  </div>
                  <div class="fd-note">Cifrele vin din <b>facturile emise</b> (fără TVA) — ciornele, proformele și facturile anulate nu intră, storno-urile scad. Luna curentă, până se emite factura, e <b>estimată</b> din conturile aprinse (scrie pe ea) și NU intră în total. „Ne-a costat" e plata către model, convertită în lei la cursul de azi.</div>
                </>
              )
            )}

            <div class="fd-sec">Firmă cu firmă</div>
            {rows.length === 0 && <div class="adm-empty">Nicio companie.</div>}
            {rows.map((r) => {
              const sg = stare(r);
              const e = !!deschise[String(r.id)];
              const pctR = r.pct == null ? null : Math.min(100, r.pct);
              const cul = r.epuizat ? 'var(--red)' : r.pct != null && r.pct >= 80 ? 'var(--orange)' : 'var(--accent)';
              const costR = costFirmaLei(r, fx);
              const profitR = profitFirmaLei(r, fx);
              return (
                <div class="fd-card" key={r.id}>
                  <button type="button" onClick={() => setDeschise((m) => ({ ...m, [String(r.id)]: !e }))}
                    style="display:flex;align-items:flex-start;gap:8px;width:100%;text-align:left;background:transparent;border:none;padding:0;font-family:inherit;color:var(--text-primary);flex-wrap:wrap">
                    <span style="flex:1 1 auto;min-width:0;font-weight:800;font-size:15px;overflow-wrap:anywhere">{r.name}</span>
                    <span class="fd-pill" style={'color:' + sg.c + ';border-color:' + sg.c}>{sg.t}</span>
                    <Icon name={e ? 'arrowDown' : 'chevronR'} size={16} color="var(--text-muted)" />
                  </button>
                  <div class="meta">
                    {r.conturi} {r.conturi === 1 ? 'cont' : 'conturi'}
                    {r.deFacturat > r.conturi ? <span style="color:var(--fd-warn)"> ({r.deFacturat} de facturat)</span> : null}
                  </div>
                  {r.enabled && (
                    <>
                      {pctR == null
                        ? <div style="font-size:12.5px;color:var(--text-muted);margin-top:6px">{intrebari(r.used)} · fără fond stabilit</div>
                        : <div style="margin-top:6px"><div style="font-size:12.5px"><b>{r.used}</b> din {intrebari(r.fond)} <span style="color:var(--text-muted)">· {r.pct}%</span></div><div class="fd-fond"><div style={'width:' + pctR + '%;background:' + cul} /></div></div>}
                      <div style="display:flex;gap:4px 12px;flex-wrap:wrap;font-size:12.5px;margin-top:6px">
                        {n(r.venitLei) > 0 ? <span>încasăm <b><Lei v={r.venitLei} fx={fx} /></b></span> : <span style="color:var(--text-muted)">nu se facturează</span>}
                        <span style="color:var(--text-muted)">ne costă <Lei v={costR} fx={fx} /></span>
                        {n(r.venitLei) > 0 ? <span>profit <b style={'color:' + (profitR >= 0 ? 'var(--fd-ok)' : 'var(--fd-bad)')}><Lei v={profitR} fx={fx} /></b></span> : null}
                      </div>
                    </>
                  )}
                  {semnale(r)}
                  {e && (
                    <div class="fd-det" style="font-size:12.5px;line-height:1.5;padding-top:8px">
                      <div class="fd-sec" style="margin:4px 0 4px">Cum iese cifra</div>
                      {socoteala(r)}
                      {r.enabled && (<><div class="fd-sec" style="margin:12px 0 4px">Cine are cont</div>{oameni(r)}</>)}
                      {n(r.facturatLei) ? (
                        <>
                          <div class="fd-sec" style="margin:12px 0 4px">Ce am facturat pe RA Insight</div>
                          <div>În ultimele 12 luni: <b><Lei v={r.facturatLei} fx={fx} /></b>
                            {n(r.incasatLei) !== n(r.facturatLei)
                              ? <> — a intrat în cont: <b><Lei v={r.incasatLei} fx={fx} /></b>, restul e neplătit</>
                              : <> — <span style="color:var(--fd-ok)">a plătit tot</span></>}
                          </div>
                        </>
                      ) : null}
                      <div style="margin-top:8px;color:var(--text-muted);font-size:11.5px">Ultima întrebare: {dataScurta(r.lastUsed)} · conturile se aprind și se sting de administratorul firmei, din <b>Utilizatori</b>; noi primim notificare.</div>
                    </div>
                  )}
                </div>
              );
            })}
            <div class="fd-note" style="margin-top:12px">
              Cifrele fără etichetă de istoric sunt ale lunii curente și se reînnoiesc pe 1. „Conturi de facturat" = câte conturi a avut firma <b>cel mult</b> luna asta — regula din contract. Cei 6 agenți AI merg pe reguli fixe, nu costă tokeni și nu apar aici; se configurează din pagina <b>Agenți AI</b> din meniu.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
