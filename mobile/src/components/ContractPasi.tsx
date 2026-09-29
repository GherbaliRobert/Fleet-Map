// Pașii contractului unui client, fiecare cu butonul lui (Alin, 24.09: „buton de trimitere fix acolo unde
// lipsește") — pe telefon, aceleași acțiuni ca pe web: _ctrePasHtml (pasul următor, sub stare), _ctreLipsuriHtml
// (fiecare lipsă a dosarului cu butonul ei), _drumButon (butonul drumului clientului) și raxCtreAproba /
// AmTrimis / Trimite / Semnat / Data / Incarca / Completeaza.
//
// O SINGURĂ scriere, folosită de lista Contracte, de dosarul firmei și de fila Contract din fișa firmei — ca pe
// web, unde butoanele din listă și din fișă sunt aceleași funcții (`_ctreGasit` / `_ctreDupa`). După orice
// acțiune, ecranul deschis se reîncarcă (`laSchimbat`).
//
// Nimic de aici nu HOTĂRĂȘTE ceva: ce lipsește (`dosar.lipsuri`, din stareDosar), drumul (`drum`), dacă serverul
// poate trimite pe email (`trimite_pe_email`), trecerile și refuzurile vin toate de la SERVER. Telefonul alege
// doar butonul și arată răspunsul, cu vorbele serverului.
//   • „Trimite la semnat" (POST /api/contracts/:id/trimite): emailul, PDF-ul atașat (același contractPdf ca la
//     „Descarcă") și trecerea pe „trimis" le face serverul. Fără SMTP butonul NU minte: devine „Am trimis-o".
//   • „Completează" scrie pe PUT /api/companies/:id/dosar, care schimbă DOAR cheile primite — și trimitem doar ce
//     s-a schimbat. NU pe PUT /api/companies/:id, care golește ce primește gol.
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import { LIPSA_ET, LIPSA_FIRMA, RUTA_NEASIGNATE, azi, inputZi, zile } from '../lib/contracte';
import { rutaDosar } from '../lib/companii';
import { ziLaPranz } from '../lib/montajSectiune';
import { AlegeFisier, type FisierAles } from './ContractUi';
import { Confirma } from './FlotaUi';
import { Icon, type IconName } from './Icon';
import '../screens/admin.css';
import '../screens/detail.css';
import '../screens/contracte.css';

// Montajul: dosarul firmei, cu formularul unei lucrări noi DESCHIS (web: raxDrumMontaj → raxMontajEdit(0)).
// Dosarul citește `?lucrare=noua`. Adresa dosarului rămâne una singură (rutaDosar).
export const rutaMontajNou = (companyId: any) => rutaDosar(companyId) + '?lucrare=noua';
// Prima factură: „Generează factură", cu firma deja aleasă (web: raxDrumFactura → raxOpenGenInvoice(companyId)).
export const rutaPrimaFactura = (companyId: any) => '/billing?factura=' + encodeURIComponent(String(companyId));
// Fără SMTP pe server, „Trimite la semnat" ar minți; pe web e scris pe butonul „Am trimis-o", la trecerea mouse-ului.
const FARA_EMAIL = 'Emailul nu e configurat pe server: descarcă contractul și trimite-l tu.';

// Contractul, cum îl dă fișa firmei (/overview), în forma unui rând din lista Contracte — ca `_ctreGasit` pe web:
// datele firmei (pentru „Completează" și adresa la care pleacă) + contractul + dosarul și drumul serverului.
// Merge și fără contract (atunci are doar firma), ca „Completează" să se poată deschide din cutia dosarului.
export function randDinFisa(o: any): any {
  const co = (o && o.company) || {};
  return Object.assign(
    { company_id: co.id, company_name: co.name, cui: co.cui, reg_com: co.reg_com, address: co.address, legal_rep: co.legal_rep, contact_email: co.contact_email },
    (o && o.contract) || {},
    { dosar: o && o.dosar, drum: o && o.drum },
  );
}
// Golurile de pe hârtie pe care le completăm noi (CUI, sediu, reprezentant) — din ce spune serverul că lipsește.
export function lipsuriFirma(c: any): string[] {
  const l: string[] = (c && c.dosar && c.dosar.lipsuri) || [];
  return l.filter((k) => LIPSA_FIRMA.indexOf(k) >= 0);
}

