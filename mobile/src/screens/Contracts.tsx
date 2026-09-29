// Super-admin: „Contracte" — toate contractele tuturor clienților, la un loc, ca pe web (raxLoadContracte).
//
// Sus, ce trebuie FĂCUT: banda roșie (firme fără niciun contract, sau cu contractul încheiat care intră
// totuși în aplicație) și banda portocalie (alarma: contracte care nu se reînnoiesc singure și se apropie
// de capăt, cu „Reînnoiește"). Dedesubt, lista cu filtre și căutare. Pe fiecare contract, ca pe web (24.09):
// sub stare, PASUL URMĂTOR cu butonul lui (Aprobă → Trimite la semnat → E semnat; după semnare, pasul din
// drumul clientului), iar la „Dosar", FIECARE LIPSĂ cu butonul ei (Completează, Pune data, Încarcă). Acțiunile
// sunt aceleași ca în dosarul firmei (usePasiContract).
// Partenerii de montaj NU mai stau aici (Alin, 24.09: „nu-i văd rostul în Contracte"): au secțiunea lor,
// Business → Montaj.
//
// Telefonul NU socotește capete de contract, zile rămase, preaviz, lipsuri sau pași: le arată cum le dă
// serverul (`sfarsit`, `preaviz_pana`, `alarma` = contracts.deAnuntat, `dosar.lipsuri`, `drum`,
// `trimite_pe_email`). Aici `prelungire_in_lucru` e un ȘIR (numărul actului); în fișa firmei (/overview) e un obiect.
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { CapEcran, HartieBtns, Pill, useReinnoire } from '../components/ContractUi';
import { usePasiContract } from '../components/ContractPasi';
import { CTR_STARI, DOSAR_FEL, de, deReinnoit, luniText, zile, zileText } from '../lib/contracte';
import { rutaDosar } from '../lib/companii';
import './admin.css';
import './detail.css';
import './contracte.css';

// `trimite` = serverul poate trimite pe email (SMTP pus) — altfel „Trimite la semnat" devine „Am trimis-o".
type Lista = { tot: any[]; fara: any[]; inc: any[]; trimite: boolean };
const DE_SEMNAT = ['ciorna', 'aprobat', 'trimis'];
type Pasi = ReturnType<typeof usePasiContract>;

