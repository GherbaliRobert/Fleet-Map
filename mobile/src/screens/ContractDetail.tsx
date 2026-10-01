// Super-admin: fișa de contract a unei firme — pe web, fila „Contract" din fereastra firmei (_raxCodContract).
//
// Un drum cu câte un buton: în lucru → aprobat → trimis → semnat → încheiat. Cutia „ce urmează" spune
// unde ești și care e pasul următor; butonul lui SALVEAZĂ întâi ce e scris în câmpuri (ca pe web,
// raxCtrTreci → raxCtrSalveaza). Semnarea și încheierea întreabă întâi: după ele nu se mai întoarce nimic.
// Odată semnat, contractul se arată doar de citit — mai trec doar data semnării și motivul încetării
// (serverul refuză orice alt câmp). Ce se schimbă după semnare se face printr-un act adițional.
//
// Tot ce e dată de capăt, preaviz, dosar, comparația cu factura sau textul prelungirii vine de la SERVER
// (/api/companies/:id/overview). Telefonul doar le pune pe ecran.
//
// Sus, sub ce lipsește, „Drumul clientului" (24.09): ofertă → trimis la semnat → semnat → montaj → aparate →
// prima factură, cu butonul pasului următor — pașii îi socotește serverul (`drum`), butoanele sunt aceleași ca
// în lista Contracte (usePasiContract). Din 30.09 (ca pe web), pasul „Montajul" duce în calendarul de montaj, iar
// „Contractul e semnat" pe un contract cu aparate vândute deschide proforma lor, gata pregătită.
//
// Ce e scris în „Datele contractului" și nesalvat NU se pierde (29.09): pașii din drum care lucrează pe contractul
// salvat („Trimite la semnat", „Am trimis-o", „E semnat") îl salvează întâi, iar o reîncărcare după o acțiune de
// alături (montaj, anexă, „Completează", un act, un fișier) îl lasă pe ecran.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import { Icon } from '../components/Icon';
import { Confirma } from '../components/FlotaUi';
import { AlegeFisier, CapEcran, DescarcaFisier, HartieBtns, Pill, useReinnoire, type FisierAles } from '../components/ContractUi';
import { AnexaCitita, AnexaEditor, Comparatie } from '../components/ContractAnexa';
import { ContractActe } from '../components/ContractActe';
import { Anexa2, ContractMontaj } from '../components/ContractMontaj';
import { DrumClient } from '../components/ContractDrum';
import { areAparateVandute, lipsuriFirma, randDinFisa, spreProforma, usePasiContract } from '../components/ContractPasi';
import {
  CTR_EXPLIC, CTR_PAS, CTR_STARI, DOSAR_FEL, azi, deReinnoit, dupaIncetare, dupaIncetareConfirm, inputZi, luniOptiuni, luniText, rolNostru,
  semnatariDin, zi, zile,
} from '../lib/contracte';
import { rutaDosar } from '../lib/companii';
import './admin.css';
import './detail.css';
import './contracte.css';
import { nrDe } from '../lib/numar';

type Form = {
  nr: string; signed: string; start: string; months: string; renew: string; notice: string;
  rep: string; reprole: string; our: string; ourrole: string; gdpr: string; status: string; endreason: string;
};
const NESEMNAT = ['ciorna', 'aprobat', 'trimis'];

function formDin(c: any, noi: string[] | null): Form {
  const alesi = semnatariDin(c && c.our_rep && c.our_rep.name);
  return {
    nr: (c && c.number) || '', signed: inputZi(c && c.signed_at), start: inputZi(c && c.start_at),
    months: c && c.months != null ? String(c.months) : '',
    renew: c && c.auto_renew === false ? '0' : '1',
    notice: String(c && c.notice_days != null ? c.notice_days : 30),
    rep: (c && c.client_rep && c.client_rep.name) || '', reprole: (c && c.client_rep && c.client_rep.role) || '',
    // Contract fără semnatari scriși → propunem TOȚI super-adminii (de regulă semnăm amândoi).
    our: alesi.length ? String(c.our_rep.name) : (noi || []).join(' și '),
    ourrole: (c && c.our_rep && c.our_rep.role) || rolNostru((noi || []).length),
    gdpr: c && c.gdpr && c.gdpr.kind === 'separat' ? 'separat' : 'anexa',
    status: c && NESEMNAT.indexOf(c.status) >= 0 ? c.status : 'ciorna',
    endreason: (c && c.ended_reason) || '',
  };
}
// Fișa se reîncarcă după fiecare acțiune de alături (o lucrare de montaj, anexa, „Completează", un act, un fișier).
// Ce ai scris în „Datele contractului" și n-ai salvat NU se pierde atunci: un câmp schimbat de tine (față de cum
// venise, `vechi`) rămâne cum l-ai scris, unul neatins ia valoarea proaspătă de la server (`nou`). Starea vine MEREU
// de la server: ea se schimbă doar prin pașii contractului, iar o stare veche ținută pe ecran l-ar întoarce din drum
// la următoarea salvare. Corpul e JavaScript curat, ca `verify_contracte_telefon.js` să-l poată rula.
function cuCeAiScris(nou: any, acum: any, vechi: any): Form {
  const out = Object.assign({}, nou);
  Object.keys(nou).forEach(function (k) { if (k !== 'status' && acum[k] !== vechi[k]) out[k] = acum[k]; });
  return out;
}

