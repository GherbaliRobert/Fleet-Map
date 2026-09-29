// Documente vehicule — același ecran ca pe web (Management → Documente): TOATE mașinile flotei, fiecare cu
// actele ei în ordinea din „Acte cerute", inclusiv cele care LIPSESC. Sus, avertismentul numește mașina
// și actul. Filele „Valabile / Istoric / Acte cerute", căutare, costuri. Starea actului (expirat / expiră
// curând) vine de la server (_due, _days), cu preavizul de acte al firmei — aceeași cifră ca alerta.
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me } from '../app/store';
import { Icon } from '../components/Icon';
import { Cautare, Costuri, Grupa, Seg } from '../components/FlotaUi';
import { DocIstRand, DocRand, metaAct, nevoiDe, ordoneazaActe, sloturi, tipuriActe, useDocOps } from '../components/ActeVehicul';
import { type Catalog, catalog, costuri, docStare, flota, modelul, nf, norm, numar, vehDe, zi10 } from '../components/flotaCommon';
import './detail.css';
import './admin.css';
import './flota.css';

export function AdminDocuments() {
  const loc = useLocation();
  // Firma poate tăia unui rol editarea actelor separat de „modifică flota" (editariTaiate) — serverul refuză atunci.
  const canEdit = !!me.value?.permissions?.manageFleet && !(me.value?.editariTaiate || []).includes('documente');
  const [acte, setActe] = useState<any[] | null>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [req, setReq] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [devs, setDevs] = useState<any[]>([]);
  const [cat, setCat] = useState<Catalog | null>(null);
  const [view, setView] = useState<'valid' | 'hist' | 'cerute'>('valid');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  async function reload() {
    setErr('');
    try { const r = await Api.documents(); setActe(Array.isArray(r) ? r : []); }
    catch (e: any) { setErr(e?.status === 403 ? 'Nu ai acces la documente.' : (e?.message || 'Eroare la încărcare')); setActe([]); }
    Api.documentsHistory().then((h) => setHist(Array.isArray(h) ? h : [])).catch(() => setHist([]));
  }
  useEffect(() => {
    reload();
    Api.docRequirements().then(setReq).catch(() => setReq(null));
    flota().then(setDevs);
    catalog().then(setCat);
  }, []);

  const tipuri = tipuriActe(req, cat);
  const { ops, ui } = useDocOps({ devs, tipuri, reload: () => { reload(); flota(true).then(setDevs); } });

  const k = norm(q);
  const pot = (d: any) => !k || norm([d.doc_type, d.number, d.issuer, numar(devs, d.imei), modelul(devs, d.imei)].join(' ')).indexOf(k) >= 0;
  const list = (acte || []).filter(pot);
  const histF = hist.filter(pot);
  // Și actele înlocuite intră la bani — altfel „cât am dat pe acte" ar uita tot ce e mai vechi de o reînnoire.
  // Fără dată de emitere, reperul e ziua în care actul a fost introdus (ca cele trei cifre să se adune).
  const cst = costuri(list.concat(histF), (d) => zi10(d.issue_date) || zi10(d.created_at));

  let body: any = null;
  if (view === 'hist') {
    const byVeh = new Map<string, any[]>();
    histF.forEach((d) => { if (!byVeh.has(d.imei)) byVeh.set(d.imei, []); byVeh.get(d.imei)!.push(d); });
    const ultima = (l: any[]) => l.reduce((x, d) => (String(d.replaced_at || '') > x ? String(d.replaced_at || '') : x), '');
    const imeis = Array.from(byVeh.keys()).sort((a, b) => {
      const ua = ultima(byVeh.get(a)!), ub = ultima(byVeh.get(b)!);
      return ua !== ub ? ub.localeCompare(ua) : numar(devs, a).localeCompare(numar(devs, b), 'ro');
    });
    body = imeis.length ? (
      <div class="fl-list">
        {imeis.map((imei) => {
          const items = byVeh.get(imei)!.slice().sort((a, b) => String(b.replaced_at || '').localeCompare(String(a.replaced_at || '')));
          const key = 'hist:' + imei;
          const deschis = open[key] !== undefined ? open[key] : imeis.length === 1;
          const lei = items.reduce((x, d) => x + (parseFloat(d.cost) || 0), 0);
          return (
            <Grupa open={deschis} onToggle={() => setOpen((p) => ({ ...p, [key]: !deschis }))} title={numar(devs, imei)} sub={modelul(devs, imei)}
              badge={<span class="fl-gn">{items.length}{items.length === 1 ? ' act' : ' acte'}{lei ? ' · ' + nf(Math.round(lei)) + ' lei' : ''}</span>}>
              {items.map((d) => <DocIstRand d={d} req={req} />)}
            </Grupa>
          );
        })}
      </div>
    ) : (
      <div class="fl-empty"><div class="ic"><Icon name="clock" size={30} /></div>
        {q ? 'Niciun act înlocuit pentru „' + q + '”.' : 'Niciun act înlocuit încă. Aici ajung actele vechi, când pui unul nou în locul lor.'}</div>
    );
  } else if (view === 'valid') {
    // Fiecare mașină, cu actele ei ȘI cu ce-i lipsește — inclusiv una fără NICIUN act introdus.
    const byVeh = new Map<string, any[]>();
    list.forEach((d) => { if (!byVeh.has(d.imei)) byVeh.set(d.imei, []); byVeh.get(d.imei)!.push(d); });
    const toate = Array.from(new Set(devs.map((d) => d.imei).concat(Array.from(byVeh.keys()))));
    const lipsaDe: Record<string, { type: string; need: string }[]> = {};
    toate.forEach((imei) => {
      const are = (byVeh.get(imei) || []).map((d) => norm(d.doc_type));
      lipsaDe[imei] = nevoiDe(vehDe(devs, imei), req, cat)
        .filter((m) => are.indexOf(norm(m.type)) < 0)
        .filter((m) => !k || norm([m.type, numar(devs, imei), modelul(devs, imei)].join(' ')).indexOf(k) >= 0);
    });
    const scor = (imei: string) => {
      const a = byVeh.get(imei) || [], l = lipsaDe[imei] || [];
      if (a.some((d) => docStare(d) === 'expired')) return 0;
      if (l.some((m) => m.need === 'req')) return 1;   // lipsă obligatorie = aproape la fel de rău
      if (a.some((d) => docStare(d) === 'soon')) return 2;
      return 3;
    };
    const imeis = toate.filter((i) => (byVeh.get(i) || []).length || (lipsaDe[i] || []).length)
      .sort((a, b) => { const sa = scor(a), sb = scor(b); return sa !== sb ? sa - sb : numar(devs, a).localeCompare(numar(devs, b), 'ro'); });

    // „1 mașină are acte expirate" nu ajută: scriem CARE mașină și CE anume îi lipsește sau i-a expirat.
    let banner: any = null;
    if (imeis.length) {
      const linii: { grav: number; el: any }[] = [];
      imeis.forEach((imei) => {
        const exp = (byVeh.get(imei) || []).filter((d) => docStare(d) === 'expired').map((d) => d.doc_type);
        const soon = (byVeh.get(imei) || []).filter((d) => docStare(d) === 'soon').map((d) => d.doc_type);
        const lipsa = (lipsaDe[imei] || []).filter((m) => m.need === 'req').map((m) => m.type);
        if (!exp.length && !soon.length && !lipsa.length) return;
        const p: any[] = [];
        if (exp.length) p.push(<><b>{exp.join(', ')}</b> {exp.length === 1 ? 'expirat' : 'expirate'}</>);
        if (lipsa.length) p.push(<>nu are <b>{lipsa.join(', ')}</b></>);
        if (soon.length) p.push(<><b>{soon.join(', ')}</b> expiră curând</>);
        linii.push({ grav: exp.length || lipsa.length ? 0 : 1, el: <div><span class="pl">{numar(devs, imei)}</span> {p.map((x, i) => <>{i ? ' · ' : ''}{x}</>)}</div> });
      });
      if (!linii.length) banner = <div class="fl-banner s-done"><span class="ic"><Icon name="check" size={17} /></span><span><b>Toate actele sunt în regulă.</b></span></div>;
      else {
        linii.sort((a, b) => a.grav - b.grav);
        const grav = linii.some((l) => l.grav === 0);
        // Lista se taie la 6: mai mult decât atât nu mai e un avertisment, e a doua listă.
        const arata = linii.slice(0, 6), rest = linii.length - arata.length;
        banner = (
          <div class={'fl-banner ' + (grav ? 's-over' : 's-soon')}>
            <span class="ic"><Icon name={grav ? 'alert' : 'clock'} size={17} /></span>
            <div>{arata.map((l) => l.el)}{rest > 0 ? <div class="rest">și încă {rest}{rest === 1 ? ' mașină' : ' mașini'} mai jos</div> : null}</div>
          </div>
        );
      }
    }

    body = (
      <>
        {banner}
        {imeis.length ? (
          <div class="fl-list">
            {imeis.map((imei) => {
              const a = ordoneazaActe(byVeh.get(imei) || []);
              const l = lipsaDe[imei] || [];
              const lipReq = l.filter((m) => m.need === 'req').length;
              const exp = a.filter((d) => docStare(d) === 'expired').length;
              const soon = a.filter((d) => docStare(d) === 'soon').length;
              const key = 'valid:' + imei;
              const deschis = open[key] !== undefined ? open[key] : ((exp > 0 || lipReq > 0) || imeis.length === 1);
              let badge;
              if (exp) badge = <span class="fl-gn al">{exp}{exp === 1 ? ' expirat' : ' expirate'}</span>;
              else if (lipReq) badge = <span class="fl-gn al">{lipReq}{lipReq === 1 ? ' act lipsă' : ' acte lipsă'}</span>;
              else if (soon) badge = <span class="fl-gn soon">{soon} expiră curând</span>;
              else badge = <span class="fl-gn ok">în regulă · {a.length}{a.length === 1 ? ' act' : ' acte'}</span>;
              // Căutarea ascunde și rândurile goale care nu se potrivesc: sloturile vin din lista filtrată.
              const nev = nevoiDe(vehDe(devs, imei), req, cat).filter((m) => a.some((d) => norm(d.doc_type) === norm(m.type)) || l.some((x) => x.type === m.type));
              return (
                <Grupa open={deschis} onToggle={() => setOpen((p) => ({ ...p, [key]: !deschis }))} title={numar(devs, imei)} sub={modelul(devs, imei)} badge={badge}>
                  {sloturi(imei, a, nev as any).map((o) => (
                    <DocRand o={o} req={req} canEdit={canEdit} onUpload={ops.upload} onView={ops.view}
                      onEdit={ops.edit} onRenew={ops.renew} onDelete={ops.del} />
                  ))}
                </Grupa>
              );
            })}
          </div>
        ) : (
          <div class="fl-empty"><div class="ic"><Icon name="fileBar" size={30} /></div>{q ? 'Niciun act pentru „' + q + '”.' : 'Niciun act introdus încă.'}</div>
        )}
      </>
    );
  } else {
    body = <ActeCerute req={req} canEdit={canEdit} />;
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Documente vehicule</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:40px">
        <Seg value={view} onChange={(v) => setView(v as any)} items={[
          { k: 'valid', label: 'Valabile', icon: 'shield' },
          { k: 'hist', label: 'Istoric', icon: 'clock' },
          { k: 'cerute', label: 'Acte cerute', icon: 'list' },
        ]} />
        {view !== 'cerute' && <Cautare value={q} onInput={setQ} placeholder="Caută după număr, act sau emitent…" />}
        {err && <div class="fl-empty" style="color:var(--red)">{err}</div>}
        {acte == null && !err && view !== 'cerute' && <div class="fl-empty"><div class="spin" style="margin:0 auto" /></div>}
        {(acte != null || view === 'cerute') && !err && (
          <>
            {view !== 'cerute' && <Costuri c={cst} totalLabel="Total acte" icon="fileBar" />}
            {body}
          </>
        )}
      </div>
      {ui}
    </div>
  );
}

