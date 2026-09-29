import { useEffect, useRef, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { Confirma } from '../components/FlotaUi';
import { de } from '../lib/contracte';
import './admin.css';
import './detail.css';
import './firma.css';
import './companii.css';

// Fișa firmei → „Abonament & plăți" (fondatori), ca pe web (_raxCodAbonament / _raxAboHtml):
//   • starea accesului + suspendarea manuală (motiv obligatoriu) / reactivarea;
//   • oferta firmei: preț / vehicul fără CAN și cu CAN, bifele „cu CAN" pe vehicul, add-on AI, notă;
//   • modulele AI la plată; RA Insight pe cont (întrebări / cont + preț / cont);
//   • prețul lunar — SOCOTIT DE SERVER (overview.price, după oferta salvată). Web-ul are aici o
//     previzualizare socotită în pagină (_raxClientPrice); pe telefon NU se copiază regula prețului:
//     după „Salvează oferta" se recitește fișa, iar prețul arătat e cel al serverului.
//     ⚠ NU e suma facturii: fișa numără mașinile după bifele „cu CAN" (FMS-urile intră la CAN sau fără
//     CAN), pe când factura (_companyBillCounts) pune FMS-urile separat, la prețul FMS, oricum ar fi
//     bifate. La o firmă cu FMS cele două pot ieși diferit — se spune pe ecran. (Cerere către server:
//     overview.price din numărătoarea facturii.)
//   • înregistrarea unei plăți.

const METODE = [{ v: 'transfer', l: 'Transfer bancar' }, { v: 'cash', l: 'Numerar' }, { v: 'card', l: 'Card' }, { v: 'manual', l: 'Manual / altul' }];
const s = (v: any) => (v != null ? String(v) : '');
function lei2(v: any) { return (Number(v) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' lei'; }
// Suma unei plăți = abonamentul lunar de pe server × lunile alese (ca pe web). Fără ofertă → gol.
function sumaAuto(ov: any, luni: any): string {
  const pl = Number(ov && ov.price && ov.price.monthlyTotal) || 0;
  if (!ov || !ov.offer || pl <= 0) return '';
  const m = Math.max(1, parseInt(luni) || 1);
  return (Math.round(pl * m * 100) / 100).toFixed(2);
}
function formaOfertei(ov: any) {
  const o = (ov && ov.offer) || {};
  return { name: o.name || '', priceNoneRON: s(o.priceNoneRON), priceCanRON: s(o.priceCanRON), aiAssistantRON: s(o.aiAssistantRON), aiAgentsRON: s(o.aiAgentsRON), note: o.note || '' };
}
function bifeCan(ov: any): Record<string, boolean> {
  const m: Record<string, boolean> = {};
  ((ov && ov.vehicles) || []).forEach((v: any) => { if (v.bill_can) m[v.imei] = true; });
  return m;
}

export function CompanyAbonament({ ov, onReload }: { ov: any; onReload: () => void }) {
  const co = ov.company || {};
  const id = Number(co.id);
  const vehicles: any[] = ov.vehicles || [];
  const [of, setOf] = useState(() => formaOfertei(ov));
  const [can, setCan] = useState<Record<string, boolean>>(() => bifeCan(ov));
  const [modificat, setModificat] = useState(false);
  const [feats, setFeats] = useState<Record<string, boolean>>(() => Object.assign({ ai_assistant: false, agents: false }, ov.features || {}));
  const q0 = ov.ai_quota || {};
  const [aiqN, setAiqN] = useState(s(q0.questionsPerSeat || q0.questions || ''));
  const [aiqS, setAiqS] = useState(s(q0.seatPriceRON || ''));
  const [pay, setPay] = useState({ months: '1', amount: sumaAuto(ov, 1), touched: false, method: 'transfer', note: '' });
  const [susp, setSusp] = useState<{ cere: boolean; motiv: string }>({ cere: false, motiv: '' });
  const [reactivez, setReactivez] = useState(false);
  const [busy, setBusy] = useState('');

  // Fișa s-a recitit → formularul pornește din ce a scris serverul. DAR nu peste ce scrii acum: o fișă
  // recitită după un comutator de modul nu are voie să-ți șteargă prețurile tastate și încă nesalvate.
  const ofAtins = useRef(false), aiqAtins = useRef(false);
  useEffect(() => {
    if (!ofAtins.current) { setOf(formaOfertei(ov)); setCan(bifeCan(ov)); setModificat(false); }
    setFeats(Object.assign({ ai_assistant: false, agents: false }, ov.features || {}));
    const q = ov.ai_quota || {};
    if (!aiqAtins.current) { setAiqN(s(q.questionsPerSeat || q.questions || '')); setAiqS(s(q.seatPriceRON || '')); }
    setPay((p) => (p.touched ? p : { ...p, amount: sumaAuto(ov, p.months) }));
  }, [ov]);

  const so = (k: string, v: string) => { ofAtins.current = true; setOf((p) => ({ ...p, [k]: v })); setModificat(true); };

  // ── Starea accesului + suspendarea (_raxSuspendHtml) ──
  const a = ov.access || {};
  const np = ov.neplata || null;
  const manual = co.suspended_at != null;
  let titlu = '', fel = '', text = '';
  if (a.status === 'expired') {
    fel = 'bad';
    titlu = manual ? 'Acces oprit de noi' : (a.motiv === 'neplata' ? 'Acces suspendat pentru neplată' : 'Acces suspendat — abonament expirat');
    if (manual && co.suspend_reason) text = 'Motivul scris: „' + co.suspend_reason + '".';
    else if (np && np.factura) text = 'Factura ' + (np.factura.numar || '') + ' e neachitată de ' + np.zile + de(np.zile) + 'zile.';
    text += (text ? ' ' : '') + 'Clientul nu poate intra deloc. Aparatele transmit mai departe, datele nu se pierd.';
  } else if (np && np.faza === 'avertisment') {
    fel = 'warn';
    titlu = 'Factură restantă — ' + np.zilePanaLaSuspendare + de(np.zilePanaLaSuspendare) + 'zile până la suspendare';
    text = 'Factura ' + ((np.factura || {}).numar || '') + ' a fost scadentă acum ' + np.zile + de(np.zile) + 'zile. Suspendarea vine singură dacă nu se plătește.';
  } else {
    fel = ({ unlimited: '', active: 'ok', grace: 'warn', expired: 'bad' } as Record<string, string>)[a.status] || '';
    titlu = a.status === 'grace' ? 'Abonament în grație' : (a.status === 'unlimited' ? 'Acces nelimitat' : 'Acces în regulă');
    text = 'Nicio factură restantă.';
  }
  async function suspenda(pornit: boolean) {
    let motiv: string | null = null;
    if (pornit) {
      motiv = susp.motiv.trim();
      if (!motiv) { showToast('Scrie un motiv — rămâne scris în dosar.', true); return; }
    }
    setBusy('susp');
    try {
      await Api.suspendCompany(id, pornit, motiv);
      setSusp({ cere: false, motiv: '' }); setReactivez(false);
      showToast(pornit ? 'Acces suspendat' : 'Acces reactivat');
      onReload();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(''); }
  }

  // ── Oferta ──
  async function salveazaOferta() {
    if (of.priceNoneRON === '') { showToast('Pune cel puțin „Preț / vehicul fără CAN".', true); return; }
    const vechi = ov.offer || {};
    const canImeis = Object.keys(can).filter((k) => can[k]);
    // Serverul ÎNLOCUIEȘTE oferta întreagă: ce nu e pe ecran (prețul FMS, limita de vehicule) se trimite
    // înapoi neschimbat. Cheile modelelor vechi (fix / pe vehicul / trepte) se golesc, ca pe web — altfel
    // „otrăvesc" oferta pe vehicul.
    const oferta = {
      name: of.name, priceNoneRON: of.priceNoneRON, priceCanRON: of.priceCanRON,
      priceFmsRON: vechi.priceFmsRON != null ? vechi.priceFmsRON : null,
      canImeis,
      aiAssistantRON: of.aiAssistantRON, aiAgentsRON: of.aiAgentsRON,
      vehicleLimit: vechi.vehicleLimit != null ? vechi.vehicleLimit : null,
      note: of.note,
      flatPriceRON: null, pricePerVehicleRON: null, basePerVehicleRON: null, canAddonRON: null, fmsAddonRON: null,
    };
    setBusy('oferta');
    try { await Api.setCompanyOferta(id, oferta); showToast('Ofertă salvată'); ofAtins.current = false; onReload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(''); }
  }
  async function modul(key: string) {
    const on = !feats[key], prev = feats;
    setFeats({ ...feats, [key]: on });
    try {
      const r: any = await Api.setCompanyFeatures(id, { [key]: on });
      if (r && r.features) setFeats((f) => Object.assign({}, f, r.features));
      showToast('Modul ' + (on ? 'activat' : 'dezactivat'));
      onReload(); // prețul lunar se schimbă cu modulele (add-on-urile AI se taxează doar cu modulul activ)
    } catch (e: any) { setFeats(prev); showToast(e?.message || 'Eroare', true); }
  }

  // ── RA Insight pe cont (raxSaveAiQuota) ──
  async function salveazaAiq() {
    const n = aiqN.trim() !== '' ? Number(aiqN) : 0;
    if (!isFinite(n) || n < 0 || n > 100000) { showToast('Număr de întrebări invalid.', true); return; }
    const sp = aiqS.trim() !== '' ? Number(aiqS) : 0;
    if (!isFinite(sp) || sp < 0 || sp > 100000) { showToast('Preț pe cont invalid.', true); return; }
    setBusy('aiq');
    try {
      const r: any = await Api.saveCompanySettingsOf(id, { ai_quota: { questionsPerSeat: Math.round(n), seatPriceRON: sp } });
      // Ce a rămas scris pe server, nu ce am presupus: la o firmă pe fondul fix vechi, 0 pe cont NU șterge fondul fix.
      const q = (r && r.ai_quota) || {};
      if (Number(q.questionsPerSeat) > 0) showToast('Salvat: ' + q.questionsPerSeat + ' întrebări/cont, ' + (Number(q.seatPriceRON) || 0) + ' lei/cont ✓');
      else if (Number(q.questions) > 0) showToast('Salvat — firma rămâne pe fondul fix vechi: ' + q.questions + ' întrebări/lună.');
      else showToast('Fond eliminat (nelimitat) ✓');
      aiqAtins.current = false; // câmpurile se reumplu cu ce a rămas scris pe server
      onReload();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(''); }
  }
  const q = ov.ai_quota || {};
  const aiqAcum = Number(q.questionsPerSeat) > 0
    ? q.questionsPerSeat + de(q.questionsPerSeat) + 'întrebări/cont' + (Number(q.seatPriceRON) > 0 ? ' · ' + lei2(q.seatPriceRON) + '/cont' : '')
    : (Number(q.questions) > 0 ? q.questions + de(q.questions) + 'întrebări/lună, fond fix vechi pe firmă' : 'nelimitat');

  // ── Plata ──
  async function inregistreazaPlata() {
    const amt = String(pay.amount ?? '').trim();
    setBusy('plata');
    try {
      await Api.recordPayment(id, { months: Math.max(1, parseInt(pay.months) || 1), amount: amt !== '' ? amt : null, method: pay.method || 'transfer', note: pay.note.trim() || null });
      showToast('Plată înregistrată ✓');
      setPay({ months: '1', amount: '', touched: false, method: 'transfer', note: '' });
      onReload();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(''); }
  }

  const pr = ov.price || null;
  const bc = ov.billCounts || {};
  const bd = (pr && pr.breakdown) || {};
  const arePret = !!(ov.offer && pr);
  const nFms = vehicles.filter((v) => v.can_type === 'fms').length;
  const camp = (label: string, k: keyof ReturnType<typeof formaOfertei>, ph: string, hint?: string, numar = true) => (
    <div class="fld"><label>{label}</label>
      <input type={numar ? 'number' : 'text'} inputMode={numar ? 'decimal' : undefined} min={numar ? '0' : undefined} step={numar ? '0.01' : undefined}
        value={of[k]} placeholder={ph} onInput={(e: any) => so(k, e.target.value)} />
      {hint ? <div class="co-note" style="margin-top:2px">{hint}</div> : null}
    </div>
  );

  return (
    <>
      {/* Starea accesului */}
      <div class={'co-box ' + fel}>
        <strong>{titlu}</strong>
        {text ? <div>{text}</div> : null}
        {!co.is_demo && (susp.cere ? (
          <div style="margin-top:10px">
            <input class="fm-in" value={susp.motiv} placeholder="De ce suspendăm? ex. factura RAT-2026-0042, neachitată de 40 de zile"
              onInput={(e: any) => setSusp({ cere: true, motiv: e.target.value })} style="margin-bottom:8px" />
            <div class="fm-btns">
              <button class="fm-btn rau" disabled={busy === 'susp'} onClick={() => suspenda(true)}><Icon name="ban" size={15} /> Confirmă suspendarea</button>
              <button class="fm-btn" disabled={busy === 'susp'} onClick={() => setSusp({ cere: false, motiv: '' })}>Renunț</button>
            </div>
          </div>
        ) : (
          <div class="fm-btns" style="margin-top:10px">
            {manual
              ? <button class="fm-btn acc" disabled={busy === 'susp'} onClick={() => setReactivez(true)}><Icon name="play" size={15} /> Reactivează accesul</button>
              : <button class="fm-btn" onClick={() => setSusp({ cere: true, motiv: '' })}><Icon name="ban" size={15} /> Suspendă acum</button>}
          </div>
        ))}
      </div>

      {/* Oferta */}
      <div class="fm-card pad">
        <h3 style="margin-top:0">Preț / vehicul (RON / lună, fără TVA)</h3>
        <div class="frm">
          <div class="frm-row">
            {camp('Fără CAN', 'priceNoneRON', 'ex. 21', 'vehiculele nebifate')}
            {camp('Cu CAN', 'priceCanRON', 'ex. 45', 'vehiculele bifate mai jos')}
          </div>
          {camp('Nume ofertă (opțional)', 'name', 'ex. Ofertă standard', undefined, false)}
          {ov.offer && ov.offer.priceFmsRON != null && (
            <div class="co-note">Oferta are și un preț pentru vehiculele FMS: {lei2(ov.offer.priceFmsRON)} / vehicul. Rămâne neschimbat la salvare.</div>
          )}
        </div>
      </div>

      <div class="fm-card pad">
        <h3 style="margin-top:0">Vehicule „cu CAN" (bifează)</h3>
        <div class="co-note" style="margin:0 0 6px">Bifat = preț „cu CAN"; nebifat = „fără CAN". Bifa pornește din detecția automată (insigna), dar o poți schimba pe fiecare vehicul.</div>
        {vehicles.length === 0 && <div class="co-note">Niciun vehicul în companie.</div>}
        {vehicles.map((v) => {
          const on = !!can[v.imei];
          return (
            <button class={'co-chk' + (on ? ' on' : '')} role="checkbox" aria-checked={on}
              onClick={() => { ofAtins.current = true; setCan((m) => { const n = { ...m }; if (on) delete n[v.imei]; else n[v.imei] = true; return n; }); setModificat(true); }}>
              <span class="bx">{on ? <Icon name="check" size={14} /> : null}</span>
              <span class="mid"><b>{v.name || v.imei}</b>{v.plate ? <small>{v.plate}</small> : null}</span>
              <span class={'co-can ' + (v.can_type === 'fms' ? 'fms' : v.can_type === 'can' ? 'can' : 'none')} title="detectat automat din date">
                {v.can_type === 'fms' ? 'FMS' : v.can_type === 'can' ? 'CAN' : 'fără'}</span>
            </button>
          );
        })}
      </div>

      <div class="fm-card pad">
        <h3 style="margin-top:0">Add-on AI (RON / lună)</h3>
        <div class="frm">
          <div class="frm-row">
            {camp('Asistent AI', 'aiAssistantRON', 'ex. 150', 'taxat dacă modulul e activ')}
            {camp('Agenți AI', 'aiAgentsRON', 'ex. 300', 'taxat dacă modulul e activ')}
          </div>
          {camp('Notă (intern)', 'note', 'detalii ofertă / contract', undefined, false)}
          <button class="btn btn-primary" disabled={busy === 'oferta'} onClick={salveazaOferta}>
            <Icon name="check" size={16} color="#06210F" /> {busy === 'oferta' ? 'Se salvează…' : 'Salvează oferta'}</button>
        </div>
      </div>

      {/* Modulele AI la plată + RA Insight pe cont */}
      <div class="fm-card pad">
        <h3 style="margin-top:0">Module AI (la plată)</h3>
        <button class="fm-tgl" onClick={() => modul('ai_assistant')} role="switch" aria-checked={!!feats.ai_assistant}>
          <span class="lbl">Asistent AI<small>chat + RA Insight</small></span><span class={'sw' + (feats.ai_assistant ? ' on' : '')} />
        </button>
        <button class="fm-tgl" onClick={() => modul('agents')} role="switch" aria-checked={!!feats.agents}>
          <span class="lbl">Agenți AI<small>cei 6 agenți (Watch / Dispatch / …)</small></span><span class={'sw' + (feats.agents ? ' on' : '')} />
        </button>
        <div class="co-note">Add-on-urile AI se facturează doar dacă modulul e activ. Agenții individuali + limita AI se setează din „Module &amp; limite" (fila Detalii).</div>

        <div class="fm-sec" style="margin-top:16px">RA Insight — conturi și fond de întrebări</div>
        <div class="co-note" style="margin:0 0 8px">Acum, pe server: <b>{aiqAcum}</b></div>
        <div class="frm">
          <div class="frm-row">
            <div class="fld"><label>Întrebări / cont / lună</label>
              <input type="number" inputMode="numeric" min="0" max="100000" step="10" value={aiqN} placeholder="gol = nelimitat" onInput={(e: any) => { aiqAtins.current = true; setAiqN(e.target.value); }} /></div>
            <div class="fld"><label>Preț / cont (lei/lună)</label>
              <input type="number" inputMode="decimal" min="0" max="100000" step="1" value={aiqS} placeholder="ex. 17" onInput={(e: any) => { aiqAtins.current = true; setAiqS(e.target.value); }} /></div>
          </div>
          <div class="co-note" style="margin:0">Când fondul lunii se termină, RA Insight se oprește până pe 1. Nu există cost suplimentar și nici prețuri pe întrebare — cine vrea mai mult, mai adaugă un cont.</div>
          <button class="fm-btn acc" disabled={busy === 'aiq'} onClick={salveazaAiq}><Icon name="check" size={15} /> Salvează</button>
          <div class="co-note" style="margin:0">Fondul lunii = <b>conturile aprinse × întrebări pe cont</b>. Conturile se dau din <b>Utilizatori</b>, cu butonul ✨ de lângă fiecare om — tot de acolo se retrag. Clientul vede o bară cu cât a rămas și cât a folosit el.</div>
        </div>
      </div>

      {/* Prețul lunar, de la server */}
      <div class="fm-card pad">
        <h3 style="margin-top:0">Preț lunar</h3>
        {!arePret && <div class="co-note" style="margin:0">Fără ofertă — 0 lei. Pune prețul mai sus și apasă „Salvează oferta".</div>}
        {arePret && (
          <>
            {pr.model === 'fix' && <div class="co-ln"><span>Tarif fix lunar</span><span>{lei2(bd.base)}</span></div>}
            {pr.model === 'oferta' && (
              <>
                <div class="co-ln"><span>Fără CAN · {Number(bc.none) || 0} veh.</span><span>{lei2(bd.base)}</span></div>
                {Number(bd.canAddon) ? <div class="co-ln"><span>Cu CAN · {Number(bc.can) || 0} veh.</span><span>{lei2(bd.canAddon)}</span></div> : null}
                {Number(bd.fmsAddon) ? <div class="co-ln"><span>FMS · {Number(bc.fms) || 0} veh.</span><span>{lei2(bd.fmsAddon)}</span></div> : null}
              </>
            )}
            {pr.model === 'trepte' && (
              <>
                <div class="co-ln"><span>Bază · {(Number(bc.none) || 0) + (Number(bc.can) || 0)} veh.</span><span>{lei2(bd.base)}</span></div>
                {Number(bd.canAddon) ? <div class="co-ln"><span>Spor CAN</span><span>{lei2(bd.canAddon)}</span></div> : null}
                {Number(bd.fmsAddon) ? <div class="co-ln"><span>Spor FMS</span><span>{lei2(bd.fmsAddon)}</span></div> : null}
              </>
            )}
            {(pr.model === 'pe-vehicul' || pr.model === 'fara-oferta') && <div class="co-ln"><span>Preț pe vehicul · {(Number(bc.none) || 0) + (Number(bc.can) || 0)} vehicule</span><span>{lei2(bd.base)}</span></div>}
            {Number(bd.aiAssistant) ? <div class="co-ln"><span>+ Asistent AI</span><span>{lei2(bd.aiAssistant)}</span></div> : null}
            {Number(bd.aiAgents) ? <div class="co-ln"><span>+ Agenți AI</span><span>{lei2(bd.aiAgents)}</span></div> : null}
            <div class="co-ln tot"><span>Total / lună</span><span>{lei2(pr.monthlyTotal)}</span></div>
            <div class="co-note">fără TVA · socotit de server, după oferta salvată și bifele de mai sus{Number(q.seatPriceRON) > 0 ? ' · conturile RA Insight se facturează separat' : ''}</div>
            {nFms > 0 && (
              <div class="co-msg" style="color:var(--co-warn);font-weight:700">
                Firma are {nFms}{de(nFms)}{nFms === 1 ? 'vehicul FMS' : 'vehicule FMS'}. Pe factură, FMS-urile se socotesc separat, la prețul FMS (sau „cu CAN", dacă lipsește), oricum ar fi bifate aici — factura poate ieși altfel decât totalul ăsta.
              </div>
            )}
          </>
        )}
        {modificat && <div class="co-msg" style="color:var(--co-warn);font-weight:700">Ai schimbat oferta — apasă „Salvează oferta" ca să vezi prețul nou.</div>}
      </div>

      {/* Plata */}
      <div class="fm-card pad">
        <h3 style="margin-top:0">Înregistrează plată</h3>
        <div class="frm">
          <div class="frm-row">
            <div class="fld"><label>Luni</label><input type="number" inputMode="numeric" min="1" max="36" value={pay.months}
              onInput={(e: any) => { const v = e.target.value; setPay((p) => ({ ...p, months: v, amount: p.touched ? p.amount : sumaAuto(ov, v) })); }} /></div>
            <div class="fld"><label>Sumă (RON)</label><input type="number" inputMode="decimal" min="0" step="0.01" value={pay.amount} placeholder="opțional"
              onInput={(e: any) => { const v = e.target.value; setPay((p) => ({ ...p, amount: v, touched: true })); }} /></div>
          </div>
          {ov.offer && <div class="co-note" style="margin:0">Suma = prețul lunar de mai sus × lunile alese{nFms > 0 ? ' (nu suma facturii — vezi nota despre FMS)' : ''}. O poți modifica.</div>}
          <div class="frm-row">
            <div class="fld"><label>Metodă</label>
              <select value={pay.method} onChange={(e: any) => setPay((p) => ({ ...p, method: e.target.value }))}>
                {METODE.map((m) => <option value={m.v}>{m.l}</option>)}
              </select></div>
            <div class="fld"><label>Notă (nr. factură)</label><input value={pay.note} placeholder="ex. F 2026-0123"
              onInput={(e: any) => { const v = e.target.value; setPay((p) => ({ ...p, note: v })); }} /></div>
          </div>
          <button class="btn btn-primary" disabled={busy === 'plata'} onClick={inregistreazaPlata}>
            <Icon name="coins" size={16} color="#06210F" /> {busy === 'plata' ? 'Se înregistrează…' : 'Înregistrează plata + extinde accesul'}</button>
        </div>
      </div>

      {reactivez && (
        <Confirma title="Reactivezi accesul?" text="Reactivezi accesul pentru clientul ăsta?" okLabel="Reactivează accesul"
          busy={busy === 'susp'} onOk={() => suspenda(false)} onCancel={() => setReactivez(false)} />
      )}
    </>
  );
}
