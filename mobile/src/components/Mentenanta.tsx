// Mentenanța pe telefon: rândul unei lucrări, fereastra „Lucrare nouă" și acțiunile de pe rând (bifă,
// creion, coș, „Mută la Documente"). Aceleași piese în ecranul Mentenanță și în fișa mașinii (Service),
// ca pe web (mntCard + #mnt-modal), ca cele două locuri să nu se depărteze.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon, type IconName } from './Icon';
import { Confirma, Seg } from './FlotaUi';
import {
  type Catalog, clasaServis, durata, esteAct, metaLucrare, mntCand, mntCatMaiE, mntFacuta, mntRepeta, mntStare,
  nf, norm, numar, odoDinIo, optiuniVehicule, vehDe, zi10,
} from './flotaCommon';

const PILL_IC: Record<string, IconName> = { done: 'check', over: 'alert', soon: 'clock', none: 'alertO', ok: 'calendar' };

export function MntRand({ m, cat, canEdit, onDone, onEdit, onDelete, onMoveDoc, veh }: {
  m: any; cat: Catalog | null; canEdit: boolean; veh?: string;
  onDone: (m: any) => void; onEdit: (m: any) => void; onDelete: (m: any) => void; onMoveDoc: (m: any) => void;
}) {
  const st = mntStare(m), meta = metaLucrare(cat, m.type), done = mntFacuta(m), rep = mntRepeta(m);
  const bits = [veh, mntCand(m), m.description].filter(Boolean);
  const cost = parseFloat(m.cost) || 0;
  const act = esteAct(cat, m.type);
  return (
    <div class={'fl-r s-' + st + (done ? ' dn' : '')}>
      <div class="fl-rh">
        <span class={'fl-ic ' + meta.fam}><Icon name={meta.icon} size={17} /></span>
        <div class="fl-rt">
          <div class="fl-rn">{m.type}</div>
          {bits.length ? <div class="fl-rs">{bits.join(' · ')}</div> : null}
          {rep ? <div class="fl-rep"><Icon name="refresh" size={12} /> la {rep}</div> : null}
        </div>
        <span class={'fl-pill s-' + st}><Icon name={PILL_IC[st] || 'calendar'} size={12} />{mntCatMaiE(m)}</span>
      </div>
      {(cost || canEdit) ? (
        <div class="fl-rf">
          <span class="fl-lei">{cost ? <>{nf(Math.round(cost))} <small>RON</small></> : ''}</span>
          {canEdit && !done && <button class="fl-ab" aria-label="Bifează: am făcut-o" onClick={() => onDone(m)}><Icon name="check" size={17} /></button>}
          {canEdit && <button class="fl-ab" aria-label="Modifică" onClick={() => onEdit(m)}><Icon name="edit" size={16} /></button>}
          {canEdit && <button class="fl-ab dang" aria-label="Șterge" onClick={() => onDelete(m)}><Icon name="trash" size={16} /></button>}
        </div>
      ) : null}
      {act && (
        <div class="fl-warn">
          <span class="ic"><Icon name="fileBar" size={15} /></span>
          <span>„{m.type}” e un act, nu o lucrare la service.</span>
          {canEdit && <button class="fl-ab" onClick={() => onMoveDoc(m)}><Icon name="arrowRight" size={14} /> Mută la Documente</button>}
        </div>
      )}
    </div>
  );
}

// Kilometrajul de acum: întâi cel calculat de server pe lucrările mașinii (_odo), apoi din datele CAN.
export function kmAcum(imei: string, lucrari: any[] | null, devs: any[]): number | null {
  const r = (lucrari || []).find((m) => m.imei === imei && m._odo);
  if (r) return r._odo;
  const d = vehDe(devs, imei);
  return d ? odoDinIo(d.io_data) : null;
}

type Cheie = 'dueDate' | 'dueKm' | 'doneDate' | 'doneKm' | 'intKm' | 'intMo';

