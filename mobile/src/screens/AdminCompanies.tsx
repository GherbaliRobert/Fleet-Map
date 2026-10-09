import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { salveazaDeLaServer } from '../lib/export';
import { numeBrand } from '../lib/descarcaPost';
import {
  CO_FILTRE, CO_SORT, cautaFirma, sorteaza, accesPastila, activitate, lunar, dosarPastila, leiScurt, nrPlati,
  rutaFisa, type ColSort,
} from '../lib/companii';
import './admin.css';
import './detail.css';
import './firma.css';
import './companii.css';

// Super-admin: Companii — registrul de clienți, ca pe web (Administrare → Companii).
// Toate rutele sunt requireSuperadmin pe server; ecranul e oricum învelit în doarSuper (App.tsx).
//
// Un cartonaș pe firmă, doar cu ce trimite deja serverul: dosarul juridic, accesul (suspendat / restanță /
// activ), venitul lunar (socotit pe server cu motorul facturii — telefonul nu socotește bani), încasat,
// ultima activitate. Filtrele se numără pe TOATĂ lista, nu pe rezultatul căutării.
// Fișa firmei (file: Detalii · Utilizatori · Vehicule · Facturi · Abonament & plăți · Contract) e în
// CompanySheet.tsx; „Client nou" (firmă + contract + administrator) în ClientNou.tsx; mutările în MutaCompanii.tsx.
export function AdminCompanies() {
  const loc = useLocation();
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [mrr, setMrr] = useState<any | null>(null);
  const [neadoptate, setNeadoptate] = useState(0);
  const [filtru, setFiltru] = useState('toate');
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<{ col: ColSort; dir: number }>({ col: 'name', dir: 1 });
  const [exportBusy, setExportBusy] = useState(false);

  // „Client nou din ofertă" venit pe adresa veche (/admin/companies?nou=<id ofertă>) → traseul Client nou.
  const nou = String(((loc.query || {}) as any).nou || '');
  useEffect(() => { if (nou) loc.route('/admin/client-nou' + (nou !== '1' ? '?oferta=' + encodeURIComponent(nou) : ''), true); }, [nou]);

  function reload() {
    setErr('');
    Api.companies()
      .then((l) => setItems(Array.isArray(l) ? l : []))
      .catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setItems(null); });
    // Banii vin separat: lista se deschide pe loc, „Lunar" și totalul apar o clipă mai târziu.
    Api.companiesMrr().then((d) => setMrr(d && (d as any).firme ? d : null)).catch(() => setMrr(null));
    // Banda de sus: câte aparate transmit și nu sunt la nicio firmă. Adopția se face DOAR în Dispozitive.
    Api.unassignedDevices().then((l) => setNeadoptate(Array.isArray(l) ? l.length : 0)).catch(() => setNeadoptate(0));
  }
  useEffect(reload, []);

  const list = items || [];
  const pastile = useMemo(() => CO_FILTRE.map((f) => ({ ...f, n: list.filter(f.f).length })), [items]);
  const rows = useMemo(() => {
    const f = (CO_FILTRE.find((x) => x.id === filtru) || CO_FILTRE[0]).f;
    const qq = q.trim();
    return sorteaza(list.filter((c) => f(c) && cautaFirma(c, qq)), sort, mrr);
  }, [items, filtru, q, sort, mrr]);

  function sorteazaDupa(col: ColSort) {
    setSort((s) => (s.col === col ? { col, dir: -s.dir } : { col, dir: col === 'name' ? 1 : -1 }));
  }
  // Lista de clienți în Excel. Serverul verifică din nou cine cere și trece descărcarea în jurnalul de audit;
  // numele fișierului vine din antetul lui („RA-Track - Raport Companii - zz.ll.aaaa.xlsx").
  async function exportExcel() {
    if (exportBusy) return;
    setExportBusy(true);
    showToast('Se pregătește lista… descărcarea se trece în jurnalul de audit.');
    try { await salveazaDeLaServer('/api/companies/export', numeBrand('Companii', 'xlsx')); }
    catch (e: any) { showToast(e?.message || 'Exportul nu a mers.', true); }
    finally { setExportBusy(false); }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Companii</div>
        <button class="h-btn" onClick={reload} aria-label="Reîncarcă"><Icon name="refresh" size={20} /></button>
      </header>
      <div class="content co-page">
        {neadoptate > 0 && (
          // Tapul duce în Dispozitive; filtrul „Neasignate" îl alege ecranul acela (parametrul e pentru el).
          <button class="co-banda" onClick={() => loc.route('/admin/devices?filtru=neasignate')}>
            <Icon name="cpu" size={18} color="var(--co-warn)" />
            <span><b>{neadoptate === 1 ? 'Un aparat așteaptă să fie adoptat.' : neadoptate + ' aparate așteaptă să fie adoptate.'}</b>{' '}
              {(neadoptate === 1 ? 'Transmite deja, dar nu e la nicio firmă' : 'Transmit deja, dar nu sunt la nicio firmă')
                + ' — ori e un client care așteaptă, ori un aparat străin. Apasă ca '
                + (neadoptate === 1 ? 'să-l rezolvi' : 'să le rezolvi') + ' în Dispozitive.'}</span>
          </button>
        )}

        <div class="co-acts">
          <button class="btn btn-primary" style="flex:1 1 100%" onClick={() => loc.route('/admin/client-nou')}>
            <Icon name="plus" size={17} color="#06210F" /> Client nou
          </button>
          <button class="fm-btn" disabled={exportBusy} onClick={exportExcel}><Icon name="download" size={16} /> {exportBusy ? 'Se pregătește…' : 'Excel'}</button>
          <button class="fm-btn" onClick={() => loc.route('/admin/muta')}><Icon name="arrowRight" size={16} /> Mută între companii</button>
        </div>

        {err && (
          <div class="fm-empty" style="color:var(--red)">{err}
            <div style="margin-top:12px"><button class="fm-btn" onClick={reload}>Reîncearcă</button></div>
          </div>
        )}
        {items == null && !err && <div class="fm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && list.length === 0 && (
          <div class="fm-empty"><Icon name="layers" size={36} color="var(--text-muted)" />
            <b>Nicio companie încă.</b>Deschide primul client cu butonul de sus.</div>
        )}

        {items != null && list.length > 0 && (
          <>
            {mrr && (
              <div class="co-mrr"><Icon name="chart" size={16} color="var(--co-ok)" />Venit lunar recurent: <b>{leiScurt(mrr.totalLei)}</b></div>
            )}
            <div class="fm-chips scroll">
              {pastile.map((f) => {
                if (f.id !== 'toate' && f.id !== 'demo' && !f.n) return null; // ce nu există nu ocupă loc
                const ton = f.ton && f.n ? (f.ton === 'rau' ? ' co-rau' : ' cald') : '';
                return (
                  <button class={'fm-chip' + (filtru === f.id ? ' on' : '') + ton} onClick={() => setFiltru(f.id)}>
                    {f.et} <b>{f.n}</b>
                  </button>
                );
              })}
            </div>
            <div class="fm-search" style="margin-bottom:10px">
              <span class="ic"><Icon name="search" size={16} /></span>
              <input class="fm-in" type="search" value={q} onInput={(e: any) => setQ(e.target.value)}
                placeholder="Caută după nume, CUI, email, telefon sau administrator…" />
            </div>
            <div class="co-sort">
              <span class="lbl">Sortare</span>
              {CO_SORT.map((s) => (
                <button class={sort.col === s.col ? 'on' : ''} onClick={() => sorteazaDupa(s.col)}>
                  {s.et}{sort.col === s.col ? (sort.dir > 0 ? ' ↑' : ' ↓') : ''}
                </button>
              ))}
            </div>

            <div class="fm-list">
              {rows.map((c) => <Cartonas c={c} mrr={mrr} onOpen={(fila) => loc.route(rutaFisa(c.id, fila))} />)}
            </div>
            {rows.length === 0 && (
              <div class="fm-empty" style="padding:24px 12px">{q.trim() ? 'Nicio companie pentru „' + q.trim() + '".' : 'Nicio companie în filtrul ăsta.'}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Cartonas({ c, mrr, onOpen }: { c: any; mrr: any; onOpen: (fila?: string) => void }) {
  const acc = accesPastila(c);
  const act = activitate(c);
  const lu = lunar(c, mrr);
  const dos = dosarPastila(c.dosar);
  const paid = Number(c.paid_total) || 0;
  const nPlati = Number(c.payment_count) || 0;
  return (
    <div class="co-card" role="button" onClick={() => onOpen()}>
      <div class="co-card-h">
        <span class="nm">{c.name}{c.cui ? <small>{c.cui}</small> : null}</span>
        <Icon name="chevronR" size={18} color="var(--text-muted)" />
      </div>
      <div class="co-tags">
        {c.is_demo ? <span class="co-tag demo">DEMO</span> : null}
        {c.active === false ? <span class="co-tag">inactiv</span> : null}
        {dos && (
          <button class={'co-pill ' + dos.fel} title={dos.titlu} aria-label={dos.titlu}
            onClick={(e) => { e.stopPropagation(); onOpen('contract'); }}>
            <Icon name="fileSignature" size={12} />{dos.et}
          </button>
        )}
        {!c.is_demo && <span class={'co-pill ' + acc.fel}>{acc.et}</span>}
        {!c.is_demo && acc.sub ? <span style="font-size:11.5px;color:var(--text-muted)">{acc.sub}</span> : null}
      </div>
      <div class="co-grid">
        <div class="co-cell"><div class="l">Vehicule</div><div class="v">{Number(c.device_count) || 0}</div></div>
        <div class="co-cell"><div class="l">Utilizatori</div><div class="v">{Number(c.user_count) || 0}</div></div>
        <div class="co-cell"><div class="l">Lunar</div>
          <div class={'v' + (lu.cald ? ' cald' : '') + (lu.muted ? ' muted' : '')} style={lu.bold ? 'font-weight:800' : ''}>{lu.t}</div></div>
        <div class="co-cell"><div class="l">Încasat</div>
          <div class={'v' + (paid ? '' : ' muted')}>{paid ? leiScurt(paid) : '—'}{nPlati ? <small>{nrPlati(nPlati)}</small> : null}</div></div>
        <div class="co-cell" style="grid-column:1 / -1"><div class="l">Ultima activitate</div>
          <div class={'v' + (act.cald ? ' cald' : '') + (act.muted ? ' muted' : '')}>{act.t}</div></div>
      </div>
    </div>
  );
}