// Fila „Acte cerute", doar de citit pe telefon: ce acte trebuie să aibă fiecare fel de mașină. Tot de
// aici se decide ce apare „lipsește". Lista gata îmbinată vine de la server; ce a schimbat firma e
// scos în evidență. Se modifică din aplicația web.
function ActeCerute({ req, canEdit }: { req: any | null; canEdit: boolean }) {
  if (!req) return <div class="fl-empty"><div class="spin" style="margin:0 auto" /></div>;
  const classes: any[] = Array.isArray(req.classes) ? req.classes : [];
  const rows: any[] = Array.isArray(req.rows) ? req.rows : [];
  if (!rows.length) return <div class="fl-empty">Lista de acte cerute nu s-a putut încărca.</div>;
  const val = (v: any) => v === 'req' ? 'obligatoriu' : v === 'opt' ? 'opțional' : 'nu se cere';
  return (
    <>
      <div class="fl-note">
        <b>Ce acte trebuie să aibă fiecare fel de mașină.</b> „Obligatoriu" = dacă lipsește, ți-o spunem cu roșu în lista de acte.
        „Opțional" = îl urmărim dacă îl introduci, dar nu te batem la cap.
        {canEdit ? ' Lista se schimbă din aplicația web, în Documente → Acte cerute.' : ''}
      </div>
      <div class="fl-tb">
        {rows.map((r) => {
          const meta = metaAct(req, r.type);
          return (
            <div class="fl-tr">
              <div class="fl-tr-h"><span class={'fl-ic ' + meta.fam} style="width:28px;height:28px;flex-basis:28px"><Icon name={meta.icon} size={14} /></span>{r.type}</div>
              <div class="fl-tr-c">
                {classes.map((c) => {
                  const cu = !!(r.custom && r.custom[c.key]);
                  const v = r[c.key];
                  return (
                    <div class={'fl-tc' + (cu ? ' cu' : '')}>
                      <div class="l">{c.label}</div>
                      <div class="v" style={v === 'req' ? 'color:var(--red)' : v ? undefined : 'color:var(--text-muted)'}>{val(v)}</div>
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