export function Contracts() {
  const loc = useLocation();
  const [d, setD] = useState<Lista | null>(null);
  const [err, setErr] = useState('');
  const [filtru, setFiltru] = useState('');
  const [cauta, setCauta] = useState('');

  function incarca() {
    setErr('');
    Api.contracts()
      .then((j: any) => setD({ tot: (j && j.contracte) || [], fara: (j && j.fara_contract) || [], inc: (j && j.incheiate_cu_acces) || [],
        trimite: !!(j && j.trimite_pe_email) }))
      .catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setD({ tot: [], fara: [], inc: [], trimite: false }); });
  }
  useEffect(incarca, []);

  const fisa = (companyId: any) => loc.route(rutaDosar(companyId));
  // După „Reînnoiește", ca pe web: fișa de contract a firmei, unde actul de prelungire așteaptă aprobarea.
  const { cere: reinnoieste, ui: uiReinnoire } = useReinnoire((cid) => fisa(cid));
  // Pașii și lipsurile de pe fiecare rând. După orice acțiune, lista se reîncarcă (ca _ctreDupa pe web).
  const pasi = usePasiContract({ trimitePeEmail: !!(d && d.trimite), laSchimbat: incarca });

  const tot = d ? d.tot : [];
  const q = cauta.trim().toLowerCase();
  const nr = (s: string) => tot.filter((c) => c.status === s).length;
  const expira = tot.filter((c) => !!c.alarma).length;
  const lipsuri = tot.filter((c) => c.dosar && c.dosar.nivel === 'incomplet').length;
  // Filtrele sunt întrebările pe care ți le pui de fapt: ce trebuie semnat, ce e incomplet, ce expiră.
  const filtre: [string, string, number][] = [
    ['', 'Toate', tot.length],
    ['desemnat', 'De semnat', nr('ciorna') + nr('aprobat') + nr('trimis')],
    ['incomplet', 'Dosar incomplet', lipsuri],
    ['expira', 'Expiră curând', expira],
    ['activ', 'În vigoare', nr('activ')],
    ['incheiat', 'Încheiate', nr('incheiat')],
  ];
  const lista = tot.filter((c) => {
    if (filtru === 'desemnat' && DE_SEMNAT.indexOf(c.status) < 0) return false;
    if (filtru === 'incomplet' && !(c.dosar && c.dosar.nivel === 'incomplet')) return false;
    if (filtru === 'expira' && !c.alarma) return false;
    if ((filtru === 'activ' || filtru === 'incheiat') && c.status !== filtru) return false;
    if (q) {
      const text = [c.company_name, c.number, c.cui].filter(Boolean).join(' ').toLowerCase();
      if (text.indexOf(q) < 0) return false;
    }
    return true;
  });

  return (
    <div class="screen">
      <CapEcran titlu="Contracte" onBack={() => loc.route('/meniu')} onRefresh={() => { setD(null); incarca(); }} />
      <div class="content">
        <div class="ctr-wrap">
          {d == null && <div class="spin" style="margin:30px auto" />}
          {err && <div class="ctr-err">{err}</div>}
          {d != null && <Benzi d={d} fisa={fisa} reinnoieste={reinnoieste} />}

          {d != null && (
            <>
              <div class="ctr-h"><Icon name="fileSignature" size={17} class="ic" /> Contractele cu clienții</div>
              <div class="ctr-chips" role="tablist">
                {filtre.map(([k, et, n]) => (
                  <button role="tab" aria-selected={filtru === k} class={'ctr-chip' + (filtru === k ? ' on' : '')} onClick={() => setFiltru(k)}>
                    {et} · <b>{n}</b>
                  </button>
                ))}
              </div>
              <div class="ctr-search">
                <Icon name="search" size={17} class="ic" />
                <input value={cauta} placeholder="Caută după client, număr de contract sau CUI…" onInput={(e: any) => setCauta(e.target.value)} />
              </div>
              {!lista.length ? (
                <div class="ctr-empty">{tot.length ? 'Niciun contract pentru filtrul ăsta.' : 'Niciun contract încă. Se face din „Client nou" (Companii) sau din fila „Contract" a unei firme.'}</div>
              ) : (
                <div class="ctr-list">
                  {lista.map((c) => <CardContract c={c} fisa={fisa} reinnoieste={reinnoieste} pasi={pasi} />)}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      {uiReinnoire}
      {pasi.ui}
    </div>
  );
}

// ── Benzile de sus: roșu (fără contract) și portocaliu (alarma de expirare) ──
function Benzi({ d, fisa, reinnoieste }: { d: Lista; fisa: (id: any) => void; reinnoieste: (c: any, sfarsit: any) => void }) {
  const { fara, inc } = d;
  const nume = (l: any[]) => (
    <div class="ctr-names">
      {l.slice(0, 8).map((x) => <button class="ctr-name" onClick={() => fisa(x.id)}>{x.name}</button>)}
      {l.length > 8 && <span class="ctr-name more">și încă {l.length - 8}</span>}
    </div>
  );
  const alarme = d.tot.filter((c) => !!c.alarma).sort((a, b) => (Number(a.sfarsit) || 0) - (Number(b.sfarsit) || 0));
  return (
    <>
      {(fara.length > 0 || inc.length > 0) && (
        <div class="ctr-band bad">
          {fara.length > 0 && (
            <>
              <div class="ctr-band-t">{fara.length === 1 ? '1 firmă fără niciun contract' : fara.length + de(fara.length) + 'firme fără niciun contract'}</div>
              {nume(fara)}
            </>
          )}
          {inc.length > 0 && (
            <>
              <div class="ctr-band-t" style={fara.length ? 'margin-top:10px' : ''}>
                {inc.length === 1 ? '1 firmă are contractul încheiat, dar intră în continuare în aplicație' : inc.length + de(inc.length) + 'firme au contractul încheiat, dar intră în continuare în aplicație'}
              </div>
              {nume(inc)}
              <p>— fă-le contract nou sau oprește-le accesul din „Abonament &amp; plăți".</p>
            </>
          )}
        </div>
      )}
      {alarme.length > 0 && (
        <div class="ctr-band warn">
          <div class="ctr-band-t">
            <Icon name="bell" size={16} style="flex:0 0 auto;margin-top:2px" />
            <span>{alarme.length === 1 ? 'Un contract se apropie de capăt și nu se reînnoiește singur'
              : alarme.length + de(alarme.length) + 'contracte se apropie de capăt și nu se reînnoiesc singure'}</span>
          </div>
          {alarme.map((c) => {
            const a = c.alarma || {};
            const cand = zileText(a.zileRamase);
            return (
              <div class="ctr-alarm">
                <div><b>{c.company_name}</b> · {c.number || '—'}</div>
                <div class="ctr-small" style="font-size:12.5px">
                  {'se termină pe ' + zile(c.sfarsit) + (cand ? ' (' + cand + ')' : '')}
                  {a.preavizPana ? ' · ultima zi de preaviz: ' + zile(a.preavizPana) + (a.preavizTrecut ? ' (a trecut)' : '') : ''}
                </div>
                <div class="ctr-btns">
                  {c.prelungire_in_lucru ? (
                    <>
                      <Pill fel="warn">prelungire în lucru: {c.prelungire_in_lucru}</Pill>
                      <button class="ctr-btn" onClick={() => fisa(c.company_id)}>Du-o la semnat</button>
                    </>
                  ) : (
                    <button class="ctr-btn pri" onClick={() => reinnoieste(c, c.sfarsit)}><Icon name="refresh" size={15} /> Reînnoiește</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

// ── Un contract din listă: firma (deschide fișa de contract), pasul următor, numărul, perioada, lunar, dosar ──
function CardContract({ c, fisa, reinnoieste, pasi }: { c: any; fisa: (id: any) => void; reinnoieste: (c: any, sfarsit: any) => void; pasi: Pasi }) {
  const st = CTR_STARI[c.status] || CTR_STARI.ciorna;
  const total = c.annex && c.annex.monthlyTotal ? Number(c.annex.monthlyTotal) : null;
  const dos = c.dosar || {};
  // La un contract nesemnat, „Stare" spune deja unde e; „Dosar" spune doar ce LIPSEȘTE — fiecare lipsă cu
  // butonul ei, chiar pe rând (Alin, 24.09). La unul semnat: pastila dosarului, apoi lipsurile.
  const linii = pasi.lipsuri(c);
  const dosar = dos.nivel === 'nesemnat'
    ? (linii ? null : <span>—</span>)
    : <Pill fel={DOSAR_FEL[dos.nivel] || ''}>{dos.eticheta || '—'}</Pill>;
  const perioada = c.start_at
    ? <>{zile(c.start_at) + ' → ' + (c.sfarsit ? zile(c.sfarsit) : 'nedeterminat')}
        {c.auto_renew === false ? <span class="ctr-small">nu se reînnoiește</span> : (c.sfarsit ? <span class="ctr-small">se reînnoiește singur</span> : null)}</>
    : <>{c.months ? luniText(Number(c.months)) : 'nedeterminat'}<span class="ctr-small">fără dată de început</span></>;
  return (
    <div class="ctr-card">
      <button class="ctr-card-h" onClick={() => fisa(c.company_id)}>
        <span class="mid">
          <span class="nm">{c.company_name}</span>
          {c.cui && <span class="ctr-small">{c.cui}</span>}
        </span>
        <Pill fel={st[1]}>{st[0]}</Pill>
        <Icon name="chevronR" size={18} color="var(--text-muted)" />
      </button>
      {pasi.pas(c)}
      <div class="ctr-kv"><span class="k">Contract</span><span class="v">{c.number || '—'}{c.luni_prelungite ? <span class="ctr-small">{'prelungit ' + luniText(Number(c.luni_prelungite))}</span> : null}</span></div>
      <div class="ctr-kv"><span class="k">Perioada</span><span class="v">{perioada}</span></div>
      <div class="ctr-kv"><span class="k">Lunar</span><span class="v">{total ? total.toLocaleString('ro-RO') + ' lei' : '—'}</span></div>
      <div class="ctr-dos">
        <div class="ctr-kv"><span class="k">Dosar</span><span class="v">{dosar}</span></div>
        {linii}
      </div>
      <div class="ctr-btns">
        <HartieBtns path={'/api/contracts/' + c.id + '/pdf'} ce="Contractul" nume="contract.pdf" />
        {deReinnoit(c, c.sfarsit, c.prelungire_in_lucru) && (
          <button class="ctr-btn" onClick={() => reinnoieste(c, c.sfarsit)}><Icon name="refresh" size={15} /> Reînnoiește</button>
        )}
      </div>
    </div>
  );
}
