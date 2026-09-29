// Piesele mici de interfață din zona „Flota administrată": filele, căutarea, cardurile de cost, grupa
// pliabilă și foaia de confirmare. Aceleași în Mentenanță, Documente, Șoferi, Grupe și Alerte, ca
// ecranele să arate și să se poarte la fel (pe web au tot un singur aspect comun, .mnt-*).
import { useState } from 'preact/hooks';
import { Icon, type IconName } from './Icon';
import { nf } from './flotaCommon';
import '../screens/detail.css';
import '../screens/admin.css';
import '../screens/flota.css';

export function Seg({ items, value, onChange }: { items: { k: string; label: string; icon?: IconName }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div class="fl-seg" role="tablist">
      {items.map((it) => (
        <button role="tab" aria-selected={value === it.k} class={value === it.k ? 'on' : ''} onClick={() => onChange(it.k)}>
          {it.icon && <Icon name={it.icon} size={15} />}<span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

export function Cautare({ value, onInput, placeholder, count }: { value: string; onInput: (v: string) => void; placeholder: string; count?: string }) {
  return (
    <div class="fl-top">
      <div class="fl-search">
        <span class="ic"><Icon name="search" size={16} /></span>
        <input type="search" value={value} placeholder={placeholder} onInput={(e) => onInput((e.target as HTMLInputElement).value)} />
      </div>
      {count ? <span class="fl-count">{count}</span> : null}
    </div>
  );
}

// Luna / Anul / Total — ascunse când toate sunt zero (web: costCards).
export function Costuri({ c, totalLabel, icon }: { c: { luna: number; an: number; total: number; year: number }; totalLabel: string; icon: IconName }) {
  if (!c.luna && !c.an && !c.total) return null;
  const v = (n: number) => <>{nf(Math.round(n))} <small>RON</small></>;
  return (
    <div class="fl-costs">
      <div class="fl-cost"><div class="l"><Icon name={icon} size={10} /> Luna aceasta</div><div class="v">{v(c.luna)}</div></div>
      <div class="fl-cost"><div class="l">Anul {c.year}</div><div class="v">{v(c.an)}</div></div>
      <div class="fl-cost tot"><div class="l">{totalLabel}</div><div class="v">{v(c.total)}</div></div>
    </div>
  );
}

// O grupă pliabilă (o mașină, o grupă de vehicule, un tip de alertă). Capul e un singur buton mare.
export function Grupa({ open, onToggle, title, sub, badge, lead, extra, children }: {
  open: boolean; onToggle: () => void; title: any; sub?: any; badge?: any; lead?: any; extra?: any; children?: any;
}) {
  return (
    <div class={'fl-g' + (open ? ' open' : '')}>
      <div style="display:flex;align-items:center">
        <button class="fl-gh" onClick={onToggle} aria-expanded={open}>
          <span class="fl-caret"><Icon name="chevronR" size={17} /></span>
          {lead}
          <span class="fl-gt">
            <div class="fl-gp">{title}</div>
            {sub ? <div class="fl-gm">{sub}</div> : null}
          </span>
          {badge}
        </button>
        {extra}
      </div>
      {open && children ? <div class="fl-gb">{children}</div> : null}
    </div>
  );
}

// Foaie de confirmare, cu întrebarea scrisă ca pe web. `field` = o casetă (ex. „Cât a costat?").
export function Confirma({ title, text, okLabel, danger, field, busy, onOk, onCancel, cancelLabel }: {
  title: string; text: any; okLabel: string; danger?: boolean; busy?: boolean; cancelLabel?: string;
  field?: { label: string; type?: string; value?: any; placeholder?: string };
  onOk: (val?: string) => void; onCancel: () => void;
}) {
  const [val, setVal] = useState<string>(field && field.value != null ? String(field.value) : '');
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div class="sheet">
        <div class="sheet-h"><b>{title}</b><button class="h-btn" onClick={() => { if (!busy) onCancel(); }} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div style="font-size:14.5px;line-height:1.5;margin:0 0 14px;white-space:pre-line">{text}</div>
          {field && (
            <div class="fld" style="margin-bottom:14px">
              <label>{field.label}</label>
              <input type={field.type || 'text'} inputMode={field.type === 'number' ? 'decimal' : undefined} value={val}
                placeholder={field.placeholder} onInput={(e) => setVal((e.target as HTMLInputElement).value)} />
            </div>
          )}
          <div class="frm-actions">
            <button class="btn fl-btn2" disabled={busy} onClick={onCancel}>{cancelLabel || 'Renunță'}</button>
            <button class={'btn ' + (danger ? 'btn-danger-ghost' : 'btn-primary')} disabled={busy} onClick={() => onOk(val)}>{busy ? '…' : okLabel}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Poza unui act, deschisă peste ecran (PDF-urile se deschid în afara aplicației).
export function Poza({ url, title, onClose }: { url: string; title: string; onClose: () => void }) {
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h"><b>{title}</b><button class="h-btn" onClick={onClose} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body"><img class="fl-img" src={url} alt={title} /></div>
      </div>
    </div>
  );
}
