import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Icon, type IconName } from './Icon';
import { showToast } from '../app/store';
import '../screens/detail.css'; // .sheet*, .btn*
import '../screens/admin.css';

export type FieldType = 'text' | 'tel' | 'email' | 'date' | 'number' | 'textarea' | 'color' | 'select' | 'chips';
export interface FieldDef {
  key: string;
  label: string;
  type?: FieldType;
  required?: boolean;
  placeholder?: string;
  options?: { value: string; label: string; group?: string; hi?: boolean; title?: string }[];
  half?: boolean;       // pune două câmpuri pe un rând
  default?: any;
  // `chips`: bife multiple, salvate ca listă separată prin virgulă („B,C,CE"). `group` le împarte pe
  // rânduri, `hi` le scoate în evidență (ex: categoriile profesioniste). `note` desenează un rând sub
  // câmp, recalculat la fiecare bifă — acolo spunem ce înseamnă alegerea, nu într-un ajutor separat.
  note?: (value: string) => any;
}
export interface CrudConfig {
  title: string;
  icon: IconName;
  addLabel: string;
  empty: string;
  load: () => Promise<any[]>;
  fields: FieldDef[];
  create: (body: any) => Promise<any>;
  update?: (id: number, body: any) => Promise<any>;
  remove?: (id: number) => Promise<any>;
  itemTitle: (it: any) => string;
  itemSub?: (it: any) => string;
  itemRight?: (it: any) => any;
  canWrite: boolean;
  filter?: { field: string; options: { value: string; label: string }[] }; // dropdown opțional (ex: companie, super-admin)
  renderExtra?: (item: any) => any; // secțiune extra în sheet-ul de editare (doar item existent) — ex: program de lucru
}