type Dlg = { fel: 'aproba' | 'amtrimis' | 'trimite' | 'data' | 'semnat' | 'completeaza'; c: any } | null;

export function usePasiContract(o: {
  trimitePeEmail: boolean;
  laSchimbat: () => void;
  // Dosarul: „Aprobă contractul" salvează ÎNTÂI formularul, apoi trece pe „aprobat" (web: raxCtrTreci('aprobat')).
  aproba?: (c: any) => void;
  // Dosarul: „Programează montajul" deschide formularul lucrării pe loc; altfel se merge în dosar, cu el deschis.
  montajNou?: (c: any) => void;
  // Dosarul: înainte de „Trimite la semnat", „Am trimis-o" și „E semnat" — pași care lucrează pe contractul SALVAT —
  // salvează ce e scris în formular. Întoarce contractul proaspăt (pentru foaia pasului) sau null dacă salvarea n-a
  // mers; atunci foaia nu se deschide, iar mesajul serverului e deja pe ecran.
  salveazaIntai?: (c: any) => Promise<any | null>;
}) {
  const loc = useLocation();
  const [dlg, setDlg] = useState<Dlg>(null);
  // Foaia care se deschide DUPĂ ce s-a închis întrebarea (vezi efectul de sub pază).
  const [dupa, setDupa] = useState<Dlg>(null);
  const [busy, setBusy] = useState(false);
  const [urca, setUrca] = useState(''); // „<id contract>:<care>" cât urcă un fișier de pe un rând
  const inchideDlg = () => { if (!busy) setDlg(null); };
  // „Înapoi" pe Android închide întrebarea deschisă, nu ecranul. Foile „E semnat" și „Completează" se păzesc singure.
  useInapoiInchide(!!dlg && dlg.fel !== 'semnat' && dlg.fel !== 'completeaza', () => { if (busy) return false; setDlg(null); return true; });
  // Două foi păzite NU se schimbă în aceeași randare (lib/inapoiFoaie.ts). Foaia nouă, fiind copil, își pune intrarea
  // în istoric ÎNAINTEA curățeniei întrebării — care apoi nu-și mai recunoaște intrarea și o lasă acolo: după ce
  // închizi foaia, următorul „înapoi" nu mai face nimic. Deci întrebarea se închide întâi, iar foaia următoare
  // (`dupa`) se deschide de aici, abia în randarea URMĂTOARE — și doar când nu mai e nicio întrebare deschisă. Până
  // atunci paza întrebării și-a scos intrarea (curățenia rulează înaintea efectelor), iar foaia nouă își pune
  // intrarea abia după întoarcerea din istoric.
  useEffect(() => {
    if (!dupa || dlg) return;
    setDlg(dupa);
    setDupa(null);
  }, [dupa, dlg]);

  // Un pas pe drumul contractului. Regula trecerilor e pe server; refuzul lui apare ca atare.
  async function put(c: any, corp: any, ok: string) {
    if (busy) return;
    setBusy(true);
    try {
      await Api.updateContract(Number(c.id), corp);
      setDlg(null);
      showToast(ok);
      o.laSchimbat();
    } catch (e: any) { setDlg(null); showToast(e?.message || 'Eroare', true); }
    finally { setBusy(false); }
  }
  async function trimite(c: any, catre?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const j = await Api.trimiteContract(Number(c.id), String(catre || '').trim());
      setDlg(null);
      showToast('Trimis la ' + ((j && j.trimis_la) || '') + ' ✓');
      o.laSchimbat();
    } catch (e: any) {
      showToast(e?.message || 'Eroare', true);
      setDlg(null);
      // Goluri pe hârtie (CUI, sediu, reprezentant): serverul refuză cu 400 — se deschide direct „Completează",
      // nu doar un mesaj (ca pe web). Ce lipsește spune dosarul serverului. Foaia se deschide DUPĂ ce s-a închis
      // întrebarea (`dupa`), nu în locul ei.
      if (e?.status === 400 && lipsuriFirma(c).length) setDupa({ fel: 'completeaza', c });
      // Fără email pe server (503): lista spune din nou `trimite_pe_email`, iar butonul devine „Am trimis-o".
      else if (e?.status === 503) o.laSchimbat();
    } finally { setBusy(false); }
  }
  // Foaia unui pas care lucrează pe contractul SALVAT: „Trimite la semnat" (PDF-ul pleacă din ce e în bază), „Am
  // trimis-o" și „E semnat" (după semnare nu se mai schimbă nimic). În dosar (`salveazaIntai`), ce e scris în
  // formular se salvează întâi, iar foaia primește contractul proaspăt. În listă și în fișa firmei nu e formular.
  async function deschide(fel: 'amtrimis' | 'trimite' | 'semnat', c: any) {
    if (busy) return;
    if (!o.salveazaIntai) { setDlg({ fel, c }); return; }
    setBusy(true);
    let r: any = null;
    try { r = await o.salveazaIntai(c); } catch { r = null; } finally { setBusy(false); }
    if (r) setDlg({ fel, c: r });
  }
  function puneData(c: any, v?: string) {
    const ms = ziLaPranz(String(v || ''));
    if (ms == null) { showToast('Alege ziua în care s-a semnat.', true); return; }
    put(c, { signed_at: ms }, 'Data semnării pusă ✓');
  }
  async function incarca(c: any, care: 'contract' | 'gdpr', f: FisierAles) {
    if (urca) return;
    setUrca(c.id + ':' + care);
    try {
      await Api.uploadContractFile(Number(c.id), { care, name: f.name, b64: f.b64 });
      showToast((care === 'gdpr' ? 'Acordul GDPR' : 'Contractul semnat') + ' e în dosar ✓');
      o.laSchimbat();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setUrca(''); }
  }

  const buton = (ic: IconName, text: string, on: () => void, pri = true) => (
    <button class={'ctr-btn' + (pri ? ' pri' : '')} disabled={busy} onClick={on}><Icon name={ic} size={15} /> {text}</button>
  );
  const trimiteSauAmTrimis = (c: any) => (o.trimitePeEmail
    ? buton('mail', 'Trimite la semnat', () => deschide('trimite', c))
    : <>{buton('mail', 'Am trimis-o', () => deschide('amtrimis', c))}<span class="ctr-small ctr-rand">{FARA_EMAIL}</span></>);

  // Butonul pasului „acum" din drumul clientului (_drumButon). Aparatele se adoptă DOAR în „Dispozitive" →
  // Neasignate (decizie 17.09): butonul te duce acolo, nu adoptă nimic de aici.
  function butonDrum(cheie: string, c: any) {
    if (!c || !c.id) return null;
    if (cheie === 'trimis') {
      if (c.status === 'ciorna') return buton('check', 'Aprobă contractul', () => (o.aproba ? o.aproba(c) : setDlg({ fel: 'aproba', c })));
      if (c.status === 'aprobat') return trimiteSauAmTrimis(c);
    }
    if (cheie === 'semnat' && c.status === 'trimis') return buton('fileSignature', 'E semnat', () => deschide('semnat', c));
    if (cheie === 'montaj') return buton('wrench', 'Programează montajul', () => (o.montajNou ? o.montajNou(c) : loc.route(rutaMontajNou(c.company_id))));
    if (cheie === 'aparate') return buton('cpu', 'Adoptă aparatele', () => loc.route(RUTA_NEASIGNATE));
    if (cheie === 'factura') return buton('report', 'Emite prima factură', () => loc.route(rutaPrimaFactura(c.company_id)));
    return null;
  }

  // Pasul următor, sub starea din listă (_ctrePasHtml). După semnare, pasul drumului (montaj, aparate, factura).
  function pas(c: any) {
    let info: any = null, butoane: any = null;
    if (['ciorna', 'aprobat', 'trimis'].indexOf(c.status) < 0) {
      const dr = c.drum;
      if (!dr || !dr.urmatorul) return null;
      const p = (dr.pasi || []).filter((x: any) => x.cheie === dr.urmatorul)[0] || {};
      info = 'urmează: ' + String(p.eticheta || '').toLowerCase() + ' · ' + dr.gata + '/' + dr.din + ' pași';
      butoane = butonDrum(dr.urmatorul, c);
    } else if (c.status === 'ciorna') {
      butoane = buton('check', 'Aprobă', () => setDlg({ fel: 'aproba', c }));
    } else if (c.status === 'aprobat') {
      butoane = trimiteSauAmTrimis(c);
    } else {
      info = c.sent_at ? 'trimis pe ' + zile(c.sent_at) + (c.sent_to ? ' la ' + c.sent_to : '') : null;
      butoane = (
        <>
          {buton('fileSignature', 'E semnat', () => deschide('semnat', c))}
          {o.trimitePeEmail ? buton('refresh', 'Retrimite', () => deschide('trimite', c), false) : null}
        </>
      );
    }
    return (
      <div class="ctr-pas">
        {info && <span class="ctr-small">{info}</span>}
        {butoane && <div class="ctr-btns">{butoane}</div>}
      </div>
    );
  }

  // Fiecare lipsă a dosarului, cu butonul ei (_ctreLipsuriHtml). CE lipsește spune doar serverul.
  function lipsuri(c: any) {
    const l: string[] = (c.dosar && c.dosar.lipsuri) || [];
    const firma = lipsuriFirma(c);
    const out: any[] = [];
    if (firma.length) {
      out.push(
        <div class="ctr-lipsa">
          <span>lipsește {firma.map((k) => LIPSA_ET[k] || k).join(', ')}</span>
          {buton('edit', 'Completează', () => setDlg({ fel: 'completeaza', c }), false)}
        </div>,
      );
    }
    if (l.indexOf('semnatura') >= 0) {
      out.push(<div class="ctr-lipsa"><span>lipsește data semnării</span>{buton('calendar', 'Pune data', () => setDlg({ fel: 'data', c }), false)}</div>);
    }
    if (l.indexOf('actul') >= 0) {
      out.push(
        <div class="ctr-lipsa">
          <span>lipsește contractul semnat (PDF)</span>
          <AlegeFisier busy={urca === c.id + ':contract'} etFisier="Încarcă semnat" onFile={(f) => incarca(c, 'contract', f)} />
        </div>,
      );
    }
    if (l.indexOf('gdpr') >= 0) {
      out.push(
        <div class="ctr-lipsa">
          <span>lipsește acordul GDPR semnat</span>
          <AlegeFisier busy={urca === c.id + ':gdpr'} etFisier="Încarcă acordul" onFile={(f) => incarca(c, 'gdpr', f)} />
        </div>,
      );
    }
    return out.length ? <>{out}</> : null;
  }

  const ui = !dlg ? null : (
    <>
      {dlg.fel === 'aproba' && (
        <Confirma title="Aprobă contractul" busy={busy} okLabel="Aprobă"
          text={'Aprobi contractul ' + (dlg.c.number || '') + '?\n\nDin clipa asta hârtia nu mai e ciornă: se poate trimite la semnat.'}
          onOk={() => put(dlg.c, { status: 'aprobat' }, 'Contract aprobat ✓ — urmează „Trimite la semnat"')} onCancel={inchideDlg} />
      )}
      {dlg.fel === 'amtrimis' && (
        <Confirma title="Am trimis-o" busy={busy} okLabel="Da, l-am trimis"
          text={'L-ai trimis tu clientului (email, WhatsApp)?\n\nContractul trece pe „trimis la client". Când vine semnat, apeși „E semnat" și îl încarci.'}
          onOk={() => put(dlg.c, { status: 'trimis' }, 'Marcat „trimis la client" ✓')} onCancel={inchideDlg} />
      )}
      {dlg.fel === 'trimite' && (
        <Confirma title="Trimite la semnat" busy={busy} okLabel="Trimite"
          text={'Contractul ' + (dlg.c.number || '') + ' pleacă pe email, cu PDF-ul atașat, ca să-l semneze. Răspunsul lor — contractul semnat — vine la adresa noastră.\n\nCând îl primești, apeși „E semnat" și îl încarci.'}
          field={{ label: 'Adresa clientului', type: 'email', value: dlg.c.contact_email || '', placeholder: 'contact@firma.ro' }}
          onOk={(v) => trimite(dlg.c, v)} onCancel={inchideDlg} />
      )}
      {dlg.fel === 'data' && (
        <Confirma title="Data semnării" busy={busy} okLabel="Salvează" text="Ce zi a fost semnat contractul?"
          field={{ label: 'Data semnării', type: 'date', value: azi() }}
          onOk={(v) => puneData(dlg.c, v)} onCancel={inchideDlg} />
      )}
      {dlg.fel === 'semnat' && <SemnatFoaie c={dlg.c} onInchide={() => setDlg(null)} onGata={() => { setDlg(null); o.laSchimbat(); }} />}
      {dlg.fel === 'completeaza' && <CompleteazaFirma c={dlg.c} onInchide={() => setDlg(null)} onSalvat={() => { setDlg(null); o.laSchimbat(); }} />}
    </>
  );

  return { pas, lipsuri, butonDrum, ui, completeaza: (c: any) => setDlg({ fel: 'completeaza', c }) };
}

