import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { Confirma } from '../components/FlotaUi';
import { de } from '../lib/contracte';
import { rutaFisa } from '../lib/companii';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import './admin.css';
import './detail.css';
import './firma.css';
import './companii.css';

// Fișa firmei → „Abonament & plăți" (fondatori), ca pe web (_raxCodAbonament / _raxAboHtml):
//   • starea accesului + suspendarea manuală (motiv obligatoriu) / reactivarea;
//   • oferta firmei: preț / vehicul fără CAN și cu CAN, bifele „cu CAN" pe vehicul, notă (suma fixă pentru agenții AI a ieșit pe
//     13.11 — agenții sunt incluși, fără cost);
//   • modulele AI; RA Insight: drumul spre fila „Acces" (pachetul firmei);
//   • prețul lunar — SOCOTIT DE SERVER (overview.price, după oferta salvată). Web-ul are aici o
//     previzualizare socotită în pagină (_raxClientPrice); pe telefon NU se copiază regula prețului:
//     după „Salvează oferta" se recitește fișa, iar prețul arătat e cel al serverului.
//     ⚠ NU e suma facturii: fișa numără mașinile după bifele „cu CAN" (FMS-urile intră la CAN sau fără
//     CAN), pe când factura (_companyBillCounts) pune FMS-urile separat, la prețul FMS, oricum ar fi
//     bifate. La o firmă cu FMS cele două pot ieși diferit — se spune pe ecran. (Cerere către server:
//     overview.price din numărătoarea facturii.)
//   • păstrarea istoricului (24.09): 12 luni incluse, mai mult se plătește; coborârea ȘTERGE date, deci
//     cere confirmare pe față. Cifrele regulii (incluse / cel mult) vin de la server (`pastrare_regula`);
//   • aparatele închiriate (25.09): doar de citit — se schimbă prin act adițional, nu dintr-o casetă;
//   • (înregistrarea unei plăți cu „luni de acces" a plecat pe 29.09: plata se trece pe factură.)

