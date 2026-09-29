import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './admin.css';
import './oferte.css';

// Super-admin: „Prețurile noastre" — tot ce CEREM și tot ce ne COSTĂ, într-un singur tablou (ca pe web,
// Ofertare Live → „Prețurile noastre"). Rândurile, cheile și valorile de acum NU sunt scrise aici: vin de la
// server, din chiar pagina web (`_PRET_GRUPURI` + ce ar pune ea în câmpuri), prin `/api/admin/offers/calc`.
//
// Pe telefon se socotesc doar două lucruri de PRIVIT, ca pe web (`raxOfPretMarja`), care nu se țin minte
// nicăieri: echivalentul în cealaltă monedă sub fiecare cifră și „rămâne" = cerem − ne costă, pe rând.
// Ce lași gol rămâne GOL: „nu știm cât ne costă" nu e „ne costă zero".
//
// Salvarea trimite TOATE cheile (tarife, costuri, cursul): serverul rescrie costurile de la zero la fiecare
// salvare, deci o cheie netrimisă s-ar șterge.
//
// Se deschide ca ecran (din lista de oferte) sau peste calculator (din rezumat), fără să piardă oferta în lucru.
type Grup = { t: string; um: string; nota?: string; curs?: boolean; randuri: [string | null, string, string | null][] };
const text = (v: any) => (v == null ? '' : String(v));
const curata = (v: string) => v.replace(/,/g, '.').replace(/[^0-9.]/g, '');

