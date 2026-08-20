import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { vehicles, showToast, me } from '../app/store';
import { Icon } from '../components/Icon';
import './admin.css';
import './tollro.css';

// TollRo — taxa rutieră pe kilometru pentru marfă peste 3,5 t. Paritate cu web (openEtollDemo).
//
// Deosebirea față de calculatoarele publice, unde tastezi numărul și VIN-ul oricărui camion:
// aici vehiculul se ALEGE DIN FLOTĂ, iar profilul de taxare (masă, axe, normă Euro) vine de la
// server, din fișa lui. Nu poți calcula pentru o mașină care nu e a ta și nu mai retastezi nimic.
//
// Grila de tarife se vede aici, dar se EDITEAZĂ doar din web (super-admin): un tabel de 24 de
// câmpuri numerice pe ecran de telefon e o invitație la greșeli, iar greșeala aici e un preț greșit
// pus în ofertă. Excepție de paritate asumată — vezi jurnalul.
const dRo = (iso: string) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? `${m[3]}.${m[2]}.${m[1]}` : String(iso || ''); };
const nr = (v: any, z = 2) => Number(v || 0).toLocaleString('ro-RO', { minimumFractionDigits: z, maximumFractionDigits: z });
const km1 = (v: any) => Number(v || 0).toLocaleString('ro-RO', { maximumFractionDigits: 1 });