// ── „E semnat" (raxCtreSemnat): ziua semnării + fișierul semnat primit de la client. Întâi urcă fișierul,
// apoi contractul trece în vigoare. Semnat nu se mai întoarce — de aceea întreabă întâi. Data se scrie la
// prânz, ca pe web. Ziua propusă e cea deja scrisă în contract (câmpul „Data semnării" din dosar), și abia fără
// ea ziua de azi — ca butonul „Contractul e semnat de amândoi" din dosar. Altfel foaia rescria data salvată cu azi.
function SemnatFoaie({ c, onInchide, onGata }: { c: any; onInchide: () => void; onGata: () => void }) {
  const [ziS, setZi] = useState(() => inputZi(c.signed_at) || azi());
  const [busy, setBusy] = useState(false);
  function inchide(): boolean { if (busy) return false; onInchide(); return true; }
  useInapoiInchide(true, inchide);

  async function peFisier(f: FisierAles) {
    if (busy) return;
    setBusy(true);
    try {
      await Api.uploadContractFile(Number(c.id), { care: 'contract', name: f.name, b64: f.b64 });
    } catch (e: any) { setBusy(false); showToast(e?.message || 'Eroare', true); return; }
    try {
      await Api.updateContract(Number(c.id), { status: 'activ', signed_at: ziLaPranz(ziS) || Date.now() });
      showToast('Contract semnat și în dosar ✓');
    } catch (e: any) {
      showToast(e?.message || 'Eroare', true); // fișierul a urcat: ecranul se reîncarcă oricum
    }
    setBusy(false);
    onGata();
  }

  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) inchide(); }}>
      <div class="sheet">
        <div class="sheet-h">
          <b><Icon name="fileSignature" size={18} color="var(--ctr-ok)" /> Contractul e semnat?</b>
          <button class="h-btn" onClick={() => inchide()} aria-label="Închide"><Icon name="x" /></button>
        </div>
        <div class="sheet-body">
          <div class="frm">
            <div style="font-size:14.5px;line-height:1.5;white-space:pre-line">
              {'Contractul ' + (c.number || '') + ' e semnat de amândoi?\n\nAlegi fișierul semnat primit de la client. Din clipa asta contractul nu se mai modifică: orice schimbare se face prin act adițional.'}
            </div>
            <div class="fld"><label>Data semnării</label>
              <input type="date" value={ziS} disabled={busy} onInput={(e: any) => setZi(e.target.value)} />
            </div>
            <div class="ctr-btns" style="margin-top:0">
              <AlegeFisier busy={busy} etFisier="Alege fișierul semnat" onFile={peFisier} />
            </div>
            <div class="frm-actions">
              <button class="btn fl-btn2" disabled={busy} onClick={() => inchide()}>Renunță</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── „Completează" (raxCtreCompleteaza): datele firmei pentru contract, cu „Preia de la ANAF" ──
