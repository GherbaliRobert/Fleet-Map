// Actele mașinilor pe telefon — ACELEAȘI rânduri în ecranul „Documente vehicule" și în fișa mașinii, ca pe
// web (docSlotCard): fiecare act cerut are rândul lui, plin sau gol („RCA — obligatoriu, nu e încărcat"),
// cu „Încarcă" pe cel gol și Vezi / Editează / Nou / Șterge pe cel plin. O singură fereastră de act, cu
// citirea actului (poză sau PDF), verificarea numărului de pe act și întrebarea la reînnoire.
//
// Decizie (păstrată de la VehicleDocs): FĂRĂ plugin nativ de cameră. Un <input type="file" capture>
// deschide camera direct în WebView-ul Android — zero permisiuni noi, zero dependințe native.
import { useEffect, useState } from 'preact/hooks';
import { Capacitor, CapacitorHttp } from '@capacitor/core';
import { API_BASE, getAuthToken } from '../api/client';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon, type IconName } from './Icon';
import { Confirma, Poza } from './FlotaUi';
import '../screens/flota.css';
import {
  type Catalog, DOC_CLS, clasaServis, dataRo, docCatMaiE, docStare, iconFa, nf, norm, numar, optiuniVehicule,
  uitaFlota, vehDe, vehDupaNumar, zi10,
} from './flotaCommon';

// ─── Fișierul actului ───────────────────────────────────────────────────────────────────────────
// Pozele de telefon au 5-12 MB; limita serverului e 4. Micșorăm în WebView înainte de trimitere.
// Exportat (și prin VehicleDocs): scanul unui contract semnat trece prin aceeași micșorare.
export function shrink(file: File): Promise<{ b64: string; mime: string; name: string }> {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') {
      if (file.size > 4 * 1024 * 1024) return reject(new Error('PDF-ul e prea mare (' + (file.size / 1048576).toFixed(1) + ' MB, limita 4). Fă o poză paginii.'));
      const fr = new FileReader();
      fr.onload = () => resolve({ b64: String(fr.result).split(',')[1], mime: 'application/pdf', name: file.name });
      fr.onerror = () => reject(new Error('Nu am putut citi fișierul.'));
      fr.readAsDataURL(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const sc = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const du = c.toDataURL('image/jpeg', 0.78);
      resolve({ b64: du.split(',')[1], mime: 'image/jpeg', name: (file.name || 'act').replace(/\.[^.]+$/, '') + '.jpg' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Fișierul nu e o imagine sau un PDF.')); };
    img.src = url;
  });
}

// Fișierul actului, adus CU tokenul. Un link simplu (<a href>) nu cară tokenul, iar aplicația rulează din
// fișierele ei, deci o adresă relativă nici nu ajunge la server. Pe telefon cererea trece prin stratul
// nativ: un fetch() din pagină e blocat (ratrack.ro nu trimite antete CORS — verificat 2026-09-13).
export type ActAdus = { url: string; mime: string; b64: string | null };

function _verificaRaspuns(status: number) {
  if (status === 404) throw new Error('Actul nu are fișier atașat');
  if (status === 403) throw new Error('Nu ai acces la actul acesta');
  if (status < 200 || status >= 300) throw new Error('Nu am putut deschide actul');
}

export async function aduActul(id: number, mimeHint?: string | null): Promise<ActAdus> {
  const tok = getAuthToken();
  const headers: Record<string, string> = tok ? { Authorization: 'Bearer ' + tok } : {};
  const url = API_BASE + '/api/documents/' + id + '/file';
  const LIMITA_MS = 60000; // fără limită, o rețea proastă lasă butonul fără niciun răspuns
  const preaMult = 'A durat prea mult. Încearcă din nou.';

  if (Capacitor.isNativePlatform()) {
    let tm: any;
    let res: any;
    try {
      res = await Promise.race([
        // responseType 'blob' → CapacitorHttp întoarce conținutul în base64 (la fel ca la rapoarte).
        CapacitorHttp.request({ url, method: 'GET', headers, responseType: 'blob' as any, connectTimeout: 20000, readTimeout: LIMITA_MS + 30000 } as any),
        new Promise((_, rej) => { tm = setTimeout(() => rej(new Error(preaMult)), LIMITA_MS); }),
      ]);
    } catch (e: any) {
      throw new Error(e?.message === preaMult ? preaMult : 'Eroare de rețea');
    } finally { clearTimeout(tm); }
    _verificaRaspuns(res.status);
    const hdr = res.headers || {};
    const cheie = Object.keys(hdr).find((k) => k.toLowerCase() === 'content-type');
    const mime = String((cheie && hdr[cheie]) || mimeHint || '').split(';')[0].trim();
    const b64 = String(res.data || '').replace(/\s+/g, '');
    return { url: 'data:' + (mime || 'application/octet-stream') + ';base64,' + b64, mime, b64 };
  }

  // În browser (dezvoltare): aceeași cerere, cu fetch.
  const ctrl = new AbortController();
  const tm = setTimeout(() => ctrl.abort(), LIMITA_MS);
  try {
    const r = await fetch(url, { headers, signal: ctrl.signal });
    _verificaRaspuns(r.status);
    const blob = await r.blob();
    return { url: URL.createObjectURL(blob), mime: blob.type || mimeHint || '', b64: null };
  } catch (e: any) {
    if (e && e.name === 'AbortError') throw new Error(preaMult);
    if (e instanceof TypeError) throw new Error('Eroare de rețea');
    throw e;
  } finally { clearTimeout(tm); }
}

// Un PDF nu se poate afișa în pagină pe telefon. Îl predăm sistemului prin foaia de partajare, la fel ca
// rapoartele exportate: de acolo se deschide în vizualizatorul de PDF-uri sau se salvează.
export async function deschideInAfara(act: ActAdus, nume: string) {
  if (Capacitor.isNativePlatform() && act.b64 != null) {
    const ext = act.mime === 'application/pdf' ? '.pdf' : act.mime.startsWith('image/') ? '.' + act.mime.slice(6).replace('jpeg', 'jpg') : '';
    let path = String(nume || 'act').replace(/[^\w.\-]+/g, '_');
    if (ext && !path.toLowerCase().endsWith(ext)) path += ext;
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      await Filesystem.writeFile({ path, data: act.b64, directory: Directory.Cache });
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
      await Share.share({ title: nume || 'Act', files: [uri] });
    } catch (e: any) {
      if (/cancel/i.test(String(e?.message || ''))) return; // omul a închis foaia de partajare — nu e o eroare
      throw new Error('Nu am putut deschide actul pe acest telefon.');
    }
    return;
  }
  window.open(act.url, '_blank');
  // Nu revocăm imediat: fila nouă citește adresa după ce ecranul nostru pierde focusul.
  setTimeout(() => { try { URL.revokeObjectURL(act.url); } catch { /* */ } }, 60000);
}

