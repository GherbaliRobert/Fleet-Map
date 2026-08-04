import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { showToast } from '../app/store';
import { Api } from '../api/endpoints';
import type { EventType, NotifPref } from '../api/endpoints';
import { Icon } from '../components/Icon';
import './detail.css';
import './admin.css';

export function NotifPrefs() {
  const loc = useLocation();
  const [types, setTypes] = useState<EventType[] | null>(null);
  const [prefs, setPrefs] = useState<Record<string, NotifPref>>({});
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [et, pr] = await Promise.all([Api.eventTypes(), Api.notifPrefs()]);
        const saved = (pr && pr.types) || null;
        const init: Record<string, NotifPref> = {};
        for (const t of et) {
          const p = (saved && saved[t.key]) || null;
          init[t.key] = {
            // Un tip NOU (fără rând salvat) pornește activ, chiar dacă restul preferințelor există deja —
            // altfel ar apărea debifat, contrazicând serverul, care îl tratează ca implicit pornit.
            enabled: (saved && p) ? !!p.enabled : true,
            threshold: p && p.threshold != null ? p.threshold : (t.def != null ? t.def : undefined),
            email: !!(p && p.email),
            push: p ? !!p.push : !!(t as any).pushDefault,
          };
        }
        setPrefs(init); setTypes(et);
      } catch (e: any) { setErr(e?.message || 'Eroare la încărcare'); setTypes([]); }
    })();
  }, []);

  function upd(key: string, patch: Partial<NotifPref>) { setPrefs((p) => ({ ...p, [key]: { ...p[key], ...patch } })); }

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, NotifPref> = {};
      for (const k of Object.keys(prefs)) {
        const p = prefs[k];
        const out: NotifPref = { enabled: !!p.enabled, email: !!p.email, push: !!p.push };
        if (p.threshold != null && !isNaN(Number(p.threshold))) out.threshold = Number(p.threshold);
        body[k] = out;
      }
      await Api.saveNotifPrefs(body);
      showToast('Preferințe salvate');
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setSaving(false); }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')}><Icon name="chevronL" /></button>
        <div class="h-title">Preferințe notificări</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {types == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {types != null && types.length > 0 && (
          <>
            <div class="muted" style="font-size:12.5px;margin-bottom:12px">Alege ce evenimente îți generează notificări, pragul de declanșare și canalele de livrare.</div>
            {types.map((t) => {
              const p = prefs[t.key] || { enabled: false };
              return (
                <div class="np-card">
                  <div class="np-head">
                    <span class="np-lbl">{t.label}</span>
                    <button class={'sw' + (p.enabled ? ' on' : '')} role="switch" aria-checked={p.enabled} onClick={() => upd(t.key, { enabled: !p.enabled })} />
                  </div>
                  {p.enabled && (
                    <div class="np-sub">
                      {t.threshold && (
                        <div class="np-thr">
                          <label>{t.below ? 'Sub pragul' : 'Peste pragul'} de declanșare</label>
                          <input type="number" inputMode="decimal" value={p.threshold ?? ''} onInput={(e) => upd(t.key, { threshold: (e.target as HTMLInputElement).value as any })} />
                          <span style="font-size:12px;color:var(--text-muted);min-width:30px">{t.unit || ''}</span>
                        </div>
                      )}
                      <div class="np-chan">
                        <span class="np-cl"><Icon name="bell" size={15} /> Push (telefon)</span>
                        <button class={'sw' + (p.push ? ' on' : '')} role="switch" aria-checked={!!p.push} onClick={() => upd(t.key, { push: !p.push })} />
                      </div>
                      <div class="np-chan">
                        <span class="np-cl"><Icon name="mail" size={15} /> Email</span>
                        <button class={'sw' + (p.email ? ' on' : '')} role="switch" aria-checked={!!p.email} onClick={() => upd(t.key, { email: !p.email })} />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <button class="btn btn-primary btn-block" style="margin-top:8px" disabled={saving} onClick={save}>{saving ? 'Se salvează…' : 'Salvează preferințele'}</button>
          </>
        )}
      </div>
    </div>
  );
}