// Pleacă DOAR ce s-a schimbat față de ce era (PUT /api/companies/:id/dosar scrie doar cheile primite): o casetă
// lăsată cum era nu atinge nimic, iar telefonul, IBAN-ul și restul firmei nu se ating deloc.
type Dz = { cui: string; name: string; reg_com: string; address: string; rep: string; reprole: string; email: string };
function dzDin(c: any): Dz {
  const rep = c.legal_rep || c.client_rep || {};
  const s = (v: any) => (v == null ? '' : String(v));
  return { cui: s(c.cui), name: s(c.company_name), reg_com: s(c.reg_com), address: s(c.address), rep: s(rep.name), reprole: s(rep.role), email: s(c.contact_email) };
}
function CompleteazaFirma({ c, onInchide, onSalvat }: { c: any; onInchide: () => void; onSalvat: () => void }) {
  const [start] = useState<Dz>(() => dzDin(c));
  const [f, setF] = useState<Dz>(() => dzDin(c));
  // fel: 'rau' (roșu) · 'ok' (verde, cu bifă) · '' (gri, „Caut la ANAF…"); `avert` = firma radiată / inactivă.
  const [msg, setMsg] = useState<{ t: string; fel: '' | 'ok' | 'rau'; avert?: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [anafBusy, setAnafBusy] = useState(false);
  const sf = (k: keyof Dz, v: string) => setF((x) => ({ ...x, [k]: v }));
  const schimbat = JSON.stringify(f) !== JSON.stringify(start);
  function inchide(): boolean {
    if (busy) return false;
    if (schimbat && !confirm('Închizi fără să salvezi?\n\nCe ai scris la datele firmei se pierde.')) return false;
    onInchide();
    return true;
  }
  useInapoiInchide(true, inchide);

  // ANAF pune doar ce întoarce (numele, Reg. Com., sediul, CUI-ul); o valoare lipsă nu șterge ce e scris.
  async function anaf() {
    const cui = f.cui.trim();
    if (!cui) { setMsg({ t: 'Scrie întâi CUI-ul.', fel: 'rau' }); return; }
    setAnafBusy(true); setMsg({ t: 'Caut la ANAF…', fel: '' });
    try {
      const a: any = await Api.anafFirma(cui);
      setF((x) => ({ ...x, name: a.name || x.name, reg_com: a.reg_com || x.reg_com, address: a.address || x.address, cui: a.cui || x.cui }));
      setMsg({ t: 'Preluat de la ANAF', fel: 'ok',
        avert: a.radiata ? 'firma apare RADIATĂ la ANAF' : a.inactiva ? 'firma e declarată INACTIVĂ' : undefined });
    } catch (e: any) {
      const retea = !e || e.status === 0 || e.status === 408;
      setMsg({ t: retea ? 'Nu am putut ajunge la ANAF.' : (e.message || 'Nu am găsit firma la ANAF.'), fel: 'rau' });
    } finally { setAnafBusy(false); }
  }

  async function salveaza() {
    if (busy) return;
    const t = (s: string) => s.trim();
    const corp: any = {};
    if (t(f.cui) !== t(start.cui)) corp.cui = t(f.cui);
    if (t(f.name) !== t(start.name)) corp.name = t(f.name);
    if (t(f.reg_com) !== t(start.reg_com)) corp.reg_com = t(f.reg_com);
    if (t(f.address) !== t(start.address)) corp.address = t(f.address);
    if (t(f.email) !== t(start.email)) corp.contact_email = t(f.email);
    if (t(f.rep) !== t(start.rep) || t(f.reprole) !== t(start.reprole)) corp.legal_rep = t(f.rep) ? { name: t(f.rep), role: t(f.reprole) } : null;
    if (!Object.keys(corp).length) { setMsg({ t: 'N-ai schimbat nimic: scrie ce lipsește, apoi „Salvează".', fel: '' }); return; }
    setBusy(true); setMsg(null);
    try {
      await Api.completeazaDosar(Number(c.company_id), corp);
      showToast('Datele firmei sunt în dosar ✓');
      onSalvat();
    } catch (e: any) { setMsg({ t: e?.message || 'Eroare', fel: 'rau' }); } // ex. denumirea golită, emailul stricat — vorbele serverului
    finally { setBusy(false); }
  }

  const camp = (k: keyof Dz, label: string, ph: string, type = 'text') => (
    <div class="fld"><label>{label}</label>
      <input type={type} value={f[k]} placeholder={ph} autocapitalize={type === 'email' ? 'none' : undefined}
        onInput={(e: any) => sf(k, e.target.value)} /></div>
  );
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) inchide(); }}>
      <div class="sheet">
        <div class="sheet-h">
          <b><Icon name="edit" size={18} color="var(--ctr-ok)" /> Datele firmei pentru contract</b>
          <button class="h-btn" onClick={() => inchide()} aria-label="Închide"><Icon name="x" /></button>
        </div>
        <div class="sheet-body">
          <div class="frm">
            <div class="fld"><label>CUI / CIF</label>
              <div style="display:flex;gap:8px">
                <input style="flex:1;min-width:0" value={f.cui} placeholder="RO12345678" onInput={(e: any) => sf('cui', e.target.value)} />
                <button class="ctr-btn" disabled={anafBusy || busy} onClick={anaf}><Icon name="download" size={15} /> ANAF</button>
              </div>
            </div>
            {camp('name', 'Denumire', 'Transport Alfa SRL')}
            {camp('reg_com', 'Nr. Reg. Com.', 'J40/1234/2020')}
            {camp('address', 'Sediu', 'Str. …, oraș, județ')}
            {camp('rep', 'Reprezentant legal', 'nume și prenume')}
            {camp('reprole', 'Funcția', 'Administrator')}
            {camp('email', 'Email (aici pleacă contractul)', 'contact@firma.ro', 'email')}
            {msg && (
              <div>
                <div class={msg.fel === 'ok' ? 'ctr-msg ok' : msg.fel === 'rau' ? 'ctr-msg' : 'ctr-hint'}>
                  {msg.fel === 'ok' ? <Icon name="check" size={14} /> : null} {msg.t}
                </div>
                {msg.avert && <div class="ctr-msg" style="font-weight:700;margin-top:4px">⚠ {msg.avert}</div>}
              </div>
            )}
            <div class="frm-actions">
              <button class="btn fl-btn2" disabled={busy} onClick={() => inchide()}>Renunț</button>
              <button class="btn btn-primary" disabled={busy} onClick={salveaza}><Icon name="check" size={16} /> {busy ? 'Se salvează…' : 'Salvează'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