// ─── Ce acte trebuie să aibă mașina („Acte cerute") și rândurile ei ────────────────────────────
export type Nevoie = { type: string; need: 'req' | 'opt' };
export type Slot = { d?: any; tip?: string; need?: string; imei: string };

// Lista de tipuri pentru alegerea actului: din „Acte cerute" (sursa unică, maint_types.js), plus „Altul".
export function tipuriActe(req: any | null, cat: Catalog | null): string[] {
  const din = (req && Array.isArray(req.rows) && req.rows.length) ? req.rows.map((r: any) => String(r.type)) : (cat ? cat.docs : []);
  return din.concat(din.indexOf('Altul') < 0 ? ['Altul'] : []);
}
export function metaAct(req: any | null, type: string): { icon: IconName; fam: string } {
  const r = req && Array.isArray(req.rows) ? req.rows.find((x: any) => norm(x.type) === norm(type)) : null;
  return r ? { icon: iconFa(r.icon, 'fileBar'), fam: r.fam || 'f-neutral' } : { icon: 'fileBar', fam: 'f-neutral' };
}
// Actele pe care mașina ar TREBUI să le aibă, după felul ei. Fără clasă (catalog necitit) → nimic,
// ca aplicația să nu strige „lipsește" pe ghicite.
export function nevoiDe(dev: any, req: any | null, cat: Catalog | null): Nevoie[] {
  const cls = dev ? clasaServis(dev, cat) : null;
  if (!cls || !req || !Array.isArray(req.rows)) return [];
  return req.rows.map((r: any) => ({ type: String(r.type), need: r[cls] })).filter((r: any) => r.need === 'req' || r.need === 'opt');
}
// Toate actele unei mașini, într-o ordine STABILĂ: cele cerute (în ordinea din „Acte cerute"), pline sau
// goale, plus orice act în plus. Înveți unde e ITP-ul și rămâne acolo; urgența o spune culoarea.
export function sloturi(imei: string, acte: any[], nevoi: Nevoie[]): Slot[] {
  const luate: Record<string, 1> = {};
  const out: Slot[] = [];
  nevoi.forEach((m) => {
    const d = acte.find((x) => norm(x.doc_type) === norm(m.type) && !luate[x.id]);
    if (d) luate[d.id] = 1;
    out.push(d ? { d, imei } : { tip: m.type, need: m.need, imei });
  });
  acte.forEach((d) => { if (!luate[d.id]) out.push({ d, imei }); });
  return out;
}
const RANG_DOC: Record<string, number> = { expired: 0, soon: 1, none: 2, ok: 3 };
export function ordoneazaActe(acte: any[]): any[] {
  return acte.slice().sort((a, b) => {
    const ra = RANG_DOC[docStare(a)], rb = RANG_DOC[docStare(b)];
    return ra !== rb ? ra - rb : String(a.expiry_date || '').localeCompare(String(b.expiry_date || ''));
  });
}