function dateInput(v: any): string {
  if (!v) return '';
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

export function AdminCrud({ cfg }: { cfg: CrudConfig }) {
  const loc = useLocation();
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [editing, setEditing] = useState<any | null>(null); // item sau {} pentru nou
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState<any | null>(null);
  const [filterVal, setFilterVal] = useState('');

  async function reload() {
    setErr('');
    try { setItems(await cfg.load()); }
    catch (e: any) { setErr(e?.status === 403 ? 'Nu ai permisiunea de administrare.' : (e?.message || 'Eroare la încărcare')); setItems([]); }
  }
  useEffect(() => { reload(); }, [cfg.title]);

  function openNew() {
    const f: Record<string, any> = {};
    for (const fd of cfg.fields) f[fd.key] = fd.default != null ? fd.default : (fd.type === 'color' ? '#3FE07D' : '');
    setForm(f); setEditing({});
  }
  function openEdit(it: any) {
    const f: Record<string, any> = {};
    for (const fd of cfg.fields) {
      const raw = it[fd.key];
      f[fd.key] = fd.type === 'date' ? dateInput(raw) : (raw != null ? raw : '');
    }
    setForm(f); setEditing(it);
  }

  function setF(k: string, v: any) { setForm((p) => ({ ...p, [k]: v })); }

  async function save() {
    for (const fd of cfg.fields) {
      if (fd.required && !String(form[fd.key] ?? '').trim()) { showToast(`Completează „${fd.label}”`, true); return; }
    }
    const body: Record<string, any> = {};
    for (const fd of cfg.fields) {
      let v: any = form[fd.key];
      if (v === '' || v == null) { body[fd.key] = null; continue; }
      if (fd.type === 'number') { const n = Number(v); body[fd.key] = isNaN(n) ? null : n; }
      else body[fd.key] = v;
    }
    setSaving(true);
    try {
      if (editing && editing.id != null && cfg.update) await cfg.update(editing.id, body);
      else await cfg.create(body);
      showToast(editing && editing.id != null ? 'Salvat' : 'Adăugat');
      setEditing(null); await reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setSaving(false); }
  }

  async function doDelete(it: any) {
    if (!cfg.remove) return;
    setSaving(true);
    try { await cfg.remove(it.id); showToast('Șters'); setConfirmDel(null); setEditing(null); await reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare la ștergere', true); }
    finally { setSaving(false); }
  }

  const shown = items == null ? [] : ((cfg.filter && filterVal) ? items.filter((it) => String(it[cfg.filter!.field] ?? '') === filterVal) : items);

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">{cfg.title}</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        {cfg.filter && items != null && items.length > 0 && (
          <div class="adm-filter">
            <select value={filterVal} onChange={(e: any) => setFilterVal(e.target.value)}>
              <option value="">Toate companiile</option>
              {cfg.filter.options.map((o) => <option value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && shown.length === 0 && !err && (
          <div class="adm-empty"><Icon name={cfg.icon} size={40} class="ic" /><div>{filterVal ? 'Niciun rezultat pentru filtrul ales.' : cfg.empty}</div></div>
        )}
        {items != null && shown.length > 0 && (
          <div class="adm-list">
            {shown.map((it) => (
              <button class="adm-item" onClick={() => cfg.canWrite ? openEdit(it) : undefined}>
                <span class="ic-wrap"><Icon name={cfg.icon} size={19} /></span>
                <span class="mid">
                  <div class="nm">{cfg.itemTitle(it)}</div>
                  {cfg.itemSub && <div class="sub">{cfg.itemSub(it)}</div>}
                </span>
                <span class="rt">
                  {cfg.itemRight && cfg.itemRight(it)}
                  {cfg.canWrite && <Icon name="chevronR" size={18} color="var(--text-muted)" />}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {cfg.canWrite && (
        <button class="fab" onClick={openNew} aria-label={cfg.addLabel}><Icon name="plus" size={26} color="#06210f" /></button>
      )}

      {editing && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) setEditing(null); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b><Icon name={cfg.icon} size={18} color="var(--accent)" /> {editing.id != null ? 'Editează' : cfg.addLabel}</b>
              <button class="h-btn" onClick={() => setEditing(null)}><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              <div class="frm">
                {renderFields(cfg.fields, form, setF)}
                <div class="frm-actions">
                  {editing.id != null && cfg.remove && (
                    <button class="btn btn-danger-ghost" disabled={saving} onClick={() => setConfirmDel(editing)}><Icon name="trash" size={16} /></button>
                  )}
                  <button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se salvează…' : 'Salvează'}</button>
                </div>
              </div>
              {editing.id != null && cfg.renderExtra && (
                <div key={'extra-' + editing.id} style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
                  {cfg.renderExtra(editing)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {confirmDel && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) setConfirmDel(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b>Confirmare ștergere</b><button class="h-btn" onClick={() => setConfirmDel(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <p style="margin:0 0 16px;font-size:14.5px">Sigur ștergi „<b>{cfg.itemTitle(confirmDel)}</b>”? Acțiunea nu poate fi anulată.</p>
              <div class="frm-actions">
                <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" onClick={() => setConfirmDel(null)}>Anulează</button>
                <button class="btn btn-danger-ghost" disabled={saving} onClick={() => doDelete(confirmDel)}>{saving ? '…' : 'Șterge'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function renderFields(fields: FieldDef[], form: Record<string, any>, setF: (k: string, v: any) => void) {
  const out: any[] = [];
  for (let i = 0; i < fields.length; i++) {
    const fd = fields[i];
    if (fd.half && fields[i + 1] && fields[i + 1].half) {
      out.push(<div class="frm-row">{field(fd, form, setF)}{field(fields[i + 1], form, setF)}</div>);
      i++;
    } else {
      out.push(field(fd, form, setF));
    }
  }
  return out;
}

function field(fd: FieldDef, form: Record<string, any>, setF: (k: string, v: any) => void) {
  const val = form[fd.key] ?? '';
  const onInput = (e: any) => setF(fd.key, e.target.value);
  let ctrl;
  if (fd.type === 'textarea') {
    ctrl = <textarea value={val} placeholder={fd.placeholder} onInput={onInput} rows={3} />;
  } else if (fd.type === 'select') {
    ctrl = (
      <select value={val} onChange={onInput}>
        <option value="">{fd.placeholder || '— alege —'}</option>
        {(fd.options || []).map((o) => <option value={o.value}>{o.label}</option>)}
      </select>
    );
  } else if (fd.type === 'chips') {
    // Valoarea stă tot ca string („B,C,CE") — la fel ca pe web și ca în bază. Serverul o normalizează
    // oricum (license_cats.format), deci nu ne batem capul aici cu ordinea sau cu duplicatele.
    const sel = String(val).split(',').map((s) => s.trim()).filter(Boolean);
    const toggle = (code: string) => {
      const i = sel.indexOf(code);
      const next = i >= 0 ? sel.filter((c) => c !== code) : sel.concat(code);
      setF(fd.key, next.join(','));
    };
    const opts = fd.options || [];
    const grupe: string[] = [];
    for (const o of opts) { const g = o.group || ''; if (grupe.indexOf(g) < 0) grupe.push(g); }
    ctrl = (
      <div class="chips">
        {grupe.map((g) => (
          <div class="chips-g">
            {g && <span class="chips-gt">{g}</span>}
            <div class="chips-b">
              {opts.filter((o) => (o.group || '') === g).map((o) => (
                <button type="button" title={o.title || o.label}
                  class={'chip' + (sel.indexOf(o.value) >= 0 ? ' on' : '') + (o.hi ? ' hi' : '')}
                  onClick={() => toggle(o.value)}>{o.label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  } else {
    ctrl = <input type={fd.type || 'text'} value={val} placeholder={fd.placeholder} onInput={onInput}
      inputMode={fd.type === 'number' ? 'numeric' : fd.type === 'tel' ? 'tel' : undefined} />;
  }
  return (
    <div class="fld">
      <label>{fd.label}{fd.required && <span class="req"> *</span>}</label>
      {ctrl}
      {fd.note && fd.note(String(val))}
    </div>
  );
}
