import { useEffect, useRef, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { FmScreen, poartaFirma } from '../components/FirmaUi';
import { istFapta, istOre, istZi, istZile } from '../lib/activitate';
import { nrDe } from '../lib/numar';

// „Istoric activitate" (web: Setări → Evidență), pentru adminul firmei: cine s-a conectat și cine ce a
// modificat în contul firmei. Filtrul pe firmă îl pune serverul, nu telefonul. IP-ul NU se arată clientului.
//
// Timpul în aplicație: îl trimite DOAR aplicația web (semnalul „sunt în aplicație"). Aplicația de telefon nu-l
// trimite — hotărârea fondatorilor: nu strângem mai multe date despre activitatea oamenilor. Blocul o spune pe
// față, ca adminul să nu creadă că un om care lucrează doar de pe telefon nu lucrează deloc.
export function ActivityLog() {
  const p = poartaFirma('manageUsers', 'Istoric activitate', 'Istoricul e al unei firme');
  if (p) return p;
  return <ActivityLogEcran />;
}

const PERIOADE: [number, string][] = [[7, '7 zile'], [30, '30 de zile'], [90, '90 de zile']];
const FAMILII: [string, string][] = [['', 'Tot'], ['conectari', 'Conectări'], ['modificari', 'Modificări'], ['descarcari', 'Descărcări']];

function ActivityLogEcran() {
  const [zile, setZile] = useState(30);
  const [familie, setFamilie] = useState('');
  const [user, setUser] = useState('');
  const [rows, setRows] = useState<any[] | null>(null);
  const [total, setTotal] = useState(0);
  const [err, setErr] = useState('');
  const [maiMulte, setMaiMulte] = useState(false);
  // Prezența ține doar de perioadă (nu de familie sau de om), deci se cere doar când se schimbă perioada. Se ține
  // împreună cu perioada pentru care a venit: la schimbarea perioadei, cifrele vechi NU mai stau sub eticheta
  // nouă — până vine răspunsul, blocul arată că se încarcă. p === null = nu s-a putut citi.
  const [prez, setPrez] = useState<{ zile: number; p: any } | null>(null);
  const [oameni, setOameni] = useState<any[]>([]);
  const cerere = useRef(0); // un răspuns întârziat al filtrului vechi nu calcă peste cel nou
  const cererePrez = useRef(0);

  // Lista de oameni pentru filtru se citește o singură dată.
  useEffect(() => { Api.users().then((l) => setOameni(Array.isArray(l) ? l : [])).catch(() => setOameni([])); }, []);

  async function incarca() {
    const n = ++cerere.current;
    setRows(null); setErr('');
    try {
      const d = await Api.activity({ zile, offset: 0, familie, user });
      if (n !== cerere.current) return;
      setRows((d && d.randuri) || []); setTotal((d && d.total) || 0);
    } catch (e: any) {
      if (n !== cerere.current) return;
      setErr(e?.message || 'Nu s-a putut citi istoricul.'); setRows([]);
    }
  }
  useEffect(() => { incarca(); }, [zile, familie, user]);

  // Prezența nu e vitală: dacă nu vine, rămâne jurnalul, iar blocul spune că n-a putut-o citi.
  useEffect(() => {
    const n = ++cererePrez.current;
    Api.presence(zile)
      .then((p) => { if (n === cererePrez.current) setPrez({ zile, p: p || null }); })
      .catch(() => { if (n === cererePrez.current) setPrez({ zile, p: null }); });
  }, [zile]);

  async function incaMulte() {
    if (maiMulte || !rows) return;
    const n = cerere.current;
    setMaiMulte(true);
    try {
      const d = await Api.activity({ zile, offset: rows.length, familie, user });
      if (n !== cerere.current) return;
      setRows((l) => (l || []).concat((d && d.randuri) || [])); setTotal((d && d.total) || 0);
    } catch (e: any) { if (n === cerere.current) setErr(e?.message || 'Nu s-a putut citi istoricul.'); }
    finally { setMaiMulte(false); }
  }

  const acum = Date.now();
  let ziCurenta: string | null = null;

  return (
    <FmScreen titlu="Istoric activitate">
      <p class="fm-note">Cine s-a conectat și cine ce a modificat în contul firmei. Se păstrează automat, nu se poate șterge din aplicație.</p>

      <div class="fm-chips">
        {PERIOADE.map(([v, et]) => (
          <button class={'fm-chip' + (zile === v ? ' on' : '')} aria-pressed={zile === v} onClick={() => setZile(v)}>{et}</button>
        ))}
      </div>
      <div class="fm-chips scroll">
        {FAMILII.map(([v, et]) => (
          <button class={'fm-chip' + (familie === v ? ' on' : '')} aria-pressed={familie === v} onClick={() => setFamilie(v)}>{et}</button>
        ))}
      </div>
      <div class="fm-bar">
        <select class="fm-in" value={user} onChange={(e) => setUser((e.target as HTMLSelectElement).value)} aria-label="Omul">
          <option value="">Toți oamenii</option>
          {oameni.map((u) => <option value={String(u.id)}>{u.full_name || u.username}</option>)}
        </select>
      </div>

      <Prezenta p={prez && prez.zile === zile ? prez.p : undefined} zile={zile} />

      {err && <div class="fm-msg rau" role="alert"><Icon name="alert" size={17} color="var(--red)" /><span>{err}</span></div>}
      {rows == null && <div class="fm-empty"><div class="spin" style="margin:0 auto" /></div>}
      {rows != null && !rows.length && !err && (
        <div class="fm-empty">
          <Icon name="clock" size={36} color="var(--text-muted)" />
          <b>Nimic în perioada asta</b>
          Schimbă perioada sau filtrele de mai sus.
        </div>
      )}
      {rows != null && rows.length > 0 && (
        <>
          <div class="fm-sec" style="color:var(--text-secondary)">{nrDe(total, 'acțiune', 'acțiuni')} în perioada aleasă</div>
          {rows.map((r) => {
            const z = istZi(r.created_at, acum);
            const cap = z !== ziCurenta ? z : null;
            ziCurenta = z;
            const f = istFapta(r);
            const ora = new Date(r.created_at).toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
            return (
              <>
                {cap && <div class="fm-zi">{cap}</div>}
                <div class="fm-act">
                  <span class="ic-w"><Icon name={f.ic} size={15} color={f.col} /></span>
                  <div class="t">
                    <b>{r.username || 'cineva'}</b> {f.verb}{f.obiect ? ' ' + f.obiect : ''}{f.tinta ? <> <b>{f.tinta}</b></> : null}
                  </div>
                  <div class="o">{ora}</div>
                </div>
              </>
            );
          })}
          {rows.length < total && (
            <button class="fm-btn" style="width:100%;margin-top:12px" disabled={maiMulte} onClick={incaMulte}>
              {maiMulte ? <><div class="spin" style="width:15px;height:15px;border-width:2px" /> Se încarcă…</> : 'Mai vezi ' + Math.min(50, total - rows.length)}
            </button>
          )}
        </>
      )}
    </FmScreen>
  );
}

// „Cât stau oamenii în aplicație" — procentul din timpul echipei, cu ora exactă alături, ca să nu fie citit
// greșit (50% dintr-o oră nu e 50% din o sută de ore). p: undefined = se încarcă, null = nu s-a putut citi.
function Prezenta({ p, zile }: { p: any; zile: number }) {
  const oameni: any[] = (p && Array.isArray(p.oameni)) ? p.oameni : [];
  const total = (p && p.minuteTotal) || 0;
  const pas = (p && p.pasMinute) || 5;
  return (
    <div class="fm-card pad">
      <h3 style="margin-top:0"><Icon name="clock" size={15} /> Cât stau oamenii în aplicația web <span style="font-weight:600;text-transform:none;letter-spacing:0;color:var(--text-muted)">· ultimele {istZile(zile)}</span></h3>
      {p === undefined ? (
        <div class="muted" style="display:flex;align-items:center;gap:8px;font-size:13px"><div class="spin" style="width:15px;height:15px;border-width:2px" /> Se încarcă…</div>
      ) : p === null ? (
        <div class="muted" style="font-size:13px;line-height:1.5">Nu s-a putut citi timpul petrecut în aplicația web. Jurnalul de mai jos nu e afectat.</div>
      ) : !oameni.length ? (
        <div class="muted" style="font-size:13px;line-height:1.5">Încă nu s-a strâns nimic din aplicația web. Măsurarea pornește odată cu prima intrare în aplicația web de acum înainte.</div>
      ) : oameni.map((o) => {
        const pct = total ? Math.round((o.minute / total) * 100) : 0;
        return (
          <div class="fm-prez-r">
            <div class="fm-prez-n"><b>{o.full_name || o.username}</b><span>{istOre(o.minute)} · {istZile(o.zile)}</span></div>
            <div class="fm-prez-b"><span class="bar"><i style={'width:' + Math.max(pct, 2) + '%'} /></span><span class="pct">{pct}%</span></div>
          </div>
        );
      })}
      <div class="muted" style="font-size:12px;line-height:1.5;margin-top:10px">
        Se numără <b>doar timpul petrecut în aplicația web</b>, cu fereastra deschisă și în față, în pași de {pas} minute. <b>Aplicația de telefon nu trimite acest semnal</b>: cine lucrează doar de pe telefon nu apare aici, iar timpul de pe telefon nu se adună la nimeni. Procentul e din totalul echipei, pe perioada aleasă.
      </div>
    </div>
  );
}