export function OurPrices(props: { peste?: boolean; onInchide?: () => void; onSalvat?: () => void }) {
  const loc = useLocation();
  const [grupuri, setGrupuri] = useState<Grup[] | null>(null);
  const [tp, setTp] = useState<Record<string, string>>({});
  const [tc, setTc] = useState<Record<string, string>>({});
  const [fx, setFx] = useState(0);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Api.offerCalc({ preturi: true }).then((j: any) => {
      const p = (j && j.preturi) || {};
      const v = p.valori || { tp: {}, tc: {} };
      const a: Record<string, string> = {}, b: Record<string, string> = {};
      Object.keys(v.tp || {}).forEach((k) => { a[k] = text(v.tp[k]); });
      Object.keys(v.tc || {}).forEach((k) => { b[k] = text(v.tc[k]); });
      setTp(a); setTc(b); setFx(Number(j && j.fx && j.fx.eur) || 0);
      setGrupuri(Array.isArray(p.grupuri) ? p.grupuri : []);
    }).catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setGrupuri([]); });
  }, []);

  const inchide = () => { if (props.onInchide) props.onInchide(); else loc.route('/admin/offers'); };

  async function gata() {
    if (!grupuri) return;
    const tarife: Record<string, any> = {}, costuri: Record<string, any> = {};
    let curs: string = '';
    grupuri.forEach((g) => g.randuri.forEach((r) => {
      if (r[0] === 'cursEur') { curs = tp.cursEur || ''; return; }   // cursul nu e tarif: pleacă pe cheia lui
      if (r[0]) tarife[r[0]] = tp[r[0]] !== '' && tp[r[0]] != null ? tp[r[0]] : null;
      if (r[2]) costuri[r[2]] = tc[r[2]] !== '' && tc[r[2]] != null ? tc[r[2]] : null;
    }));
    setBusy(true);
    try {
      await Api.saveSystemSettings({ tarife_lista: tarife, costuri_noastre: costuri, curs_eur: curs });
      showToast('Prețurile noastre, salvate ✓');
      // Ca la calculator: după salvare, lista înlocuiește ecranul în istoric („Înapoi" nu mai redeschide prețurile).
      if (props.onSalvat) props.onSalvat(); else loc.route('/admin/offers', true);
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(false); }
  }

  // Sub fiecare cifră, echivalentul în cealaltă monedă (grupul spune în ce e scrisă). Zero n-are echivalent.
  function ech(v: string, um: string): string {
    const n = parseFloat(v);
    if (!Number.isFinite(n) || n <= 0 || !(fx > 0)) return '';
    return um === '€' ? '≈ ' + (n * fx).toFixed(n < 20 ? 1 : 0) + ' lei' : '≈ ' + (n / fx).toFixed(n < 100 ? 1 : 0) + ' €';
  }
  // „Rămâne" pe rând, cât scrii: + / − și procentul din ce cerem. Gol dacă lipsește una din cifre.
  function ramane(kP: string | null, kC: string | null): { t: string; c: string } {
    const vp = kP && tp[kP] !== '' && tp[kP] != null ? parseFloat(tp[kP]) : null;
    const vc = kC && tc[kC] !== '' && tc[kC] != null ? parseFloat(tc[kC]) : null;
    if (vp == null || vc == null || !Number.isFinite(vp) || !Number.isFinite(vc)) return { t: '', c: '' };
    const m = vp - vc;
    return {
      t: (m > 0 ? '+' : '') + (Math.round(m * 100) / 100) + (vp > 0 ? ' · ' + Math.round((m / vp) * 100) + '%' : ''),
      c: m > 0 ? 'var(--of-ok)' : (m < 0 ? 'var(--red)' : 'var(--text-muted)'),
    };
  }
  const camp = (val: Record<string, string>, set: (x: Record<string, string>) => void, k: string, um: string, et: string) => (
    <span class="op-c">
      <input class="of-in" inputMode="decimal" value={val[k] || ''} placeholder="—" aria-label={et}
        onInput={(e: any) => set({ ...val, [k]: curata(e.currentTarget.value) })} />
      <em>{ech(val[k] || '', um)}</em>
    </span>
  );

  const corp = (
    <div class={'content' + (props.peste ? '' : ' has-tabbar')} style={'padding-top:14px;padding-left:16px;padding-right:16px' + (props.peste ? ';padding-bottom:calc(24px + var(--sab))' : '')}>
      <div style="font-size:13px;color:var(--text-muted);line-height:1.55;margin-bottom:12px">
        Prețurile de listă ale casei. De la ele pornește fiecare ofertă nouă — ofertele deja salvate își păstrează
        prețurile lor. Ce lași gol la „ne costă" rămâne <b>necunoscut</b>, nu zero.
      </div>
      {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
      {grupuri == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
      {grupuri && grupuri.length > 0 && (<>
        <div class="op-cap"><span>cerem</span><span>ne costă</span><b>rămâne</b></div>
        {grupuri.map((g) => (
          <div>
            <div class="op-g">{g.t} <em>{g.um}</em></div>
            {g.randuri.map((r) => {
              const mj = ramane(r[0], r[2]);
              return (
                <div class="op-r">
                  <div class="et">{r[1]}</div>
                  <div class="op-grid">
                    {r[0] ? camp(tp, setTp, r[0], g.um, r[1] + ' — cerem') : <span />}
                    {r[2] ? camp(tc, setTc, r[2], g.um, r[1] + ' — ne costă') : <span />}
                    <b class="op-mj" style={mj.c ? 'color:' + mj.c : ''}>{mj.t}</b>
                  </div>
                </div>
              );
            })}
            {g.nota && <div class="op-n">{g.nota}</div>}
          </div>
        ))}
        <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;margin-top:16px">
          <button class="of-b" onClick={inchide} disabled={busy}>Anulează</button>
          <button class="of-b pri" onClick={gata} disabled={busy}><Icon name="check" size={17} /> {busy ? 'Se salvează…' : 'Gata'}</button>
        </div>
      </>)}
    </div>
  );

  return (
    <div class={'screen of-scr' + (props.peste ? ' op-over' : '')}>
      <header class="app-header">
        <button class="h-btn" onClick={inchide} aria-label="Înapoi"><Icon name={props.peste ? 'x' : 'chevronL'} /></button>
        <div class="h-title">Prețurile noastre</div>
      </header>
      {corp}
    </div>
  );
}
