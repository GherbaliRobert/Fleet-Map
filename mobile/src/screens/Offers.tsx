import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon, type IconName } from '../components/Icon';
import { salveazaPostDeLaServer } from '../lib/descarcaPost';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import './admin.css';
import './detail.css';
import './oferte.css';

// Super-admin: Ofertare Live — lista ofertelor salvate, ca pe web: pâlnia de sus, starea fiecărei oferte și
// pașii ei (Am trimis-o / Acceptată / Pierdută / Redeschide), hârtia, clientul nou din ofertă, creionul.
//
// Nicio sumă nu se socotește aici. Calculatorul (OfferCalc) și „Prețurile noastre" (OurPrices) iau totul de la
// server, care rulează chiar pagina web; hârtia unei oferte salvate vine tot de acolo (`hartie: true`) și se
// face PDF de generatorul serverului. Termenul și motivele pierderii vin din `/api/admin/offers/meta`.
// (Calculatorul din iulie, cu prețurile lui vechi, a plecat pe 23.09; cel de acum e al web-ului.)
type Et = { et: string; c: string; ic: IconName };
const OF_ET: Record<string, Et> = {
  ciorna: { et: 'Ciornă', c: 'var(--text-muted)', ic: 'edit' },
  trimisa: { et: 'Trimisă', c: 'var(--of-warn)', ic: 'arrowRight' },
  expirata: { et: 'Expirată', c: 'var(--red)', ic: 'clock' },
  acceptata: { et: 'Acceptată', c: 'var(--of-ok)', ic: 'check' },
  pierduta: { et: 'Pierdută', c: 'var(--text-muted)', ic: 'x' },
};
// „Expirată" nu e o stare ținută în bază: se socotește din termen, ca pe web (_ofStare).
function stare(o: any): string {
  const s = o.status || 'ciorna';
  if (s === 'trimisa' && o.valid_until && Number(o.valid_until) < Date.now()) return 'expirata';
  return s;
}
function zile(o: any): number | null {
  if (!o.valid_until) return null;
  return Math.ceil((Number(o.valid_until) - Date.now()) / 86400000);
}
// „20 de zile", dar „5 zile".
function de(n: number) { const x = Math.abs(Math.round(n)); if (x === 0) return ' '; const r = x % 100; return (r >= 1 && r <= 19) ? ' ' : ' de '; }
function subStare(o: any): string {
  const s = stare(o), z = zile(o);
  if (s === 'trimisa' && z != null) return z <= 0 ? 'expiră azi' : ('mai are ' + z + (z === 1 ? ' zi' : de(z) + 'zile'));
  if (s === 'expirata' && z != null) return 'de ' + Math.abs(z) + de(Math.abs(z)) + 'zile';
  if (s === 'pierduta' && o.lost_reason) return String(o.lost_reason).slice(0, 60);
  return '';
}
const lei = (v: any) => (Number(v) || 0).toLocaleString('ro-RO', { maximumFractionDigits: 0 }) + ' lei';
const eur = (v: any, fx: number) => ((Number(v) || 0) / (fx || 5)).toLocaleString('ro-RO', { maximumFractionDigits: 0 }) + ' €';
function fmtD(ms: any) { if (ms == null) return '—'; const d = new Date(Number(ms)); if (isNaN(d.getTime())) return '—'; return ('0' + d.getDate()).slice(-2) + '.' + ('0' + (d.getMonth() + 1)).slice(-2) + '.' + d.getFullYear(); }

// Pâlnia de deasupra listei — aceleași șase cifre ca pe web (_ofPalnieHtml), din ofertele arătate.
function Palnie({ rows }: { rows: any[] }) {
  const n = (st: string) => rows.filter((o) => stare(o) === st).length;
  const LUNA = 30 * 86400000, acum = Date.now();
  const deLuna = (st: string) => rows.filter((o) => stare(o) === st && o.decided_at && (acum - Number(o.decided_at)) < LUNA).length;
  const acceptate = deLuna('acceptata'), pierdute = deLuna('pierduta');
  const expiraCurand = rows.filter((o) => { const z = zile(o); return stare(o) === 'trimisa' && z != null && z <= 7; }).length;
  const c = (nr: number, et: string, cul?: string) => (
    <div class="of-c"><b style={cul && nr ? 'color:' + cul : ''}>{nr.toLocaleString('ro-RO')}</b><span>{et}</span></div>
  );
  return (
    <div class="of-palnie">
      {c(n('ciorna'), 'în ciornă')}
      {c(n('trimisa'), 'în așteptare', 'var(--of-warn)')}
      {c(expiraCurand, 'expiră în 7 zile', 'var(--red)')}
      {c(n('expirata'), 'cu termen depășit', 'var(--red)')}
      {c(acceptate, (acceptate === 1 ? 'acceptată' : 'acceptate') + ' în ultima lună', 'var(--of-ok)')}
      {c(pierdute, (pierdute === 1 ? 'pierdută' : 'pierdute') + ' în ultima lună')}
    </div>
  );
}

