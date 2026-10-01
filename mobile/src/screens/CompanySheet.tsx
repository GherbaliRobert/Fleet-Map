import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon, type IconName } from '../components/Icon';
import { Confirma } from '../components/FlotaUi';
import { LinkParolaSheet, pregatesteLinkul, type LinkParola } from '../components/LinkParolaSheet';
import { CompanyEditSheet, CompanyConfigSheet } from '../components/CompanyEdit';
// Comparația contract ↔ factură: o singură bucată, a ecranelor Contracte (aceeași și în dosarul firmei).
import { Comparatie } from '../components/ContractAnexa';
// Drumul clientului și butoanele lui: aceleași bucăți ca în dosar și în lista Contracte.
import { DrumClient } from '../components/ContractDrum';
import { lipsuriFirma, randDinFisa, usePasiContract } from '../components/ContractPasi';
import { CompanyAbonament } from './CompanyAbonament';
import { CTR_STARI, CTR_EXPLIC, DOSAR_FEL, dupaIncetare, zile } from '../lib/contracte';
// Documentele firmei: adresa ferestrei de emis, starea și luna — aceleași ca în Facturare (lib/factura.ts).
// Întrebarea de dinainte de ✓ și metoda încasării stau tot acolo, scrise o singură dată pe telefon.
import { lunaText, metodaText, rutaFactura, stareClient, trimisaText, INTREB_PROFORMA, INTREB_FACTURA, OK_PROFORMA, OK_FACTURA } from '../lib/factura';
// „Vezi": hârtia documentului — ACEEAȘI ca în Facturare (nu o a doua, desenată aici).
import { DocumentFactura } from '../components/DocumentFactura';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import {
  accesDetalii, contacte, dataOraRo, dataRo, dosarPastila, EMAIL_OK, nrUseri, nrVeh, ROL_ET, rutaDosar, rutaFisa,
} from '../lib/companii';
import './admin.css';
import './detail.css';
import './firma.css';
import './companii.css';

// Fișa unei firme (fondatori), ca fereastra de pe web (raxOpenCompanyDetail), pe file:
// Detalii · Utilizatori · Vehicule · Facturi · Abonament & plăți · Contract.
// Totul vine dintr-un singur apel (/api/companies/:id/overview). Rutele sunt requireSuperadmin pe server;
// ecranul e învelit în doarSuper (App.tsx). Adresa: /admin/companies/:id?tab=<fila>.