const PILL_IC: Record<string, IconName> = { expired: 'alert', soon: 'clock', none: 'alertO', ok: 'check' };

export function DocRand({ o, req, canEdit, onUpload, onView, onEdit, onRenew, onDelete }: {
  o: Slot; req: any | null; canEdit: boolean;
  onUpload: (imei: string, tip: string) => void; onView: (d: any) => void; onEdit: (d: any) => void;
  onRenew: (d: any) => void; onDelete: (d: any) => void;
}) {
  const d = o.d || null;
  const tip = d ? d.doc_type : (o.tip || '');
  const meta = metaAct(req, tip);
  const st = d ? (DOC_CLS[docStare(d)] || 'none') : (o.need === 'req' ? 'over' : 'none');
  const bits: string[] = [];
  if (d) {
    if (d.expiry_date) bits.push('valabil până ' + dataRo(d.expiry_date));
    if (d.number) bits.push(d.number);
    if (d.issuer) bits.push(d.issuer);
    if (!bits.length) bits.push('fără date completate');
  } else bits.push(o.need === 'req' ? 'obligatoriu — nu e încărcat' : 'opțional — nu e încărcat');
  const cost = d ? (parseFloat(d.cost) || 0) : 0;
  const pill = d
    ? <span class={'fl-pill s-' + st}><Icon name={PILL_IC[docStare(d)] || 'check'} size={12} />{docCatMaiE(d)}</span>
    : <span class={'fl-pill s-' + st}><Icon name={o.need === 'req' ? 'alert' : 'alertO'} size={12} />{o.need === 'req' ? 'lipsește' : 'neîncărcat'}</span>;
  const areFisier = !!(d && d.has_file);
  return (
    <div class={'fl-r s-' + st}>
      <div class="fl-rh">
        <span class={'fl-ic ' + meta.fam}><Icon name={meta.icon} size={17} /></span>
        <div class="fl-rt">
          <div class="fl-rn">{tip}{areFisier ? <span style="color:var(--text-muted);margin-left:5px" title="Are actul încărcat"><Icon name="report" size={12} /></span> : null}</div>
          <div class="fl-rs">{bits.join(' · ')}</div>
        </div>
        {pill}
      </div>
      {(cost || areFisier || canEdit) ? (
        <div class="fl-rf">
          <span class="fl-lei">{cost ? <>{nf(Math.round(cost))} <small>RON</small></> : ''}</span>
          {areFisier && <button class="fl-ab" onClick={() => onView(d)}><Icon name="eye" size={16} /> Vezi</button>}
          {canEdit && !d && <button class="fl-ab pri" onClick={() => onUpload(o.imei, tip)}><Icon name="upload" size={15} /> Încarcă</button>}
          {canEdit && d && <button class="fl-ab" aria-label="Editează datele actului" onClick={() => onEdit(d)}><Icon name="edit" size={16} /></button>}
          {canEdit && d && <button class="fl-ab" onClick={() => onRenew(d)} aria-label="Încarcă actul nou — ăsta trece în istoric"><Icon name="upload" size={15} /> Nou</button>}
          {canEdit && d && <button class="fl-ab dang" aria-label="Șterge" onClick={() => onDelete(d)}><Icon name="trash" size={16} /></button>}
        </div>
      ) : null}
    </div>
  );
}