export function ContractDetail() {
  const loc = useLocation();
  const { params } = useRoute();
  const companyId = Number((params as any).companyId);
  const [d, setD] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [noi, setNoi] = useState<string[] | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [atinsNoi, setAtinsNoi] = useState(false); // omul a schimbat semnatarii noștri → nu-i mai propunem
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'' | 'semnat' | 'incheiat' | 'sterge' | 'scoate-contract' | 'scoate-gdpr'>('');
  const [urca, setUrca] = useState('');
  const [versiune, setVersiune] = useState(0); // schimbată la fiecare reîncărcare: secțiunile de sub fișă pornesc din nou
  const cur = useRef(companyId);
  cur.current = companyId;

  // Formularul cum a venit la ultima încărcare, și al cărui contract e — ca reîncărcarea să știe ce ai schimbat tu.
  const baza = useRef<{ id: any; f: Form } | null>(null);
  // `pastreaza`: după o acțiune de alături, ce ai scris și n-ai salvat rămâne pe ecran (cuCeAiScris). Fără el (prima
  // încărcare, „Reîncarcă", după o salvare, un contract nou sau șters) formularul se ia întreg de la server.
  // Întoarce fișa proaspătă (sau null), ca pasul de după o salvare să lucreze pe ea (salveazaIntai).
  function incarca(pastreaza?: boolean): Promise<any | null> {
    const id = companyId;
    setErr('');
    return Api.companyOverview(id).then((o: any) => {
      if (cur.current !== id) return null; // răspuns întârziat pentru altă firmă
      if (o && o.error) { setErr(o.error); return null; }
      const k = o && o.contract;
      const nou = k ? formDin(k, noi) : null;
      const b = baza.current;
      const pastrat = !!(pastreaza && nou && b && b.id === k.id);
      setD(o);
      setForm((f) => (pastrat && f && b && nou ? cuCeAiScris(nou, f, b.f) : nou));
      baza.current = nou ? { id: k.id, f: nou } : null;
      if (!pastrat) { setAtinsNoi(false); setMsg(''); }
      setVersiune((v) => v + 1);
      return o;
    }).catch((e: any) => { if (cur.current === id) setErr(e?.message || 'Eroare la încărcare'); return null; });
  }
  const reincarca = () => { incarca(true); };
  useEffect(() => { setD(null); incarca(); }, [companyId]);
  // Cine semnează din partea noastră: conturile de super-admin active (numele nu se scriu în cod).
  useEffect(() => {
    Api.users().then((u) => {
      const l = (Array.isArray(u) ? u : []).filter((x: any) => x.role === 'superadmin' && x.active !== false)
        .map((x: any) => String(x.full_name || x.username || '').trim()).filter(Boolean);
      setNoi(l);
    }).catch(() => setNoi([]));
  }, []);
  // Când lista sosește după fișă: contractul fără semnatari scriși primește propunerea (dacă omul n-a scris nimic).
  useEffect(() => {
    if (!noi || !d || !d.contract || atinsNoi) return;
    const c = d.contract;
    if (semnatariDin(c.our_rep && c.our_rep.name).length) return;
    setForm((f) => (f ? { ...f, our: noi.join(' și '), ourrole: (c.our_rep && c.our_rep.role) || rolNostru(noi.length) } : f));
  }, [noi, d]);

  const inapoi = () => { if (history.length > 1) history.back(); else loc.route('/admin/contracts'); };
  const { cere: reinnoieste, ui: uiReinnoire } = useReinnoire((cid) => { if (cid === companyId) reincarca(); else loc.route(rutaDosar(cid)); });
  // Butoanele drumului și „Completează" — aceleași ca în lista Contracte. Aici „Aprobă contractul" salvează întâi
  // formularul (ca raxCtrTreci pe web), „Trimite la semnat" / „Am trimis-o" / „E semnat" la fel (salveazaIntai).
  // „Programează montajul" duce în calendar, ca din listă. După „Completează" (datele firmei), ce ai scris în
  // formularul contractului rămâne.
  const pasi = usePasiContract({
    trimitePeEmail: !!(d && d.trimite_pe_email),
    laSchimbat: reincarca,
    aproba: () => treci('aprobat'),
    salveazaIntai,
  });
  // „Înapoi" pe Android închide întrebarea deschisă a dosarului (semnat, încheiat, șterge, scoate fișierul), nu
  // ecranul — ca întrebările din listă și din fișa firmei. Cât se salvează, rămâne deschisă.
  useInapoiInchide(!!dialog, () => { if (busy) return false; setDialog(''); return true; });

  const c = d && d.contract;
  const semnat = !!c && (c.status === 'activ' || c.status === 'incheiat');
  const sf = (k: keyof Form, v: any) => setForm((f) => (f ? { ...f, [k]: v } : f));

  // ── Salvarea (butonul formularului și, înainte de pasul următor, butonul mare) ──
  // Întoarce fișa proaspătă după salvare, sau null dacă salvarea n-a mers (mesajul e pe ecran). Butoanele rămân
  // blocate până sosește fișa, ca pasul de după să nu lucreze pe contractul de dinainte.
  async function salveaza(stareNoua?: string, motiv?: string | null, semnatAzi?: string): Promise<any | null> {
    if (!c || !form || busy) return null;
    const signed = semnatAzi || form.signed;
    let trup: any;
    if (semnat) {
      // Semnat: doar data semnării, încheierea și motivul ei. Serverul oricum refuză orice alt câmp.
      trup = { signed_at: zi(signed), gdpr: { kind: (c.gdpr && c.gdpr.kind) || 'anexa', signed_at: zi(signed) } };
      if (stareNoua) trup.status = stareNoua;
      if (typeof motiv === 'string' && motiv.trim()) trup.ended_reason = motiv.trim();
      else if (c.status === 'incheiat') trup.ended_reason = form.endreason || null;
    } else {
      trup = {
        number: form.nr.trim(), status: stareNoua || form.status,
        signed_at: zi(signed), start_at: zi(form.start),
        months: form.months === '' ? null : parseInt(form.months, 10),
        auto_renew: form.renew === '1', notice_days: parseInt(form.notice, 10) || 0,
        client_rep: { name: form.rep.trim(), role: form.reprole.trim() },
        our_rep: { name: form.our.trim(), role: form.ourrole.trim() },
        gdpr: { kind: form.gdpr, signed_at: zi(signed) },
      };
    }
    setBusy(true); setMsg('');
    try {
      await Api.updateContract(Number(c.id), trup);
    } catch (e: any) {
      const t = e?.message || 'Eroare';
      setMsg(t); setDialog('');
      showToast(t, true); // butonul mare e sus, mesajul de sub formular poate fi în afara ecranului
      setBusy(false);
      return null;
    }
    showToast('Contract salvat ✓');
    // „Contractul e semnat" pe un contract cu aparate VÂNDUTE (web: raxCtrTreci → raxProformaLaSemnare): se deschide
    // proforma avansului, gata pregătită. Se pleacă cu întrebarea încă deschisă — adresa proformei ia locul intrării
    // ei din istoric (spreProforma) —, iar dosarul se reîncarcă singur la întoarcere. `c` e contractul de dinainte de
    // salvare, ca pe web: semnarea nu schimbă Anexa nr. 2.
    if (stareNoua === 'activ' && areAparateVandute(c)) { spreProforma(loc, companyId); setDialog(''); setBusy(false); return null; }
    setDialog('');
    try { return await incarca(); } finally { setBusy(false); }
  }
  // Pasul următor. Semnarea și încheierea întreabă întâi.
  function treci(stare: string) {
    if (stare === 'activ' || stare === 'incheiat') { setDialog(stare === 'activ' ? 'semnat' : 'incheiat'); return; }
    salveaza(stare);
  }
  // Ce scrie în „Datele contractului" și nu e încă pe server. Starea nu contează (o hotărăște pasul). Semnatarii
  // noștri PROPUȘI (contract fără semnatari scriși) contează: se văd pe ecran, deci trebuie să ajungă și pe hârtie.
  function nesalvat(): boolean {
    if (!c || !form || semnat) return false;
    const s = formDin(c, []);
    return (Object.keys(s) as (keyof Form)[]).some((k) => k !== 'status' && form[k] !== s[k]);
  }
  // „Trimite la semnat" (PDF-ul emailat se face din contractul SALVAT), „Am trimis-o" și „E semnat" (după semnare
  // numărul, datele și semnatarii nu se mai schimbă decât prin act adițional) salvează ÎNTÂI ce e scris aici — ca
  // „Aprobă contractul" și butonul din „ce urmează" (web: raxCtrTreci → raxCtrSalveaza). Starea rămâne cea de acum;
  // o schimbă pasul. Foaia pasului primește contractul proaspăt; dacă salvarea n-a mers, nu se deschide.
  async function salveazaIntai(rand: any): Promise<any | null> {
    if (!nesalvat()) return rand;
    const o = await salveaza(c.status);
    return o && o.contract ? randDinFisa(o) : null;
  }
  async function creeaza() {
    if (busy) return;
    setBusy(true);
    try {
      await Api.createContract(companyId, { status: 'ciorna', months: 12, auto_renew: true, notice_days: 30, gdpr: { kind: 'anexa' } });
      incarca();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(false); }
  }
  async function sterge() {
    if (!c || busy) return;
    setBusy(true);
    try { await Api.deleteContract(Number(c.id)); setDialog(''); incarca(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(false); }
  }
  async function urcaFisier(care: string, f: FisierAles) {
    if (!c) return;
    setUrca(care);
    try { await Api.uploadContractFile(Number(c.id), { care, name: f.name, b64: f.b64 }); showToast('Act urcat ✓'); reincarca(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setUrca(''); }
  }
  async function scoateFisier(care: string) {
    if (!c || busy) return;
    setBusy(true);
    try { await Api.deleteContractFile(Number(c.id), care); setDialog(''); reincarca(); }
    catch (e: any) { showToast('Eroare: ' + (e?.message || ''), true); }
    finally { setBusy(false); }
  }

  const titlu = (d && d.company && d.company.name) || 'Contract';
  return (
    <div class="screen">
      <CapEcran titlu={titlu} onBack={inapoi} onRefresh={() => { setD(null); incarca(); }} />
      <div class="content">
        <div class="ctr-wrap">
          {err && <div class="ctr-err">{err}</div>}
          {!d && !err && <div class="spin" style="margin:30px auto" />}
          {d && fisa()}
        </div>
      </div>
      {uiReinnoire}
      {dialog === 'semnat' && (
        <Confirma title="Contractul e semnat?" busy={busy} okLabel="Da, e semnat"
          text={'Marchezi contractul SEMNAT de amândoi?\n\nDin clipa asta contractul și anexele lui nu se mai modifică: orice schimbare (mașini noi, alt preț, prelungire) se face prin act adițional.' +
            (form && form.signed ? '' : '\n\nData semnării nu e scrisă — pun data de azi.')}
          onOk={() => { const z = form && form.signed ? undefined : azi(); if (z) sf('signed', z); salveaza('activ', null, z); }}
          onCancel={() => { if (!busy) setDialog(''); }} />
      )}
      {dialog === 'incheiat' && (
        <Confirma title="Încheie contractul" danger busy={busy} okLabel="Încheie contractul"
          text={'Marchezi contractul ÎNCHEIAT? Se trece data de azi ca dată a încetării. Un contract încheiat nu mai poate fi redeschis.' +
            dupaIncetareConfirm(d && d.date_dupa_incetare_zile)}
          field={{ label: 'Motivul încetării (rămâne în dosar)', placeholder: 'ex. denunțare cu preaviz' }}
          onOk={(v) => salveaza('incheiat', v || '')} onCancel={() => { if (!busy) setDialog(''); }} />
      )}
      {dialog === 'sterge' && (
        <Confirma title="Șterge contractul" danger busy={busy} okLabel="Șterge"
          text="Ștergi ciorna de contract? Un contract semnat nu se poate șterge — se încheie."
          onOk={sterge} onCancel={() => { if (!busy) setDialog(''); }} />
      )}
      {(dialog === 'scoate-contract' || dialog === 'scoate-gdpr') && (
        <Confirma title="Scoate fișierul" danger busy={busy} okLabel="Scoate"
          text="Scoți fișierul din dosar? Datele contractului rămân."
          onOk={() => scoateFisier(dialog === 'scoate-gdpr' ? 'gdpr' : 'contract')} onCancel={() => { if (!busy) setDialog(''); }} />
      )}
      {pasi.ui}
    </div>
  );

  // ── Fișa, de sus în jos, în ordinea de pe web ──
  function fisa() {
    const dos = d.dosar || {};
    // Contractul (sau doar firma, fără contract) în forma unui rând din lista Contracte — pentru butoane.
    const rand = randDinFisa(d);
    // CUI, sediu, reprezentant: le completăm noi, pe loc („Completează", cu ANAF). Ce lipsește spune serverul.
    const deCompletat = lipsuriFirma(rand).length > 0;
    // Ce lipsește — sus de tot, și doar când chiar lipsește ceva sau expiră.
    const cutieDosar = dos.nivel && dos.nivel !== 'demo' && (dos.text || dos.nivel === 'expira') ? (
      <div class={'ctr-band ' + (DOSAR_FEL[dos.nivel] || '')}>
        <div class="ctr-band-t">{dos.eticheta || ''}</div>
        {dos.text && <div>Lipsește: {dos.text}</div>}
        {d.preaviz_pana && c && c.status === 'activ' && <div>Ultima zi în care se poate anunța rezilierea: <b>{zile(d.preaviz_pana)}</b></div>}
        {deCompletat && (
          <div class="ctr-btns">
            <button class="ctr-btn" onClick={() => pasi.completeaza(rand)}><Icon name="edit" size={15} /> Completează</button>
          </div>
        )}
      </div>
    ) : null;

    if (!c) {
      return (
        <>
          {cutieDosar}
          <div class="ctr-empty">Firma asta nu are încă niciun contract.</div>
          <button class="ctr-btn pri wide" disabled={busy} onClick={creeaza}><Icon name="fileSignature" size={16} /> Fă un contract ({d.numar_propus || 'număr nou'})</button>
        </>
      );
    }
    const st = CTR_STARI[c.status] || CTR_STARI.ciorna;
    const istoric = (d.contract_istoric || []).filter((x: any) => x.id !== c.id);
    return (
      <>
        {cutieDosar}
        {/* Unde e clientul pe drum și butonul pasului următor (ca pe web: cutia dosarului → drumul → capul). */}
        <DrumClient drum={d.drum} buton={(k) => pasi.butonDrum(k, rand)} />
        <div class="ctr-cap">
          <Pill fel={st[1]}>{st[0]}</Pill>
          <b>{c.number || 'fără număr'}</b>
          <span class="per">{zile(c.start_at) + ' → ' + (d.sfarsit ? zile(d.sfarsit) : 'nedeterminat')}</span>
        </div>
        {ceUrmeaza()}
        {c.status !== 'incheiat' && <Comparatie cmp={d.comparatie} semnat={semnat} />}

        {semnat ? dateSemnate() : formular()}

        <div class="ctr-h2">Anexa nr. 1 — ce plătește lunar</div>
        {semnat ? (
          <>
            <div class="ctr-sub">Anexa semnată. O listă nouă de aparate sau alt preț se fac printr-un act adițional, mai jos.</div>
            <AnexaCitita a={c.annex} />
          </>
        ) : (
          <>
            <div class="ctr-sub">Bifează aparatele care intră în contract și scrie abonamentul lunar al fiecăruia. E o fotografie a înțelegerii: dacă mâine clientul mai adaugă un vehicul, anexa semnată rămâne ce s-a semnat.</div>
            <AnexaEditor key={'anx-' + versiune} contract={c} vehicles={d.vehicles || []} onSalvat={reincarca} />
          </>
        )}

        {/* Acte adiționale: doar la un contract SEMNAT — la unul nesemnat se schimbă contractul însuși. */}
        {semnat && (
          <>
            <div class="ctr-h2">Acte adiționale</div>
            <div class="ctr-sub">Contractul semnat nu se mai schimbă. Când clientul mai cumpără mașini, vrea alt modul, se schimbă prețul sau se prelungește contractul, se face un act adițional — o hârtie nouă, agățată de contract, care spune ce se schimbă și de când.</div>
            <ContractActe key={'acte-' + versiune} contract={c} vehicles={d.vehicles || []} onFisa={reincarca} />
          </>
        )}

        <div class="ctr-h2">Anexa nr. 2 — echipamente și montaj (cost unic)</div>
        <div class="ctr-sub">
          {semnat
            ? 'Ce s-a semnat rămâne cum e. Lucrările de mai jos țin doar evidența execuției: cine montează și cât ne costă. Montaj în plus = act adițional.'
            : 'Până la semnare, anexa se face din lucrările de montaj de mai jos (sau, până la prima lucrare, din ofertă). Aparatele vândute rămân în ea.'}
          {' În contract intră '}<b>doar prețul către client</b>{'. Cât ne cere partenerul rămâne aici, la noi, ca să vedem marja.'}
        </div>
        <Anexa2 m={c.montaj} />
        <ContractMontaj key={'mont-' + versiune} companyId={companyId} contract={c} tarifeCasa={d.tarife_montaj} onSalvat={reincarca} />

        <div class="ctr-h2">Actele semnate</div>
        <div class="ctr-list">
          {randFisier('contract', 'Contractul semnat', !!c.has_file, c.file_name)}
          {c.gdpr && c.gdpr.kind === 'separat' && randFisier('gdpr', 'Acordul GDPR semnat', !!c.has_gdpr_file, c.gdpr_name)}
        </div>

        {istoric.length > 0 && (
          <>
            <div class="ctr-h2">Contracte anterioare</div>
            <div class="ctr-list">
              {istoric.map((x: any) => {
                const s2 = CTR_STARI[x.status] || CTR_STARI.ciorna;
                return (
                  <div class="ctr-row">
                    <div class="ctr-row-top">
                      <div class="ctr-row-t">
                        <b>{x.number || '—'}</b>
                        <span class="ctr-row-s">{zile(x.start_at) + ' → ' + (x.end_at ? zile(x.end_at) : '—') + (x.ended_at ? ' · încheiat ' + zile(x.ended_at) : '')}</span>
                      </div>
                      <Pill fel={s2[1]}>{s2[0]}</Pill>
                    </div>
                    <div class="ctr-btns"><HartieBtns path={'/api/contracts/' + x.id + '/pdf'} ce="Contractul" nume="contract.pdf" /></div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </>
    );
  }

  // ── „Ce urmează": unde e contractul pe drum și un singur buton pentru pasul următor ──
  function ceUrmeaza() {
    const pas = CTR_PAS[c.status];
    const prel = d.prelungire_in_lucru; // aici e un obiect {id, number, status}
    let explic = CTR_EXPLIC[c.status] || '';
    if (c.status === 'activ' && d.sfarsit) {
      explic += c.auto_renew === false
        ? ' Se termină pe ' + zile(d.sfarsit) + ' și NU se reînnoiește singur' + (d.preaviz_pana ? '; ultima zi de preaviz: ' + zile(d.preaviz_pana) : '') + '.'
        : ' Se reînnoiește singur; termenul de acum ține până pe ' + zile(d.sfarsit) +
          (d.preaviz_pana ? '. Ca să nu se mai prelungească, rezilierea se anunță cel târziu pe ' + zile(d.preaviz_pana) : '') + '.';
    }
    if (c.status === 'activ' && prel) explic += ' Prelungirea e pornită: actul ' + (prel.number || '') + ', mai jos — du-l până la semnare.';
    if (c.status === 'incheiat' && c.ended_at) explic += ' Data încetării: ' + zile(c.ended_at) + '.';
    // După încetare: aparatele se arhivează, iar istoricul lor se mai ține cât scrie în contract (cifra o dă
    // serverul), apoi se șterge singur.
    const arhiveaza = c.status === 'incheiat' ? dupaIncetare(d.date_dupa_incetare_zile) : '';
    explic += arhiveaza;
    const deRe = deReinnoit(c, d.sfarsit, prel);
    return (
      <div class="ctr-urm">
        <div class="ctr-urm-t">{explic}</div>
        <div class="ctr-btns">
          {deRe && <button class="ctr-btn pri" onClick={() => reinnoieste(c, d.sfarsit)}><Icon name="refresh" size={15} /> Reînnoiește</button>}
          {pas && <button class={'ctr-btn' + (deRe ? '' : ' pri')} disabled={busy} onClick={() => treci(pas[0])}><Icon name="arrowRight" size={15} /> {pas[1]}</button>}
          {c.status === 'incheiat' && <button class="ctr-btn pri" disabled={busy} onClick={creeaza}><Icon name="fileSignature" size={15} /> Fă un contract nou</button>}
          {arhiveaza && <button class="ctr-btn" onClick={() => loc.route('/admin/devices')}><Icon name="cpu" size={15} /> Deschide Dispozitive</button>}
          <HartieBtns path={'/api/contracts/' + c.id + '/pdf'} ce="Contractul" nume="contract.pdf"
            veziEticheta={c.status === 'ciorna' ? 'Vezi ciorna' : 'Vezi contractul'} descEticheta="Descarcă (PDF)" />
          {!semnat && <button class="ctr-btn danger" disabled={busy} onClick={() => setDialog('sterge')}><Icon name="trash" size={15} /> Șterge contractul</button>}
        </div>
      </div>
    );
  }

  // ── Formularul contractului NESEMNAT: se lucrează liber între „în lucru", „aprobat" și „trimis" ──
  function formular() {
    if (!form) return null;
    const lista = noi || [];
    const alesi = semnatariDin(form.our);
    const chirieLuniMin = Number(c.annex && c.annex.chirie && c.annex.chirie.luniMin) || 0;
    function bifa(n: string) {
      const acum = lista.filter((x) => alesi.indexOf(x) >= 0);
      const noua = lista.filter((x) => (x === n ? acum.indexOf(n) < 0 : acum.indexOf(x) >= 0));
      setAtinsNoi(true);
      setForm((f) => (f ? {
        ...f, our: noua.join(' și '),
        ourrole: f.ourrole === 'Administrator' || f.ourrole === 'Administratori' ? rolNostru(noua.length) : f.ourrole,
      } : f));
    }
    return (
      <div class="ctr-frm">
        <div class="ctr-h2">Datele contractului</div>
        <div class="fld"><label>Număr</label><input value={form.nr} onInput={(e: any) => sf('nr', e.target.value)} /></div>
        <div class="fld"><label>Data semnării</label><input type="date" value={form.signed} onInput={(e: any) => sf('signed', e.target.value)} /></div>
        <div class="fld"><label>Începe la</label><input type="date" value={form.start} onInput={(e: any) => sf('start', e.target.value)} /></div>
        <div class="fld"><label>Durata</label>
          <select value={form.months} onChange={(e: any) => sf('months', e.target.value)}>
            {luniOptiuni(c.months).map(([v, et]) => <option value={v}>{et}</option>)}
          </select>
          {/* Aparate închiriate (25.09): contractul ține cel puțin cât scrie în anexă (`annex.chirie.luniMin`, pus de
              server). Serverul o păzește DOAR la crearea contractului din ofertă, nu și la salvarea formularului (punct
              trecut la Alin, 29.09) — deci aici se spune, cu cifra lui, iar omul trebuie să-l respecte. */}
          {chirieLuniMin > 0 && (
            <div class="ctr-hint" style="margin-top:4px">Aparatele sunt închiriate: contractul se face pe cel puțin {luniText(chirieLuniMin)} (sau pe durată nedeterminată).</div>
          )}
        </div>
        <div class="fld"><label>La termen</label>
          <select value={form.renew} onChange={(e: any) => sf('renew', e.target.value)}>
            <option value="1">se reînnoiește singur</option>
            <option value="0">se oprește</option>
          </select>
        </div>
        <div class="fld"><label>Preaviz (zile)</label><input type="number" inputMode="numeric" min="0" placeholder="30" value={form.notice} onInput={(e: any) => sf('notice', e.target.value)} /></div>

        <div class="ctr-h2">Cine semnează</div>
        <div class="fld"><label>Reprezentantul clientului</label><input value={form.rep} placeholder="nume și prenume" onInput={(e: any) => sf('rep', e.target.value)} /></div>
        <div class="fld"><label>Funcția lui</label><input value={form.reprole} placeholder="Administrator" onInput={(e: any) => sf('reprole', e.target.value)} /></div>
        {lista.length ? (
          <div class="fld">
            <label>Din partea noastră semnează</label>
            <div class="ctr-semn">
              {lista.map((n) => (
                <label class="ctr-semn-b"><input type="checkbox" checked={alesi.indexOf(n) >= 0} onChange={() => bifa(n)} /> {n}</label>
              ))}
            </div>
            {/* Câmpul rămâne de scris: se poate semna și prin împuternicit. */}
            <input value={form.our} placeholder="nume și prenume" onInput={(e: any) => { setAtinsNoi(true); sf('our', e.target.value); }} />
          </div>
        ) : (
          <div class="fld"><label>Din partea noastră</label><input value={form.our} placeholder="nume și prenume" onInput={(e: any) => { setAtinsNoi(true); sf('our', e.target.value); }} /></div>
        )}
        <div class="fld"><label>Funcția</label><input value={form.ourrole} placeholder="Administrator" onInput={(e: any) => { setAtinsNoi(true); sf('ourrole', e.target.value); }} /></div>
        <div class="fld"><label>Acordul GDPR</label>
          <select value={form.gdpr} onChange={(e: any) => sf('gdpr', e.target.value)}>
            <option value="anexa">anexă la contract</option>
            <option value="separat">act semnat separat</option>
          </select>
        </div>
        {/* Semnarea NU e în listă: se face doar cu butonul mare, care întreabă (după ea contractul se încuie). */}
        <div class="fld"><label>Unde e contractul</label>
          <select value={form.status} onChange={(e: any) => sf('status', e.target.value)}>
            {NESEMNAT.map((k) => <option value={k}>{CTR_STARI[k][0]}</option>)}
          </select>
        </div>
        <button class="btn btn-primary" disabled={busy} onClick={() => salveaza()}><Icon name="check" size={16} /> {busy ? 'Se salvează…' : 'Salvează contractul'}</button>
        {msg && <div class="ctr-msg">{msg}</div>}
      </div>
    );
  }

  // ── Contractul SEMNAT: se citește; se mai scriu doar data semnării și motivul încetării ──
  function dateSemnate() {
    if (!form) return null;
    const rep = (r: any) => { r = r || {}; return [r.name, r.role].filter(Boolean).join(', ') || '—'; };
    const kv = (k: string, v: any) => <div class="ctr-kv"><span class="k">{k}</span><span class="v">{v}</span></div>;
    return (
      <>
        <div class="ctr-band">
          <div class="ctr-band-t"><Icon name="lock" size={16} style="flex:0 0 auto;margin-top:2px" /> <span>Contractul e semnat — nu se mai modifică</span></div>
          <div>Mașini noi, alt preț, alt modul sau o prelungire se fac printr-un act adițional (mai jos). Așa rămâne limpede ce s-a semnat și când s-a schimbat.</div>
        </div>
        <div class="ctr-panel">
          <h4>Actul</h4>
          {kv('Număr', c.number || '—')}
          {kv('Începe la', zile(c.start_at))}
          {kv('Durata', c.months ? luniText(Number(c.months)) : 'nedeterminată')}
          {kv('La termen', c.auto_renew === false ? 'se oprește' : 'se reînnoiește singur')}
        </div>
        <div class="ctr-panel">
          <h4>Cine a semnat</h4>
          {kv('Preaviz', nrDe(c.notice_days == null ? 30 : c.notice_days, 'zi', 'zile'))}
          {kv('Pentru client', rep(c.client_rep))}
          {kv('Pentru noi', rep(c.our_rep))}
          {kv('Acord GDPR', c.gdpr && c.gdpr.kind === 'separat' ? 'act separat' : 'anexă la contract')}
        </div>
        <div class="ctr-frm">
          <div class="fld"><label>Data semnării</label><input type="date" value={form.signed} onInput={(e: any) => sf('signed', e.target.value)} /></div>
          {c.status === 'incheiat' && (
            <div class="fld"><label>Motivul încetării</label><input value={form.endreason} placeholder="ex. denunțare cu preaviz" onInput={(e: any) => sf('endreason', e.target.value)} /></div>
          )}
          <button class="ctr-btn" style="align-self:flex-start" disabled={busy} onClick={() => salveaza()}>
            <Icon name="check" size={16} /> {busy ? 'Se salvează…' : 'Salvează ' + (c.status === 'incheiat' ? 'data și motivul' : 'data semnării')}
          </button>
          {msg && <div class="ctr-msg">{msg}</div>}
        </div>
      </>
    );
  }

  // ── Un rând din „Actele semnate": scanul contractului sau acordul GDPR separat ──
  function randFisier(care: string, eticheta: string, are: boolean, nume?: string) {
    return (
      <div class="ctr-row">
        <div class="ctr-row-t"><b>{eticheta}</b><span class="ctr-row-s">{are ? (nume || 'fișier atașat') : 'niciun fișier încă'}</span></div>
        <div class="ctr-btns">
          {are ? (
            <>
              <DescarcaFisier path={'/api/contracts/' + c.id + '/file?care=' + care} ce={eticheta} eticheta="Descarcă" />
              <button class="ctr-btn danger" disabled={busy} onClick={() => setDialog(care === 'gdpr' ? 'scoate-gdpr' : 'scoate-contract')}><Icon name="x" size={15} /> Scoate</button>
            </>
          ) : (
            <AlegeFisier busy={urca === care} etFisier="Urcă (PDF/JPG/PNG)" onFile={(f) => urcaFisier(care, f)} />
          )}
        </div>
      </div>
    );
  }
}