const FILE: { k: string; et: string; ic: IconName }[] = [
  { k: 'detalii', et: 'Detalii', ic: 'idCard' },
  { k: 'utilizatori', et: 'Utilizatori', ic: 'user' },
  { k: 'vehicule', et: 'Vehicule', ic: 'car' },
  { k: 'facturi', et: 'Facturi', ic: 'report' },
  { k: 'abonament', et: 'Abonament & plăți', ic: 'coins' },
  { k: 'contract', et: 'Contract', ic: 'fileSignature' },
];
const esteFirma = (o: any, id: any) => !!(o && o.company && id != null && Number(o.company.id) === Number(id));
const lei2 = (v: any) => (Number(v) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' lei';

export function CompanySheet() {
  const loc = useLocation();
  const { params } = useRoute();
  const id = Number(params.id);
  const filaCeruta = String(((loc.query || {}) as any).tab || 'detalii');
  const [fila, setFila] = useState(FILE.some((f) => f.k === filaCeruta) ? filaCeruta : 'detalii');
  const [ov, setOv] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [foaie, setFoaie] = useState<'' | 'edit' | 'config' | 'sterge'>('');
  const [stergBusy, setStergBusy] = useState(false);
  // Firma deschisă ACUM. Fișa unei firme mari se încarcă greu: un răspuns întârziat al altei firme
  // (sau venit după ce ai plecat de pe ecran) NU are voie să ajungă aici — i-ar pune CUI-ul, IBAN-ul și
  // prețul altei firme, iar o salvare le-ar și scrie în bază.
  const cur = useRef<number | null>(null);

  function incarca() {
    cur.current = id;
    setErr('');
    Api.companyOverview(id).then((o: any) => {
      if (cur.current !== id || !esteFirma(o, id)) return;
      setOv(o);
    }).catch((e: any) => { if (cur.current === id) setErr(e?.status === 404 ? 'Compania nu există.' : (e?.message || 'Fișa firmei nu s-a încărcat.')); });
  }
  useEffect(() => { setOv(null); incarca(); return () => { cur.current = null; }; }, [id]);
  useEffect(() => { if (FILE.some((f) => f.k === filaCeruta)) setFila(filaCeruta); }, [filaCeruta]);
  // Fila aleasă intră în ADRESĂ (înlocuiește intrarea, nu adaugă una): butoanele care pleacă din fișă — pașii din
  // drumul clientului, „Deschide Stoc echipamente" — te aduc, la „înapoi", pe fila de pe care ai plecat, nu pe Detalii.
  const alegeFila = (k: string) => { setFila(k); if (k !== filaCeruta) loc.route(rutaFisa(id, k), true); };
  // „Deschide fila Facturi" din „Abonament & plăți" (web: raxCodTab('facturi')). Butonul stă jos pe o pagină
  // lungă: fila nouă se arată de sus, nu de la mijloc.
  const cont = useRef<HTMLDivElement>(null);
  const deschideFacturi = () => { alegeFila('facturi'); if (cont.current) cont.current.scrollTop = 0; };

  const o = esteFirma(ov, id) ? ov : null;
  const co = (o && o.company) || {};
  const counts = (o && o.counts) || {};
  const dos = o ? dosarPastila(o.dosar) : null;
  const q = (o && o.ai_quota) || {};
  const areFond = Number(q.questionsPerSeat) > 0 || Number(q.questions) > 0;

  async function sterge(val?: string) {
    const nume = String(co.name || '');
    if (String(val || '').trim() !== nume) { showToast('Numele nu coincide — anulat', true); setFoaie(''); return; }
    setStergBusy(true);
    try { await Api.deleteCompany(id); showToast('Companie ștearsă: ' + nume); loc.route('/admin/companies', true); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); setFoaie(''); }
    finally { setStergBusy(false); }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">{co.name || 'Companie'}</div>
        <button class="h-btn" onClick={incarca} aria-label="Reîncarcă"><Icon name="refresh" size={20} /></button>
      </header>
      <div class="content co-page" ref={cont}>
        {err && (
          <div class="fm-empty" style="color:var(--red)">{err}
            <div style="margin-top:12px"><button class="fm-btn" onClick={incarca}>Reîncearcă</button></div>
          </div>
        )}
        {!o && !err && <div class="fm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {o && (
          <>
            <div class="co-head">
              <div class="t">{co.name}</div>
              <div class="s">{nrVeh(counts.vehicles) + ' · ' + nrUseri(counts.users)}</div>
              <div class="co-tags">
                {co.is_demo ? <span class="co-tag demo">DEMO</span> : null}
                {co.active === false ? <span class="co-tag">inactiv</span> : null}
                {dos && <button class={'co-pill ' + dos.fel} title={dos.titlu} onClick={() => alegeFila('contract')}><Icon name="fileSignature" size={12} />{dos.et}</button>}
              </div>
            </div>
            <div class="co-tabs" role="tablist">
              {FILE.map((f) => (
                <button role="tab" aria-selected={fila === f.k} class={fila === f.k ? 'on' : ''} onClick={() => alegeFila(f.k)}>
                  <Icon name={f.ic} size={15} />{f.et}
                </button>
              ))}
            </div>

            {fila === 'detalii' && <Detalii o={o} onEdit={() => setFoaie('edit')} onConfig={() => setFoaie('config')} onSterge={() => setFoaie('sterge')} />}
            {fila === 'utilizatori' && <Utilizatori o={o} onReload={incarca} />}
            {fila === 'vehicule' && <Vehicule o={o} />}
            {fila === 'facturi' && <Facturi o={o} onReload={incarca} />}
            {fila === 'abonament' && <CompanyAbonament ov={o} onReload={incarca} onFacturi={deschideFacturi} />}
            {fila === 'contract' && <Contract o={o} onDosar={() => loc.route(rutaDosar(id))} onReload={incarca} />}
          </>
        )}
      </div>

      {o && foaie === 'edit' && <CompanyEditSheet company={co} onClose={() => setFoaie('')} onSaved={() => { setFoaie(''); incarca(); }} />}
      {o && foaie === 'config' && (
        <CompanyConfigSheet companyId={id} areFond={areFond} onClose={() => setFoaie('')} onChanged={incarca}
          onOferta={() => { setFoaie(''); alegeFila('abonament'); }} />
      )}
      {o && foaie === 'sterge' && (
        <Confirma title={'Șterge compania „' + (co.name || '') + '"?'} danger busy={stergBusy} okLabel="Șterge definitiv"
          text={'Acțiunea este IREVERSIBILĂ.\nVa șterge și consumul de tokeni AI asociat.'}
          field={{ label: 'Pentru confirmare, scrie numele companiei exact: „' + (co.name || '') + '"', placeholder: co.name || '' }}
          onOk={sterge} onCancel={() => setFoaie('')} />
      )}
    </div>
  );
}

