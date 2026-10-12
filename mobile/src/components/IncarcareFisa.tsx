// Fila „Încărcare" din fișa vehiculului, pe telefon (web: #edit-tab-incarcare). Regulile — ce câmpuri are sens felul
// ales, cifrele obișnuite, ce pleacă la salvare — stau în lib/incarcare.ts, oglinda paginii. Aici doar se desenează.
import { Icon } from './Icon';
import { incVizibile, incObisnuite, remorcaText, type IncMeta, type Remorca } from '../lib/incarcare';

type Props = {
  val: Record<string, any>;                       // formularul fișei (aceleași chei ca pe server: inc_*, payload)
  setMulte: (patch: Record<string, any>) => void;
  meta: IncMeta | null;
  remorci: Remorca[];
};

export function IncarcareForm({ val, setMulte, meta, remorci }: Props) {
  if (!meta) return <div class="spin" style="margin:12px auto" />;
  const fel = String(val.inc_fel || '');
  const vz = incVizibile(fel, meta);
  const lista = remorci.filter((r) => r.fel === vz.felRemorca);
  const alegeFel = (nou: string) => {
    // Se schimbă căsuțele goale și cele rămase cu cifra felului dinainte; ce a scris omul rămâne.
    const p = incObisnuite(val, nou, fel, false, meta);
    p.inc_fel = nou;
    if (p.inc_remorca_id && !remorci.some((r) => String(r.id) === String(p.inc_remorca_id) && r.fel === incVizibile(nou, meta).felRemorca)) p.inc_remorca_id = '';
    setMulte(p);
  };
  const camp = (k: string, l: string, step = '0.01') => (
    <div class="fld" key={k}>
      <label>{l}</label>
      <input type="number" inputMode="decimal" step={step} value={String(val[k] ?? '')}
        onInput={(e) => setMulte({ [k]: (e.target as HTMLInputElement).value })} />
    </div>
  );
  const titlu = (t: string) => <div style="font-size:12px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.3px;margin:6px 0 2px">{t}</div>;
  return (
    <div class="frm" style="gap:10px">
      <div style="background:var(--bg-dark);border-radius:10px;padding:10px 12px;font-size:12.5px;color:var(--text-secondary);line-height:1.5">
        Simulatorul de încărcare folosește cifrele de aici, ca să nu le scrii la fiecare plan. Alege felul vehiculului — se pun
        cifrele obișnuite —, apoi corectează-le după fișa tehnică a mașinii.
      </div>
      <div class="fld">
        <label>Felul vehiculului</label>
        <select value={fel} onChange={(e) => alegeFel((e.target as HTMLSelectElement).value)}>
          <option value="">— Alege —</option>
          {meta.feluriVehicul.map((f) => <option value={f.id}>{f.et}</option>)}
        </select>
      </div>
      {fel && (
        <button type="button" onClick={() => setMulte(incObisnuite(val, fel, '', true, meta))}
          style="min-height:44px;border-radius:10px;border:1px solid var(--border);background:var(--bg-dark);color:var(--text-primary);font-weight:700;font-family:inherit;display:flex;align-items:center;justify-content:center;gap:8px">
          <Icon name="refresh" size={15} /> Pune cifrele obișnuite
        </button>
      )}
      {vz.caroserie && <>
        {titlu('Caroseria (interior, în metri)')}
        {camp('inc_lungime', 'Lungime')}
        {camp('inc_latime', 'Lățime')}
        {camp('inc_inaltime', 'Înălțime')}
      </>}
      {titlu('Axele (în metri)')}
      {camp('inc_ampatament', 'Ampatament')}
      {vz.caroserie && camp('inc_axa_caroserie', 'De la axa față la caroserie')}
      {vz.sa && camp('inc_sa_axa', 'Șaua în fața axei motoare')}
      {titlu('Tara pe axe (kg)')}
      {camp('inc_tara_fata', 'Pe axa față', '1')}
      {camp('inc_tara_spate', 'Pe axa din spate', '1')}
      {fel && <>
        {titlu(vz.sa ? 'Semiremorca obișnuită' : 'Remorca obișnuită (cu proțap)')}
        <div class="fld">
          <select value={String(val.inc_remorca_id || '')} onChange={(e) => setMulte({ inc_remorca_id: (e.target as HTMLSelectElement).value })}>
            <option value="">— Fără —</option>
            {lista.map((r) => <option value={String(r.id)}>{r.plate}{r.model ? ' · ' + r.model : ''}</option>)}
          </select>
          <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px">
            {lista.length ? 'Simulatorul o propune prima când alegi vehiculul ăsta.'
              : (vz.sa ? 'Firma n-are încă semiremorci trecute — le adaugi din Vehicule → Semiremorci și remorci.' : 'Firma n-are remorci cu proțap trecute — le adaugi din Vehicule → Semiremorci și remorci.')}
          </div>
          {lista.length > 0 && val.inc_remorca_id && (() => { const r = lista.find((x) => String(x.id) === String(val.inc_remorca_id)); return r ? <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">{remorcaText(r, meta)}</div> : null; })()}
        </div>
      </>}
      <div style="font-size:11.5px;color:var(--text-muted)">Sarcina utilă se scrie la „Greutăți & capacitate”; limitele pe axe, la „Config Camion”.</div>
    </div>
  );
}