// Fereastra „Lucrare nouă" / „Modifici: …". Două moduri, ca pe web: „O programez" (scadență) și
// „Am făcut-o deja" (data și kilometrajul de atunci). Aplicația propune intervalul și scadența după
// felul mașinii; tot ce propune rămâne editabil, iar un câmp scris de om nu mai e rescris.
export function MntForm({ edit, imei0, lockImei, devs, cat, lucrari, onClose, onSaved, onIntervale }: {
  edit: any | null; imei0?: string; lockImei?: boolean; devs: any[]; cat: Catalog | null; lucrari: any[] | null;
  onClose: () => void; onSaved: () => void; onIntervale?: () => void;
}) {
  const work = cat ? cat.work.map((w) => w.type) : [];
  const tipCunoscut = (t: string) => work.some((w) => w === t);
  const [mode, setMode] = useState<'plan' | 'done'>(edit && mntFacuta(edit) ? 'done' : 'plan');
  const [imei, setImei] = useState<string>(edit ? edit.imei : (imei0 || ''));
  const [typeSel, setTypeSel] = useState<string>(edit ? (tipCunoscut(edit.type) ? edit.type : '__alt') : '');
  const [typeAlt, setTypeAlt] = useState<string>(edit && !tipCunoscut(edit.type) ? (edit.type || '') : '');
  const [desc, setDesc] = useState<string>(edit ? (edit.description || '') : '');
  const [cost, setCost] = useState<string>(edit && edit.cost != null ? String(edit.cost) : '');
  const [v, setV] = useState<Record<Cheie, string>>(() => ({
    dueDate: edit ? (zi10(edit.due_date) || '') : '',
    dueKm: edit && edit.due_km ? String(edit.due_km) : '',
    doneDate: edit ? (zi10(edit.done_date) || zi10(edit.done_at) || '') : '',
    doneKm: edit && edit.done_km ? String(edit.done_km) : '',
    intKm: edit && edit.interval_km ? String(edit.interval_km) : '',
    intMo: edit && edit.interval_months ? String(edit.interval_months) : '',
  }));
  // Câmpurile completate de aplicație (le poate rescrie la o nouă propunere). Ce scrie omul iese de aici.
  const [auto, setAuto] = useState<Set<Cheie>>(() => new Set());
  const [iv, setIv] = useState<any | null>(null);
  const [intreb, setIntreb] = useState<'' | 'fara' | 'act'>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { Api.maintIntervals().then(setIv).catch(() => setIv(null)); }, []);

  const type = typeSel === '__alt' ? typeAlt.trim() : typeSel;
  const dev = vehDe(devs, imei);
  const odo = imei ? kmAcum(imei, lucrari, devs) : null;
  const cls = dev ? clasaServis(dev, cat) : null;
  const interval = useMemo(() => {
    if (!iv || !Array.isArray(iv.rows) || !type || !cls) return null;
    const row = iv.rows.find((r: any) => norm(r.type) === norm(type));
    const x = row ? row[cls] : null;
    return x && (x.km || x.months) ? x as { km?: number; months?: number } : null;
  }, [iv, type, cls]);

  function scrie(k: Cheie, val: string) { setV((p) => ({ ...p, [k]: val })); setAuto((p) => { const n = new Set(p); n.delete(k); return n; }); }
  // Propunerea completează doar câmpurile goale sau puse tot de ea. La o lucrare deja salvată nu
  // completează nimic singură: cifrele din baza de date rămân cum erau, propunerea doar se arată.
  function propune(patch: Partial<Record<Cheie, string>>) {
    if (edit) return;
    const n = { ...v };
    const a = new Set(auto);
    let schimbat = false;
    (Object.keys(patch) as Cheie[]).forEach((k) => {
      const val = patch[k];
      if (val == null) return;
      if (a.has(k) || !String(v[k] || '').trim()) { if (n[k] !== val) { n[k] = val; schimbat = true; } a.add(k); }
    });
    if (schimbat) setV(n);
    setAuto(a);
  }
  useEffect(() => {
    if (edit) return;
    const p: Partial<Record<Cheie, string>> = {};
    if (mode === 'done') {
      p.doneDate = new Date().toISOString().slice(0, 10);
      if (odo) p.doneKm = String(odo);
    }
    if (interval) {
      p.intKm = interval.km ? String(interval.km) : '';
      p.intMo = interval.months ? String(interval.months) : '';
      if (mode === 'plan' && interval.km && odo) p.dueKm = String(odo + interval.km);
      if (mode === 'plan' && interval.months) { const d = new Date(); d.setMonth(d.getMonth() + interval.months); p.dueDate = d.toISOString().slice(0, 10); }
    }
    propune(p);
  }, [mode, imei, type, interval, odo]);

  async function salveaza(sarPeste?: 'fara' | 'act' | 'amandoua') {
    const body: any = {
      imei, type, description: desc.trim(),
      cost: parseFloat(cost) || null,
      interval_km: parseInt(v.intKm) || null,
      interval_months: parseInt(v.intMo) || null,
    };
    if (mode === 'done') {
      // Data aleasă e cea reală, nu „acum": o revizie notată peste o săptămână intră în istoric cu ziua ei.
      // Dacă data nu s-a schimbat, păstrăm momentul exact de atunci.
      const d = v.doneDate || null;
      body.status = 'done';
      body.done_date = d;
      body.done_km = parseInt(v.doneKm) || null;
      const vechi = edit && edit.done_at && (zi10(edit.done_date) || zi10(edit.done_at)) === d;
      body.done_at = vechi ? edit.done_at : (d ? new Date(d + 'T12:00:00').toISOString() : null);
      body.due_date = null; body.due_km = null;
    } else {
      body.status = 'pending';
      body.due_date = v.dueDate || null;
      body.due_km = parseInt(v.dueKm) || null;
      body.done_date = null; body.done_km = null; body.done_at = null;
    }
    if (!body.imei || !body.type) { showToast('Alege vehiculul și lucrarea', true); return; }
    const trecut = sarPeste === 'amandoua' ? ['fara', 'act'] : (sarPeste ? [sarPeste] : []);
    if (mode === 'plan' && !body.due_date && !body.due_km && trecut.indexOf('fara') < 0) { setIntreb('fara'); return; }
    if (esteAct(cat, body.type) && trecut.indexOf('act') < 0) { setIntreb('act'); return; }
    setIntreb('');
    setSaving(true);
    try {
      if (edit) await Api.updateMaintenance(edit.id, body); else await Api.createMaintenance(body);
      showToast(edit ? 'Salvat' : (mode === 'done' ? 'Salvată la „Făcute”' : 'Lucrare adăugată'));
      onSaved();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setSaving(false); }
  }

  // O lucrare programată, deschisă ca s-o notezi făcută: completăm ziua de azi și kilometrajul de acum, dar
  // doar la ALEGEREA modului — la deschiderea unei lucrări vechi nu se pune nimic de azi peste datele ei.
  function schimbaMod(k: string) {
    const m = k === 'done' ? 'done' : 'plan';
    setMode(m);
    if (edit && m === 'done' && !mntFacuta(edit)) {
      setV((p) => ({ ...p, doneDate: p.doneDate || new Date().toISOString().slice(0, 10), doneKm: p.doneKm || (odo ? String(odo) : '') }));
    }
  }

  const clasa = cls && cat ? cat.classes.find((c) => c.key === cls) : null;
  const optiuni = optiuniVehicule(devs);
  const fld = (k: Cheie, label: string, t: 'date' | 'number', ph?: string) => (
    <div class="fld"><label>{label}</label>
      <input type={t} value={v[k]} placeholder={ph} inputMode={t === 'number' ? 'numeric' : undefined}
        onInput={(e) => scrie(k, (e.target as HTMLInputElement).value)} />
    </div>
  );
  const titlu = edit ? 'Modifici: ' + (edit.type || 'lucrarea') : 'Lucrare nouă';

  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h">
          <b style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><Icon name="wrench" size={18} color="var(--accent)" /> {titlu}</b>
          <button class="h-btn" onClick={() => { if (!saving) onClose(); }} aria-label="Închide"><Icon name="x" /></button>
        </div>
        <div class="sheet-body">
          <div class="frm">
            {/* Fereastra făcea DOUĂ treburi cu aceleași câmpuri. Acum alegi de la început, ca pe web. */}
            <Seg value={mode} onChange={schimbaMod}
              items={[{ k: 'plan', label: 'O programez', icon: 'calendar' }, { k: 'done', label: 'Am făcut-o deja', icon: 'check' }]} />
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
            <div class="fld"><label>Lucrare <span class="req">*</span></label>
              <select value={typeSel} onChange={(e) => setTypeSel((e.target as HTMLSelectElement).value)}>
                <option value="">— alege lucrarea —</option>
                {work.map((t) => <option value={t}>{t}</option>)}
                <option value="__alt">Altele…</option>
              </select>
              {typeSel === '__alt' && <input type="text" value={typeAlt} placeholder="Scrie lucrarea" onInput={(e) => setTypeAlt((e.target as HTMLInputElement).value)} />}
            </div>
            <div class="fld"><label>Descriere</label>
              <input type="text" value={desc} placeholder="ex. ulei 5W30, filtru ulei + aer" onInput={(e) => setDesc((e.target as HTMLInputElement).value)} />
            </div>

            {mode === 'plan' ? (
              <div class="fl-fs">
                <div class="fl-fs-t">Când trebuie făcută</div>
                <div class="frm-row">{fld('dueDate', 'La data', 'date')}{fld('dueKm', 'La kilometraj', 'number', 'ex. 150000')}</div>
                <div class="fl-hint">Poți pune una, alta sau amândouă. Cu amândouă, se aprinde la prima care vine.</div>
              </div>
            ) : (
              <div class="fl-fs">
                <div class="fl-fs-t">Când am făcut-o</div>
                <div class="frm-row">{fld('doneDate', 'Data', 'date')}{fld('doneKm', 'Kilometrajul atunci', 'number', 'km')}</div>
                <div class="fl-hint">Completate cu ziua de azi și cu kilometrajul citit acum din mașină. Schimbă-le dacă lucrarea s-a făcut altă dată.</div>
              </div>
            )}

            {interval && type && (
              <div class="fl-prop">
                <div class="fl-prop-t"><Icon name="wrench" size={14} /> RA Tracks propune</div>
                <div>
                  La {(clasa && clasa.art) || 'un'} <b>{(clasa && (clasa.low || clasa.label)) || 'mașina asta'}</b>, „{type}” se face{' '}
                  {interval.km && interval.months
                    ? <>la fiecare <b>{nf(interval.km)} km</b> sau la <b>{durata(interval.months)}</b> — care vine prima.</>
                    : interval.km ? <>la fiecare <b>{nf(interval.km)} km</b>.</> : <>o dată la <b>{durata(interval.months)}</b>.</>}
                </div>
                {mode === 'plan' ? (() => {
                  const li: any[] = [];
                  if (interval.km && odo) li.push(<>la <b>{nf(odo + interval.km)} km</b></>);
                  else if (interval.km) li.push(<>la fiecare <b>{nf(interval.km)} km</b> — dar mașina nu-și raportează kilometrajul, așa că scrie tu de la ce cifră pornim</>);
                  if (interval.months) { const d = new Date(); d.setMonth(d.getMonth() + interval.months); li.push(<>pe <b>{d.toLocaleDateString('ro-RO')}</b></>); }
                  return li.length ? (
                    <div style="margin-top:6px">
                      {numar(devs, imei)}{odo ? <> are acum <b>{nf(odo)} km</b>, deci</> : null}:
                      <ul>{li.map((x) => <li>{x}</li>)}</ul>
                      {li.length > 1 ? <div>Te anunțăm la <b>prima</b> dintre ele.</div> : null}
                    </div>
                  ) : null;
                })() : (
                  <div style="margin-top:6px">După ce salvezi, următoarea scadență se programează singură, pornind de la data și kilometrajul pe care le pui mai sus.</div>
                )}
                <div class="f">
                  Poți scrie tu alte cifre mai jos.
                  {onIntervale ? <> Cifrele noastre se văd în fila <button type="button" class="fl-ab" style="height:30px;min-width:0;padding:0 8px" onClick={onIntervale}>Intervale ›</button></> : null}
                </div>
              </div>
            )}

            <div class="fl-fs">
              <div class="fl-fs-t">Se repetă</div>
              <div class="frm-row">{fld('intKm', 'La fiecare (km)', 'number', 'gol = nu se repetă')}{fld('intMo', 'La fiecare (luni)', 'number', 'gol = nu se repetă')}</div>
              <div class="fl-hint">{mode === 'done'
                ? 'Cu un interval pus aici, următoarea scadență se programează singură, pornind de la data și kilometrajul de mai sus.'
                : 'Când o bifezi ca făcută, următoarea scadență se creează singură.'}</div>
            </div>
            <div class="fld"><label>{mode === 'done' ? 'Cât a costat (RON)' : 'Cost estimat (RON)'}</label>
              <input type="number" inputMode="decimal" step="0.01" value={cost} placeholder="opțional" onInput={(e) => setCost((e.target as HTMLInputElement).value)} />
            </div>
            <div class="frm-actions">
              <button class="btn fl-btn2" disabled={saving} onClick={onClose}>Renunță</button>
              <button class="btn btn-primary" disabled={saving} onClick={() => salveaza()}>
                {saving ? 'Se salvează…' : (edit ? 'Salvează' : (mode === 'done' ? 'Salvează la „Făcute”' : 'Adaugă lucrarea'))}
              </button>
            </div>
          </div>
        </div>
      </div>
      {intreb === 'fara' && (
        <Confirma title="Fără termen" okLabel="Salvez fără termen" cancelLabel="Pun un termen" busy={saving}
          text={'Lucrarea n-are nici dată, nici kilometraj — deci nimeni n-o să-ți amintească de ea.\n\nO salvezi așa?'}
          onCancel={() => setIntreb('')} onOk={() => salveaza(esteAct(cat, type) ? 'fara' : 'amandoua')} />
      )}
      {intreb === 'act' && (
        <Confirma title="Ăsta e act, nu lucrare" okLabel="Salvează oricum" cancelLabel="Renunț" busy={saving}
          text={'„' + type + '” este un ACT, nu o lucrare la service.\n\nLocul lui e în Documente vehicule, unde ține minte valabilitatea și te anunță înainte să expire.\n\nÎl salvezi totuși aici?'}
          onCancel={() => setIntreb('')} onOk={() => salveaza('amandoua')} />
      )}
    </div>
  );
}