// ─── Detalii (_raxCodDetalii) ─────────────────────────────────────────────────────────────────
function Kv({ k, v, style }: { k: string; v: any; style?: string }) {
  const gol = v == null || v === '';
  return <div class="co-kv"><span class="k">{k}</span><span class={'v' + (gol ? ' gol' : '')} style={style || ''}>{gol ? '—' : v}</span></div>;
}
function Detalii({ o, onEdit, onConfig, onSterge }: { o: any; onEdit: () => void; onConfig: () => void; onSterge: () => void }) {
  const c = o.company || {};
  const acc = accesDetalii(o.access);
  const pers = contacte(c.contacts);
  const nV = (o.vehicles || []).length;
  // Ștergerea: doar o firmă goală (fără vehicule și fără oameni) și niciodată compania demo — ca pe web.
  const poateSterge = !c.is_demo && !(Number(o.counts && o.counts.vehicles) > 0) && !(Number(o.counts && o.counts.users) > 0);
  return (
    <>
      <div class="fm-card">
        <h3>Identificare</h3>
        <Kv k="Nume" v={c.name} /><Kv k="CUI / CIF" v={c.cui} /><Kv k="Nr. Reg. Com." v={c.reg_com} /><Kv k="Adresă" v={c.address} />
        <Kv k="Acces" v={acc.et} style={'color:' + acc.culoare + ';font-weight:800'} />
      </div>
      <div class="fm-card">
        <h3>Bancă &amp; contact</h3>
        <Kv k="IBAN" v={c.iban} /><Kv k="Bancă" v={c.bank_name} /><Kv k="Email" v={c.contact_email} /><Kv k="Telefon" v={c.phone} />
        <Kv k="Vehicule" v={nrVeh(nV)} />
      </div>
      <div class="fm-card">
        <h3>Persoane de contact</h3>
        {pers.length === 0 && (
          <div class="fm-empty" style="padding:14px 6px"><b style="margin-top:0">Nicio persoană de contact</b>
            Pe cine suni când e ceva de rezolvat? Se adaugă din „Editează datele companiei".</div>
        )}
        {pers.map((p) => (
          <div class="co-row">
            <div class="a"><b>{p.name || '—'}</b>{p.role ? <span class="co-pill">{p.role}</span> : null}</div>
            <div class="s">{[p.phone, p.email].filter(Boolean).join(' · ') || '—'}</div>
            {(p.phone || p.email) && (
              <div class="fm-btns" style="margin-top:8px">
                {p.phone ? <a class="fm-btn" href={'tel:' + p.phone.replace(/\s+/g, '')}><Icon name="phone" size={15} /> Sună</a> : null}
                {p.email ? <a class="fm-btn" href={'mailto:' + p.email}><Icon name="mail" size={15} /> Email</a> : null}
              </div>
            )}
          </div>
        ))}
      </div>
      <div class="fm-btns" style="margin-bottom:14px">
        <button class="fm-btn acc" style="flex:1" onClick={onEdit}><Icon name="edit" size={15} /> Editează datele companiei</button>
        <button class="fm-btn" style="flex:1" onClick={onConfig}><Icon name="settings" size={15} /> Module &amp; limite</button>
      </div>
      {poateSterge && (
        <>
          <div class="fm-sec" style="color:var(--red)">Periculos</div>
          <button class="fm-btn rau" style="width:100%" onClick={onSterge}><Icon name="trash" size={15} /> Șterge compania</button>
          <div class="co-note">Se poate șterge doar o firmă goală: fără vehicule și fără utilizatori.</div>
        </>
      )}
    </>
  );
}