type Foaie = { fel: 'trimisa' | 'pierduta'; o: any } | null;

export function Offers() {
  const loc = useLocation();
  const [offers, setOffers] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [fxAzi, setFxAzi] = useState<number>(0);
  const [meta, setMeta] = useState<{ valabilZile: number | null; motivePierdut: { cod: string; et: string }[] }>({ valabilZile: null, motivePierdut: [] });
  const [foaie, setFoaie] = useState<Foaie>(null);
  const [pana, setPana] = useState('');
  const [motiv, setMotiv] = useState('');
  const [liber, setLiber] = useState('');
  const [busy, setBusy] = useState<string>('');

  function loadList() {
    setErr('');
    Api.offers().then((r) => setOffers(Array.isArray(r) ? r : []))
      .catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setOffers([]); });
  }
  useEffect(() => {
    loadList();
    // Cursul de azi e doar rezerva pentru ofertele vechi, fără curs înghețat în ele.
    Api.fx().then((f: any) => setFxAzi(Number(f && f.eur) || 0)).catch(() => {});
    // Termenul și motivele vin de la server — niciun „30" și nicio listă de motive scrise aici.
    Api.offerMeta().then((m: any) => { if (m && Array.isArray(m.motivePierdut)) setMeta({ valabilZile: m.valabilZile || null, motivePierdut: m.motivePierdut }); }).catch(() => {});
  }, []);
  useInapoiInchide(!!foaie, () => { if (busy) return false; setFoaie(null); return true; });

  async function del(o: any) {
    if (!confirm('Ștergi această ofertă?')) return;
    try { await Api.deleteOffer(o.id); showToast('Ofertă ștearsă ✓'); loadList(); } catch (e: any) { showToast(e?.message || 'Eroare', true); }
  }
  async function schimbaStarea(o: any, status: string, extra?: any) {
    setBusy('stare-' + o.id);
    try {
      await Api.offerSetStare(o.id, Object.assign({ status }, extra || {}));
      setFoaie(null);
      showToast('Ofertă marcată „' + ((OF_ET[status] || {}).et || status) + '" ✓');
      loadList();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(''); }
  }
  function deschideTrimisa(o: any) {
    const z = meta.valabilZile;
    setPana(z ? new Date(Date.now() + z * 86400000).toISOString().slice(0, 10) : '');
    setFoaie({ fel: 'trimisa', o });
  }
  function deschidePierduta(o: any) {
    setMotiv((meta.motivePierdut[0] || { cod: '' }).cod); setLiber('');
    setFoaie({ fel: 'pierduta', o });
  }
  function gataFoaie() {
    if (!foaie) return;
    if (foaie.fel === 'trimisa') {
      const t = pana ? new Date(pana + 'T23:59:59').getTime() : null;
      schimbaStarea(foaie.o, 'trimisa', t ? { valid_until: t } : {});
    } else {
      const et = (meta.motivePierdut.find((m) => m.cod === motiv) || { et: motiv }).et;
      const lib = liber.trim();
      schimbaStarea(foaie.o, 'pierduta', { lost_reason: et + (lib ? ' — ' + lib : '') });
    }
  }
  // Hârtia unei oferte SALVATE: plicul îl face serverul din ce s-a salvat (prețuri negociate, cursul ei
  // înghețat), PDF-ul îl face generatorul serverului; telefonul îl deschide în foaia de partajare.
  async function hartia(o: any) {
    setBusy('pdf-' + o.id);
    try {
      const j: any = await Api.offerCalc({ offer_id: o.id, hartie: true });
      if (!j || !j.hartieSalvata) throw new Error('Oferta nu s-a putut pregăti');
      await salveazaPostDeLaServer('/api/admin/offers/pdf', j.hartieSalvata, 'Ofertă.pdf');
    } catch (e: any) { showToast('Nu s-a putut deschide oferta: ' + (e?.message || 'eroare'), true); }
    finally { setBusy(''); }
  }

  // Pașii care au sens din starea de acum (ca pe web, _ofButoaneStare): n-ai pierdut ce n-ai trimis.
  function butoaneStare(o: any) {
    const s = stare(o), b = busy === 'stare-' + o.id;
    if (s === 'ciorna') return <button class="of-b" disabled={b} onClick={() => deschideTrimisa(o)}><Icon name="arrowRight" size={15} /> Am trimis-o</button>;
    if (s === 'trimisa' || s === 'expirata') return (<>
      <button class="of-b ok" disabled={b} onClick={() => schimbaStarea(o, 'acceptata')}><Icon name="check" size={15} /> Acceptată</button>
      <button class="of-b" disabled={b} onClick={() => deschidePierduta(o)}><Icon name="x" size={15} /> Pierdută</button>
    </>);
    return <button class="of-b" disabled={b} onClick={() => schimbaStarea(o, 'ciorna')}><Icon name="refresh" size={15} /> Redeschide</button>;
  }

  const z = meta.valabilZile;
  return (
    <div class="screen of-scr">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Ofertare Live</div>
        <button class="h-btn" onClick={loadList} aria-label="Reîncarcă"><Icon name="refresh" size={20} /></button>
      </header>
      <div class="content has-tabbar" style="padding-top:14px;padding-left:16px;padding-right:16px">
        <div class="of-cap">
          <p>Calculatorul din care iese oferta pentru un client nou. Completezi flota, alegi ce mai primește, iar prețul se face
            singur — pe ecran, în lei și în euro. Când clientul acceptă, oferta devine contract fără să retastezi nimic.</p>
          <div class="of-pasi">
            <span class="of-pas"><b>1</b> Completezi</span>
            <span class="of-pas"><b>2</b> Salvezi oferta</span>
            <span class="of-pas"><b>3</b> Trimiți PDF-ul</span>
            <span class="of-pas"><b>4</b> Deschizi clientul din ea</span>
          </div>
          <div class="of-cap-btn">
            <button class="of-b" onClick={() => loc.route('/admin/offers/preturi')}><Icon name="tag" size={17} /> Prețurile noastre</button>
            <button class="of-b pri" onClick={() => loc.route('/admin/offers/noua')}><Icon name="plus" size={17} /> Ofertă nouă</button>
          </div>
        </div>

        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {offers == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {offers != null && offers.length === 0 && !err && (<>
          <div class="adm-sec2" style="margin-top:0">Oferte salvate</div>
          <div class="adm-empty" style="padding:24px 20px"><Icon name="report" size={40} class="ic" /><div>Nicio ofertă salvată încă.</div></div>
        </>)}
        {offers != null && offers.length > 0 && (<>
          <div class="adm-sec2" style="margin-top:0">Oferte salvate ({offers.length})</div>
          <Palnie rows={offers} />
          <div class="of-hint" style="margin:-4px 0 10px">
            „Vezi hârtia" deschide PDF-ul ofertei în foaia de partajare a telefonului: de acolo îl deschizi cu aplicația de
            PDF-uri, îl salvezi sau îl trimiți. E exact fișierul pe care îl primește clientul.
          </div>
          {offers.map((o: any) => {
            const cfg = (o.config && o.config.cfg) || {};
            // Cursul ÎNGHEȚAT în ofertă; dacă lipsește (ofertă veche), cel de azi — atunci euro e o aproximare.
            const fx = Number(cfg.fxRate) || fxAzi || 5;
            const s = stare(o), m = OF_ET[s] || OF_ET.ciorna, sub = subStare(o);
            const once = Number(o.once_total) || 0;
            const devenit = !!o.contract_id;
            const dosar = devenit && o.company_id != null;   // firma clientului, ca să-i deschidem dosarul
            return (
              <div class="of-rand">
                <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                  <b style="font-size:14px">{o.name || '—'}</b>
                  {cfg.aiA ? <span class="of-ai">AI</span> : null}
                  {/* Aparate închiriate: alt fel de bani (lunar, nu la semnare) — se vede din listă, fără s-o deschizi. */}
                  {cfg.echipMod === 'inchiriaza' ? <span class="of-chirie" title="Aparatele sunt închiriate: rămân ale noastre, chiria se plătește lunar">închiriere</span> : null}
                </div>
                <div style="font-size:12.5px;color:var(--text-muted);margin-top:2px">{(o.client_name || '—') + ' · ' + fmtD(o.created_at)}</div>
                {devenit ? <div style="font-size:11.5px;color:var(--of-ok);font-weight:700;margin-top:3px"><Icon name="check" size={11} color="var(--of-ok)" /> a devenit client</div> : null}
                <div style="display:flex;align-items:flex-start;gap:12px;margin-top:9px">
                  <div style="flex:1;min-width:0">
                    <div style={'display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:700;color:' + m.c}><Icon name={m.ic} size={12} color={m.c} />{m.et}</div>
                    {sub ? <div style="font-size:11px;color:var(--text-muted);margin-top:1px">{sub}</div> : null}
                  </div>
                  <div style="text-align:right">
                    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px">Lunar</div>
                    <div style="font-size:13.5px;font-weight:800">{lei(o.monthly_total)}</div>
                    <div style="font-size:10.5px;color:var(--text-muted)">{eur(o.monthly_total, fx)}</div>
                  </div>
                  <div style="text-align:right">
                    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px">La început</div>
                    {/* Ofertele salvate înainte de 21.09 n-au suma asta: liniuță cinstită, nu „0 lei". */}
                    {once > 0 ? (<>
                      <div style="font-size:13.5px;font-weight:800">{lei(once)}</div>
                      <div style="font-size:10.5px;color:var(--text-muted)">{eur(once, fx)}</div>
                    </>) : <div style="font-size:13px;color:var(--text-muted)" title="Ofertă salvată înainte ca suma asta să se rețină. Deschide-o și salveaz-o din nou.">—</div>}
                  </div>
                </div>
                <div class="of-acts">
                  {butoaneStare(o)}
                  <button class="of-b" disabled={busy === 'pdf-' + o.id} onClick={() => hartia(o)} aria-label="Vezi hârtia">
                    {busy === 'pdf-' + o.id ? <span class="spin" style="width:15px;height:15px;border-width:2px" /> : <Icon name="eye" size={15} />} Vezi hârtia
                  </button>
                  {dosar
                    ? <button class="of-b ok" onClick={() => loc.route('/admin/companies/' + o.company_id + '?tab=contract')} aria-label="Deschide dosarul clientului"><Icon name="fileSignature" size={15} /> Dosarul clientului</button>
                    : devenit ? null : <button class="of-b" onClick={() => loc.route('/admin/client-nou?oferta=' + o.id)} aria-label="Client nou din ofertă"><Icon name="userPlus" size={15} /> Client nou</button>}
                  <button class="of-b of-ic" onClick={() => loc.route('/admin/offers/' + o.id)} aria-label="Deschide și modifică oferta"><Icon name="edit" size={16} /></button>
                  <button class="of-b of-ic rau" onClick={() => del(o)} aria-label="Șterge oferta"><Icon name="trash" size={16} /></button>
                </div>
              </div>
            );
          })}
        </>)}
      </div>

      {foaie && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) setFoaie(null); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b><Icon name={foaie.fel === 'trimisa' ? 'arrowRight' : 'x'} size={18} color="var(--of-ok)" /> {foaie.fel === 'trimisa' ? 'Am trimis oferta' : 'De ce am pierdut-o?'}</b>
              <button class="h-btn" onClick={() => setFoaie(null)} aria-label="Închide"><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              {foaie.fel === 'trimisa' ? (<>
                <div style="font-size:13px;color:var(--text-muted);line-height:1.5;margin-bottom:12px">
                  Până când ține prețul? {z
                    ? 'Implicit ' + z + de(z) + 'zile — destul cât să se gândească, destul de scurt cât să nu fie prețul de pe altă lună.'
                    : 'Lasă gol și se pune termenul obișnuit.'}
                </div>
                <input type="date" class="of-in lat" value={pana} onInput={(e: any) => setPana(e.currentTarget.value)} aria-label="Valabilă până la" />
              </>) : (<>
                <div style="font-size:13px;color:var(--text-muted);line-height:1.5;margin-bottom:12px">Se scrie ca să putem număra, peste un an, unde pierdem cel mai des.</div>
                <select class="of-in lat" value={motiv} onChange={(e: any) => setMotiv(e.currentTarget.value)} style="margin-bottom:8px" aria-label="Motivul">
                  {meta.motivePierdut.map((m) => <option value={m.cod}>{m.et}</option>)}
                </select>
                <input class="of-in lat" value={liber} onInput={(e: any) => setLiber(e.currentTarget.value)} placeholder="amănunte (opțional) — ex. „la 24 lei/mașină la X”" aria-label="Amănunte" />
              </>)}
              <div style="display:grid;grid-template-columns:1fr 2fr;gap:8px;margin-top:16px">
                <button class="of-b" onClick={() => setFoaie(null)} disabled={!!busy}>Anulează</button>
                <button class="of-b pri" onClick={gataFoaie} disabled={!!busy || (foaie.fel === 'pierduta' && !motiv)}><Icon name="check" size={17} /> Gata</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
