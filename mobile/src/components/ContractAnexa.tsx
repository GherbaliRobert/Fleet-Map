// Fișa de contract, partea cu banii lunari: chenarul „Contractul și factura spun același lucru" și Anexa
// nr. 1 (aparatele și serviciile lunare). Ca pe web: _raxCtrComparatie, _raxCtrAnexaHtml,
// _raxCtrAnexaCitita, raxCtrAnexaTotal, raxCtrSalveazaAnexa.
//
// Cifrele comparației vin de la SERVER, socotite cu funcția facturii; propozițiile și verdictul le face
// `verdictComparatie` (lib/contracte.ts), pe care proba o rulează lângă cea de pe web.
// Totalul anexei din editor e informativ (suma adevărată o face serverul, contracte.facAnexa, la salvare).
// Prețul propus pe aparat vine de la server (`pret_sugerat` pe vehicul, în /overview) — regula „cu CAN →
// prețul CAN, FMS → prețul FMS" nu se copiază pe telefon. Până îl trimite serverul, caseta rămâne goală
// și „Salvează anexa" NU pleacă cu un aparat bifat fără preț: serverul l-ar socoti 0 lei, iar partea
// mașinilor venită din ofertă (ex. 10 × 45 lei) s-ar înlocui cu o sumă mai mică, pe hârtie și în comparație.
import { useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { lei, nrAparate, nrMasini, verdictComparatie } from '../lib/contracte';
import { Icon } from './Icon';
import '../screens/contracte.css';

// ── Contract ↔ factură, pe bucăți (nu apare la un contract încheiat — decide fișa) ──
export function Comparatie({ cmp, semnat }: { cmp: any; semnat: boolean }) {
  const v = verdictComparatie(cmp);
  if (!v) return null;
  const m = cmp.masini, ai = cmp.raInsight;
  if (v.fel === 'gol') {
    return (
      <div class="ctr-band warn">
        <div class="ctr-band-t">Anexa nr. 1 e goală</div>
        <div>Contractul nu spune încă ce plătește clientul pe lună, deci n-are cu ce să se compare factura ({lei(cmp.total ? cmp.total.factura : 0)} luna asta). Trece aparatele în anexă, mai jos{semnat ? ' — la un contract semnat, printr-un act adițional.' : '.'}</div>
      </div>
    );
  }
  // Imediat după „Client nou din ofertă" firma n-are încă aparate: drumul firesc, nu o nepotrivire.
  if (v.fel === 'dupaMontaj') {
    return (
      <div class="ctr-band">
        <div class="ctr-band-t">Factura pornește după montaj</div>
        <div>Contractul spune {nrMasini(m.contract.nr)}, {lei(m.contract.lei)} pe lună (din ofertă). Firma n-are încă aparate adoptate, deci luna asta n-ar avea ce factura pentru mașini. Când le treci în anexă, cele două se pun una lângă alta aici.</div>
      </div>
    );
  }
  const bine = v.fel === 'bine';
  return (
    <div class={'ctr-band ' + (bine ? 'ok' : 'warn')}>
      <div class="ctr-band-t">{bine ? 'Contractul și factura spun același lucru' : 'Contractul și factura nu spun același lucru'}</div>
      <div>Mașini: contractul <b>{lei(m.contract.lei)}</b> pe lună ({nrMasini(m.contract.nr)}{m.contract.dinOferta ? ', din ofertă' : ''}) · factura de luna asta <b>{lei(m.factura.lei)}</b> ({nrMasini(m.factura.nr)})</div>
      {ai && (
        <div style="margin-top:4px">RA Insight: {ai.contractPretCont ? lei(ai.contractPretCont) + ' pe cont în contract' : 'nu e în contract'} · acum {ai.facturaConturi === 1 ? '1 cont activ' : (ai.facturaConturi || 0) + ' conturi active'} — se facturează după câte conturi folosește clientul în lună.</div>
      )}
      {v.probleme.length > 0 && (
        <div style="margin-top:6px">{v.probleme.map((p) => <div>• {p}</div>)}</div>
      )}
    </div>
  );
}

// Un rând de citit: titlu, dedesubt detaliul, în dreapta suma.
function Rand({ t, s, v }: { t: any; s?: any; v: any }) {
  return (
    <div class="ctr-row">
      <div class="ctr-row-top">
        <div class="ctr-row-t"><b>{t}</b>{s ? <span class="ctr-row-s">{s}</span> : null}</div>
        <div class="ctr-row-v">{v}</div>
      </div>
    </div>
  );
}

// ── Anexa nr. 1 de citit (contract semnat): mașinile (sau felurile lor, din ofertă) și serviciile ──
export function AnexaCitita({ a }: { a: any }) {
  a = a || {};
  const veh: any[] = a.vehicles || [], vo: any[] = a.vehiculeOferta || [], sv: any[] = a.servicii || [];
  return (
    <div class="ctr-list">
      {veh.length > 0 && veh.map((v) => (
        <Rand t={(v.name || v.imei) + (v.plate ? ' · ' + v.plate : '')}
          s={(v.gpsModel || 'model necompletat') + ' · ' + v.imei + ' · ' + (v.can ? 'cu CAN' : 'fără CAN')}
          v={v.monthlyRON == null ? '—' : lei(v.monthlyRON)} />
      ))}
      {!veh.length && vo.length > 0 && vo.map((r) => (
        <Rand t={r.nume} s={r.cant + ' × ' + lei(r.pret) + (r.detaliu ? ' · ' + r.detaliu : '')} v={lei(r.total)} />
      ))}
      {!veh.length && !vo.length && <div class="ctr-empty">Nicio mașină trecută în anexă.</div>}
      {sv.length > 0 && <div class="ctr-sub" style="margin-top:4px;font-weight:700">Servicii lunare</div>}
      {sv.map((r) => <Rand t={r.nume} s={r.detaliu || (r.cant + ' × ' + lei(r.pret))} v={r.inclus ? 'inclus' : lei(r.total)} />)}
      <div class="ctr-total">Total abonament lunar: <b>{lei(a.monthlyTotal)}</b> (fără TVA)</div>
    </div>
  );
}

// ── Anexa nr. 1 de lucru (contract nesemnat): bifezi aparatele și scrii abonamentul fiecăruia ──
type Rd = { bifat: boolean; pret: string };
export function AnexaEditor({ contract, vehicles, onSalvat }: { contract: any; vehicles: any[]; onSalvat: () => void }) {
  const loc = useLocation();
  const an = contract.annex || {};
  const sv: any[] = an.servicii || [], vo: any[] = an.vehiculeOferta || [];
  const inAnexa: Record<string, any> = {};
  (an.vehicles || []).forEach((v: any) => { inAnexa[v.imei] = v; });
  const gol = !Object.keys(inAnexa).length;
  const [rd, setRd] = useState<Record<string, Rd>>(() => {
    const o: Record<string, Rd> = {};
    vehicles.forEach((v) => {
      const a = inAnexa[v.imei];
      const pret = a && a.monthlyRON != null ? a.monthlyRON : (v.pret_sugerat != null ? v.pret_sugerat : '');
      o[v.imei] = { bifat: gol ? false : !!a, pret: pret === '' || pret == null ? '' : String(pret) };
    });
    return o;
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  // Prețul convenit în ofertă ajunge aici la crearea contractului, chiar fără niciun aparat.
  const dinOferta = Number(an.monthlyTotal) > 0 && !((an.vehicles || []).length) ? (
    <div class="ctr-tag"><Icon name="coins" size={15} />
      <span>Preț convenit: <b>{lei(an.monthlyTotal)}/lună</b> — venit din ofertă{vo.length ? ': ' + vo.map((r) => r.cant + ' × ' + r.nume + ' (' + lei(r.pret) + ')').join(', ') : ''}. Când bifezi aparatele, se recalculează doar partea mașinilor.</span>
    </div>
  ) : null;
  // Serviciile lunare (RA Insight, păstrarea datelor, agenții) rămân în contract și după bifarea aparatelor.
  const servicii = sv.length ? (
    <>
      <div class="ctr-sub" style="margin-top:4px;font-weight:700">Servicii lunare (rămân în contract)</div>
      {sv.map((r) => <Rand t={r.nume} s={r.detaliu || null} v={r.inclus ? 'inclus' : lei(r.total)} />)}
    </>
  ) : null;

  if (!vehicles.length) {
    return (
      <div class="ctr-list">
        {dinOferta}
        <div class="ctr-empty">
          Firma n-are încă niciun aparat adoptat. Adoptă-le întâi din{' '}
          <button class="ctr-name" style="min-height:30px;display:inline-flex" onClick={() => loc.route('/admin/devices')}>Dispozitive → Neasignate</button>
          , apoi treci-le aici.
        </div>
        {servicii}
      </div>
    );
  }

  // Totalul de pe ecran: informativ. Ce se semnează socotește serverul la salvare.
  let n = 0, t = 0;
  vehicles.forEach((v) => { const r = rd[v.imei]; if (r && r.bifat) { n++; t += parseFloat(r.pret) || 0; } });
  const ts = sv.reduce((s, r) => s + (Number(r.total) || 0), 0);

  // Aparatele bifate fără abonament scris: serverul le-ar socoti 0 lei (nu „prețul din ofertă").
  const faraPret = (o: Record<string, Rd>) => vehicles.filter((v) => {
    const r = o[v.imei];
    return r && r.bifat && (r.pret.trim() === '' || !isFinite(parseFloat(r.pret)));
  });

  async function salveaza() {
    if (busy) return;
    const lipsa = faraPret(rd);
    if (lipsa.length) {
      const nume = lipsa.map((v) => (v.name || v.imei) + (v.plate ? ' (' + v.plate + ')' : ''));
      setMsg('Scrie abonamentul lunar pentru ' + (nume.length === 1 ? nume[0] : nume.length + ' aparate: ' + nume.join(', ')) +
        '. Fără el, aparatul intră în contract cu 0 lei și totalul lunar iese greșit. Dacă nu se plătește separat, scrie 0.');
      return;
    }
    setMsg('');
    const lista = vehicles.filter((v) => rd[v.imei] && rd[v.imei].bifat).map((v) => ({
      imei: v.imei, name: v.name || v.imei, plate: v.plate || null,
      gpsModel: v.gps_model || null, can: !!v.bill_can,
      monthlyRON: rd[v.imei].pret !== '' ? parseFloat(rd[v.imei].pret) : null,
    }));
    setBusy(true);
    try {
      await Api.updateContract(Number(contract.id), { annex: { vehicles: lista, currency: 'RON' } });
      showToast('Anexă salvată ✓ (' + lista.length + ' aparate)');
      onSalvat();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(false); }
  }
  const pune = (imei: string, p: Partial<Rd>) => { setMsg(''); setRd((o) => ({ ...o, [imei]: { ...o[imei], ...p } })); };
  const lipsaAcum = new Set(faraPret(rd).map((v) => v.imei));

  return (
    <div class="ctr-list">
      {dinOferta}
      {vehicles.map((v) => {
        const a = inAnexa[v.imei];
        const r = rd[v.imei] || { bifat: false, pret: '' };
        // Modelul și CAN-ul ajung pe hârtia semnată: dacă modelul lipsește, o scriem pe față.
        const model = a && a.gpsModel ? a.gpsModel : (v.gps_model || null);
        const can = a && (a.can === true || a.can === false) ? a.can : !!v.bill_can;
        return (
          <div class={'ctr-chk' + (r.bifat ? ' on' : '')}>
            <input type="checkbox" checked={r.bifat} aria-label={'În anexă: ' + (v.name || v.imei)} onChange={() => pune(v.imei, { bifat: !r.bifat })} />
            <div class="mid" onClick={() => pune(v.imei, { bifat: !r.bifat })}>
              <b>{v.name || v.imei}</b>{v.plate ? ' · ' + v.plate : ''}
              <span class="ctr-row-s">
                {model ? model : <span class="ctr-warn-txt">model necompletat</span>}
                {' · ' + v.imei + ' · ' + (can ? 'cu date din motor (CAN)' : 'fără CAN')}
              </span>
            </div>
            <input class={'ctr-price' + (lipsaAcum.has(v.imei) ? ' lipsa' : '')} type="number" inputMode="decimal" min="0" step="1" placeholder="lei/lună" value={r.pret}
              aria-label={'Abonament lunar, lei: ' + (v.name || v.imei)} onInput={(e: any) => pune(v.imei, { pret: e.target.value })} />
          </div>
        );
      })}
      {servicii}
      <div class="ctr-total">
        {n ? <><b>{nrAparate(n)}</b>: {lei(t)}{ts ? ' + servicii ' + lei(ts) : ''} = <b>{lei(t + ts)} pe lună</b> (fără TVA)</> : 'Niciun aparat bifat.'}
      </div>
      <button class="ctr-btn" style="align-self:flex-start" disabled={busy} onClick={salveaza}><Icon name="check" size={16} /> {busy ? 'Se salvează…' : 'Salvează anexa'}</button>
      {msg && <div class="ctr-msg">{msg}</div>}
    </div>
  );
}