// ─── Utilizatori (_raxCodAdminiHtml + _raxCodUsers) ───────────────────────────────────────────
// Din 16.09 firma își face singură administratorii. Formularul apare NUMAI când firma n-are niciun
// administrator activ — atunci nu e nimeni înăuntru care să poată face pe cineva.
function Utilizatori({ o, onReload }: { o: any; onReload: () => void }) {
  const c = o.company || {};
  const users: any[] = o.users || [];
  const activi = users.filter((u) => (u.role === 'company_admin' || u.role === 'admin') && u.active !== false);
  const [email, setEmail] = useState('');
  const [nume, setNume] = useState('');
  const [intreb, setIntreb] = useState(false);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<LinkParola | null>(null);

  function cere() {
    const e = email.trim().toLowerCase();
    if (!e) { showToast('Scrie adresa de email a administratorului.', true); return; }
    if (!EMAIL_OK.test(e)) { showToast('Adresa trebuie să fie un email valid (ex. ion.popescu@firma.ro).', true); return; }
    setIntreb(true);
  }
  async function adauga() {
    const e = email.trim().toLowerCase(), n = nume.trim();
    setBusy(true);
    try {
      const j: any = await Api.addCompanyAdmin(Number(c.id), n ? { username: e, full_name: n } : { username: e });
      setIntreb(false);
      if (j && j.invited) showToast('Administrator adăugat. I-am trimis linkul pe ' + e + '.');
      else if (j && j.link) setLink(await pregatesteLinkul({ email: e, link: j.link, motiv: 'Emailul de invitație NU a plecat' }));
      else showToast((j && j.warning) || 'Cont creat, dar linkul nu a plecat.', true);
      setEmail(''); setNume('');
      onReload();
    } catch (err: any) { setIntreb(false); showToast(err?.message || 'Eroare', true); }
    finally { setBusy(false); }
  }

  return (
    <>
      <div class="fm-card pad">
        <h3 style="margin-top:0"><Icon name="shield" size={14} /> Administratorii firmei
          <span class="co-pill" style="margin-left:auto">{activi.length ? activi.length + (activi.length === 1 ? ' activ' : ' activi') : 'niciunul'}</span></h3>
        {activi.length > 0 ? (
          <>
            <div class="co-tags" style="margin-top:4px">{activi.map((u) => <span class="co-pill ok">{u.full_name || u.username}</span>)}</div>
            <div class="co-note">Firma își face singură administratorii, din contul ei. Noi intervenim doar dacă rămâne fără niciunul.</div>
          </>
        ) : (
          <>
            <div class="co-box warn" style="margin:6px 0 10px">Firma n-are niciun administrator activ — nimeni de acolo nu poate adăuga colegi, atribui mașini sau boteza roluri. Toate mărunțișurile ajung la noi. Dă-i unul și se descurcă singură mai departe.</div>
            <div class="frm">
              <div class="fld"><label>Email (așa se autentifică) <span class="req">*</span></label>
                <input type="email" autocapitalize="none" autocomplete="off" spellcheck={false} value={email} placeholder="ion.popescu@firma.ro"
                  onInput={(e: any) => setEmail(e.target.value)} /></div>
              <div class="fld"><label>Nume afișat</label>
                <input value={nume} placeholder="ex. Ion Popescu" onInput={(e: any) => setNume(e.target.value)} /></div>
              <button class="btn btn-primary" disabled={busy} onClick={cere}><Icon name="plus" size={16} color="#06210F" /> Adaugă administrator</button>
              <div class="co-note" style="margin:0">Primește un link pe email și își pune singur parola. Noi nu scriem parole.</div>
            </div>
          </>
        )}
      </div>

      <div class="fm-card">
        <h3>Conturile firmei</h3>
        {users.length === 0 && (
          <div class="fm-empty" style="padding:14px 6px"><b style="margin-top:0">Niciun cont în firma asta</b>
            Conturile le face administratorul firmei, din ecranul lui de Utilizatori.</div>
        )}
        {users.map((u) => (
          <div class="co-row">
            <div class="a"><b>{u.username}</b><span class="co-pill">{ROL_ET[u.role] || u.role}</span></div>
            {u.full_name ? <div class="s">{u.full_name}</div> : null}
            <div class="s">{[u.email, u.phone].filter(Boolean).join(' · ') || '—'}
              {' · '}<span style={'font-weight:700;color:' + (u.active === false ? 'var(--red)' : 'var(--co-ok)')}>{u.active === false ? 'inactiv' : 'activ'}</span></div>
          </div>
        ))}
      </div>

      {intreb && (
        <Confirma title="Îi dai drept de administrator?" busy={busy} okLabel="Adaugă administrator"
          text={'„' + email.trim().toLowerCase() + '" va putea adăuga colegi, atribui mașini și boteza roluri în firma asta. Nu va vedea alte firme.'}
          onOk={adauga} onCancel={() => setIntreb(false)} />
      )}
      {link && <LinkParolaSheet data={link} onClose={() => setLink(null)} />}
    </>
  );
}