// Act înlocuit: nu mai are stare, dar ține minte cât a valorat și cât a costat.
export function DocIstRand({ d, req }: { d: any; req: any | null }) {
  const meta = metaAct(req, d.doc_type);
  const bits: string[] = [];
  if (d.replaced_at) bits.push('înlocuit pe ' + new Date(d.replaced_at).toLocaleDateString('ro-RO'));
  if (d.issue_date) bits.push('emis ' + dataRo(d.issue_date));
  if (d.expiry_date) bits.push('era valabil până ' + dataRo(d.expiry_date));
  if (d.number) bits.push(d.number);
  if (d.issuer) bits.push(d.issuer);
  const cost = parseFloat(d.cost) || 0;
  return (
    <div class="fl-r s-none dn">
      <div class="fl-rh">
        <span class={'fl-ic ' + meta.fam}><Icon name={meta.icon} size={17} /></span>
        <div class="fl-rt">
          <div class="fl-rn">{d.doc_type}</div>
          {bits.length ? <div class="fl-rs">{bits.join(' · ')}</div> : null}
        </div>
        <span class="fl-pill s-none"><Icon name="clock" size={12} />înlocuit</span>
      </div>
      {cost ? <div class="fl-rf"><span class="fl-lei">{nf(Math.round(cost))} <small>RON</small></span></div> : null}
    </div>
  );
}

// ─── Fereastra actului ─────────────────────────────────────────────────────────────────────────
// Câmpurile din propunere care aparțin FIȘEI mașinii (nu actului) și cele ale actului.
const FISA_ET: Record<string, string> = {
  plate: 'Nr. înmatriculare', vin: 'Serie șasiu (VIN)', brand: 'Marca', model: 'Model', year: 'An',
  fuel_type: 'Combustibil', displacement: 'Cilindree', power_kw: 'Putere (kW)',
  passenger_seats: 'Locuri', tare_weight: 'Masă proprie (kg)', max_weight_legal: 'Masă maximă (kg)',
  vehicle_type: 'Categorie (propusă din talon)',
};
const ACT_ET: Record<string, string> = {
  doc_type: 'Tip act', number: 'Serie/nr.', issuer: 'Emitent', issue_date: 'Emis la', expiry_date: 'EXPIRĂ la',
};
const incredere = (v: number) => v >= 0.85
  ? <span class="fl-t-ok" style="font-size:10.5px">sigur</span>
  : v >= 0.6 ? <span class="fl-t-warn" style="font-size:10.5px">probabil</span>
  : <span style="color:var(--red);font-size:10.5px">verifică</span>;

type Potrivire = { stare: 'ales' | 'confirma' | 'altul' | 'strain'; plate: string; imei?: string; deschis?: string } | null;

