import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import type { ComponentChildren } from 'preact';
import { Preferences } from '@capacitor/preferences';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon, type IconName } from '../components/Icon';
import { Confirma } from '../components/FlotaUi';
import { AntetFondator, adresaFirmei } from '../components/FondatorUi';
import { Gros } from '../components/InsightText';
import {
  nr, intrebari, lunaNume, lei, tilePachete, atentie, randFirma, planSursa, textFaraInsight, NIMIC_ATENTIE, NICIO_FIRMA, NOTA_CONTROL,
  estimare, costLunaIstLei, baniLuna, profitLunaIst, neincasatLunaLei, luniCuViata, statIstoric, type Atentie,
} from '../components/insightBani';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import './admin.css';
import './fondator.css';

// „RA Insight · control" (fondatorii), ca pe web (raxLoadAiUsage): patru cifre sus, „Ce cere atenție", un rând pe firmă cu amănuntul la
// o apăsare, soldul Anthropic, „Sursă externă" pe toată platforma și istoricul pe 12 luni (buton „Istoric", oprit din start, alegerea
// se ține minte). Toate sumele în lei și €, după cursul trimis de server. Telefonul nu socotește bani: vezi components/insightBani.ts.
// „Proba modelelor" și „Cheia Anthropic" rămân pe web (cer un ecran mare, respectiv Dashboard platformă, pe care telefonul nu-l are).
const PREF_ISTORIC = 'raAiuIstoric';
const n = (v: any) => Number(v) || 0;

