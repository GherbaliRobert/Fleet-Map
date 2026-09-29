import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { WorkSchedEditor } from '../components/WorkSchedEditor';
import './admin.css';

// Setări de COMPANIE: prețuri combustibil (manageFleet) + praguri agenți AI (manageUsers). Serverul scope-uiește pe req.companyId.
//
// Pragurile sunt aceleași ca în cardul fiecărui agent de pe web (AGP_THRESH, public/index.html): aceleași
// chei, aceleași opțiuni, aceeași explicație sub fiecare. Pe telefon stau grupate pe agent, într-o coloană.
// Limitele (min/max) sunt cele din ALERT_THRESHOLD_SPECS de pe server, care validează oricum.
// Exportate: foaia „Praguri" din Agenți AI (fondatorul, pe o firmă aleasă) citește ACEEAȘI listă — nu a doua copie.
export type ThrOpt = [number | '', string];
export type Prag = { k: string; label: string; unit: string; min: number; max: number; def: number | ''; hint: string; options: ThrOpt[] };
export const PRAGURI: { agent: string; nume: string; campuri: Prag[] }[] = [
  { agent: 'watch', nume: 'RA Watch', campuri: [
    { k: 'offlineMin', label: 'Offline (fără semnal)', unit: 'min', min: 5, max: 1440, def: 60, hint: 'Alertă dacă un vehicul nu trimite date de atâta timp.',
      options: [[15, '15 minute'], [30, '30 minute'], [60, '1 oră (recomandat)'], [120, '2 ore'], [360, '6 ore'], [720, '12 ore']] },
    { k: 'idleMaxMin', label: 'Ralanti prelungit', unit: 'min', min: 5, max: 1440, def: 120, hint: 'Alertă când motorul merge staționat (pe loc) de atâta timp.',
      options: [[15, '15 minute'], [30, '30 minute'], [60, '1 oră'], [120, '2 ore (recomandat)'], [180, '3 ore']] },
    { k: 'fuelDropL', label: 'Scădere combustibil', unit: 'L', min: 1, max: 1000, def: 15, hint: 'Alertă la o cădere bruscă de nivel.',
      options: [[10, '10 litri'], [15, '15 litri (recomandat)'], [20, '20 litri'], [30, '30 litri'], [50, '50 litri']] },
    { k: 'fuelTheftL', label: 'Furt combustibil — prag', unit: 'L', min: 1, max: 1000, def: '', hint: 'Scădere la parcare sau în mers, confirmată dacă nu revine în ~1h.',
      options: [['', 'Dezactivat (recomandat)'], [15, '15 litri'], [20, '20 litri'], [30, '30 litri'], [50, '50 litri']] },
  ] },
  { agent: 'care', nume: 'RA Care', campuri: [
    { k: 'serviceSoonKm', label: 'Avertisment service (bord/CAN)', unit: 'km înainte', min: 100, max: 50000, def: 1500, hint: 'Cu câți km înainte de service-ul indicat de BORDUL mașinii să apară alerta.',
      options: [[500, '500 km înainte'], [1000, '1.000 km înainte'], [1500, '1.500 km înainte (recomandat)'], [2000, '2.000 km înainte'], [3000, '3.000 km înainte'], [5000, '5.000 km înainte']] },
    // Lucrările (schimb de ulei, revizie) au preavizul lor; ACTELE îl au pe al lor, mai jos. Înainte, pe telefon,
    // se numeau „Avertisment scadențe" și omul credea că reglează și ITP-ul, și RCA-ul.
    { k: 'careDaysLead', label: 'Avertisment lucrări service (zile)', unit: 'zile înainte', min: 1, max: 365, def: 14, hint: 'Cu câte zile înainte de scadența unei LUCRĂRI pe dată să se aprindă. Aceeași cifră colorează rândul în Mentenanță ȘI trimite notificarea.',
      options: [[7, '7 zile înainte'], [14, '14 zile înainte (recomandat)'], [21, '3 săptămâni înainte'], [30, '30 zile înainte (o lună)'], [60, '60 zile înainte']] },
    { k: 'careKmLead', label: 'Avertisment lucrări service (km)', unit: 'km înainte', min: 50, max: 50000, def: 500, hint: 'Cu câți km înainte de scadența pe KILOMETRI să se aprindă. Aceeași cifră colorează rândul ȘI trimite notificarea.',
      options: [[250, '250 km înainte'], [500, '500 km înainte (recomandat)'], [1000, '1.000 km înainte'], [1500, '1.500 km înainte'], [2000, '2.000 km înainte']] },
    { k: 'docDaysLead', label: 'Avertisment acte (ITP, RCA, rovinietă)', unit: 'zile înainte', min: 1, max: 365, def: 30, hint: 'Cu câte zile înainte de expirarea unui ACT să se aprindă. Aceeași cifră colorează rândul în Documente ȘI trimite notificarea.',
      options: [[7, '7 zile înainte'], [14, '14 zile înainte'], [30, '30 zile înainte (recomandat)'], [45, '45 zile înainte'], [60, '60 zile înainte (două luni)']] },
  ] },
  { agent: 'optimize', nume: 'RA Optimize', campuri: [
    { k: 'ecoScoreMin', label: 'Scor eco minim', unit: '/100', min: 0, max: 100, def: 60, hint: 'Alertă când scorul eco al unui vehicul scade sub această valoare.',
      options: [[40, 'sub 40 — doar cazurile grave'], [50, 'sub 50 — relaxat'], [60, 'sub 60 (recomandat)'], [70, 'sub 70 — exigent'], [80, 'sub 80 — foarte exigent']] },
  ] },
  { agent: 'dispatch', nume: 'RA Dispatch', campuri: [
    { k: 'dispOnlineMin', label: 'Disponibil — ultimul semnal sub', unit: 'min', min: 5, max: 240, def: 65, hint: 'Un vehicul e „disponibil" dacă a transmis semnal mai recent de atât și e oprit.',
      options: [[30, '30 minute'], [45, '45 minute'], [65, '65 minute (recomandat)'], [90, '90 minute'], [120, '2 ore']] },
    { k: 'dispIdleHour', label: 'Verifică „subutilizat" după', unit: 'ora zilei', min: 0, max: 23, def: 12, hint: 'De la ce oră a zilei semnalăm vehiculele disponibile dar fără rulaj azi.',
      options: [[10, '10:00'], [11, '11:00'], [12, '12:00 (recomandat)'], [13, '13:00'], [14, '14:00']] },
    { k: 'dispIdleKm', label: 'Nefolosit azi — sub', unit: 'km', min: 1, max: 100, def: 1, hint: 'Sub câți km parcurși azi un vehicul disponibil e considerat neutilizat.',
      options: [[1, '1 km (recomandat)'], [2, '2 km'], [5, '5 km'], [10, '10 km']] },
  ] },
  { agent: 'compliance', nume: 'RA Compliance', campuri: [
    { k: 'compContWarnMin', label: 'Avertizează la conducere continuă de', unit: 'înainte de 4h30', min: 60, max: 270, def: 270, hint: 'Când să te anunțe, ca să programezi pauza ÎNAINTE de depășire. Limita legală (4h30) rămâne fixă prin lege.',
      options: [[210, '3h30 — din timp'], [240, '4h00 (recomandat)'], [255, '4h15 — pe ultima sută'], [270, 'doar la depășire (4h30)']] },
    { k: 'compDailyWarnMin', label: 'Avertizează la conducere zilnică de', unit: 'înainte de 9h', min: 120, max: 540, def: 540, hint: 'Când să te anunțe că se apropie ziua de 9h, ca să planifici schimbul sau încheierea zilei.',
      options: [[420, '7h00 — din timp'], [480, '8h00 (recomandat)'], [510, '8h30 — pe ultima sută'], [540, 'doar la depășire (9h)']] },
  ] },
];
const TOATE = PRAGURI.flatMap((g) => g.campuri);
// Ce arată caseta: valoarea salvată, altfel valoarea implicită a agentului (ca pe web).
const afisat = (t: Prag, salvat: any) => (salvat == null || salvat === '' ? String(t.def) : String(salvat));
// Valoarea PROPRIE, ca text: nesetată (null / gol) → ''. „Ce ai schimbat" se măsoară pe ea, nu pe ce arată caseta.
const brut = (v: any) => (v == null ? '' : String(v));
const nesetat = (v: any) => v == null || v === '';