export function DocForm({ imei0, tip0, edit, lockImei, devs, tipuri, ctxImei, fisa, onFisa, onClose, onSaved }: {
  imei0?: string; tip0?: string; edit?: any | null; lockImei?: boolean; devs: any[]; tipuri: string[];
  ctxImei?: string; fisa?: any; onFisa?: (patch: any) => void; onClose: () => void; onSaved: () => void;
}) {
  const poateFisa = !!me.value?.permissions?.manageFleet && !(me.value?.editariTaiate || []).includes('vehicule');
  const zi = (x: any) => zi10(x) || '';
  const [imei, setImei] = useState<string>(edit ? edit.imei : (imei0 || ''));
  const [f, setF] = useState<any>(() => edit
    ? { doc_type: edit.doc_type || '', number: edit.number || '', issuer: edit.issuer || '', issue_date: zi(edit.issue_date), expiry_date: zi(edit.expiry_date), cost: edit.cost != null ? String(edit.cost) : '' }
    : { doc_type: tip0 || '', number: '', issuer: '', issue_date: '', expiry_date: '', cost: '' });
  const [fisier, setFisier] = useState<{ b64: string; mime: string; name: string } | null>(null);
  const [prop, setProp] = useState<any>(null);
  const [bife, setBife] = useState<Record<string, boolean>>({});
  const [pot, setPot] = useState<Potrivire>(null);
  const [fisaPending, setFisaPending] = useState<Record<string, any>>({});
  const [citesc, setCitesc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [renew, setRenew] = useState<{ vechi: any; f: any; patch: Record<string, any>; inFisa: number } | null>(null);
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));

  // Câmpurile de fișă se pot pune: în formularul mașinii deschise (se salvează cu „Salvează"-ul ei) sau
  // direct pe mașină, dacă rolul are voie să modifice fișa.
  const inFormular = (t: string) => !!onFisa && !!ctxImei && t === ctxImei;
  const fisaPosibila = (t: string) => inFormular(t) || poateFisa;
  const ocupat = (t: string, k: string) => {
    if (inFormular(t)) return String(fisa?.[k] ?? '').trim() !== '';
    const d = vehDe(devs, t);
    return !!(d && d[k] != null && String(d[k]).trim() !== '');
  };
  function bifeImplicite(campuri: any, tinta: string, stare: Potrivire) {
    const b: Record<string, boolean> = {};
    for (const k of Object.keys(campuri || {})) {
      if (k in ACT_ET) b[k] = true;
      // Actul altei mașini: nimic din fișa lui nu se bifează singur pe mașina deschisă.
      else if (k in FISA_ET) b[k] = !(stare && stare.stare === 'altul') && !ocupat(tinta, k);
    }
    return b;
  }

  async function citeste(file: File | undefined) {
    if (!file) return;
    setCitesc(true); setProp(null); setPot(null);
    try {
      const fl = await shrink(file);
      const r = await Api.scanDocument({ b64: fl.b64, mime: fl.mime, tip: 'auto' });
      setFisier(fl); setProp(r);
      // Actul spune a cui e: numărul de pe act se compară cu flota (web: _docScanPotriveste).
      let p: Potrivire = null, tinta = imei;
      const pl = r && r.campuri && r.campuri.plate;
      if (pl) {
        const v = vehDupaNumar(devs, pl);
        if (!v) p = { stare: 'strain', plate: String(pl) };
        else if (!imei) { p = { stare: 'ales', plate: v.plate, imei: v.imei }; setImei(v.imei); tinta = v.imei; }
        else if (imei === v.imei) p = { stare: 'confirma', plate: v.plate, imei: v.imei };
        else p = { stare: 'altul', plate: v.plate, imei: v.imei, deschis: numar(devs, imei) };
      }
      setPot(p);
      setBife(bifeImplicite(r && r.campuri, tinta, p));
    } catch (e: any) { showToast(e?.message || 'Nu am putut citi actul', true); }
    finally { setCitesc(false); }
  }
  function mutaPe(nou: string) {
    setImei(nou);
    const p: Potrivire = pot ? { ...pot, stare: 'confirma' } : null;
    setPot(p);
    if (prop) setBife(bifeImplicite(prop.campuri, nou, p));
  }

  // „Validează și adaugă actul": ce e bifat la act intră în formular, ce e bifat la fișă merge la mașină,
  // iar actul se salvează pe loc (fluxul e unul: încarci → vezi ce s-a citit → confirmi → e în listă).
  async function aplica() {
    const c = (prop && prop.campuri) || {};
    const f2 = { ...f };
    const patch: Record<string, any> = {};
    for (const k of Object.keys(c)) {
      if (!bife[k]) continue;
      if (k === 'doc_type') { if (tipuri.indexOf(String(c[k])) >= 0) f2.doc_type = String(c[k]); }
      else if (k in ACT_ET) f2[k] = String(c[k]);
      else if (k in FISA_ET && fisaPosibila(imei)) patch[k] = c[k];
    }
    // Fișa mașinii deschise se completează PE LOC (ca pe web): un talon citit ca să umple fișa nu trebuie
    // să aștepte salvarea unui act. Pe altă mașină, datele se scriu abia după ce actul s-a salvat.
    let inFisa = 0;
    let deScris = patch;
    const n = Object.keys(patch).length;
    if (n && inFormular(imei)) { onFisa!(patch); inFisa = n; deScris = {}; }
    setF(f2); setProp(null); setFisaPending(deScris);
    if (f2.doc_type && imei) await salveaza(f2, deScris, false, inFisa);
    else showToast((inFisa ? 'Completat: ' + inFisa + (inFisa === 1 ? ' câmp' : ' câmpuri') + ' în fișă — apasă „Salvează" pentru ele. ' : 'Completat în formular. ')
      + 'Pentru act, alege ' + (!imei ? 'vehiculul' : 'tipul actului') + ' și apasă „Adaugă actul".');
  }

  async function salveaza(date?: any, patch?: Record<string, any>, reinnoireConfirmata?: boolean, dejaInFisa = 0) {
    const x = date || f;
    const pf = patch || fisaPending;
    if (!imei || !x.doc_type) { showToast('Alege vehiculul și tipul actului', true); return; }
    const body: any = {
      imei, doc_type: x.doc_type, number: String(x.number || '').trim(), issuer: String(x.issuer || '').trim(),
      issue_date: x.issue_date || null, expiry_date: x.expiry_date || null, cost: parseFloat(x.cost) || null,
    };
    // Fișierul se trimite DOAR dacă s-a încărcat unul acum: o corectură de dată nu are voie să șteargă scanul.
    if (fisier) { body.file_b64 = fisier.b64; body.file_mime = fisier.mime; body.file_name = fisier.name; }
    setSaving(true);
    try {
      // Reînnoirea întreabă ÎNAINTE: actul vechi nu dispare — pleacă în istoric — dar omul trebuie să știe.
      if (!edit && x.doc_type !== 'Altul' && !reinnoireConfirmata) {
        const acte = await Api.documentsOf(imei).catch(() => [] as any[]);
        const vechi = (Array.isArray(acte) ? acte : []).find((a: any) => a.doc_type === x.doc_type);
        if (vechi) { setRenew({ vechi, f: x, patch: pf, inFisa: dejaInFisa }); return; }
      }
      if (edit) await Api.updateDocument(edit.id, body); else await Api.createDocument(body);
      let coada = dejaInFisa ? ' · ' + dejaInFisa + (dejaInFisa === 1 ? ' câmp completat' : ' câmpuri completate') + ' în fișă — apasă „Salvează" pentru ele' : '';
      const n = Object.keys(pf || {}).length;
      if (n) {
        if (inFormular(imei)) { onFisa!(pf); coada = ' · ' + n + (n === 1 ? ' câmp completat' : ' câmpuri completate') + ' în fișă — apasă „Salvează" pentru ele'; }
        else if (poateFisa) {
          // Ruta face actualizare PARȚIALĂ: atinge doar coloanele trimise, restul fișei rămâne neatins.
          try { await Api.updateDeviceDetails(imei, pf); uitaFlota(); coada = ' · am completat și fișa mașinii (' + n + (n === 1 ? ' câmp)' : ' câmpuri)'); }
          catch { coada = ' · fișa mașinii nu s-a putut completa'; }
        }
      }
      showToast((edit ? 'Act modificat' : 'Act salvat')
        + (body.expiry_date ? '' : ' — fără dată de expirare, nu vei fi alertat') + coada);
      onSaved();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setSaving(false); }
  }

  const optiuni = optiuniVehicule(devs);
  const tipList = tipuri.concat(f.doc_type && tipuri.indexOf(f.doc_type) < 0 ? [f.doc_type] : []);
  const campuri = (prop && prop.campuri) || {};
  const randuri = Object.keys(campuri).filter((k) => k in ACT_ET || (k in FISA_ET && fisaPosibila(imei)));
  const fisaNegata = Object.keys(campuri).some((k) => k in FISA_ET) && !fisaPosibila(imei);
  const busy = saving || citesc;

  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h">
          <b><Icon name="fileBar" size={18} color="var(--accent)" /> {edit ? 'Corectează actul' : 'Act nou'}</b>
          <button class="h-btn" onClick={() => { if (!busy) onClose(); }} aria-label="Închide"><Icon name="x" /></button>
        </div>
        <div class="sheet-body">
          <div class="frm">
            {/* La corectare n-are rost citirea: ea aduce un act NOU, nu corectează unul existent. */}
            {!edit && (
              <div class="fl-fs" style="border-style:dashed">
                <div class="fl-fs-t">Încarcă actul și completez eu câmpurile</div>
                <div class="fl-hint">RCA / ITP / CASCO / Rovinietă → datele și expirarea actului. Talon / CIV → și fișa mașinii (marcă, model, VIN, cilindree…). Tu confirmi tot înainte de salvare.</div>
                {citesc ? <div style="display:flex;align-items:center;gap:8px;font-size:13.5px"><div class="spin" style="width:18px;height:18px" /> Citesc actul…</div> : (
                  <div style="display:flex;gap:8px">
                    <label class="btn btn-primary" style="flex:1;font-size:14px">
                      <input type="file" accept="image/*" capture="environment" style="display:none"
                        onChange={(e) => { const fl = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; citeste(fl); }} />
                      <Icon name="sparkles" size={15} /> Fotografiază
                    </label>
                    <label class="btn fl-btn2" style="flex:1;font-size:14px">
                      <input type="file" accept="image/*,application/pdf" style="display:none"
                        onChange={(e) => { const fl = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = ''; citeste(fl); }} />
                      <Icon name="upload" size={15} /> Alege fișier
                    </label>
                  </div>
                )}
              </div>
            )}

            {prop && (
              <div class="fl-prop" style="background:transparent">
                {pot && pot.stare === 'ales' && <div class="fl-banner s-done" style="margin-bottom:8px"><span class="ic"><Icon name="check" size={15} /></span><span>Actul e pentru <b>{pot.plate}</b> — am ales-o eu, după numărul de pe act.</span></div>}
                {pot && pot.stare === 'confirma' && <div class="fl-banner s-done" style="margin-bottom:8px"><span class="ic"><Icon name="check" size={15} /></span><span>Numărul de pe act se potrivește cu <b>{pot.plate}</b>.</span></div>}
                {pot && pot.stare === 'altul' && (
                  <div class="fl-banner s-over" style="margin-bottom:8px;flex-wrap:wrap"><span class="ic"><Icon name="alert" size={15} /></span>
                    <span style="flex:1 1 180px">Actul e pentru <b>{pot.plate}</b>, dar ai deschis fereastra pe <b>{pot.deschis}</b>.</span>
                    <button class="fl-ab" onClick={() => mutaPe(pot.imei!)}>Pune-l pe {pot.plate}</button>
                  </div>
                )}
                {pot && pot.stare === 'strain' && <div class="fl-banner s-soon" style="margin-bottom:8px"><span class="ic"><Icon name="alertO" size={15} /></span><span>Pe act scrie <b>{pot.plate}</b>, dar nu găsesc mașina asta în flotă. Alege tu vehiculul.</span></div>}
                {randuri.length ? (
                  <>
                    <div style="font-size:12.5px;font-weight:700;margin-bottom:6px">Am citit din act ({prop.sursa === 'pdf-text' ? 'text din PDF, gratuit' : 'citire AI'}) — debifează ce nu vrei:</div>
                    {randuri.map((k) => (
                      <label style="display:flex;align-items:center;gap:9px;padding:6px 0;font-size:13px;border-bottom:1px solid var(--border)">
                        <input type="checkbox" style="width:20px;height:20px;flex:0 0 20px" checked={!!bife[k]} onChange={(e) => setBife((p) => ({ ...p, [k]: (e.target as HTMLInputElement).checked }))} />
                        <span style="flex:1;min-width:0">
                          <span style="color:var(--text-muted);font-size:11.5px;display:block">{ACT_ET[k] || FISA_ET[k]} {incredere((prop.incredere || {})[k] || 0)}
                            {(k in FISA_ET) && ocupat(imei, k) ? <span class="fl-t-warn" style="font-size:10.5px"> · deja completat</span> : null}</span>
                          <b style="word-break:break-word">{String(campuri[k])}</b>
                        </span>
                      </label>
                    ))}
                    <div style="display:flex;gap:8px;margin-top:10px">
                      <button class="btn btn-primary" style="flex:1" disabled={busy} onClick={aplica}>Validează și adaugă actul</button>
                      <button class="btn fl-btn2" disabled={busy} onClick={() => { setProp(null); setFisier(null); setPot(null); }}>Renunță</button>
                    </div>
                    <div class="fl-hint" style="margin-top:6px">La validare actul se salvează și apare în listă, cu fișierul atașat.
                      {inFormular(imei) ? ' Câmpurile pentru fișă se completează în formularul mașinii — pe alea le salvezi cu „Salvează".' : (poateFisa ? ' Câmpurile bifate pentru fișă se scriu direct pe mașină.' : '')}</div>
                  </>
                ) : (
                  <div class="fl-hint">N-am putut citi nimic utilizabil din act ({prop.sursa || '?'}). Completează manual — sau încearcă o poză mai dreaptă, fără reflexii.</div>
                )}
                {fisaNegata && <div class="fl-hint" style="margin-top:6px">Datele pentru fișa mașinii (talon) nu se scriu: rolul tău nu poate modifica fișa vehiculelor.</div>}
              </div>
            )}

            <div class="fld"><label>Vehicul <span class="req">*</span></label>
              {(edit || lockImei) && imei
                ? <div class="fl-ro">{optiuni.find((o) => o.value === imei)?.label || numar(devs, imei)}</div>
                : (
                  <select value={imei} onChange={(e) => setImei((e.target as HTMLSelectElement).value)}>
                    <option value="">— alege vehiculul —</option>
                    {optiuni.map((o) => <option value={o.value}>{o.label}</option>)}
                  </select>
                )}
            </div>
            <div class="fld"><label>Tip act <span class="req">*</span></label>
              <select value={f.doc_type} onChange={(e) => set('doc_type', (e.target as HTMLSelectElement).value)}>
                <option value="">— alege actul —</option>
                {tipList.map((t) => <option value={t}>{t}</option>)}
              </select>
            </div>
            <div class="frm-row">
              <div class="fld"><label>Serie / număr</label><input value={f.number} placeholder="opțional" onInput={(e) => set('number', (e.target as HTMLInputElement).value)} /></div>
              <div class="fld"><label>Emitent</label><input value={f.issuer} placeholder="cine l-a eliberat" onInput={(e) => set('issuer', (e.target as HTMLInputElement).value)} /></div>
            </div>
            <div class="frm-row">
              <div class="fld"><label>Data emiterii</label><input type="date" value={f.issue_date} onInput={(e) => set('issue_date', (e.target as HTMLInputElement).value)} /></div>
              <div class="fld"><label>Data expirării</label><input type="date" value={f.expiry_date} onInput={(e) => set('expiry_date', (e.target as HTMLInputElement).value)} /></div>
            </div>
            <div class="fld"><label>Cost (RON)</label><input type="number" inputMode="decimal" step="0.01" value={f.cost} placeholder="cât ai dat pe el" onInput={(e) => set('cost', (e.target as HTMLInputElement).value)} /></div>
            {fisier && !prop && <div class="fl-hint"><Icon name="report" size={12} /> Actul încărcat ({fisier.name}) se atașează la salvare.</div>}
            <div class="frm-actions">
              <button class="btn fl-btn2" disabled={busy} onClick={onClose}>Renunță</button>
              <button class="btn btn-primary" disabled={busy} onClick={() => salveaza()}>{saving ? 'Se salvează…' : (edit ? 'Salvează modificarea' : 'Adaugă actul')}</button>
            </div>
          </div>
        </div>
      </div>
      {renew && (
        <Confirma title="Reînnoiești actul?" okLabel="Da, reînnoiește" busy={saving}
          text={numar(devs, imei) + ' are deja un act „' + renew.f.doc_type + '”' + (renew.vechi.expiry_date ? ', valabil până ' + dataRo(renew.vechi.expiry_date) : '') + '.\n\nÎl trimit în istoric și pun actul nou în locul lui?'}
          onCancel={() => setRenew(null)} onOk={() => { const r = renew; setRenew(null); salveaza(r.f, r.patch, true, r.inFisa); }} />
      )}
    </div>
  );
}