export function EToll() {
  const [cfg, setCfg] = useState<any>(null);
  const [imei, setImei] = useState('');
  const [prof, setProf] = useState<any>(null);
  const [sursa, setSursa] = useState<'istoric' | 'manual'>('istoric');
  const [rez, setRez] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const azi = new Date().toISOString().slice(0, 10);
  const [de, setDe] = useState(new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10));
  const [pana, setPana] = useState(azi);
  const [kmA, setKmA] = useState(''), [kmN, setKmN] = useState(''), [kmX, setKmX] = useState('');
  // Ce se scrie de mana pentru campurile care LIPSESC din fisa. Nu se salveaza singur — pentru asta
  // e butonul; iar daca fisa are deja valoarea, serverul ignora completarea (fisa e adevarul).
  const [mMasa, setMMasa] = useState(''), [mAxe, setMAxe] = useState('');
  const [salvez, setSalvez] = useState(false);
  const manual = () => ({ masaKg: parseFloat(mMasa) || undefined, axe: parseFloat(mAxe) || undefined });

  useEffect(() => { Api.tollroConfig().then(setCfg).catch((e: any) => setErr(e?.message || 'Eroare')); }, []);

  useEffect(() => {
    setProf(null); setRez(null); setMMasa(''); setMAxe('');   // alt vehicul, alte date
    if (!imei) return;
    Api.tollroProfil(imei).then(setProf).catch(() => setProf(null));
  }, [imei]);

  async function salveazaInFisa() {
    const b: any = {};
    if (parseFloat(mMasa) > 0) b.masaKg = parseFloat(mMasa);
    if (parseFloat(mAxe) > 0) b.axe = parseFloat(mAxe);
    if (!b.masaKg && !b.axe) { showToast('Completează întâi valorile'); return; }
    setSalvez(true);
    try {
      await Api.tollroSalveazaProfil(imei, b);
      showToast('Salvat în fișa vehiculului');
      setMMasa(''); setMAxe('');
      setProf(await Api.tollroProfil(imei));
    } catch (e: any) { showToast(e?.message || 'Nu s-a putut salva'); }
    finally { setSalvez(false); }
  }

  function cereVehicul() {
    if (!imei) { showToast('Alege întâi vehiculul din flotă'); return false; }
    return true;
  }

  async function calcManual() {
    if (!cereVehicul()) return;
    setBusy(true); setErr('');
    try { setRez(await Api.tollroEstimate(imei, { autostrada: parseFloat(kmA) || 0, national: parseFloat(kmN) || 0, alte: parseFloat(kmX) || 0 }, manual())); }
    catch (e: any) { setErr(e?.message || 'Eroare la calcul'); }
    finally { setBusy(false); }
  }

  async function calcIstoric() {
    if (!cereVehicul()) return;
    setBusy(true); setErr(''); setRez(null);
    try { setRez(await Api.tollroDinIstoric(imei, de + 'T00:00:00', pana + 'T23:59:59', manual())); }
    catch (e: any) { setErr(e?.message || 'Eroare la calcul'); }
    finally { setBusy(false); }
  }

  const v = prof?.vehicul, inc = prof?.incadrare;
  const masa = v?.masaKg || null;
  const poateEdita = !!(me.value?.isSuper || me.value?.permissions?.manageFleet);
  const z = rez?.rezultat;
  const maxCost = z?.linii?.length ? Math.max(0.01, ...z.linii.map((l: any) => l.cost)) : 1;
  const kmTotal = z?.linii?.reduce((a: number, l: any) => a + l.km, 0) || 0;

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Taxa de drum</div>
        {cfg?.grila && <span class="tr-din">din {dRo(cfg.grila.aplicabilDin)}</span>}
      </header>

      <div class="content has-tabbar" style="padding:0 14px 96px">
        {err && <div class="tr-nota rosu">{err}</div>}

        <div class="pf-card" style="margin-top:10px">
          <div class="tr-h">Vehiculul</div>
          <select class="tr-sel" value={imei} onChange={(e) => setImei((e.target as HTMLSelectElement).value)}>
            <option value="">— alege vehicul —</option>
            {vehicles.value.map((x: any) => <option value={x.imei}>{(x.plate || x.name || x.imei) + (x.plate && x.name ? ' · ' + x.name : '')}</option>)}
          </select>
          <div class="tr-mic">Doar vehiculele din flota ta — profilul se ia din fișă.</div>

          {v && (
            <>
              <div class="tr-profil">
                <div class="tr-f"><span>Număr</span><b class={v.numar ? '' : 'gol'}>{v.numar || '—'}</b></div>
                <div class="tr-f"><span>VIN</span><b class={v.vin ? '' : 'gol'}>{v.vin || '—'}</b></div>
                {masa
                  ? <div class="tr-f"><span>MTMA</span><b>{(masa / 1000).toLocaleString('ro-RO')} t</b></div>
                  : <div class="tr-f edit"><span>MTMA (kg) ✎</span><input type="number" min="500" max="100000" placeholder="ex. 30000" value={mMasa} onInput={(e) => setMMasa((e.target as HTMLInputElement).value)} /></div>}
                {v.axe
                  ? <div class="tr-f"><span>Axe</span><b>{v.axe}</b></div>
                  : <div class="tr-f edit"><span>Axe ✎</span><input type="number" min="2" max="12" placeholder="ex. 4" value={mAxe} onInput={(e) => setMAxe((e.target as HTMLInputElement).value)} /></div>}
                <div class="tr-f"><span>Normă</span><b class={v.euro ? '' : 'gol'}>{v.euro || '—'}</b></div>
              </div>
              {masa && masa < 3500
                ? <div class="tr-nota rosu">Sub 3,5 t — vehiculul <b>nu intră la TollRo</b>. Pentru el rămâne rovinieta, plătită pe perioadă.</div>
                : inc
                  ? <div class="tr-nota verde">Se taxează cu <b>{nr(inc.leiPerKm.autostrada)} lei/km</b> pe autostradă și <b>{nr(inc.leiPerKm.national)} lei/km</b> pe drum național.{inc.euroCunoscut ? '' : ' (normă necunoscută → tarif maxim)'}</div>
                  : null}
              {(!masa || !v.axe) && (
                <div class="tr-nota galben">
                  {!masa && !v.axe ? 'Masa și numărul de axe lipsesc' : (!masa ? 'Masa maximă autorizată lipsește' : 'Numărul de axe lipsește')} din fișa vehiculului — completează-le mai sus ca să poți calcula.
                  {poateEdita && <button class="btn tr-salv" disabled={salvez} onClick={salveazaInFisa}>{salvez ? 'Se salvează…' : 'Salvează în fișă'}</button>}
                </div>
              )}
              {!v.euro && <div class="tr-nota galben">Norma de poluare lipsește din fișă — calculăm la tariful maxim. Se completează din fișa vehiculului.</div>}
              {(v.axe || mAxe) && <div class="tr-mic">Numărul de axe nu schimbă suma: grila publicată diferențiază doar după masă și normă Euro. Îl păstrăm pentru cazul în care ordonanța finală îl va folosi.</div>}
            </>
          )}
        </div>

        <div class="pf-card">
          <div class="tr-h">Kilometrii</div>
          <div class="tr-tabs">
            <button class={'tr-tab' + (sursa === 'istoric' ? ' on' : '')} onClick={() => setSursa('istoric')}>Din traseul parcurs</button>
            <button class={'tr-tab' + (sursa === 'manual' ? ' on' : '')} onClick={() => setSursa('manual')}>Îi introduc eu</button>
          </div>
          {sursa === 'istoric' ? (
            <>
              <div class="tr-linii2">
                <label class="tr-lb">De la<input type="date" value={de} max={azi} onInput={(e) => setDe((e.target as HTMLInputElement).value)} /></label>
                <label class="tr-lb">Până la<input type="date" value={pana} max={azi} onInput={(e) => setPana((e.target as HTMLInputElement).value)} /></label>
              </div>
              <button class="btn btn-primary tr-act" disabled={busy} onClick={calcIstoric}>{busy ? 'Se calculează…' : 'Calculează din traseu'}</button>
              <div class="tr-mic">Luăm traseul real al mașinii și, pentru fiecare bucată, aflăm din OpenStreetMap ce fel de drum e. Maxim 8 zile odată.</div>
            </>
          ) : (
            <>
              <div class="tr-linii2">
                <label class="tr-lb">Autostradă / expres (km)<input type="number" min="0" step="0.1" value={kmA} onInput={(e) => setKmA((e.target as HTMLInputElement).value)} /></label>
                <label class="tr-lb">Drum național (km)<input type="number" min="0" step="0.1" value={kmN} onInput={(e) => setKmN((e.target as HTMLInputElement).value)} /></label>
                <label class="tr-lb">Alte drumuri (km)<input type="number" min="0" step="0.1" value={kmX} onInput={(e) => setKmX((e.target as HTMLInputElement).value)} /></label>
              </div>
              <button class="btn btn-primary tr-act" disabled={busy} onClick={calcManual}>{busy ? 'Se calculează…' : 'Calculează'}</button>
            </>
          )}
        </div>

        <div class="pf-card">
          <div class="tr-h">Detalii costuri{z?.aplicabil ? <span class="tr-mic" style="display:inline;margin-left:6px">· {z.categorieEticheta} · {z.euroEticheta}</span> : null}</div>
          {busy && <div class="tr-mic"><div class="spin" style="display:inline-block;vertical-align:-3px;margin-right:6px" /> Se citește traseul și se întreabă OpenStreetMap ce fel de drumuri sunt…</div>}
          {!busy && !rez && <div class="tr-mic">Alege vehiculul și perioada, apoi apasă „Calculează".</div>}
          {!busy && rez?.error && <div class="tr-nota rosu">{rez.error}</div>}
          {!busy && z && !z.aplicabil && <div class="tr-nota rosu">{z.motiv}</div>}
          {!busy && z?.aplicabil && (
            <>
              <div class="tr-sumar">
                <div><span>Distanță totală</span><b>{km1(kmTotal)} km</b></div>
                <div class="tot"><span>Total</span><b>{nr(z.total)} {z.moneda}</b></div>
              </div>
              {z.linii.map((l: any) => (
                <div class="tr-linie">
                  <div class="cap"><span class="pct" style={'background:' + l.culoare} />{l.eticheta}<b>{l.taxabil ? nr(l.cost) + ' ' + z.moneda : 'netaxat'}</b></div>
                  <div class="sub">{km1(l.km)} km{l.taxabil ? ' · ' + nr(l.leiPerKm) + ' lei/km' : ''}</div>
                  <div class="bara"><i style={'width:' + Math.round((l.cost / maxCost) * 100) + '%;background:' + l.culoare} /></div>
                </div>
              ))}
              {(z.avertismente || []).map((a: string) => <div class="tr-nota galben">{a}</div>)}
              <div class="tr-mic" style="margin-top:8px">Costuri estimative — tarifele se stabilesc de autoritățile române și se pot modifica.{rez.sursa ? ' Sursa kilometrilor: ' + rez.sursa + '.' : ''}{rez.atribuire ? ' ' + rez.atribuire + '.' : ''}</div>
            </>
          )}
        </div>

        {cfg?.grila && (
          <div class="pf-card">
            <div class="tr-h">Grila de tarife</div>
            <div class="tr-mic">Se aplică din <b>{dRo(cfg.grila.aplicabilDin)}</b>. Prima cifră = autostradă/expres, a doua = drum național (lei/km). ⚠ = tarif nepublicat încă, estimat de noi.</div>
            <div style="overflow-x:auto;margin-top:8px">
              <table class="tr-grid">
                <thead><tr><th>Masă</th>{cfg.euro.map((e: any) => <th>{e.eticheta}</th>)}</tr></thead>
                <tbody>
                  {cfg.categorii.map((c: any) => (
                    <tr><th>{c.eticheta}</th>
                      {cfg.euro.map((e: any) => {
                        const t = cfg.grila.tarife[c.key][e.key];
                        return <td class={t.presupus ? 'presupus' : ''}>{nr(t.autostrada)} / {nr(t.national)}{t.presupus ? ' ⚠' : ''}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {cfg.editabil && <div class="tr-mic" style="margin-top:6px">Grila se modifică din aplicația web (Administrare).</div>}
          </div>
        )}
      </div>
    </div>
  );
}