export function Settings() {
  const loc = useLocation();
  const isSuper = !!me.value?.isSuper;
  const canFleet = !!me.value?.permissions?.manageFleet;
  const canUsers = !!me.value?.permissions?.manageUsers;
  const [fp, setFp] = useState<any>(null);
  const [fpForm, setFpForm] = useState<any>({ motorina: '', benzina: '', gpl: '' });
  const [thr, setThr] = useState<Record<string, any>>({});
  const [thrOrig, setThrOrig] = useState<Record<string, any>>({});
  const [thrLoaded, setThrLoaded] = useState(false);
  const [thrErr, setThrErr] = useState('');
  const [ws, setWs] = useState<any>(null);
  const [wsLoaded, setWsLoaded] = useState(false);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (canFleet) Api.fuelPrices().then((d: any) => { setFp(d); const c = d.company || {}; setFpForm({ motorina: c.motorina ?? '', benzina: c.benzina ?? '', gpl: c.gpl ?? '' }); }).catch(() => {});
    if (canUsers) Api.companySettings().then((s: any) => {
      const t = Object.assign({}, s?.alert_thresholds);
      setThr(t); setThrOrig(t); setThrLoaded(true);
      setWs(s?.work_schedule || null); setWsLoaded(true);
    }).catch((e: any) => { setThrErr(e?.message || 'Nu s-au putut citi pragurile.'); setThrLoaded(true); setWsLoaded(true); });
  }, []);

  async function saveFuel() {
    setBusy('fuel');
    const clean: any = {};
    ['motorina', 'benzina', 'gpl'].forEach((k) => { const v = fpForm[k]; if (v !== '' && v != null) { const n = Number(v); if (n > 0 && n < 100) clean[k] = n; } });
    try { await Api.setFuelPrices(clean); showToast('Prețuri salvate'); const d = await Api.fuelPrices(); setFp(d); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(''); }
  }
  async function refreshNat() { setBusy('refresh'); try { await Api.refreshFuelPrices(); const d = await Api.fuelPrices(); setFp(d); showToast('Media națională actualizată'); } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(''); } }

  // Trimite DOAR ce ai schimbat aici. Serverul îmbină oricum, dar așa un prag pus între timp pe web (de alt
  // om, pe alt agent) nu e călcat de valoarea veche rămasă pe ecranul telefonului.
  // „Schimbat" = valoarea proprie a firmei s-a schimbat, NU cifra din casetă. La un prag nesetat caseta arată
  // implicitul agentului (ex. 60 min), dar agentul folosește baza platformei, pusă de fondatori (ex. 30).
  // Dacă omul alege chiar 60 ca s-o fixeze, e o schimbare reală și se trimite — comparat pe cifra afișată,
  // telefonul zicea „Nimic de salvat" și firma rămânea pe 30.
  const schimbate = TOATE.filter((t) => brut(thr[t.k]) !== brut(thrOrig[t.k]));
  async function saveThr() {
    if (!schimbate.length) { showToast('Nimic de salvat — n-ai schimbat niciun prag'); return; }
    const clean: any = {};
    for (const t of schimbate) {
      const v = thr[t.k];
      if (v === '' || v == null) { clean[t.k] = null; continue; } // gol = revine la implicit (ex. furt: dezactivat)
      const n = Number(v);
      if (!Number.isFinite(n) || n < t.min || n > t.max) { showToast('Valoare invalidă la „' + t.label + '"', true); return; }
      clean[t.k] = Math.round(n);
    }
    setBusy('thr');
    try {
      const r: any = await Api.saveCompanySettings({ alert_thresholds: clean });
      const nou = Object.assign({}, (r && r.alert_thresholds) || { ...thrOrig, ...clean });
      setThr(nou); setThrOrig(nou);
      showToast('Praguri salvate ✓');
    } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusy(''); }
  }

  const auto = (fp && fp.auto) || {};

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Setări companie</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        {canFleet && (
          <div class="pf-card">
            <h3>Prețuri combustibil (lei/L)</h3>
            <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px">Folosite la calculul costului în rapoarte. Lasă gol → se folosește media națională (auto, zilnic). Lanț: preț pe vehicul → aceste valori → media națională.{auto.motorina ? ' Național azi: motorină ' + auto.motorina + ' · benzină ' + (auto.benzina || '—') + ' · GPL ' + (auto.gpl || '—') + '.' : ''} Sursa: PretCarburant.ro</div>
            <div class="frm-row">
              <div class="fld"><label>Motorină</label><input type="number" value={fpForm.motorina} onInput={(e: any) => setFpForm({ ...fpForm, motorina: e.target.value })} placeholder={auto.motorina ? String(auto.motorina) : 'auto'} /></div>
              <div class="fld"><label>Benzină</label><input type="number" value={fpForm.benzina} onInput={(e: any) => setFpForm({ ...fpForm, benzina: e.target.value })} placeholder={auto.benzina ? String(auto.benzina) : 'auto'} /></div>
              <div class="fld"><label>GPL</label><input type="number" value={fpForm.gpl} onInput={(e: any) => setFpForm({ ...fpForm, gpl: e.target.value })} placeholder={auto.gpl ? String(auto.gpl) : 'auto'} /></div>
            </div>
            <div style="display:flex;gap:8px;margin-top:10px;align-items:center">
              <button class="btn btn-primary" style="flex:1" disabled={busy === 'fuel'} onClick={saveFuel}>{busy === 'fuel' ? '…' : 'Salvează prețurile'}</button>
              {isSuper && <button class="adm-act" disabled={busy === 'refresh'} onClick={refreshNat}><Icon name="refresh" size={14} /> Național</button>}
            </div>
          </div>
        )}

        {canUsers && (
          <div class="pf-card">
            <h3>Praguri agenți AI</h3>
            <div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:4px">Când te alertează fiecare agent. Aceleași praguri ca în cardul agentului de pe web.</div>
            {/* Telefonul nu primește de la server baza platformei, doar pragurile firmei — deci la un prag nesetat
                nu știm ce cifră se aplică de fapt. O spunem, în loc să prezentăm implicitul ca valoare salvată. */}
            {!isSuper && (
              <div style="font-size:12px;color:var(--text-muted);line-height:1.5;margin-bottom:4px">
                Unde scrie <b style="color:var(--text-secondary)">implicit</b>, firma n-are încă un prag al ei: agentul folosește pragul de bază al platformei, care poate fi altul decât cel din casetă. Alege o valoare și salvează ca s-o fixezi pentru firmă.
              </div>
            )}
            {/* Contul platformei n-are firmă: pragurile de aici devin baza TUTUROR companiilor fără praguri
                proprii. Pe web, fondatorul alege întâi firma; pe telefon nu există alegerea, deci o spunem. */}
            {isSuper && (
              <div style="margin:8px 0 4px;padding:9px 11px;border-radius:9px;font-size:12px;line-height:1.45;background:rgba(245,158,11,.12);color:var(--text-primary);border:1px solid rgba(245,158,11,.35)">
                <Icon name="alert" size={13} color="var(--orange)" style="vertical-align:-2px;margin-right:4px" />
                Modifici <b>baza platformei</b>, valabilă pentru TOATE companiile care n-au praguri proprii. Pragurile unei singure firme le schimbi din <b>Agenți AI</b>: alegi firma sus, deschizi agentul și apeși „Praguri".
              </div>
            )}
            {thrErr && <div style="color:var(--red);font-size:13px;margin-top:10px">{thrErr}</div>}
            {!thrLoaded ? <div class="spin" style="margin:14px auto" /> : thrErr ? null : PRAGURI.map((g) => (
              <div style="margin-top:12px">
                <div style="font-size:12px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;color:var(--text-muted);padding:6px 0;border-bottom:1px solid var(--border)">{g.nume}</div>
                {g.campuri.map((t) => {
                  // Nesetat → caseta stă pe „Implicit", NU pe valoarea recomandată: altfel alegerea recomandatei nu
                  // schimba nimic în casetă și pragul nu se putea fixa pentru firmă (găsit 24.09). Unde implicitul
                  // e chiar „gol" (furtul de combustibil: dezactivat), opțiunea goală există deja în listă.
                  const unset = nesetat(thr[t.k]) && t.def !== '';
                  const val = unset ? '' : afisat(t, thr[t.k]);
                  const opts = t.options.slice();
                  if (unset) opts.unshift(['', isSuper ? 'Implicit (cel recomandat)' : 'Implicit (pragul de bază al platformei)']);
                  else if (!opts.some(([v]) => String(v) === val)) opts.unshift([val === '' ? '' : Number(val), val + ' (curent)']);
                  return (
                    <div class="fld" style="padding:10px 0;border-bottom:1px solid var(--border)">
                      <label style="color:var(--text-primary)">{t.label} <span style="color:var(--text-muted);font-weight:600">({t.unit})</span>
                        {nesetat(thr[t.k]) && <span style="margin-left:6px;font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:999px;border:1px solid var(--border);color:var(--text-muted);white-space:nowrap">implicit</span>}
                      </label>
                      <select value={val} onChange={(e: any) => setThr({ ...thr, [t.k]: e.target.value })}>
                        {opts.map(([v, l]) => <option value={String(v)}>{l}</option>)}
                      </select>
                      <span style="font-size:11.5px;color:var(--text-muted);line-height:1.45">{t.hint}</span>
                    </div>
                  );
                })}
              </div>
            ))}
            {thrLoaded && !thrErr && (
              <div style="font-size:11.5px;color:var(--text-muted);line-height:1.5;margin-top:10px">
                RA Client nu are praguri proprii: preia pragurile celorlalți agenți, fiindcă le rezumă concluziile.
              </div>
            )}
            <button class="btn btn-primary btn-block" style="margin-top:12px" disabled={busy === 'thr' || !thrLoaded || !!thrErr} onClick={saveThr}>
              {busy === 'thr' ? 'Se salvează…' : schimbate.length ? 'Salvează pragurile (' + schimbate.length + ')' : 'Salvează pragurile'}
            </button>
          </div>
        )}

        {canUsers && wsLoaded && (
          <div class="pf-card">
            <h3><Icon name="clock" size={16} /> Program de lucru — supraveghere</h3>
            <WorkSchedEditor value={ws} onSave={(w: any) => Api.saveCompanySettings({ work_schedule: w }).then((r: any) => setWs(w))} />
          </div>
        )}

        {!canFleet && !canUsers && <div class="adm-empty">Nu ai acces la setări de companie.</div>}
      </div>
    </div>
  );
}
