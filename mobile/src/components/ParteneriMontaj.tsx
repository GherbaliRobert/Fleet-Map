// Partenerii de montaj — firmele care montează în locul nostru. Stau în ecranul nostru de contracte, ca pe
// web (raxParteneriIncarca / raxPartSalveaza / raxPartSterge), și NU apar nicăieri în ce vede clientul.
// Tarifele lor se propun singure la fiecare lucrare de montaj. Modificarea e tot POST, cu id.
// Butonul „înapoi" de pe Android închide foaia partenerului (întreabă dacă s-a scris ceva), nu ecranul.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import { MONTAJ_TIPURI } from '../lib/contracte';
import { Confirma } from './FlotaUi';
import { Pill } from './ContractUi';
import { Icon } from './Icon';
import '../screens/admin.css';
import '../screens/detail.css';
import '../screens/contracte.css';

type Edit = { id: number; name: string; cui: string; contact: string; tarife: Record<string, string> };

export function ParteneriMontaj() {
  const [lista, setLista] = useState<any[] | null>(null);
  const [edit, setEdit] = useState<Edit | null>(null);
  const [del, setDel] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);
  const start = useRef(''); // formularul cum s-a deschis — „înapoi" întreabă doar dacă s-a schimbat ceva

  function incarca() {
    Api.montajParteneri().then((l) => setLista(Array.isArray(l) ? l : [])).catch(() => setLista([]));
  }
  useEffect(incarca, []);

  function deschide(p: any | null) {
    const t: Record<string, string> = {};
    MONTAJ_TIPURI.forEach(([k]) => { const v = p && p.tarife ? p.tarife[k] : null; t[k] = v == null ? '' : String(v); });
    const e: Edit = { id: p ? Number(p.id) : 0, name: (p && p.name) || '', cui: (p && p.cui) || '', contact: (p && p.contact) || '', tarife: t };
    start.current = JSON.stringify(e);
    setEdit(e);
  }
  // Întoarce true dacă foaia s-a închis. Aceeași întrebare pentru X, fundal și „înapoi" de pe Android.
  function inchide(): boolean {
    if (!edit) return true;
    if (busy) return false;
    if (JSON.stringify(edit) !== start.current && !confirm('Închizi fără să salvezi?\n\nCe ai scris la partener se pierde.')) return false;
    setEdit(null);
    return true;
  }
  useInapoiInchide(!!edit, inchide);
  async function salveaza() {
    if (!edit || busy) return;
    const tarife: Record<string, number> = {};
    Object.keys(edit.tarife).forEach((k) => { const v = edit.tarife[k]; if (v !== '') tarife[k] = parseFloat(v); });
    setBusy(true);
    try {
      await Api.saveMontajPartener({ id: edit.id || null, name: edit.name.trim(), cui: edit.cui.trim(), contact: edit.contact.trim(), tarife });
      setEdit(null);
      showToast('Partener salvat ✓');
      incarca();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(false); }
  }
  async function sterge() {
    if (!del || busy) return;
    setBusy(true);
    try { await Api.deleteMontajPartener(Number(del.id)); setDel(null); incarca(); }
    catch (e: any) { showToast('Eroare: ' + (e?.message || ''), true); }
    finally { setBusy(false); }
  }
  const sf = (k: keyof Edit, v: any) => setEdit((p) => (p ? { ...p, [k]: v } : p));

  return (
    <>
      <div class="ctr-h"><Icon name="wrench" size={17} class="ic" /> Parteneri de montaj</div>
      <div class="ctr-sub">Firmele care montează în locul nostru. Clientul nu le vede niciodată — pentru el montăm noi. Tarifele scrise aici se propun singure la fiecare lucrare.</div>
      {lista == null ? <div class="spin" style="margin:8px auto" /> : (
        <div class="ctr-list">
          {!lista.length && <div class="ctr-empty">Niciun partener de montaj încă.</div>}
          {lista.map((p: any) => {
            const n = Object.keys(p.tarife || {}).length;
            return (
              <div class="ctr-row">
                <div class="ctr-row-top">
                  <div class="ctr-row-t">
                    <b>{p.name}</b> {p.active === false && <Pill>inactiv</Pill>}
                    <span class="ctr-row-s">{(p.cui ? p.cui + ' · ' : '') + (p.contact ? p.contact + ' · ' : '') + (n ? n + ' tarife scrise' : 'fără tarife scrise')}</span>
                  </div>
                </div>
                <div class="ctr-btns">
                  <button class="ctr-btn" onClick={() => deschide(p)}><Icon name="edit" size={15} /> Modifică</button>
                  <button class="ctr-btn danger" onClick={() => setDel(p)}><Icon name="trash" size={15} /> Șterge</button>
                </div>
              </div>
            );
          })}
          <button class="ctr-btn" style="align-self:flex-start" onClick={() => deschide(null)}><Icon name="plus" size={16} /> Partener nou</button>
        </div>
      )}

      {edit && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) inchide(); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b><Icon name="wrench" size={18} color="var(--accent)" /> {edit.id ? 'Partener de montaj' : 'Partener nou'}</b>
              <button class="h-btn" onClick={() => inchide()} aria-label="Închide"><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Firma care montează</label><input value={edit.name} placeholder="ex. Instal GPS Vest SRL" onInput={(e: any) => sf('name', e.target.value)} /></div>
                <div class="fld"><label>CUI</label><input value={edit.cui} placeholder="RO12345678" onInput={(e: any) => sf('cui', e.target.value)} /></div>
                <div class="fld"><label>Contact</label><input value={edit.contact} placeholder="nume · telefon · email" onInput={(e: any) => sf('contact', e.target.value)} /></div>
                <div class="ctr-h2" style="margin-top:4px">Cât ne cere, pe lucrare (lei)</div>
                <div class="ctr-mont">
                  {MONTAJ_TIPURI.map(([k, et, um]) => (
                    <div class="ctr-mont-r ctr-mont-1">
                      <span class="t" style="margin:0">{et} <em>({um})</em></span>
                      <input type="number" inputMode="decimal" min="0" step="1" placeholder="lei" value={edit.tarife[k]}
                        onInput={(e: any) => { const v = e.target.value; setEdit((p) => (p ? { ...p, tarife: { ...p.tarife, [k]: v } } : p)); }} />
                    </div>
                  ))}
                </div>
                <div class="frm-actions">
                  <button class="btn fl-btn2" disabled={busy} onClick={() => setEdit(null)}>Renunț</button>
                  <button class="btn btn-primary" disabled={busy} onClick={salveaza}><Icon name="check" size={16} /> {busy ? 'Se salvează…' : 'Salvează partenerul'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {del && (
        <Confirma title="Șterge partenerul" danger busy={busy} okLabel="Șterge"
          text="Ștergi partenerul? Lucrările deja salvate rămân, dar fără numele lui."
          onOk={sterge} onCancel={() => { if (!busy) setDel(null); }} />
      )}
    </>
  );
}