// ─── Acțiunile de pe rândurile de acte, într-un singur loc (ecranul Documente + fișa mașinii) ───
export function useDocOps({ devs, tipuri, reload, ctxImei, fisa, onFisa }: {
  devs: any[]; tipuri: string[]; reload: () => void; ctxImei?: string; fisa?: any; onFisa?: (patch: any) => void;
}) {
  const [form, setForm] = useState<{ imei?: string; tip?: string; edit?: any } | null>(null);
  const [del, setDel] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const [poza, setPoza] = useState<{ url: string; title: string } | null>(null);
  useEffect(() => () => { if (poza && poza.url.startsWith('blob:')) try { URL.revokeObjectURL(poza.url); } catch { /* */ } }, [poza]);

  async function vezi(d: any) {
    try {
      const act = await aduActul(d.id, d.file_mime);
      const titlu = d.doc_type + ' · ' + numar(devs, d.imei);
      // Poza se vede aici, peste ecran. Un PDF nu intră într-un <img>: îl predăm vizualizatorului telefonului.
      if (String(act.mime || d.file_mime || '').startsWith('image/')) setPoza({ url: act.url, title: titlu });
      else await deschideInAfara(act, d.file_name || (d.doc_type + '-' + d.id));
    } catch (e: any) { showToast(e?.message || 'Nu am putut deschide actul', true); }
  }
  async function sterge(d: any) {
    setBusy(true);
    try { await Api.deleteDocument(d.id); setDel(null); showToast('Act șters'); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare la ștergere', true); }
    finally { setBusy(false); }
  }
  const ops = {
    upload: (imei: string, tip: string) => setForm({ imei, tip }),
    add: (imei?: string) => setForm({ imei, tip: '' }),
    edit: (d: any) => setForm({ edit: d }),
    // Reînnoirea nu e o corectare: deschide un act GOL, de același tip, pe aceeași mașină.
    renew: (d: any) => setForm({ imei: d.imei, tip: d.doc_type }),
    view: vezi,
    del: (d: any) => setDel(d),
  };
  const ui = (
    <>
      {form && (
        <DocForm imei0={form.imei} tip0={form.tip} edit={form.edit || null} lockImei={!!ctxImei || !!form.imei}
          devs={devs} tipuri={tipuri} ctxImei={ctxImei} fisa={fisa} onFisa={onFisa}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }} />
      )}
      {del && (
        <Confirma title="Confirmare ștergere" okLabel="Șterge" danger busy={busy}
          text={'Ștergi „' + del.doc_type + '” de la ' + numar(devs, del.imei) + '?'
            + (del.doc_type !== 'Altul' ? '\n\nDacă vrei doar să pui unul nou în locul lui, folosește butonul „Nou" — atunci ăsta rămâne în istoric.' : '')
            + (del.has_file ? '\n\nSe șterge și poza sau PDF-ul atașat.' : '')}
          onCancel={() => setDel(null)} onOk={() => sterge(del)} />
      )}
      {poza && <Poza url={poza.url} title={poza.title} onClose={() => setPoza(null)} />}
    </>
  );
  return { ops, ui };
}
