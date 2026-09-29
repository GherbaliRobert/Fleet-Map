// Mentenanță — același ecran ca pe web (Management → Mentenanță): o listă de MAȘINI, cele cu restanțe
// primele și deschise singure; filele „De făcut / Făcute / Intervale"; căutare; costurile pe lună/an;
// rândul spune „mai sunt 7.700 km", „depășit cu 12 zile", „azi" sau „făcută". Starea (restant / curând)
// vine de la server (_due), cu preavizul firmei — aceeași cifră ca alertele.
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me } from '../app/store';
import { Icon } from '../components/Icon';
import { Cautare, Costuri, Grupa, Seg } from '../components/FlotaUi';
import { MntRand, useMntOps } from '../components/Mentenanta';
import {
  type Catalog, catalog, costuri, durata, flota, metaLucrare, modelul, mntFacuta, mntStare, mntZileRamase, nf, norm, numar, zi10,
} from '../components/flotaCommon';
import './detail.css';
import './admin.css';
import './flota.css';

const RANG: Record<string, number> = { over: 0, soon: 1, ok: 2, none: 3, done: 4 };

export function AdminMaintenance() {
  const loc = useLocation();
  // Serverul cere „modifică flota" și ca firma să nu fi tăiat rolului editarea mentenanței.
  const canEdit = !!me.value?.permissions?.manageFleet && !(me.value?.editariTaiate || []).includes('mentenanta');
  const [list, setList] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [devs, setDevs] = useState<any[]>([]);
  const [cat, setCat] = useState<Catalog | null>(null);
  const [view, setView] = useState<'agenda' | 'done' | 'intervale'>('agenda');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [iv, setIv] = useState<any | null>(null);

  async function reload() {
    setErr('');
    try { const r = await Api.maintenance(); setList(Array.isArray(r) ? r : []); }
    catch (e: any) { setErr(e?.status === 403 ? 'Nu ai acces la mentenanță.' : (e?.message || 'Eroare la încărcare')); setList([]); }
  }
  useEffect(() => { reload(); flota().then(setDevs); catalog().then(setCat); }, []);
  useEffect(() => {
    if (view === 'intervale' && !iv) Api.maintIntervals().then(setIv).catch(() => setIv({ classes: [], rows: [] }));
  }, [view]);

  const { ops, ui } = useMntOps({ reload, devs, cat, lucrari: list, onIntervale: () => setView('intervale') });

  const istoric = view === 'done';
  const all = list || [];
  const k = norm(q);
  const filtrat = k ? all.filter((m) => norm([m.type, m.description, numar(devs, m.imei), modelul(devs, m.imei)].join(' ')).indexOf(k) >= 0) : all;
  // Costurile din ACEEAȘI listă pentru toate trei cifrele (web: „trei cifre care se contraziceau").
  const cst = costuri(filtrat.filter(mntFacuta), (x) => zi10(x.done_date) || zi10(x.done_at));
  const pending = filtrat.filter((m) => !mntFacuta(m)).sort((a, b) => {
    const da = mntZileRamase(a), db = mntZileRamase(b);
    if (da == null && db == null) return String(a.type).localeCompare(String(b.type));
    if (da == null) return 1;
    if (db == null) return -1;
    return da - db;
  });
  const done = filtrat.filter(mntFacuta).sort((a, b) => String(b.done_at || b.done_date || '').localeCompare(String(a.done_at || a.done_date || '')));
  const sursa = istoric ? done : pending;

  const byVeh = new Map<string, any[]>();
  sursa.forEach((m) => { if (!byVeh.has(m.imei)) byVeh.set(m.imei, []); byVeh.get(m.imei)!.push(m); });
  const ultima = (l: any[]) => l.reduce((x, m) => { const d = String(m.done_at || m.done_date || ''); return d > x ? d : x; }, '');
  const imeis = Array.from(byVeh.keys()).sort((a, b) => {
    const la = byVeh.get(a)!, lb = byVeh.get(b)!;
    if (istoric) { const ua = ultima(la), ub = ultima(lb); if (ua !== ub) return ub.localeCompare(ua); }
    else {
      const ra = Math.min.apply(null, la.map((m) => RANG[mntStare(m)])), rb = Math.min.apply(null, lb.map((m) => RANG[mntStare(m)]));
      if (ra !== rb) return ra - rb;
    }
    return numar(devs, a).localeCompare(numar(devs, b), 'ro');
  });

  let banner: any = null;
  if (!istoric && imeis.length) {
    const cuRest = imeis.filter((i) => byVeh.get(i)!.some((m) => mntStare(m) === 'over')).length;
    const cuCurand = imeis.filter((i) => !byVeh.get(i)!.some((m) => mntStare(m) === 'over') && byVeh.get(i)!.some((m) => mntStare(m) === 'soon')).length;
    if (cuRest) banner = (
      <div class="fl-banner s-over"><span class="ic"><Icon name="alert" size={17} /></span>
        <span><b>{cuRest}{cuRest === 1 ? ' mașină are' : ' mașini au'} lucrări restante.</b>{cuCurand ? (cuCurand === 1 ? ' Încă una se apropie de scadență.' : ' Alte ' + cuCurand + ' se apropie de scadență.') : ''}</span></div>
    );
    else if (cuCurand) banner = (
      <div class="fl-banner s-soon"><span class="ic"><Icon name="clock" size={17} /></span>
        <span><b>{cuCurand}{cuCurand === 1 ? ' mașină se apropie' : ' mașini se apropie'} de scadență.</b> Nimic restant.</span></div>
    );
    else banner = <div class="fl-banner s-done"><span class="ic"><Icon name="check" size={17} /></span><span><b>Toate mașinile sunt la zi.</b></span></div>;
  }

  const count = view === 'intervale' ? '' : (sursa.length + ' ' + (istoric ? (sursa.length === 1 ? 'făcută' : 'făcute') : 'de făcut'));

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Mentenanță</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        <Seg value={view} onChange={(v) => setView(v as any)} items={[
          { k: 'agenda', label: 'De făcut', icon: 'list' },
          { k: 'done', label: 'Făcute', icon: 'check' },
          { k: 'intervale', label: 'Intervale', icon: 'settings' },
        ]} />

        {view === 'intervale' ? <Intervale iv={iv} cat={cat} canEdit={canEdit} /> : (
          <>
            <Cautare value={q} onInput={setQ} placeholder="Caută după număr, lucrare sau descriere…" count={list ? count : ''} />
            {err && <div class="fl-empty" style="color:var(--red)">{err}</div>}
            {list == null && !err && <div class="fl-empty"><div class="spin" style="margin:0 auto" /></div>}
            {list != null && !err && (
              <>
                <Costuri c={cst} totalLabel="Total service" icon="wrench" />
                {banner}
                {imeis.length ? (
                  <div class="fl-list">
                    {imeis.map((imei) => {
                      const items = byVeh.get(imei)!;
                      const over = items.filter((m) => mntStare(m) === 'over').length;
                      const soon = items.filter((m) => mntStare(m) === 'soon').length;
                      const key = view + ':' + imei;
                      const deschis = open[key] !== undefined ? open[key] : ((!istoric && over > 0) || imeis.length === 1);
                      const odo = items.reduce((x, m) => Math.max(x, m._odo || 0), 0);
                      const sub = [modelul(devs, imei), odo ? nf(odo) + ' km' : ''].filter(Boolean).join(' · ');
                      let badge;
                      if (istoric) {
                        const lei = items.reduce((x, m) => x + (parseFloat(m.cost) || 0), 0);
                        badge = <span class="fl-gn">{items.length}{items.length === 1 ? ' lucrare' : ' lucrări'}{lei ? ' · ' + nf(Math.round(lei)) + ' lei' : ''}</span>;
                      } else if (over) badge = <span class="fl-gn al">{over}{over === 1 ? ' restantă' : ' restante'}</span>;
                      else if (soon) badge = <span class="fl-gn soon">{soon} curând</span>;
                      else badge = <span class="fl-gn ok">la zi · {items.length}{items.length === 1 ? ' lucrare' : ' lucrări'}</span>;
                      return (
                        <Grupa open={deschis} onToggle={() => setOpen((p) => ({ ...p, [key]: !deschis }))}
                          title={numar(devs, imei)} sub={sub} badge={badge}>
                          {items.map((m) => (
                            <MntRand m={m} cat={cat} canEdit={canEdit}
                              onDone={ops.done} onEdit={ops.edit} onDelete={ops.del} onMoveDoc={ops.doc} />
                          ))}
                        </Grupa>
                      );
                    })}
                  </div>
                ) : (
                  <div class="fl-empty">
                    <div class="ic"><Icon name={istoric ? 'clock' : 'check'} size={30} /></div>
                    {istoric
                      ? (q ? 'Nicio lucrare făcută pentru „' + q + '”.' : 'Nicio lucrare făcută încă. Aici ajung lucrările pe care le bifezi cu ✓.')
                      : (q ? 'Nicio lucrare pentru „' + q + '”.' : 'Nimic de făcut. Toate mașinile sunt la zi.')}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {canEdit && view !== 'intervale' && (
        <button class="fab" onClick={() => ops.add()} aria-label="Adaugă lucrare"><Icon name="plus" size={26} color="#06210f" /></button>
      )}
      {ui}
    </div>
  );
}

// Fila „Intervale", doar de citit pe telefon: la câți km și la câte luni se repetă fiecare lucrare, pe
// cele trei feluri de mașini. Tabelul vine gata îmbinat de la server; cifrele schimbate de firmă sunt
// scoase în evidență. Se modifică din aplicația web (96 de căsuțe nu încap cinstit pe un telefon).
function Intervale({ iv, cat, canEdit }: { iv: any | null; cat: Catalog | null; canEdit: boolean }) {
  if (!iv) return <div class="fl-empty"><div class="spin" style="margin:0 auto" /></div>;
  const classes: any[] = Array.isArray(iv.classes) ? iv.classes : [];
  const rows: any[] = Array.isArray(iv.rows) ? iv.rows : [];
  if (!rows.length) return <div class="fl-empty">Intervalele nu s-au putut încărca.</div>;
  const val = (x: any) => (x && (x.km || x.months)) ? [x.km ? nf(x.km) + ' km' : '', x.months ? durata(x.months) : ''].filter(Boolean).join(' / ') : 'la nevoie';
  return (
    <>
      <div class="fl-note">
        <b>La cât se face fiecare lucrare.</b> Cifrele sunt punctul nostru de plecare. Când adaugi o lucrare, aplicația
        completează singură scadența după tabelul ăsta și după felul mașinii. „La nevoie" = fără propunere.
        {canEdit ? ' Cifrele se schimbă din aplicația web, în Mentenanță → Intervale.' : ''}
      </div>
      <div class="fl-tb">
        {rows.map((r) => {
          const meta = metaLucrare(cat, r.type);
          return (
            <div class="fl-tr">
              <div class="fl-tr-h"><span class={'fl-ic ' + meta.fam} style="width:28px;height:28px;flex-basis:28px"><Icon name={meta.icon} size={14} /></span>{r.type}</div>
              <div class="fl-tr-c">
                {classes.map((c) => {
                  const cu = !!(r.custom && r.custom[c.key]);
                  return (
                    <div class={'fl-tc' + (cu ? ' cu' : '')} title={cu ? 'Schimbat de firma voastră' : undefined}>
                      <div class="l">{c.label}</div>
                      <div class="v">{val(r[c.key])}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
