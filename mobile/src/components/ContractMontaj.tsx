// Anexa nr. 2 (echipamente și montaj, cost unic) și lucrările de montaj ale firmei — ca pe web
// (_raxCtrAnexa2, raxMontajIncarca / Randeaza / Edit / Total / Salveaza / Sterge).
//
// Două prețuri pe aceeași lucrare: ce plătește clientul (singurul care intră în contract) și cât ne cere
// partenerul (rămâne la noi). Clientul nu vede NICIODATĂ partenerul sau costul lui.
//   • Marja pe rândurile salvate vine de la server (`socoteala` = montaj.calc).
//   • Totalul din formular e doar informativ, cât scrii; adevărul îl socotește serverul la salvare.
//   • Prețul propus pentru client: întâi cel din Anexa nr. 2 a contractului (ce s-a convenit cu clientul
//     ăsta), apoi tariful casei — pe care îl dă SERVERUL: `tarife_montaj` din /overview dacă vine, altfel
//     „Prețurile noastre" din calculatorul de pe server (`/api/admin/offers/calc` cu `preturi`, cerut o
//     singură dată, la prima deschidere a formularului). Telefonul nu ține o copie a tarifelor.
//     Costul partenerului se propune din tarifele scrise la partener.
//   • „Salvează lucrarea" nu pleacă cu un rând care are bucăți, dar n-are preț pentru client: la un contract
//     nesemnat, serverul reface Anexa nr. 2 din lucrări și rândul ar ajunge pe hârtie „3 buc × 0,00 lei".
//   • Butonul „înapoi" de pe Android închide foaia (întreabă dacă s-a scris ceva), nu pleacă din fișă.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import { MONTAJ_STARI, MONTAJ_TIPURI, eur, inputZi, lei, tarifeMontajCasa, zi, zile } from '../lib/contracte';
import { Confirma } from './FlotaUi';
import { Icon } from './Icon';
import '../screens/admin.css';
import '../screens/detail.css';
import '../screens/contracte.css';

function Rand({ t, s, v }: { t: any; s?: any; v: any }) {
  return (
    <div class="ctr-row">
      <div class="ctr-row-top">
        <div class="ctr-row-t"><b>{t}</b>{s ? <span class="ctr-row-s">{s}</span> : null}</div>
        <div class="ctr-row-v">{v}</div>
      </div>
    </div>
  );
}

// ── Anexa nr. 2, de citit: echipamentele vândute (euro, la cursul înghețat) și montajul (lei) ──
export function Anexa2({ m }: { m: any }) {
  const eq: any[] = (m && m.echipamente && m.echipamente.items) || [], it: any[] = (m && m.items) || [];
  if (!eq.length && !it.length) return <div class="ctr-empty">Anexa nr. 2 e goală: contractul n-are costuri unice.</div>;
  const total = m.totalUnicLei != null ? m.totalUnicLei : (Number(m.totalClient) || 0) + (Number(m.echipamente && m.echipamente.totalLei) || 0);
  return (
    <div class="ctr-list">
      {eq.map((r) => <Rand t={r.eticheta || r.tip} s={r.buc + ' buc × ' + eur(r.pretEur)} v={lei(r.totalLei)} />)}
      {it.map((r) => <Rand t={r.eticheta || r.tip} s={r.buc + ' ' + (r.um || 'buc') + ' × ' + lei(r.pretClient)} v={lei(r.total)} />)}
      <div class="ctr-total">În Anexa nr. 2: <b>{lei(total)}</b> o singură dată (fără TVA)</div>
    </div>
  );
}

type Linie = { buc: string; pc: string; cp: string };
// `p0` = partenerul salvat pe lucrare când s-a deschis foaia: un partener „inactiv" rămâne în listă DOAR pe ea.
type Edit = { id: number; partener: string; p0: string; data: string; stare: string; factura: string; linii: Record<string, Linie> };
const s = (v: any) => (v == null || v === '' ? '' : String(v));
// „Programează montajul" din Drumul clientului cere formularul unei lucrări NOI, deschis (web: raxDrumMontaj →
// raxMontajEdit(0)). `deschideNoua` e un bilet: un număr nou = o deschidere. Biletul folosit se ține minte AICI,
// în afara bucății, ca fișa reîncărcată (care o face din nou) să nu redeschidă formularul.
let biletFolosit = 0;