// ─── Vehicule (_raxCodVehicule) — doar de citit ───────────────────────────────────────────────
function Vehicule({ o }: { o: any }) {
  const cc = o.counts || {};
  const v: any[] = o.vehicles || [];
  const badge = (t: string) => t === 'fms' ? <span class="co-can fms">FMS</span> : t === 'can' ? <span class="co-can can">CAN</span> : <span class="co-can none">fără CAN</span>;
  return (
    <>
      <div class="co-tags" style="margin:0 0 12px">
        <span class="co-can fms">{(cc.fms || 0) + ' FMS'}</span><span class="co-can can">{(cc.can || 0) + ' CAN'}</span><span class="co-can none">{(cc.none || 0) + ' fără CAN'}</span>
      </div>
      {v.length === 0 ? (
        <div class="fm-empty"><Icon name="car" size={32} color="var(--text-muted)" /><b>Niciun vehicul</b>
          Aparatele le înregistrăm noi, din „Dispozitive", și le dăm firmei de acolo.</div>
      ) : (
        <div class="fm-card">
          {v.map((x) => (
            <div class="co-row">
              <div class="a"><b>{x.name || x.imei}</b>{badge(x.can_type)}</div>
              <div class="s">{[x.plate || '—', x.vehicle_type || null].filter(Boolean).join(' · ')}</div>
              <div class="s">Ultima poziție: {x.last_position_time ? dataOraRo(x.last_position_time) : '—'}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// ─── Facturi (_raxCodFacturi): DOCUMENTELE firmei, cu starea și ✓, apoi încasările ─────────────────────
// Până pe 29.09 fila arăta doar plățile, iar plata „se trecea din Abonament & plăți", cu luni de acces — ceas
// scos pe 28.09. Acum, ca pe web: facturile și proformele firmei (fără ciorne: le scoate serverul, în /overview →
// `facturi`), fiecare cu ce e, data, totalul și starea; ✓ pe cele neplătite; dedesubt, încasările.
//   • Emiterea NU se face aici. Cele două butoane deschid „Generează factură" din Facturare, cu firma și felul
//     deja alese (web: raxOpenGenInvoice(id, 'unica' | 'abonament')) — o singură fereastră de emis, nu două.
//     Adresa o face rutaFactura (aceeași ca „Emite prima factură" din drumul clientului). La „înapoi" de acolo,
//     fișa se redeschide pe fila asta: fila e în adresă (alegeFila → rutaFisa).
//   • ✓ = PUT /api/invoices/:id/status {paid}, cu aceeași întrebare ca pe web (raxInvoiceMarkPaid). Pe o proformă
//     înseamnă „Încasată": serverul emite factura fiscală cu aceleași rânduri și o dă plătită.
//   • Starea e ACEEAȘI funcție ca în Facturare pe telefon (stareClient, lib/factura.ts ↔ _myInvStare, legate prin
//     proba lui); luna din „abonament <luna>" la fel (lunaText ↔ _giLunaText). Aici se scrie doar coloana „Ce e"
//     a fișei (mai scurtă decât cea din Facturare, ca pe web) — blocul dintre sentinele, pe care proba îl rulează
//     lângă _raxCodFacturi. Întrebarea de dinainte de ✓ vine din lib/factura.ts (aceeași ca în Facturare), iar
//     proba o pune lângă raxInvoiceMarkPaid din pagină.
//   • „Vezi" deschide hârtia comună (components/DocumentFactura.tsx), aceeași ca în Facturare.

// ── începe „documentele firmei" ──
// Coloana „Ce e" din fișă (web: _raxCodFacturi): proformă · abonament <luna> · unică · — (factură de dinainte de
// 28.09, fără fel scris).
function ceEDocumentul(f: any): string {
  if (f.type === 'proforma') return 'proformă';
  if (f.fel === 'abonament') return ('abonament ' + lunaText(f.luna)).trim();
  if (f.fel === 'unica') return 'unică';
  return '—';
}
// ── sfârșit „documentele firmei" ──

const bani2 = (v: any) => (Number(v) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei';
// Legătura proformă ↔ factura fiscală făcută din ea, dacă amândouă sunt în listă: același total de două ori nu e
// o dublură, iar omul vede din ce s-a născut fiecare.
function legatura(f: any, docs: any[]): string {
  const nr = (id: any) => { const d = id != null ? docs.find((x) => Number(x.id) === Number(id)) : null; return d && d.full_number ? d.full_number : ''; };
  if (f.type === 'proforma' && f.factura_id) { const n = nr(f.factura_id); return n ? 'a devenit factura ' + n : ''; }
  if (f.din_proforma) { const n = nr(f.din_proforma); return n ? 'din proforma ' + n : ''; }
  return '';
}

function Facturi({ o, onReload }: { o: any; onReload: () => void }) {
  const loc = useLocation();
  const c = o.company || {};
  const docs: any[] = o.facturi || [];
  const pl: any[] = o.payments || [];
  const [vezi, setVezi] = useState<any | null>(null);    // documentul deschis în „Vezi"
  const [intreb, setIntreb] = useState<any | null>(null); // documentul pe care s-a apăsat ✓
  const [busy, setBusy] = useState(false);
  // „Înapoi" pe Android închide întrebarea, nu fișa (foaia „Vezi" se păzește singură).
  useInapoiInchide(!!intreb, () => { if (busy) return false; setIntreb(null); return true; });
  const acum = Date.now();

  async function platita(f: any) {
    if (busy) return;
    const pf = f.type === 'proforma';
    setBusy(true);
    try {
      const j: any = await Api.invoiceSetStatus(Number(f.id), 'paid');
      // Ca pe web (raxInvoiceMarkPaid): la proformă, și numărul facturii fiscale născute acum (dacă nu vine, fără un loc
      // gol în text), plus ce a plecat singur odată cu ea — anunțul clientului, emailul cu PDF-ul, ANAF —, cu vorbele
      // serverului (`trimisa`), prin trimisaText din lib/factura.ts (legat de _invTrimisaText din pagină).
      const nr = (j && j.invoice && j.invoice.full_number) || '';
      const dinProforma = (nr ? 'Proformă încasată → factura ' + nr : 'Proformă încasată') + trimisaText(j && j.trimisa, false) + ' ✓';
      showToast(pf ? dinProforma : 'Factură plătită ✓');
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(false); setIntreb(null); }
    // Și după o eroare: poate a încasat-o altcineva între timp — lista arată ce e acum pe server.
    onReload();
  }

  return (
    <>
      {/* Compania demo nu se facturează: nu e în lista din Facturare, deci fereastra de emis nu s-ar deschide. */}
      {!c.is_demo && (
        <div class="fm-btns" style="margin-bottom:12px">
          <button class="fm-btn acc" style="flex:1 1 auto" onClick={() => loc.route(rutaFactura(c.id, 'unica'))}><Icon name="report" size={15} /> Factură unică / proformă</button>
          <button class="fm-btn" style="flex:1 1 auto" onClick={() => loc.route(rutaFactura(c.id, 'abonament'))}><Icon name="calendar" size={15} /> Abonamentul unei luni</button>
        </div>
      )}
      {docs.length === 0 ? (
        <div class="fm-empty" style="padding:28px 14px"><Icon name="report" size={32} color="var(--text-muted)" /><b>Niciun document emis</b>
          {c.is_demo
            ? 'Compania demo nu se facturează.'
            : 'Aparatele și montajul se facturează din „Factură unică / proformă", completată din contract. Abonamentul lunar pleacă singur dacă firma are bifat „auto" în Facturare.'}</div>
      ) : (
        <div class="fm-card">
          <h3>Documente</h3>
          {docs.map((f) => {
            const pf = f.type === 'proforma';
            const [stEt, stCul] = stareClient(f, acum);
            const ce = ceEDocumentul(f);
            const leg = legatura(f, docs);
            const deschis = f.status !== 'paid' && f.status !== 'canceled';
            return (
              <div class="co-row">
                <div class="a"><b>{f.full_number || '—'}</b><span style={'font-size:12.5px;font-weight:800;white-space:nowrap;color:' + stCul}>{stEt}</span></div>
                <div class="s">{[ce !== '—' ? ce : '', 'din ' + dataRo(f.issue_date), deschis && f.due_date ? 'scadentă pe ' + dataRo(f.due_date) : ''].filter(Boolean).join(' · ')}</div>
                {leg ? <div class="s">{leg}</div> : null}
                {/* Suma pe rândul ei, întreagă (nowrap); butoanele dedesubt. Pe 375px, lângă „Vezi" + „Marchează plătită"
                    rămâneau ~49px pentru sumă, iar „2.250,00 lei" se rupea în mijlocul cifrei (revizia lotului 4). */}
                <div class="s" style="margin-top:6px"><b style="font-size:15px;white-space:nowrap;color:var(--text-primary)">{bani2(f.total)}</b></div>
                <div class="fm-btns" style="margin-top:8px">
                  <button class="fm-btn" onClick={() => setVezi(f)}><Icon name="eye" size={15} /> Vezi</button>
                  {deschis && (
                    <button class="fm-btn acc" disabled={busy} title={pf ? 'Încasată — emite factura fiscală' : 'Marchează plătită'} onClick={() => setIntreb(f)}>
                      <Icon name="check" size={15} /> {pf ? 'Încasată' : 'Marchează plătită'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {pl.length > 0 && (
        <div class="fm-card">
          <h3>Încasări</h3>
          {pl.map((p) => (
            <div class="co-row">
              <div class="a"><b>{p.amount_ron != null ? lei2(p.amount_ron) : '—'}</b><span style="font-size:12.5px;color:var(--text-muted)">{dataRo(p.paid_at || p.created_at)}</span></div>
              <div class="s">{(p.note || 'încasare fără factură') + ' · ' + metodaText(p.method)}</div>
            </div>
          ))}
        </div>
      )}
      {intreb && (
        <Confirma title={(intreb.type === 'proforma' ? 'Proforma ' : 'Factura ') + (intreb.full_number || '')} busy={busy}
          okLabel={intreb.type === 'proforma' ? OK_PROFORMA : OK_FACTURA}
          text={intreb.type === 'proforma' ? INTREB_PROFORMA : INTREB_FACTURA}
          onOk={() => platita(intreb)} onCancel={() => { if (!busy) setIntreb(null); }} />
      )}
      {vezi && <DocumentFactura inv={vezi} privire="fisa" nota={notaLegatura(vezi, docs)} onClose={() => setVezi(null)} />}
    </>
  );
}

// Legătura proformă ↔ factură, ca frază pe hârtia „Vezi" („Din proforma PF-2026-0002.").
function notaLegatura(f: any, docs: any[]): string {
  const leg = legatura(f, docs);
  return leg ? leg[0].toUpperCase() + leg.slice(1) + '.' : '';
}

// ─── Contract: rezumatul dosarului + drumul clientului + comparația cu factura; dosarul întreg e în ecranele
// Contracte. Ca fila Contract de pe web (_raxCodContract): cutia dosarului → drumul (cu butonul pasului
// următor) → capul contractului. Butoanele sunt ACELEAȘI ca în listă și în dosar; după o apăsare, fișa se reîncarcă.
function Contract({ o, onDosar, onReload }: { o: any; onDosar: () => void; onReload: () => void }) {
  const co = o.company || {};
  const c = o.contract || null;
  const dos = o.dosar || {};
  const pasi = usePasiContract({ trimitePeEmail: !!o.trimite_pe_email, laSchimbat: onReload });
  if (co.is_demo) return <div class="fm-empty">Compania demo nu are contract.</div>;
  const semnat = !!(c && (c.status === 'activ' || c.status === 'incheiat'));
  const st = c ? (CTR_STARI[c.status] || CTR_STARI.ciorna) : null;
  const rand = randDinFisa(o);
  // Un contract încheiat: CE URMEAZĂ — aparatele se arhivează, istoricul lor se mai ține cât scrie în contract.
  const explic = c && CTR_EXPLIC[c.status] ? CTR_EXPLIC[c.status] + (c.status === 'incheiat' ? dupaIncetare(o.date_dupa_incetare_zile) : '') : '';
  return (
    <>
      {/* Ce lipsește — sus de tot: apare doar când chiar lipsește ceva sau expiră. CUI-ul, sediul și reprezentantul
          se completează pe loc (cu ANAF). */}
      {dos.nivel && dos.nivel !== 'demo' && (dos.text || dos.nivel === 'expira') && (
        <div class={'co-box ' + (DOSAR_FEL[dos.nivel] || '')}>
          <strong>{dos.eticheta || ''}</strong>
          {dos.text ? <div>Lipsește: {dos.text}</div> : null}
          {o.preaviz_pana && c && c.status === 'activ' ? <div>Ultima zi în care se poate anunța rezilierea: <b>{zile(o.preaviz_pana)}</b></div> : null}
          {lipsuriFirma(rand).length > 0 && (
            <div class="fm-btns" style="margin-top:8px">
              <button class="fm-btn" onClick={() => pasi.completeaza(rand)}><Icon name="edit" size={15} /> Completează</button>
            </div>
          )}
        </div>
      )}
      {c && o.drum ? <div style="margin-bottom:12px"><DrumClient drum={o.drum} buton={(k) => pasi.butonDrum(k, rand)} /></div> : null}
      {!c ? (
        <div class="fm-card pad">
          <div style="font-size:14px;margin-bottom:10px">Firma asta nu are încă niciun contract.</div>
          <button class="btn btn-primary" style="width:100%" onClick={onDosar}><Icon name="fileSignature" size={16} color="#06210F" /> Deschide dosarul — fă un contract{o.numar_propus ? ' (' + o.numar_propus + ')' : ''}</button>
        </div>
      ) : (
        <>
          <div class="fm-card pad">
            <div class="co-tags" style="margin-top:0">
              {st && <span class={'co-pill ' + st[1]}>{st[0]}</span>}
              <b style="font-size:15px">{c.number || 'fără număr'}</b>
            </div>
            <div class="co-note" style="font-size:13px">{zile(c.start_at) + ' → ' + (o.sfarsit ? zile(o.sfarsit) : 'nedeterminat')}</div>
            {explic ? <div class="co-note">{explic}</div> : null}
            {o.prelungire_in_lucru ? <div class="co-note">Prelungire în lucru: {o.prelungire_in_lucru.number || '—'}.</div> : null}
          </div>
          {c.status !== 'incheiat' && <Comparatie cmp={o.comparatie} semnat={semnat} />}
          <button class="btn btn-primary" style="width:100%" onClick={onDosar}><Icon name="fileSignature" size={16} color="#06210F" /> Deschide dosarul</button>
          <div class="co-note">În dosar: anexele, actele adiționale, montajul, actele semnate și PDF-ul contractului.</div>
        </>
      )}
      {pasi.ui}
    </>
  );
}