const s = (v: any) => (v != null ? String(v) : '');
function lei2(v: any) { return (Number(v) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' lei'; }
// Ce se plătește lunar, din cifrele trimise de server, adunate EXACT ca pe web (raxAboRecalc): mașinile (overview.price, după
// oferta salvată) + pachetul RA Insight („+ RA Insight Pro", 13.11 — pe orice ofertă, și fără ofertă) + păstrarea istoricului,
// când e plătită + chiria aparatelor închiriate. Fiecare e rând separat pe factură (buildInvoiceLines).
// Telefonul nu socotește niciun preț: doar adună patru sume pe care i le-a dat serverul.
function lunar(ov: any) {
  const pr = ov && ov.price, bd = (pr && pr.breakdown) || {};
  const baza = ov && ov.offer && pr ? Number(pr.perVehicleTotal) || 0 : 0;
  const pachet = Number(bd.aiPachet) || 0;
  const p = ov && ov.pastrare;
  const past = p && p.platita ? Number(p.pretRON) || 0 : 0;
  const chirie = ov && ov.chirie ? Number(ov.chirie.totalRON) || 0 : 0;
  return { baza, pachet, eticheta: String(bd.aiPachetEticheta || 'RA Insight'), past, chirie, total: Math.round((baza + pachet + past + chirie) * 100) / 100 };
}
// „; pachetul RA Insight și chiria aparatelor sunt pe rânduri separate pe factură" / „; pachetul RA Insight e pe un rând separat
// pe factură" — doar ce e chiar pe factură, cu acordul cerut.
function notaRanduri(b: { pachet: number; past: number; chirie: number }) {
  const l = [b.pachet ? 'pachetul RA Insight' : '', b.past ? 'păstrarea istoricului' : '', b.chirie ? 'chiria aparatelor' : ''].filter(Boolean);
  if (!l.length) return '';
  return '; ' + (l.length > 1 ? l.slice(0, -1).join(', ') + ' și ' + l[l.length - 1] + ' sunt pe rânduri separate' : l[0] + ' e pe un rând separat') + ' pe factură';
}
// Selecția „Cât se păstrează", pornită din ce scrie pe firmă (ca _raxPastrareHtml): plătită → lunile ei
// (24 / 36, altfel „alt"); neplătită → cele incluse. Fără regulă sau fără păstrare → secțiunea nu apare.
function formaPastrarii(ov: any) {
  const R = ov && ov.pastrare_regula, P = ov && ov.pastrare;
  if (!R || !P) return { sel: '', alt: '', pret: '' };
  const custom = !!P.platita && P.luni !== 24 && P.luni !== 36;
  return { sel: custom ? 'alt' : String(P.platita ? P.luni : R.incluse), alt: custom ? s(P.luni) : '', pret: P.platita ? s(P.pretRON) : '' };
}
function formaOfertei(ov: any) {
  const o = (ov && ov.offer) || {};
  return { name: o.name || '', priceNoneRON: s(o.priceNoneRON), priceCanRON: s(o.priceCanRON), note: o.note || '' };
}
function bifeCan(ov: any): Record<string, boolean> {
  const m: Record<string, boolean> = {};
  ((ov && ov.vehicles) || []).forEach((v: any) => { if (v.bill_can) m[v.imei] = true; });
  return m;
}

// `onFacturi` — „Deschide fila Facturi" (web: raxCodTab('facturi')): fișa schimbă fila; plata se trece acolo.
export function CompanyAbonament({ ov, onReload, onFacturi }: { ov: any; onReload: () => void; onFacturi?: () => void }) {
  const loc = useLocation();
  const co = ov.company || {};
  const id = Number(co.id);
  const vehicles: any[] = ov.vehicles || [];
  const [of, setOf] = useState(() => formaOfertei(ov));
  const [can, setCan] = useState<Record<string, boolean>>(() => bifeCan(ov));
  const [modificat, setModificat] = useState(false);
  const [feats, setFeats] = useState<Record<string, boolean>>(() => Object.assign({ ai_assistant: false, agents: false }, ov.features || {}));
  const [susp, setSusp] = useState<{ cere: boolean; motiv: string }>({ cere: false, motiv: '' });
  const [reactivez, setReactivez] = useState(false);
  const [busy, setBusy] = useState('');
  const [past, setPast] = useState(() => formaPastrarii(ov));
  // Coborârea păstrării ȘTERGE date: se întreabă pe față, într-o foaie, înainte de a trimite ceva.
  const [pastCob, setPastCob] = useState<{ de: number; la: number; pret: number } | null>(null);

  // Fișa s-a recitit → formularul pornește din ce a scris serverul. DAR nu peste ce scrii acum: o fișă
  // recitită după un comutator de modul nu are voie să-ți șteargă prețurile tastate și încă nesalvate.
  const ofAtins = useRef(false), pastAtins = useRef(false);
  useEffect(() => {
    if (!ofAtins.current) { setOf(formaOfertei(ov)); setCan(bifeCan(ov)); setModificat(false); }
    setFeats(Object.assign({ ai_assistant: false, agents: false }, ov.features || {}));
    if (!pastAtins.current) setPast(formaPastrarii(ov));
  }, [ov]);

  // Butonul „înapoi" de pe Android închide foaia de confirmare deschisă, nu fișa firmei de sub ea.
  // (Cele două foi nu se deschid niciodată deodată.)
  useInapoiInchide(reactivez, () => { if (busy === 'susp') return false; setReactivez(false); return true; });
  useInapoiInchide(!!pastCob, () => { if (busy === 'past') return false; setPastCob(null); return true; });

  const so = (k: string, v: string) => { ofAtins.current = true; setOf((p) => ({ ...p, [k]: v })); setModificat(true); };

  // ── Starea accesului + suspendarea (_raxSuspendHtml) ──
  const a = ov.access || {};
  const np = ov.neplata || null;
  const manual = co.suspended_at != null;
  let titlu = '', fel = '', text = '';
  if (a.status === 'expired') {
    fel = 'bad';
    titlu = manual ? 'Acces oprit de noi' : 'Acces suspendat pentru neplată';
    if (manual && co.suspend_reason) text = 'Motivul scris: „' + co.suspend_reason + '".';
    else if (np && np.factura) text = 'Factura ' + (np.factura.numar || '') + ' e neachitată de ' + np.zile + (Number(np.zile) === 1 ? ' zi.' : de(np.zile) + 'zile.');
    text += (text ? ' ' : '') + 'Clientul nu poate intra deloc. Aparatele transmit mai departe, datele nu se pierd.';
  } else if (np && np.faza === 'avertisment') {
    fel = 'warn';
    titlu = 'Factură restantă — ' + np.zilePanaLaSuspendare + de(np.zilePanaLaSuspendare) + 'zile până la suspendare';
    text = 'Factura ' + ((np.factura || {}).numar || '') + ' a fost scadentă acum ' + np.zile + de(np.zile) + 'zile. Suspendarea vine singură dacă nu se plătește.';
  } else {
    // Fără „nelimitat" și fără „abonament în grație": ceasul pe perioade plătite a plecat pe 29.09.
    fel = a.status === 'active' ? 'ok' : '';
    titlu = 'Acces în regulă';
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
      onReload(); // prețul lunar se schimbă cu modulele (pachetul RA Insight intră în preț doar cu modulul pornit)
    } catch (e: any) { setFeats(prev); showToast(e?.message || 'Eroare', true); }
  }

  // ── Păstrarea istoricului (raxSavePastrare) ──
  // Regula (câte luni sunt incluse, cel mult câte) și ce scrie acum pe firmă vin de la server. Aici doar se
  // alege; serverul curăță cererea, o refuză dacă nu e un număr de luni valid și scrie în audit de la cât la cât.
  const PR = ov.pastrare_regula || null, PA = ov.pastrare || null;
  const sp2 = (k: 'sel' | 'alt' | 'pret', v: string) => { pastAtins.current = true; setPast((p) => ({ ...p, [k]: v })); };
  function salveazaPastrarea() {
    if (!PR || !PA) return;
    const inc = Number(PR.incluse), max = Number(PR.max);
    const inainte = Number(PA.luni) || inc;
    let luni = past.sel === 'alt' ? Math.round(Number(past.alt)) : Number(past.sel);
    if (!Number.isFinite(luni) || luni < 1 || luni > max) { showToast('Alege un număr de luni, cel mult ' + max + '.', true); return; }
    if (luni < inc) luni = inc;
    const pret = luni > inc ? Number(past.pret !== '' ? past.pret : 0) : 0;
    if (!Number.isFinite(pret) || pret < 0) { showToast('Preț invalid.', true); return; }
    // O păstrare coborâtă ȘTERGE date, iar ele nu se mai pot aduce înapoi. Se spune pe față, înainte.
    if (luni < inainte) { setPastCob({ de: inainte, la: luni, pret }); return; }
    trimitePastrarea(luni, pret);
  }
  async function trimitePastrarea(luni: number, pret: number) {
    if (!PR) return;
    const inc = Number(PR.incluse);
    setBusy('past');
    try {
      // Coborârea ȘTERGE date: confirmarea de pe ecran (setPastCob) pleacă și la server, care o cere din 01.10
      // (lista lui Robert, pct. 18) — ca pe web.
      const inainte = (PA && Number(PA.luni)) || inc;
      const r: any = await Api.saveCompanySettingsOf(id, { pastrare: luni > inc ? { luni, pretRON: pret } : null, ...(luni < inainte ? { confirmaStergere: true } : {}) });
      // Ce a rămas scris pe server, nu ce am trimis.
      const p = (r && r.pastrare) || null;
      showToast(p && p.platita
        ? 'Salvat: istoricul se păstrează ' + p.luni + de(p.luni) + 'luni, ' + (Number(p.pretRON) || 0).toLocaleString('ro-RO', { maximumFractionDigits: 2 }) + ' lei/lună ✓'
        : 'Salvat: cele ' + inc + ' luni incluse ✓');
      setPastCob(null);
      pastAtins.current = false; // selecția se reface din ce a rămas scris pe server
      onReload();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(''); }
  }

  const pr = ov.price || null;
  const bc = ov.billCounts || {};
  const bd = (pr && pr.breakdown) || {};
  const arePret = !!(ov.offer && pr);
  const bani = lunar(ov);
  const chRanduri: any[] = (ov.chirie && Array.isArray(ov.chirie.randuri)) ? ov.chirie.randuri : [];
  const nFms = vehicles.filter((v) => v.can_type === 'fms').length;
  // Nota despre FMS și trimiterea la ea din nota plății ies din ACEEAȘI condiție. Diferența FMS există doar cu
  // o ofertă salvată: fără ofertă, factura nu pune niciun rând pe mașini (0 lei), deci suma propusă (păstrare,
  // chirie) e chiar suma facturii — un „nu suma facturii" ar fi fals, iar nota la care trimite nici nu e pe ecran.
  const notaFms = arePret && nFms > 0;
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

      {/* (Aici stătea „Add-on AI" — o sumă fixă pe lună pentru agenții AI. A ieșit pe 13.11, Alin: „2. DA": agenții sunt incluși.) */}
      <div class="fm-card pad">
        <div class="frm">
          {camp('Notă (intern)', 'note', 'detalii ofertă / contract', undefined, false)}
          <button class="btn btn-primary" disabled={busy === 'oferta'} onClick={salveazaOferta}>
            <Icon name="check" size={16} color="#06210F" /> {busy === 'oferta' ? 'Se salvează…' : 'Salvează oferta'}</button>
        </div>
      </div>

      {/* Modulele AI + drumul spre pachetul RA Insight */}
      <div class="fm-card pad">
        <h3 style="margin-top:0">Module AI</h3>
        <button class="fm-tgl" onClick={() => modul('ai_assistant')} role="switch" aria-checked={!!feats.ai_assistant}>
          <span class="lbl">Asistent AI<small>chat + RA Insight</small></span><span class={'sw' + (feats.ai_assistant ? ' on' : '')} />
        </button>
        <button class="fm-tgl" onClick={() => modul('agents')} role="switch" aria-checked={!!feats.agents}>
          <span class="lbl">Agenți AI<small>cei 6 agenți (Watch / Dispatch / …)</small></span><span class={'sw' + (feats.agents ? ' on' : '')} />
        </button>
        <div class="co-note">Agenții AI sunt incluși, fără cost; îi pornești și îi oprești din fila „Acces”.</div>

        {/* RA Insight se vinde pe pachete (regula veche, „pe cont", a ieșit pe 11.11): pachetul se alege din fila „Acces". */}
        <div class="fm-sec" style="margin-top:16px">RA Insight</div>
        <div class="co-note">Se vinde pe pachete; pachetul firmei se alege din fila „Acces”.</div>
        <button class="fm-btn" onClick={() => loc.route(rutaFisa(id, 'acces'), true)}><Icon name="layers" size={15} /> Deschide „Acces”</button>
      </div>

      {/* Păstrarea istoricului (24.09) — ca pe web (_raxPastrareHtml). Fără regulă sau fără păstrare de la server
          (setări stricate pe firmă), secțiunea nu apare: nu se ghicește o regulă după care se șterg date. */}
      {PR && PA && (
        <div class="fm-card pad">
          <h3 style="margin-top:0">Păstrarea istoricului</h3>
          <div class="frm">
            <div class="fld"><label>Cât se păstrează</label>
              <select value={past.sel} onChange={(e: any) => sp2('sel', e.target.value)}>
                <option value={String(PR.incluse)}>{PR.incluse} luni (incluse)</option>
                <option value="24">24 de luni</option>
                <option value="36">36 de luni</option>
                <option value="alt">Alt număr de luni…</option>
              </select></div>
            {past.sel !== String(PR.incluse) && (
              <div class="frm-row">
                {past.sel === 'alt' && (
                  <div class="fld"><label>Luni</label>
                    <input type="number" inputMode="numeric" min={String(Number(PR.incluse) + 1)} max={String(PR.max)} step="1"
                      value={past.alt} placeholder="ex. 48" onInput={(e: any) => sp2('alt', e.target.value)} /></div>
                )}
                <div class="fld"><label>Preț (lei/lună, pe firmă)</label>
                  <input type="number" inputMode="decimal" min="0" step="0.01"
                    value={past.pret} placeholder="ex. 50" onInput={(e: any) => sp2('pret', e.target.value)} /></div>
              </div>
            )}
            <div class="co-note" style="margin:0">{PR.incluse} luni sunt incluse pentru toți. Mai mult se plătește lunar și apare pe factură. Aplicația șterge singură tot ce e mai vechi decât scrie aici, la câteva ore.</div>
            <button class="fm-btn acc" disabled={busy === 'past'} onClick={salveazaPastrarea}><Icon name="check" size={15} /> {busy === 'past' ? 'Se salvează…' : 'Salvează'}</button>
          </div>
        </div>
      )}

      {/* Aparatele închiriate (25.09) — ca pe web (_raxChirieHtml). Doar de citit: rândurile vin din contract;
          alte aparate sau alt preț înseamnă act adițional, nu o casetă schimbată în grabă. */}
      {chRanduri.length > 0 && (
        <div class="fm-card pad">
          <h3 style="margin-top:0">Aparate închiriate</h3>
          {chRanduri.map((r: any) => (
            <div class="co-ln"><span>{r.nume} · {r.cant} buc × {(Number(r.pret) || 0).toLocaleString('ro-RO')} lei</span>
              <span>{((Number(r.cant) || 0) * (Number(r.pret) || 0)).toLocaleString('ro-RO')} lei</span></div>
          ))}
          <div class="co-note">Aparatele sunt ale noastre (le vezi în Gestiune → Stoc echipamente). Chiria apare pe factură pe rând separat, lună de lună. Din contract; se schimbă doar prin act adițional.</div>
          <div class="fm-btns" style="margin-top:10px">
            <button class="fm-btn" onClick={() => loc.route('/admin/stoc')}><Icon name="boxes" size={15} /> Deschide Stoc echipamente</button>
          </div>
        </div>
      )}

      {/* Prețul lunar, de la server */}
      <div class="fm-card pad">
        <h3 style="margin-top:0">Preț lunar</h3>
        {!arePret && <div class="co-note" style="margin:0">{bani.pachet || bani.past || bani.chirie ? 'Fără ofertă — vehiculele nu se taxează (0 lei).' : 'Fără ofertă — 0 lei.'} Pune prețul mai sus și apasă „Salvează oferta".</div>}
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
          </>
        )}
        {/* Aceleași rânduri ca pe web și ca pe factură: pachetul RA Insight (13.11; numele, ca „RA Insight Pro", vine de la server),
            păstrarea plătită și chiria aparatelor. */}
        {bani.pachet ? <div class="co-ln"><span>+ {bani.eticheta}</span><span>{lei2(bani.pachet)}</span></div> : null}
        {bani.past ? <div class="co-ln"><span>+ Păstrarea istoricului · {PA.luni}{de(PA.luni)}luni</span><span>{lei2(bani.past)}</span></div> : null}
        {bani.chirie ? <div class="co-ln"><span>+ Chiria aparatelor</span><span>{lei2(bani.chirie)}</span></div> : null}
        {(arePret || bani.pachet || bani.past || bani.chirie) ? (
          <>
            <div class="co-ln tot"><span>Total / lună</span><span>{lei2(bani.total)}</span></div>
            <div class="co-note">fără TVA · abonamentul e socotit de server, după oferta salvată și bifele de mai sus{notaRanduri(bani)}</div>
          </>
        ) : null}
        {notaFms && (
          <div class="co-msg" style="color:var(--co-warn);font-weight:700">
            Firma are {nFms}{de(nFms)}{nFms === 1 ? 'vehicul FMS' : 'vehicule FMS'}. Pe factură, FMS-urile se socotesc separat, la prețul FMS (sau „cu CAN", dacă lipsește), oricum ar fi bifate aici — factura poate ieși altfel decât totalul ăsta.
          </div>
        )}
        {modificat && <div class="co-msg" style="color:var(--co-warn);font-weight:700">Ai schimbat oferta — apasă „Salvează oferta" ca să vezi prețul nou.</div>}
      </div>

      {/* Plățile (29.09): se trec PE FACTURĂ. Formularul „Înregistrează plata + extinde accesul" (luni × preț)
          a plecat odată cu ceasul vechi „acces până la", care bloca clienți care plătiseră tot. */}
      <div class="fm-card pad">
        <h3 style="margin-top:0">Plăți</h3>
        <div class="co-note" style="margin:0">Plata se trece pe factură, din fila „Facturi" (butonul „Marchează plătită" de pe rând; la proformă, „Încasată"). Accesul clientului se oprește doar pentru o factură neplătită la 15 zile după scadență — nu mai există „acces până la".</div>
        {onFacturi && (
          <div class="fm-btns" style="margin-top:10px">
            <button class="fm-btn" onClick={onFacturi}><Icon name="report" size={15} /> Deschide fila Facturi</button>
          </div>
        )}
      </div>

      {reactivez && (
        <Confirma title="Reactivezi accesul?" text="Reactivezi accesul pentru clientul ăsta?" okLabel="Reactivează accesul"
          busy={busy === 'susp'} onOk={() => suspenda(false)} onCancel={() => setReactivez(false)} />
      )}
      {pastCob && (
        <Confirma danger title="Se șterg date" okLabel="Scad și șterg" busy={busy === 'past'}
          text={'Scazi păstrarea istoricului de la ' + pastCob.de + de(pastCob.de) + 'luni la ' + pastCob.la + de(pastCob.la) + 'luni.\n\n' +
            'Tot istoricul firmei mai vechi de ' + pastCob.la + de(pastCob.la) + 'luni — poziții, curse, alerte — se șterge definitiv la următoarea rulare, în câteva ore. Nu se mai poate aduce înapoi.'}
          onOk={() => trimitePastrarea(pastCob.la, pastCob.pret)} onCancel={() => { if (busy !== 'past') setPastCob(null); }} />
      )}
    </>
  );
}