export function ContractMontaj({ companyId, contract, tarifeCasa, onSalvat, deschideNoua }: {
  companyId: number; contract: any; tarifeCasa: Record<string, any> | null | undefined; onSalvat: () => void; deschideNoua?: number;
}) {
  const [lucrari, setLucrari] = useState<any[] | null>(null);
  const [parteneri, setParteneri] = useState<any[]>([]);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [del, setDel] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [deschid, setDeschid] = useState(false); // se aduc tarifele casei, înainte de formular
  // Tarifele casei aduse de la calculatorul serverului (când /overview nu le are). undefined = necerute încă.
  const [casa, setCasa] = useState<Record<string, number | null> | null | undefined>(undefined);
  const start = useRef(''); // formularul cum s-a deschis — „înapoi" întreabă doar dacă s-a schimbat ceva

  function incarca() {
    Promise.all([Api.companyMontaje(companyId).catch(() => []), Api.montajParteneri().catch(() => [])]).then(([l, p]) => {
      setLucrari(Array.isArray(l) ? l : []);
      setParteneri(Array.isArray(p) ? p : []);
    });
  }
  useEffect(incarca, [companyId]);

  // Prețul pentru client propus la o lucrare: Anexa nr. 2 a contractului, apoi tariful casei (de la server).
  function tarifeClient(casaAcum?: Record<string, any> | null): Record<string, any> {
    const tc = tarifeCasa || casaAcum || casa || null;
    const dinAnexa: Record<string, any> = {};
    ((contract && contract.montaj && contract.montaj.items) || []).forEach((r: any) => {
      if (r.pretClient != null && dinAnexa[r.tip] == null) dinAnexa[r.tip] = r.pretClient;
    });
    const out: Record<string, any> = {};
    MONTAJ_TIPURI.forEach(([k]) => { out[k] = dinAnexa[k] != null ? dinAnexa[k] : (tc && tc[k] != null ? tc[k] : null); });
    return out;
  }
  // Tarifele casei, o singură dată pe fișă. Dacă nu vin, formularul se deschide oricum, cu casetele goale.
  async function aduCasa(): Promise<Record<string, number | null> | null> {
    if (tarifeCasa) return null; // le-a trimis deja serverul, în /overview
    if (casa !== undefined) return casa;
    let t: Record<string, number | null> | null = null;
    try {
      const j: any = await Api.offerCalc({ preturi: true });
      t = tarifeMontajCasa(j && j.preturi && j.preturi.valori && j.preturi.valori.tp);
    } catch { t = null; }
    setCasa(t);
    return t;
  }
  const tarifeLui = (pid: string) => ((parteneri.find((p) => String(p.id) === pid) || {}).tarife || {}) as Record<string, any>;

  async function deschide(m: any | null) {
    if (deschid) return;
    setDeschid(true);
    const casaAcum = await aduCasa();
    setDeschid(false);
    const puse: Record<string, any> = {};
    ((m && m.items) || []).forEach((r: any) => { puse[r.tip] = r; });
    const pid = m && m.partener_id != null ? String(m.partener_id) : '';
    const tc = tarifeClient(casaAcum), tp = tarifeLui(pid);
    const linii: Record<string, Linie> = {};
    MONTAJ_TIPURI.forEach(([k]) => {
      const r = puse[k] || {};
      linii[k] = { buc: s(r.buc), pc: r.pretClient != null ? s(r.pretClient) : s(tc[k]), cp: r.costPartener != null ? s(r.costPartener) : s(tp[k]) };
    });
    const e: Edit = { id: m ? Number(m.id) : 0, partener: pid, p0: pid, data: m && m.data_lucrare ? inputZi(m.data_lucrare) : '',
      stare: (m && m.status) || 'de_programat', factura: (m && m.factura_partener) || '', linii };
    start.current = JSON.stringify(e);
    setMsg('');
    setEdit(e);
  }
  // Întoarce true dacă foaia s-a închis. Aceeași întrebare pentru X, fundal și „înapoi" de pe Android.
  function inchide(): boolean {
    if (!edit) return true;
    if (busy) return false;
    if (JSON.stringify(edit) !== start.current && !confirm('Închizi fără să salvezi?\n\nCe ai scris la lucrarea de montaj se pierde.')) return false;
    setEdit(null);
    return true;
  }
  useInapoiInchide(!!edit, inchide);
  // Biletul drumului: după ce lucrările și partenerii au sosit (lista „Cine execută" e plină), o singură dată.
  useEffect(() => {
    if (!deschideNoua || deschideNoua === biletFolosit || lucrari == null) return;
    biletFolosit = deschideNoua;
    if (!edit) deschide(null);
  }, [deschideNoua, lucrari]);
  // Alt partener: ce s-a scris pe rândurile cu bucăți rămâne; restul se propune din nou (ca pe web).
  function schimbaPartener(pid: string) {
    setEdit((e) => {
      if (!e) return e;
      const tc = tarifeClient(), tp = tarifeLui(pid);
      const linii: Record<string, Linie> = {};
      MONTAJ_TIPURI.forEach(([k]) => {
        const l = e.linii[k];
        const cuBuc = (parseFloat(l.buc) || 0) > 0;
        linii[k] = cuBuc ? { buc: l.buc, pc: l.pc, cp: l.cp !== '' ? l.cp : s(tp[k]) } : { buc: l.buc, pc: s(tc[k]), cp: s(tp[k]) };
      });
      return { ...e, partener: pid, linii };
    });
  }
  const pune = (k: string, p: Partial<Linie>) => { setMsg(''); setEdit((e) => (e ? { ...e, linii: { ...e.linii, [k]: { ...e.linii[k], ...p } } } : e)); };
  const sf = (k: keyof Edit, v: any) => setEdit((e) => (e ? { ...e, [k]: v } : e));

  // Rândurile care chiar se montează (cu bucăți), în forma pe care o așteaptă serverul.
  function citeste(e: Edit) {
    const nr = (v: string) => (v === '' ? null : parseFloat(v));
    return MONTAJ_TIPURI.map(([k]) => ({ tip: k, buc: nr(e.linii[k].buc), pretClient: nr(e.linii[k].pc), costPartener: nr(e.linii[k].cp) }))
      .filter((r) => (r.buc || 0) > 0);
  }

  // Rândurile cu bucăți, dar fără preț pentru client (ar intra în Anexa nr. 2 cu 0 lei).
  const farePret = (l: Linie) => (parseFloat(l.buc) || 0) > 0 && (l.pc.trim() === '' || !isFinite(parseFloat(l.pc)));

  async function salveaza() {
    if (!edit || busy) return;
    const lipsa = MONTAJ_TIPURI.filter(([k]) => farePret(edit.linii[k]));
    if (lipsa.length) {
      setMsg('Scrie prețul pentru client la: ' + lipsa.map((x) => x[1]).join(', ') +
        '. Fără el, lucrarea intră în Anexa nr. 2 cu 0 lei. Dacă nu se plătește, scrie 0.');
      return;
    }
    setMsg('');
    const trup = {
      id: edit.id || null, contract_id: (contract && contract.id) || null,
      partener_id: edit.partener ? parseInt(edit.partener, 10) : null,
      data_lucrare: zi(edit.data), status: edit.stare,
      factura_partener: edit.factura.trim() || null,
      items: citeste(edit),
    };
    setBusy(true);
    try {
      const j: any = await Api.saveMontaj(companyId, trup);
      showToast(j && j.anexa === 'semnat'
        ? 'Lucrare salvată ✓ — contractul e semnat, deci Anexa nr. 2 rămâne cum s-a semnat'
        : j && j.anexa === 'actualizata' ? 'Lucrare salvată ✓ — Anexa nr. 2 s-a refăcut din lucrările contractului' : 'Lucrare salvată ✓');
      setEdit(null);
      onSalvat(); // Anexa nr. 2 poate fi refăcută: fișa se reîncarcă toată
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(false); }
  }
  async function sterge() {
    if (!del || busy) return;
    setBusy(true);
    try { await Api.deleteMontaj(Number(del.id)); setDel(null); incarca(); }
    catch (e: any) { showToast('Eroare: ' + (e?.message || ''), true); }
    finally { setBusy(false); }
  }

  // Totalul din formular — informativ.
  let tcF = 0, tpF = 0;
  const rdF = edit ? citeste(edit) : [];
  rdF.forEach((r) => { tcF += (r.buc || 0) * (r.pretClient || 0); tpF += (r.buc || 0) * (r.costPartener || 0); });
  const marjaF = tcF - tpF;

  const tc = (lucrari || []).reduce((a, m) => a + Number(m.total_client || 0), 0);
  const tp = (lucrari || []).reduce((a, m) => a + Number(m.total_partener || 0), 0);

  return (
    <>
      {lucrari == null ? <div class="spin" style="margin:8px auto" /> : (
        <div class="ctr-list">
          {!lucrari.length && <div class="ctr-empty">Nicio lucrare de montaj încă.</div>}
          {lucrari.map((m) => {
            const so = m.socoteala || {};
            return (
              <div class="ctr-row">
                <div class="ctr-row-t">
                  <b>{(m.data_lucrare ? zile(m.data_lucrare) : 'fără dată') + ' · ' + lei(m.total_client) + ' de la client'}</b>
                  <span class="ctr-row-s">
                    {(m.partener_nume ? 'executat de ' + m.partener_nume + ' · ne costă ' + lei(m.total_partener) : 'fără partener ales') + ' · '}
                    <b class="ctr-ok-txt">{'marjă ' + lei(so.marja) + (so.marjaProc != null ? ' (' + so.marjaProc + '%)' : '')}</b>
                    {' · ' + (MONTAJ_STARI[m.status] || m.status) + (m.factura_partener ? ' · factura lui: ' + m.factura_partener : '')}
                  </span>
                </div>
                <div class="ctr-btns">
                  <button class="ctr-btn" disabled={deschid} onClick={() => deschide(m)}><Icon name="edit" size={15} /> Modifică</button>
                  <button class="ctr-btn danger" onClick={() => setDel(m)}><Icon name="trash" size={15} /> Șterge</button>
                </div>
              </div>
            );
          })}
          {lucrari.length > 0 && (
            <div class="ctr-total">Total montaj la clientul ăsta: <b>{lei(tc)}</b> încasat · {lei(tp)} plătit partenerilor · <b class="ctr-ok-txt">{lei(tc - tp)} marjă</b></div>
          )}
          <button class="ctr-btn" style="align-self:flex-start" disabled={deschid} onClick={() => deschide(null)}><Icon name="plus" size={16} /> {deschid ? 'Se deschide…' : 'Lucrare de montaj'}</button>
        </div>
      )}

      {edit && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) inchide(); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b><Icon name="wrench" size={18} color="var(--accent)" /> {edit.id ? 'Lucrarea de montaj' : 'Lucrare de montaj'}</b>
              <button class="h-btn" onClick={() => inchide()} aria-label="Închide"><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Cine execută</label>
                  <select value={edit.partener} onChange={(e: any) => schimbaPartener(e.target.value)}>
                    <option value="">— fără partener ales —</option>
                    {/* Un partener „inactiv" (nu mai lucrăm cu el) nu se mai propune; rămâne doar pe lucrările lui (ca pe
                        web). Filtrul stă aici, nu în listă: tarifeLui() citește tarifele și pe o lucrare veche. */}
                    {parteneri.filter((p) => p.active !== false || String(p.id) === edit.p0).map((p) => (
                      <option value={String(p.id)}>{p.name + (p.active === false ? ' — inactiv' : '')}</option>
                    ))}
                  </select>
                </div>
                <div class="fld"><label>Data lucrării</label><input type="date" value={edit.data} onInput={(e: any) => sf('data', e.target.value)} /></div>
                <div class="fld"><label>Unde e lucrarea</label>
                  <select value={edit.stare} onChange={(e: any) => sf('stare', e.target.value)}>
                    {Object.keys(MONTAJ_STARI).map((k) => <option value={k}>{MONTAJ_STARI[k]}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Nr. facturii de la partener</label><input value={edit.factura} placeholder="ex. X-2026-118" onInput={(e: any) => sf('factura', e.target.value)} /></div>
                <div class="ctr-mont">
                  {MONTAJ_TIPURI.map(([k, et, um]) => {
                    const l = edit.linii[k];
                    return (
                      <div class="ctr-mont-r">
                        <div class="t">{et} <em>({um})</em></div>
                        <div class="ctr-mont-3">
                          <label>Cant.<input type="number" inputMode="decimal" min="0" step="1" placeholder="0" value={l.buc} onInput={(e: any) => pune(k, { buc: e.target.value })} /></label>
                          <label>Preț client<input class={farePret(l) ? 'lipsa' : ''} type="number" inputMode="decimal" min="0" step="1" placeholder="lei" value={l.pc} onInput={(e: any) => pune(k, { pc: e.target.value })} /></label>
                          <label>Cost partener<input type="number" inputMode="decimal" min="0" step="1" placeholder="lei" value={l.cp} onInput={(e: any) => pune(k, { cp: e.target.value })} /></label>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div class="ctr-total">
                  {rdF.length ? (
                    <>Clientul plătește <b>{lei(tcF)}</b> · partenerul ne cere {lei(tpF)} · <b class={marjaF < 0 ? 'ctr-bad-txt' : 'ctr-ok-txt'}>{'marjă ' + lei(marjaF) + (tcF > 0 ? ' (' + (Math.round(marjaF / tcF * 1000) / 10) + '%)' : '')}</b></>
                  ) : 'Scrie câte bucăți ai de montat.'}
                </div>
                {msg && <div class="ctr-msg">{msg}</div>}
                <div class="frm-actions">
                  <button class="btn fl-btn2" disabled={busy} onClick={() => setEdit(null)}>Renunț</button>
                  <button class="btn btn-primary" disabled={busy} onClick={salveaza}><Icon name="check" size={16} /> {busy ? 'Se salvează…' : 'Salvează lucrarea'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {del && (
        <Confirma title="Șterge lucrarea" danger busy={busy} okLabel="Șterge"
          text="Ștergi lucrarea de montaj? Anexa nr. 2 rămâne cum a fost salvată ultima dată."
          onOk={sterge} onCancel={() => { if (!busy) setDel(null); }} />
      )}
    </>
  );
}
