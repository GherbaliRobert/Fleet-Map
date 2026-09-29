// Actele adiționale ale unui contract SEMNAT — ca pe web (raxActeIncarca / raxActeRandeaza / raxActTreci /
// _raxActeFormular / raxActSalveaza / raxActUrca / raxActSterge).
//
// Un contract semnat nu se mai atinge: ce se schimbă (mașini noi, alt preț, o prelungire) se scrie într-un
// act adițional, cu drumul lui (în lucru → aprobat → trimis → semnat), câte un buton pe pas. Actul semnat
// nu se mai modifică și nu se șterge (regula stă pe server). Serverul păstrează singur serviciile lunare
// în anexa nouă a actului și scrie hârtia (PDF-ul) — telefonul nu desenează nimic.
//
// Un act de PRELUNGIRE (cu „luni în plus") schimbă ce scrie sus, în fișă: „Prelungirea e pornită: actul …"
// și butonul „Reînnoiește" vin din /overview (`prelungire_in_lucru`). De aceea, orice schimbare a unui astfel
// de act (salvat, șters, trecut la pasul următor, semnat) reîncarcă TOATĂ fișa (`onFisa`), nu doar lista —
// altfel „Reînnoiește" rămânea ascuns după ștergerea ciornei, sau vizibil și dădea 409.
// Butonul „înapoi" de pe Android închide foaia actului (întreabă dacă s-a scris ceva), nu pleacă din fișă.
import { useEffect, useRef, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import { ACT_PAS, ACT_STARI_ET, azi, de, inputZi, luniText, zi, zile } from '../lib/contracte';
import { AlegeFisier, DescarcaFisier, HartieBtns, Pill, type FisierAles } from './ContractUi';
import { Confirma } from './FlotaUi';
import { Icon } from './Icon';
import '../screens/admin.css';
import '../screens/detail.css';
import '../screens/contracte.css';

type Form = {
  id: number; nr: string; status: string; obiect: string; signed: string; start: string; luni: string;
  cuAnexa: boolean; anexa: Record<string, { bifat: boolean; pret: string }>;
  luniVechi: boolean; // actul, cum era salvat, prelungea contractul
};
const ePrelungire = (a: any) => !!a && Number(a.luni_noi) > 0;

export function ContractActe({ contract, vehicles, onFisa }: { contract: any; vehicles: any[]; onFisa: () => void }) {
  const [lista, setLista] = useState<any[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [semneaza, setSemneaza] = useState<any | null>(null);
  const [sterge, setSterge] = useState<any | null>(null);
  const [urca, setUrca] = useState<number | null>(null);
  const start = useRef(''); // formularul cum s-a deschis — „înapoi" întreabă doar dacă s-a schimbat ceva
  const contractId = Number(contract.id);
  const inVigoare = contract.status === 'activ'; // act nou doar la un contract în vigoare

  function incarca() {
    Api.contractActe(contractId).then((l) => setLista(Array.isArray(l) ? l : [])).catch(() => setLista([]));
  }
  useEffect(incarca, [contractId]);

  // ── Pasul următor al unui act (semnarea întreabă întâi) ──
  async function treci(a: any, stare: string) {
    const trup: any = { status: stare };
    if (stare === 'activ' && !a.signed_at) trup.signed_at = zi(azi());
    setBusy(true);
    try {
      const j: any = await Api.updateAct(Number(a.id), trup);
      showToast('Act ' + ((j && j.number) || '') + ': ' + (ACT_STARI_ET[j && j.status] || (j && j.status) || stare) + ' ✓');
      setSemneaza(null);
      // O semnare (sau orice pas al unei prelungiri) schimbă ce scrie sus, în fișă: se reîncarcă TOATĂ.
      if (stare === 'activ' || ePrelungire(a)) onFisa(); else incarca();
    } catch (e: any) { showToast(e?.message || 'Nu s-a putut', true); }
    finally { setBusy(false); }
  }
  function pas(a: any) {
    const p = ACT_PAS[a.status];
    if (!p) return;
    if (p[0] === 'activ') setSemneaza(a); else treci(a, p[0]);
  }

  // ── Formularul ──
  function deschide(a: any | null) {
    const inAnexa: Record<string, any> = {};
    ((a && a.annex && a.annex.vehicles) || []).forEach((v: any) => { inAnexa[v.imei] = v; });
    const anexa: Form['anexa'] = {};
    vehicles.forEach((v) => {
      const x = inAnexa[v.imei];
      anexa[v.imei] = { bifat: !!x, pret: x && x.monthlyRON != null ? String(x.monthlyRON) : '' };
    });
    setMsg('');
    const f: Form = {
      id: a ? Number(a.id) : 0, nr: (a && a.number) || '', status: (a && a.status) || 'ciorna', obiect: (a && a.obiect) || '',
      signed: a && a.signed_at ? inputZi(a.signed_at) : '', start: a && a.start_at ? inputZi(a.start_at) : '',
      luni: a && a.luni_noi != null ? String(a.luni_noi) : '', cuAnexa: !!Object.keys(inAnexa).length, anexa,
      luniVechi: ePrelungire(a),
    };
    start.current = JSON.stringify(f);
    setForm(f);
  }
  // Întoarce true dacă foaia s-a închis. Aceeași întrebare pentru X, fundal și „înapoi" de pe Android.
  function inchide(): boolean {
    if (!form) return true;
    if (busy) return false;
    if (JSON.stringify(form) !== start.current && !confirm('Închizi fără să salvezi?\n\nCe ai scris în actul adițional se pierde.')) return false;
    setForm(null);
    return true;
  }
  useInapoiInchide(!!form, inchide);
  const sf = (k: keyof Form, v: any) => setForm((p) => (p ? { ...p, [k]: v } : p));
  async function salveaza() {
    if (!form || busy) return;
    const obiect = form.obiect.trim();
    if (!obiect) { setMsg('Scrie ce se schimbă — asta ajunge pe hârtie.'); return; }
    let annex: any = null;
    if (form.cuAnexa) {
      // Un aparat bifat fără abonament ar intra în anexa nouă cu 0 lei (serverul nu pune alt preț).
      const lipsa = vehicles.filter((v) => {
        const r = form.anexa[v.imei];
        return r && r.bifat && (r.pret.trim() === '' || !isFinite(parseFloat(r.pret)));
      }).map((v) => (v.name || v.imei) + (v.plate ? ' (' + v.plate + ')' : ''));
      if (lipsa.length) {
        setMsg('Scrie abonamentul lunar pentru ' + (lipsa.length === 1 ? lipsa[0] : lipsa.length + ' aparate: ' + lipsa.join(', ')) +
          '. Fără el, aparatul intră în anexă cu 0 lei. Dacă nu se plătește separat, scrie 0.');
        return;
      }
      const l = vehicles.filter((v) => form.anexa[v.imei] && form.anexa[v.imei].bifat).map((v) => ({
        imei: v.imei, name: v.name || v.imei, plate: v.plate || null,
        gpsModel: v.gps_model || null, can: !!v.bill_can,
        monthlyRON: form.anexa[v.imei].pret !== '' ? parseFloat(form.anexa[v.imei].pret) : null,
      }));
      annex = { vehicles: l, currency: 'RON' };
    }
    const trup = {
      number: form.nr.trim() || null, status: form.status, obiect,
      signed_at: zi(form.signed), start_at: zi(form.start),
      luni_noi: form.luni === '' ? null : parseInt(form.luni, 10),
      annex,
    };
    const prelungire = form.luniVechi || (trup.luni_noi != null && trup.luni_noi > 0);
    setBusy(true); setMsg('');
    try {
      if (form.id) await Api.updateAct(form.id, trup); else await Api.createAct(contractId, trup);
      setForm(null);
      showToast('Act adițional salvat ✓');
      if (prelungire) onFisa(); else incarca();
    } catch (e: any) { setMsg(e?.message || 'Eroare'); }
    finally { setBusy(false); }
  }

  async function urcaScan(id: number, f: FisierAles) {
    setUrca(id);
    try { await Api.uploadActFile(id, { name: f.name, b64: f.b64 }); showToast('Act semnat urcat ✓'); incarca(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setUrca(null); }
  }
  async function stergeAct() {
    if (!sterge || busy) return;
    setBusy(true);
    try {
      const prelungire = ePrelungire(sterge);
      await Api.deleteAct(Number(sterge.id)); setSterge(null);
      if (prelungire) onFisa(); else incarca();
    }
    catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(false); }
  }

  return (
    <>
      {lista == null ? <div class="spin" style="margin:8px auto" /> : (
        <div class="ctr-list">
          {!lista.length && <div class="ctr-empty">Niciun act adițional. Contractul e cum a fost semnat.</div>}
          {lista.map((a) => {
            const st = ACT_STARI_ET[a.status] || a.status;
            const fel = a.status === 'activ' ? 'ok' : (a.status === 'ciorna' ? '' : 'warn');
            const p = ACT_PAS[a.status];
            const detalii = 'de la ' + zile(a.start_at) + (a.signed_at ? ' · semnat ' + zile(a.signed_at) : '') +
              (a.annex && (a.annex.vehicles || []).length ? ' · anexă nouă de aparate' : '') +
              (a.montaj && (a.montaj.items || []).length ? ' · montaj' : '') +
              (a.luni_noi ? ' · prelungire ' + luniText(Number(a.luni_noi)) : '') +
              (a.has_file ? ' · act semnat atașat' : '');
            return (
              <div class="ctr-row">
                <div class="ctr-row-top">
                  <div class="ctr-row-t">
                    <b>{a.number || ('A' + a.nr_ordine)}</b> · {String(a.obiect || 'fără obiect scris').slice(0, 90)}
                    <span class="ctr-row-s">{detalii}</span>
                  </div>
                </div>
                <div><Pill fel={fel}>{st}</Pill></div>
                <div class="ctr-btns">
                  {p && <button class="ctr-btn pri" disabled={busy} onClick={() => pas(a)}><Icon name="arrowRight" size={15} /> {p[1]}</button>}
                  <HartieBtns path={'/api/acte/' + a.id + '/pdf'} ce="Actul adițional" nume="act-aditional.pdf" />
                  {a.has_file
                    ? <DescarcaFisier path={'/api/acte/' + a.id + '/file'} ce="Actul semnat" eticheta="Actul semnat" />
                    : <AlegeFisier busy={urca === Number(a.id)} etFoto="Poză act semnat" etFisier="Urcă actul semnat" onFile={(f) => urcaScan(Number(a.id), f)} />}
                  {/* Un act SEMNAT nu se mai editează și nu se șterge — ca un contract semnat. */}
                  {a.status !== 'activ' && <button class="ctr-btn" onClick={() => deschide(a)}><Icon name="edit" size={15} /> Modifică</button>}
                  {a.status !== 'activ' && <button class="ctr-btn danger" onClick={() => setSterge(a)}><Icon name="trash" size={15} /> Șterge</button>}
                </div>
              </div>
            );
          })}
          {inVigoare && <button class="ctr-btn" style="align-self:flex-start" onClick={() => deschide(null)}><Icon name="fileSignature" size={16} /> Act adițional nou</button>}
        </div>
      )}

      {form && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) inchide(); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b><Icon name="fileSignature" size={18} color="var(--accent)" /> {form.id ? 'Actul adițional' : 'Act adițional nou'}</b>
              <button class="h-btn" onClick={() => inchide()} aria-label="Închide"><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Număr</label><input value={form.nr} placeholder="se propune automat" onInput={(e: any) => sf('nr', e.target.value)} /></div>
                <div class="fld"><label>Unde e actul</label>
                  <select value={form.status} onChange={(e: any) => sf('status', e.target.value)}>
                    {['ciorna', 'aprobat', 'trimis'].map((k) => <option value={k}>{ACT_STARI_ET[k]}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Ce se schimbă (se scrie pe hârtie, cuvânt cu cuvânt)</label>
                  <textarea rows={4} value={form.obiect} onInput={(e: any) => sf('obiect', e.target.value)}
                    placeholder="ex. Se suplimentează flota monitorizată cu 3 vehicule, conform Anexei nr. 1 la prezentul act. Abonamentul lunar devine 767 lei, fără TVA." />
                </div>
                <div class="fld"><label>Data semnării</label><input type="date" value={form.signed} onInput={(e: any) => sf('signed', e.target.value)} /></div>
                <div class="fld"><label>Produce efecte de la</label><input type="date" value={form.start} onInput={(e: any) => sf('start', e.target.value)} /></div>
                <div class="fld"><label>Prelungire (luni, dacă e cazul)</label><input type="number" inputMode="numeric" min="0" step="1" placeholder="ex. 12" value={form.luni} onInput={(e: any) => sf('luni', e.target.value)} /></div>
                <label class="ctr-semn-b">
                  <input type="checkbox" checked={form.cuAnexa} onChange={() => sf('cuAnexa', !form.cuAnexa)} />
                  <span style="font-weight:700">Actul schimbă lista de aparate (anexă nouă)</span>
                </label>
                {form.cuAnexa && (vehicles.length ? (
                  <div class="ctr-list">
                    <div class="ctr-sub">Bifează aparatele care rămân în contract DUPĂ modificare — lista asta o înlocuiește pe cea veche.</div>
                    {vehicles.map((v) => {
                      const r = form.anexa[v.imei] || { bifat: false, pret: '' };
                      const pune = (p: any) => { setMsg(''); setForm((f) => (f ? { ...f, anexa: { ...f.anexa, [v.imei]: { ...r, ...p } } } : f)); };
                      const lipsaPret = r.bifat && (r.pret.trim() === '' || !isFinite(parseFloat(r.pret)));
                      return (
                        <div class={'ctr-chk' + (r.bifat ? ' on' : '')}>
                          <input type="checkbox" checked={r.bifat} aria-label={'Rămâne în contract: ' + (v.name || v.imei)} onChange={() => pune({ bifat: !r.bifat })} />
                          <div class="mid" onClick={() => pune({ bifat: !r.bifat })}>
                            <b>{v.name || v.imei}</b>{v.plate ? ' · ' + v.plate : ''}
                            <span class="ctr-row-s">{(v.gps_model || 'model necompletat') + ' · ' + v.imei}</span>
                          </div>
                          <input class={'ctr-price' + (lipsaPret ? ' lipsa' : '')} type="number" inputMode="decimal" min="0" step="1" placeholder="lei/lună" value={r.pret}
                            aria-label={'Abonament lunar, lei: ' + (v.name || v.imei)} onInput={(e: any) => pune({ pret: e.target.value })} />
                        </div>
                      );
                    })}
                  </div>
                ) : <div class="ctr-empty">Firma n-are aparate adoptate.</div>)}
                {msg && <div class="ctr-msg">{msg}</div>}
                <div class="frm-actions">
                  <button class="btn fl-btn2" disabled={busy} onClick={() => setForm(null)}>Renunț</button>
                  <button class="btn btn-primary" disabled={busy} onClick={salveaza}><Icon name="check" size={16} /> {busy ? 'Se salvează…' : 'Salvează actul'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {semneaza && (
        <Confirma title="Actul e semnat?" busy={busy} okLabel="Da, e semnat"
          text={'Marchezi actul ' + (semneaza.number || '') + ' SEMNAT de amândoi?\n\nDin clipa asta nu se mai modifică.' +
            (semneaza.luni_noi ? ' Contractul se prelungește cu ' + semneaza.luni_noi + de(Number(semneaza.luni_noi)) + 'luni.' : '') +
            (semneaza.signed_at ? '' : '\n\nData semnării nu e scrisă — pun data de azi.')}
          onOk={() => treci(semneaza, 'activ')} onCancel={() => { if (!busy) setSemneaza(null); }} />
      )}
      {sterge && (
        <Confirma title="Șterge actul adițional" danger busy={busy} okLabel="Șterge"
          text="Ștergi actul adițional? Unul semnat nu se poate șterge."
          onOk={stergeAct} onCancel={() => { if (!busy) setSterge(null); }} />
      )}
    </>
  );
}