function Lei({ v, fx }: { v: any; fx: number }) {
  return <>{nr(v)} lei <span style="font-weight:400;color:var(--text-muted);font-size:.82em">({nr(n(v) / fx)} €)</span></>;
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
  const [deschis, setDeschis] = useState<Record<string, boolean>>({});
  const [foaie, setFoaie] = useState<{ fel: 'sold' } | { fel: 'sursa'; x: any } | null>(null);
  const [busy, setBusy] = useState(false);
  useInapoiInchide(!!foaie, () => { setFoaie(null); return true; });

  function reload() {
    setErr('');
    Api.aiUsage().then((x) => { setD(x); })
      .catch((e: any) => setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'indisponibil')));
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
  // Soldul îl scriem noi, o dată (web: raxAiSold); de atunci serverul scade ce se cheltuie.
  async function salveazaSold(v?: string) {
    setBusy(true);
    try { await Api.insightSold(String(v == null ? '' : v).replace(',', '.').trim()); setFoaie(null); reload(); }
    catch (e: any) { showToast((e && e.message) || 'Eroare', true); }
    setBusy(false);
  }
  // „Sursă externă" pe toată platforma (web: raxAiSursa): serverul întreabă pe loc Anthropic dacă modelul primește căutarea.
  async function puneSursa(x: any) {
    setBusy(true);
    try {
      const j = await Api.adminSursaExterna(x.k);
      setFoaie(null);
      showToast('Sursă externă: ' + x.t + '. ' + (j.model || ''), j.modelOk === false);
      reload();
    } catch (e: any) { showToast((e && e.message) || 'Eroare', true); }
    setBusy(false);
  }

  const s = (d && d.summary) || {};
  const rows: any[] = (d && d.rows) || [];
  const istoric: any[] = (d && d.istoric) || [];
  const fx = n(d && d.fxEur) || 5;
  const p = d && d.pachete;
  const cuInsight = rows.filter((x) => x.enabled);
  const lista: Atentie[] = d ? atentie(p, s, rows, fx) : [];
  const fara = textFaraInsight(rows);
  const se = planSursa(d && d.sursa, fx);

  // ── Istoricul ──
  const luni = luniCuViata(istoric);
  const st = statIstoric(luni, fx, d && d.istoricStat);
  const neincasatTot = st.neincasatLei;
  // O firmă fără preț pe cont: banda duce în fișa ei, la „Abonament & plăți"; mai multe: lista de firme.
  const spreFirme = (l: any[]) => loc.route(l.length === 1 ? adresaFirmei(l[0].id, 'abonament') : '/admin/companies');

  return (
    <div class="screen">
      <AntetFondator titlu="RA Insight · control" onBack={() => loc.route('/meniu')} onRefresh={reload} />
      <div class="content has-tabbar" style="padding:12px 12px 24px">
        {err && <div class="adm-empty" style="color:var(--red)">Eroare: {err}</div>}
        {!d && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {d && (
          <>
            <div class="aiu-tile">
              {tilePachete(p, fx).map((t) => (
                <div class="aiu-tila">
                  <div class="k">{t.k}</div>
                  <div class={'v' + (t.ton ? ' ' + t.ton : '')}>{t.v}</div>
                  <div class="s">{t.s}{t.buton ? <> · <button type="button" class="aiu-l" onClick={() => setFoaie({ fel: 'sold' })}>{t.buton}</button></> : null}</div>
                </div>
              ))}
            </div>

            <div class="fd-sec">Ce cere atenție</div>
            {lista.length === 0 ? (
              <div class="aiu-at ok"><Icon name="check" size={15} /><span>{NIMIC_ATENTIE}</span></div>
            ) : lista.map((a) => (
              <div class={'aiu-at ' + a.ton}>
                <Icon name={a.ton === 'bad' ? 'alert' : 'alertO'} size={15} />
                <span><Gros text={a.t} /></span>
                {a.firma != null ? <button type="button" class="fd-btn" onClick={() => loc.route(adresaFirmei(a.firma))}>Deschide firma</button> : null}
                {a.spreAbonament && a.spreAbonament.length ? <button type="button" class="fd-btn" onClick={() => spreFirme(a.spreAbonament as any[])}>Deschide</button> : null}
              </div>
            ))}

            <div class="fd-sec">Firmă cu firmă</div>
            {cuInsight.length === 0 && <div class="fd-note aiu-nota">{NICIO_FIRMA}</div>}
            {cuInsight.map((x) => {
              const r = randFirma(x, fx);
              const e = !!deschis[String(r.id)];
              return (
                <div class="fd-card aiu-firma" key={r.id}>
                  <button type="button" class="aiu-firma-cap" aria-expanded={e ? 'true' : 'false'} onClick={() => setDeschis((m) => ({ ...m, [String(r.id)]: !e }))}>
                    <Icon name={e ? 'arrowDown' : 'chevronR'} size={15} />
                    <b>{r.nume}</b>
                    <span class={'fd-pill' + (r.vechi ? ' aiu-nota' : ' on')}>{r.pachet}</span>
                  </button>
                  <div class="aiu-firma-fol">
                    {r.bara != null ? <div class="fd-fond"><div class={'aiu-b ' + r.baraTon} style={'width:' + r.bara + '%'} /></div> : null}
                    <span>{r.folosite}</span>
                  </div>
                  <dl class="aiu-kv">
                    <div><dt>Instant</dt><dd>{r.instant}</dd></div>
                    <div><dt>Sursă externă</dt><dd>{r.sursa}</dd></div>
                    <div><dt>Ne costă</dt><dd>{r.cost}</dd></div>
                    <div><dt>Ne rămân</dt><dd class={r.ramanOk ? 'ok' : 'bad'}><b>{r.raman}</b></dd></div>
                  </dl>
                  {e && (
                    <div class="aiu-det">
                      {r.pachetRand ? (
                        <div class="aiu-pk-r">
                          <b>{r.pachetRand.nume}</b> · <span class={'t-' + r.pachetRand.plasaTon}>{r.pachetRand.plasa}</span>
                          {r.pachetRand.raman ? <> · <Gros text={r.pachetRand.raman} /></> : null}
                        </div>
                      ) : null}
                      {r.semnale.map((z) => <div class={'aiu-sem t-' + z.ton}><Icon name="alertO" size={13} />{z.t}</div>)}
                      <div class="fd-sec aiu-t">Cum iese cifra</div>
                      {r.socoteala.map((t) => <div class="aiu-soc">• <Gros text={t} /></div>)}
                      <div class="fd-sec aiu-t">Cine are cont</div>
                      {r.oameni.length === 0 ? <div class="t-mut">Niciun cont cu RA Insight.</div> : r.oameni.map((o: any) => (
                        <div class="aiu-om">
                          <span class="aiu-om-n">{o.nume}</span>
                          <span class={'t-' + o.ton}>{o.stare}</span>
                          <span class={o.usedTon ? 't-mut' : ''}>{o.folosite}</span>
                          <span class="t-mut">{o.data}</span>
                        </div>
                      ))}
                      {r.facturat ? <>
                        <div class="fd-sec aiu-t">Ce am facturat pe RA Insight</div>
                        <div><Gros text={r.facturat.t} />{r.facturat.platit ? <> — <span class="t-ok">a plătit tot</span></> : null}</div>
                      </> : null}
                      <div class="aiu-ult">{r.ultima}</div>
                      <button type="button" class="fd-btn" onClick={() => loc.route(adresaFirmei(r.id))}>Deschide firma</button>
                    </div>
                  )}
                </div>
              );
            })}
            {fara ? <div class="fd-note aiu-nota">{fara}</div> : null}

            <div class="fd-sec">Controale</div>
            <div class="aiu-ctl">
              <button type="button" class="fd-btn" onClick={() => setFoaie({ fel: 'sold' })}><Icon name="coins" size={14} /> Soldul Anthropic</button>
              <button type="button" class={'fd-btn' + (ist ? ' primary' : '')} onClick={comutaIstoric}><Icon name="chart" size={14} /> Istoric{ist ? '' : ' (oprit)'}</button>
            </div>
            {se ? (
              <div class="aiu-se">
                <div class="aiu-se-h"><Icon name="globe" size={15} /><b>{se.titlu}</b><span>{se.sub}</span></div>
                <div class="aiu-se-b">
                  {se.stari.map((x: any) => (
                    <button type="button" class={'fd-btn' + (x.al ? ' primary' : '')} aria-pressed={x.al ? 'true' : undefined} onClick={() => { if (!x.al) setFoaie({ fel: 'sursa', x }); }}>{x.t}</button>
                  ))}
                </div>
                {se.model ? <div class={'aiu-se-m' + (se.modelRau ? ' t-bad' : '')}>{se.model}</div> : null}
                {se.eroare ? <div class="aiu-se-m t-bad">{se.eroare}</div> : null}
                <div class="aiu-se-m">{se.luna}</div>
              </div>
            ) : null}

            {ist && (
              luni.length === 0 ? (
                <>
                  <div class="fd-sec">Istoric</div>
                  <div class="fd-note aiu-nota">Încă nu e nimic de arătat aici. Se umple singur: <b>luna curentă</b> apare imediat ce prima firmă are un cont de RA Insight cu preț în contract, iar <b>lunile trecute</b>, pe măsură ce ies facturile.</div>
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
                  <div class="fd-note aiu-nota">Cifrele vin din <b>facturile emise</b> (fără TVA) — ciornele, proformele și facturile anulate nu intră, storno-urile scad. Luna curentă, până se emite factura, e <b>estimată</b> din conturile aprinse (scrie pe ea) și NU intră în total. „Ne-a costat" e plata către model, convertită în lei la cursul de azi.</div>
                </>
              )
            )}

            <div class="fd-note aiu-nota" style="margin-top:12px">{NOTA_CONTROL}</div>
          </>
        )}
      </div>
      {foaie && foaie.fel === 'sold' ? (
        <Confirma title="Soldul de la Anthropic" okLabel="Salvează" busy={busy}
          text="Soldul îl găsiți în contul Anthropic (Billing). De azi încolo aplicația scade singură ce se cheltuie și socotește, după ritmul ultimelor 7 zile, pentru câte zile mai ajunge."
          field={{ label: 'Soldul, în dolari', value: '', type: 'number' }}
          onCancel={() => setFoaie(null)} onOk={(v) => salveazaSold(v)} />
      ) : null}
      {foaie && foaie.fel === 'sursa' ? (
        <Confirma title={'Sursă externă: ' + foaie.x.t + '?'} text={foaie.x.d} okLabel="Da" busy={busy}
          onCancel={() => setFoaie(null)} onOk={() => puneSursa(foaie.x)} />
      ) : null}
    </div>
  );
}