// Acțiunile de pe rând + fereastra, într-un singur loc: ecranul Mentenanță și fila Service din fișa
// mașinii le folosesc la fel. `reload` reîmprospătează lista celui care le-a cerut.
export function useMntOps({ reload, devs, cat, lucrari, lockImei, onIntervale }: {
  reload: () => void; devs: any[]; cat: Catalog | null; lucrari: any[] | null; lockImei?: boolean; onIntervale?: () => void;
}) {
  const [form, setForm] = useState<{ edit: any | null; imei?: string } | null>(null);
  const [ask, setAsk] = useState<{ kind: 'done' | 'del' | 'doc'; m: any } | null>(null);
  const [busy, setBusy] = useState(false);

  async function faBifa(m: any, costTxt?: string) {
    // Rândul întreg, ca pe web: serverul scrie toate coloanele, deci nimic din lucrare nu se pierde.
    const body: any = {};
    Object.keys(m).forEach((k) => { if (k[0] !== '_') body[k] = m[k]; });
    body.status = 'done';
    const c = parseFloat(String(costTxt || '').replace(',', '.'));
    if (isFinite(c) && c > 0) body.cost = c;
    setBusy(true);
    try { await Api.updateMaintenance(m.id, body); setAsk(null); showToast('Trecută la „Făcute”'); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(false); }
  }
  async function faStergere(m: any) {
    setBusy(true);
    try { await Api.deleteMaintenance(m.id); setAsk(null); showToast('Șters'); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare la ștergere', true); }
    finally { setBusy(false); }
  }
  async function faMutare(m: any) {
    setBusy(true);
    try {
      await Api.maintToDocument(m.id);
      setAsk(null);
      showToast('Mutat la Documente · ' + m.type + ' · ' + numar(devs, m.imei));
      reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la mutare', true); }
    finally { setBusy(false); }
  }

  const ops = {
    add: (imei?: string) => setForm({ edit: null, imei }),
    edit: (m: any) => setForm({ edit: m }),
    done: (m: any) => setAsk({ kind: 'done', m }),
    del: (m: any) => setAsk({ kind: 'del', m }),
    doc: (m: any) => setAsk({ kind: 'doc', m }),
  };

  let sheet: any = null;
  if (ask) {
    const m = ask.m, rep = mntRepeta(m), cost = parseFloat(m.cost) || 0;
    if (ask.kind === 'done') {
      sheet = (
        <Confirma title={m.type + ' — efectuat'} okLabel="Da, efectuat" busy={busy}
          text={'Trece la „Făcute”, cu data și ora de acum' + (m._odo ? ', la ' + nf(m._odo) + ' km' : '') + '.'
            + (rep ? '\n\nUrmătoarea scadență (la ' + rep + ') se creează singură.' : '')}
          field={{ label: 'Cât a costat? (lei — poți lăsa gol)', type: 'number', value: m.cost != null ? m.cost : '' }}
          onCancel={() => setAsk(null)} onOk={(val) => faBifa(m, val)} />
      );
    } else if (ask.kind === 'del') {
      sheet = (
        <Confirma title="Confirmare ștergere" okLabel="Șterge" danger busy={busy}
          text={mntFacuta(m) && cost
            ? 'Ștergi „' + m.type + '” dintre lucrările făcute?\n\nSe pierd și cei ' + nf(Math.round(cost)) + ' lei din totalul de service.'
            : 'Ștergi lucrarea „' + m.type + '”?'}
          onCancel={() => setAsk(null)} onOk={() => faStergere(m)} />
      );
    } else {
      sheet = (
        <Confirma title="Mută la Documente" okLabel="Mută" busy={busy}
          text={'Se mută „' + m.type + '” la Documente vehicule, pe ' + numar(devs, m.imei) + '.\n\nScadența devine data de expirare a actului, iar costul se păstrează. Din Mentenanță dispare.'}
          onCancel={() => setAsk(null)} onOk={() => faMutare(m)} />
      );
    }
  }

  const ui = (
    <>
      {form && (
        <MntForm edit={form.edit} imei0={form.imei} lockImei={lockImei} devs={devs} cat={cat} lucrari={lucrari}
          onClose={() => setForm(null)} onSaved={() => { setForm(null); reload(); }}
          onIntervale={onIntervale ? () => { setForm(null); onIntervale(); } : undefined} />
      )}
      {sheet}
    </>
  );
  return { ops, ui };
}
