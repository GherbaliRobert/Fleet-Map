import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import type { ComponentChildren } from 'preact';
import { Api } from '../api/endpoints';
import { Icon, type IconName } from '../components/Icon';
import { AntetFondator } from '../components/FondatorUi';
import './admin.css';
import './fondator.css';

// „Acasă" (Gestiune) — cele 4 cartonașe-sumar ale fondatorului, ca pe web (loadAdminDash): cifra, dedesubt starea
// („1 fără contract · 0 restanțe", „2 n-au intrat niciodată", „istoric păstrat 2 ani"), iar „Vezi detalii în <rândul
// din meniu>" duce în pagina unde se lucrează. Cartonașul e SUMAR, nu loc de lucru (hotărât 17.09). Portocaliul se
// aprinde doar când chiar e ceva de rezolvat. Cifrele vin de la server (/api/admin/counts).
const PRAG_ZILE = 60; // același prag ca în Dispozitive arhivate: „pe ducă" = se șterge în cel mult atâtea zile

type Card = { cheie: string; icon: IconName; titlu: string; ruta: string; meniu: string };
// „Vezi detalii în …" scrie EXACT numele rândului din meniu (ca _RAX_NUME pe web), ca să nu se despartă.
const CARDURI: Card[] = [
  { cheie: 'companies', icon: 'building', titlu: 'Companii', ruta: '/admin/companies', meniu: 'Companii' },
  { cheie: 'users', icon: 'user', titlu: 'Utilizatori', ruta: '/admin/users', meniu: 'Utilizatori' },
  { cheie: 'devices', icon: 'cpu', titlu: 'Dispozitive active', ruta: '/admin/devices', meniu: 'Dispozitive' },
  { cheie: 'archived', icon: 'archive', titlu: 'Arhivate', ruta: '/admin/archived', meniu: 'Dispozitive arhivate' },
];

export function FounderHome() {
  const loc = useLocation();
  const [c, setC] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [subUsers, setSubUsers] = useState<ComponentChildren>(null);
  const [subArh, setSubArh] = useState<{ t: ComponentChildren; warn: boolean } | null>(null);

  function reload() {
    setErr('');
    Api.adminCounts().then((x) => {
      setC(x);
      // Rândul de stare al arhivei: lista mare o cerem DOAR dacă există aparate arhivate.
      const n = Number(x && x.archived_devices) || 0;
      if (!n) { setSubArh(null); return; }
      Api.archivedDevices().then((rows) => {
        if (!Array.isArray(rows)) return;
        const peDuca = rows.filter((d: any) => d.purge_zile != null && d.purge_zile > 0 && d.purge_zile <= PRAG_ZILE).length;
        const sters = rows.filter((d: any) => d.purge_zile != null && d.purge_zile <= 0).length;
        if (peDuca) setSubArh({ t: <span style="color:var(--fd-warn)">{peDuca} cu istoricul pe ducă</span>, warn: true });
        else if (sters) setSubArh({ t: sters + ' fără istoric', warn: false });
        else setSubArh({ t: 'istoric păstrat 2 ani', warn: false });
      }).catch(() => setSubArh(null));
    }).catch((e: any) => setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare de rețea.')));
    // Cine n-a intrat niciodată (last_login lipsă) — ușa pe care n-a trecut nimeni: invitația a căzut în spam.
    Api.users().then((u) => {
      const l = Array.isArray(u) ? u : [];
      const nic = l.filter((x: any) => !x.last_login).length;
      setSubUsers(nic ? <span style="color:var(--fd-warn)">{nic}{nic === 1 ? ' n-a intrat niciodată' : ' n-au intrat niciodată'}</span> : (l.length ? 'toți au intrat' : null));
    }).catch(() => setSubUsers(null));
  }
  useEffect(reload, []);

  const num = (v: any) => (c == null || v == null ? '–' : String(v));
  function sub(k: string): { t: ComponentChildren; warn: boolean } | null {
    if (!c) return null;
    if (k === 'companies') {
      const fc = Number(c.companies_fara_contract) || 0, rs = Number(c.companies_restante) || 0;
      if (!fc && !rs) return { t: 'toate în regulă', warn: false };
      return {
        t: <><span style={'color:' + (fc ? 'var(--fd-bad)' : 'var(--text-muted)')}>{fc} fără contract</span> · <span style={'color:' + (rs ? 'var(--fd-warn)' : 'var(--text-muted)')}>{rs}{rs === 1 ? ' restanță' : ' restanțe'}</span></>,
        warn: false,
      };
    }
    if (k === 'users') return subUsers ? { t: subUsers, warn: false } : null;
    if (k === 'archived') return subArh;
    return null;
  }
  const valoare = (k: string) => (k === 'companies' ? num(c && c.companies) : k === 'users' ? num(c && c.users) : k === 'devices' ? num(c && c.active_devices) : num(c && c.archived_devices));

  return (
    <div class="screen">
      <AntetFondator titlu="Acasă" onBack={() => loc.route('/meniu')} onRefresh={reload} />
      <div class="content has-tabbar" style="padding-bottom:24px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        <div style="display:flex;flex-direction:column;gap:10px">
          {CARDURI.map((k) => {
            const s = sub(k.cheie);
            return (
              <button type="button" class={'fd-kpi' + (s && s.warn ? ' warn' : '')} style="text-align:left;font-family:inherit;color:var(--text-primary);width:100%" onClick={() => loc.route(k.ruta)}>
                <div class="cap"><Icon name={k.icon} size={13} /> {k.titlu}</div>
                <div class="v">{valoare(k.cheie)}</div>
                {s && <div class="sub">{s.t}</div>}
                <div class="jos" style="color:var(--fd-ok);font-weight:700;display:flex;align-items:center;gap:4px">Vezi detalii în {k.meniu} <Icon name="arrowRight" size={13} /></div>
              </button>
            );
          })}
        </div>
        <div class="fd-note" style="margin-top:16px">
          Cifrele de mai sus sunt un sumar. Apasă „Vezi detalii" pe oricare ca să deschizi secțiunea întreagă, unde poți și modifica.
        </div>
      </div>
    </div>
  );
}
