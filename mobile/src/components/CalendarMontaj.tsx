// Calendarul montajului — PRIMA filă din Business → Montaj, ca pe web (blocul „calendarul de montaj" din
// public/index.html). SINGURUL loc în care se programează montajul unui contract SEMNAT.
//
// Ce e pe web e și aici, pe o singură coloană, lizibil la 375px, fără derulare laterală:
//   • luna (‹ / › / „Azi") și filtrul pe instalator („vezi doar zilele lui ocupate");
//   • grila lunii, strânsă: pe fiecare zi câte mașini se montează (portocaliu = programat, verde = montat). Pe web
//     grila scrie și clientul; pe telefon n-are loc, așa că sub grilă stau zilele cu montaj, cu clientul, mașinile,
//     instalatorul și starea — exact ce scrie pe web în eticheta fiecărei zile;
//   • „De programat": contractele semnate cu mașini rămase, termenul de 30 de zile (roșu depășit, portocaliu curând),
//     butonul „Programează" pe fiecare, și stocul de aparate;
//   • o zi liberă apăsată → „Programează montajul" pe ziua aia; o zi ocupată → ce e pe ea + „Programează";
//   • o lucrare apăsată → „S-a montat?" (cu câte — mai puține se întorc singure la „De programat"), „Altă zi sau alt
//     instalator" (Mută), „La client" (dosarul lui) și „Șterge ziua".
//
// Telefonul NU socotește nimic din programare: ce mai e de programat, termenul, prețul pentru client (din Anexa
// nr. 2) și costul instalatorului le face serverul, cu vorbele lui la refuz. Regulile de afișare stau în
// lib/calendarMontaj.ts, legate de pagină printr-o probă. Clientul nu vede nimic de aici (rute requireSuperadmin).
import { useEffect, useRef, useState } from 'preact/hooks';
import { showToast } from '../app/store';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import {
  CAL_TEXT, MJC_ZILE, alteTipuri, ceSeMonteaza, contractulFormularului, corpMontata, corpMutare, corpProgramare, cuClient,
  cuMasini, deProgramatActive, detaliiContract, dinContract, eroarea, esteMontata, faraClientText, formLucrare, formNou,
  grilaLunii, instalatoriActivi, instalatoriFiltru, instalatoriLucrare, intrebareMontata, lucrareMontata, lucrariPeZi,
  lunaAlaturata, lunaText, masini, mutaLucrarea, numeFirmaContract, optiuneClient, programeazaMontaj, stareText, stergeZiua,
  stocText, termenFel, termenLinie, termenPastila, tipGps, titluLucrare, toastMontata, toastMutat, toastProgramat, ziCuNume, ziRo,
  type CalContract, type CalDate, type CalLucrare, type FormLuc, type FormProg,
} from '../lib/calendarMontaj';
import { Confirma } from './FlotaUi';
import { Icon } from './Icon';
import '../screens/admin.css';
import '../screens/detail.css';
import '../screens/contracte.css';
import '../screens/montaj.css';

// Instalatorul ales sus se ține minte cât trăiește aplicația: „La client" duce în dosarul firmei, iar „înapoi"
// trebuie să găsească calendarul cum l-ai lăsat (ca filtrele din fila Lucrări).
let partTinut = '';

// O singură foaie deschisă deodată; trecerea de la una la alta (ziua → programarea, lucrarea → întrebarea) păstrează
// aceeași pază de „înapoi" (vezi useInapoiInchide: două foi păzite schimbate deodată lasă istoricul strâmb).
type Foaie =
  | { fel: 'zi'; zi: string }
  | { fel: 'prog'; f: FormProg; start: string }
  | { fel: 'fara'; text: string }
  | { fel: 'lucrare'; id: number; f: FormLuc; start: string }
  | { fel: 'intreb'; ce: 'montata' | 'sterge'; id: number; f: FormLuc; start: string; text: string }
  | null;

export function CalendarMontaj({ d, err, incarcand, onLuna, onSchimbat, onClient, pre, onPreFolosit }: {
  d: CalDate | null;                 // calendarul lunii, de la ecranul Montaj (se încarcă odată cu celelalte file)
  err?: string;
  incarcand?: boolean;               // altă lună pe drum: săgețile așteaptă
  onLuna: (luna: string) => void;
  onSchimbat: (luna?: string) => void;   // după programare / mutare / montată / ștergere: ecranul reîncarcă (pe luna dată)
  onClient: (companyId: number) => void; // „La client": dosarul firmei (se cheamă din foaie — ecranul înlocuiește adresa)
  pre?: number | null;               // venit din drumul clientului: contractul de programat
  onPreFolosit?: () => void;
}) {
  const [part, setPartS] = useState(partTinut);
  const [foaie, setFoaie] = useState<Foaie>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const preNr = useRef(0);
  const setPart = (v: string) => { partTinut = v; setPartS(v); };

  // Întoarce true dacă foaia s-a închis. Aceeași întrebare pentru X, fundal, „Renunț" și „înapoi" de pe Android.
  // Din întrebarea „Montată?" / „Șterge ziua?", „înapoi" te întoarce în foaia zilei (ca „Renunță" pe web, unde
  // panoul rămâne deschis) — foaia rămâne deschisă, deci paza își pune intrarea la loc.
  function inchide(): boolean {
    if (busy) return false;
    const x = foaie;
    if (!x) return true;
    if (x.fel === 'intreb') { setFoaie({ fel: 'lucrare', id: x.id, f: x.f, start: x.start }); return false; }
    if ((x.fel === 'prog' || x.fel === 'lucrare') && JSON.stringify(x.f) !== x.start &&
      !confirm('Închizi fără să salvezi?\n\n' + (x.fel === 'prog' ? 'Ce ai ales la programare se pierde.' : 'Ce ai schimbat la ziua de montaj se pierde.'))) return false;
    setFoaie(null);
    setMsg('');
    return true;
  }
  useInapoiInchide(!!foaie, inchide);

  // Venit din „Drumul clientului" / din fișă („Programează montajul"): formularul pe contractul lui, ca raxLoadMontaj
  // cu `_raxMj.cal.pre`. Dacă n-are nimic de programat, o spune — cu numele firmei.
  useEffect(() => {
    if (pre == null || !d) return;
    if (onPreFolosit) onPreFolosit();
    const r = dinContract(d, pre);
    if ('contract_id' in r) { deschideProg(d.azi, r.contract_id, null); return; }
    if (!deProgramatActive(d).length) { deschideFara(CAL_TEXT.nimic); return; }
    if (r.faraClient) { deschideFara(faraClientText(r.faraClient)); return; }
    // Contractul nu e la „De programat" (nesemnat, sau fără montaj de aparat): numele firmei din lista contractelor.
    const nr = ++preNr.current;
    numeFirmaContract(pre).then((nume) => {
      if (nr !== preNr.current) return;
      setFoaie((f) => f || { fel: 'fara', text: faraClientText(nume || 'Firma asta') });
    });
  }, [pre, d]);

  // O lucrare deschisă care nu mai e în calendar (ștearsă între timp): foaia se închide, nu rămâne goală.
  const lucrareDeschisa = foaie && (foaie.fel === 'lucrare' || foaie.fel === 'intreb') && d ? d.lucrari.find((x) => x.id === foaie.id) : null;
  useEffect(() => {
    if (foaie && (foaie.fel === 'lucrare' || foaie.fel === 'intreb') && !lucrareDeschisa) setFoaie(null);
  }, [foaie, lucrareDeschisa]);

  function deschideFara(text: string) { setMsg(''); setFoaie({ fel: 'fara', text }); }
  // „Programează": pe o zi (din grilă / din foaia zilei), pe un contract („De programat"), sau pe contractul cerut.
  // Instalatorul ales sus se propune singur (raxMjCalZi / raxMjCalProgrameaza); venit din drum, niciunul.
  function deschideProg(zi: string | null, contractId: number | null, partener: string | null) {
    const f = formNou(d, zi, contractId, partener);
    if (!f) { deschideFara(CAL_TEXT.nimic); return; }
    setMsg('');
    setFoaie({ fel: 'prog', f, start: JSON.stringify(f) });
  }
  function deschideLucrare(l: CalLucrare) {
    const f = formLucrare(d && d.parteneri, l);
    setMsg('');
    setFoaie({ fel: 'lucrare', id: l.id, f, start: JSON.stringify(f) });
  }
  function peZi(zi: string, pe: CalLucrare[]) {
    if (pe.length) { setMsg(''); setFoaie({ fel: 'zi', zi }); }
    else deschideProg(zi, null, part || null);
  }
  const setF = (f: FormProg) => { setMsg(''); setFoaie((x) => (x && x.fel === 'prog' ? { ...x, f } : x)); };
  const setL = (f: FormLuc) => { setMsg(''); setFoaie((x) => (x && x.fel === 'lucrare' ? { ...x, f } : x)); };

  // ── Cererile (rutele și refuzurile: ale serverului) ──
  async function programeaza(c: CalContract, f: FormProg) {
    if (busy) return;
    if (!f.zi) { setMsg(CAL_TEXT.faraZi); return; }
    setBusy(true);
    setMsg('');
    try {
      await programeazaMontaj(corpProgramare(c, f));
      showToast(toastProgramat(c, parseInt(f.n, 10) || 0, f.zi));
      setFoaie(null);
      onSchimbat(f.zi.slice(0, 7));
    } catch (e: any) { setMsg(eroarea(e, 'Nu s-a putut programa.')); }
    finally { setBusy(false); }
  }
  async function muta(l: CalLucrare, f: FormLuc) {
    if (busy) return;
    if (!f.mzi) { setMsg(CAL_TEXT.faraZiMuta); return; }
    setBusy(true);
    setMsg('');
    try {
      await mutaLucrarea(l.id, corpMutare(f));
      showToast(toastMutat(f.mzi));
      setFoaie(null);
      onSchimbat(f.mzi.slice(0, 7));
    } catch (e: any) { setMsg(eroarea(e, 'Nu s-a putut muta.')); }
    finally { setBusy(false); }
  }
  // Întrebarea s-a pus; un refuz al serverului („Între 1 și 3") se vede înapoi în foaia zilei, ca pe web (#mjc-msg).
  async function faIntrebarea(x: { ce: 'montata' | 'sterge'; id: number; f: FormLuc; start: string }) {
    if (busy) return;
    setBusy(true);
    setMsg('');
    try {
      if (x.ce === 'montata') {
        const j = await lucrareMontata(x.id, corpMontata(x.f));
        showToast(toastMontata(j));
      } else await stergeZiua(x.id);
      setFoaie(null);
      onSchimbat();
    } catch (e: any) {
      setFoaie({ fel: 'lucrare', id: x.id, f: x.f, start: x.start });
      setMsg(eroarea(e, x.ce === 'montata' ? 'Nu s-a putut salva.' : 'Nu s-a putut șterge.'));
    } finally { setBusy(false); }
  }

  if (!d) return err ? <div class="ctr-err">{err}</div> : <div class="spin" style="margin:30px auto" />;

  const g = grilaLunii(d.luna, d.azi);
  const pe = lucrariPeZi(d.lucrari, part);
  const zileCu = Object.keys(pe).filter((zi) => zi.slice(0, 7) === d.luna).sort();
  const luna = (pas: number) => { if (!incarcand) onLuna(lunaAlaturata(d.luna, pas, d.azi)); };

  return (
    <>
      {err && <div class="ctr-err">{err}</div>}
      <div class="ctr-h"><Icon name="calendar" size={17} class="ic" /> Calendarul montajului</div>
      <div class="ctr-sub">{CAL_TEXT.sub}</div>
      <div class="mjc-panou">
        <div class="mjc-bar">
          <button type="button" class="ctr-btn mjc-sag" disabled={incarcand} aria-label="Luna trecută" onClick={() => luna(-1)}><Icon name="chevronL" size={18} /></button>
          <b class="mjc-luna">{lunaText(d.luna)}{incarcand && <span class="spin mjc-spin" aria-hidden="true" />}</b>
          <button type="button" class="ctr-btn mjc-sag" disabled={incarcand} aria-label="Luna viitoare" onClick={() => luna(1)}><Icon name="chevronR" size={18} /></button>
          <button type="button" class="ctr-btn" disabled={incarcand} onClick={() => luna(0)}>Azi</button>
        </div>
        <label class="mjc-f">
          <span>Instalator</span>
          <select value={part} onChange={(e: any) => setPart(e.currentTarget.value)}>
            <option value="">toți</option>
            {instalatoriFiltru(d.parteneri, part).map((p) => <option value={String(p.id)}>{p.name}</option>)}
          </select>
        </label>
        {g ? (
          <div class="mjc-grila">
            {MJC_ZILE.map((z) => <div key={'z' + z} class="mjc-zs" aria-hidden="true">{z}</div>)}
            {Array.from({ length: g.gol }).map((_, i) => <div key={'g' + i} class="mjc-zi gol" aria-hidden="true" />)}
            {g.zile.map((z) => {
              const l = pe[z.zi] || [];
              return (
                <button type="button" key={z.zi} class={'mjc-zi' + (z.wk ? ' wk' : '') + (z.azi ? ' azi' : '')}
                  aria-label={l.length ? ziRo(z.zi) + ': ' + l.map((x) => titluLucrare(x, d.stari)).join('; ') : 'Programează pe ' + ziRo(z.zi)}
                  onClick={() => peZi(z.zi, l)}>
                  <span class="mjc-nr">{z.nr}</span>
                  {l.slice(0, 2).map((x) => <span class={'mjc-l ' + (esteMontata(x.status) ? 'mjc-mont' : 'mjc-prog')}>{x.masini}</span>)}
                  {l.length > 2 && <span class="mjc-mai">+{l.length - 2}</span>}
                </button>
              );
            })}
          </div>
        ) : <div class="ctr-empty">Se încarcă…</div>}
        <div class="mjc-leg">
          <span class="mjc-l mjc-prog"><b>10</b> programat</span>
          <span class="mjc-l mjc-mont"><b>10</b> montat</span>
          <span>cifra = câte mașini</span>
        </div>
      </div>

      {/* Zilele cu montaj ale lunii, cu clientul — ce scrie pe web în grilă, pe care telefonul n-o poate lăți. */}
      {zileCu.length ? (
        <div class="mjc-zile">
          {zileCu.map((zi) => (
            <div class="mjc-ziua" key={zi}>
              <div class="mjc-ziua-t">{ziCuNume(zi)}</div>
              {pe[zi].map((l) => <RandLucrare l={l} stari={d.stari} onClick={() => deschideLucrare(l)} />)}
            </div>
          ))}
        </div>
      ) : (
        <div class="ctr-empty">{part ? 'Instalatorul ales n-are nicio zi de montaj în luna asta.' : 'Nicio zi de montaj în luna asta.'}</div>
      )}

      <DeProgramat d={d} onProgrameaza={(cid) => deschideProg(null, cid, part || null)} />

      {foaie && foaie.fel === 'zi' && (
        <Foaie titlu={ziCuNume(foaie.zi)} icon="calendar" onClose={inchide}>
          <div class="frm">
            <div class="mjc-ziua">
              {(pe[foaie.zi] || []).map((l) => <RandLucrare l={l} stari={d.stari} onClick={() => deschideLucrare(l)} />)}
            </div>
            <div class="frm-actions">
              <button class="btn fl-btn2" onClick={() => inchide()}>Închide</button>
              <button class="btn btn-primary" onClick={() => deschideProg(foaie.zi, null, part || null)}><Icon name="calendar" size={16} /> Programează</button>
            </div>
          </div>
        </Foaie>
      )}
      {foaie && foaie.fel === 'fara' && (
        <Foaie titlu="Programează montajul" icon="calendar" onClose={inchide}>
          <div class="frm">
            <div class="mjc-text">{foaie.text}</div>
            <div class="frm-actions"><button class="btn fl-btn2" onClick={() => inchide()}>Închide</button></div>
          </div>
        </Foaie>
      )}
      {foaie && foaie.fel === 'prog' && (
        <FoaieProgramare d={d} f={foaie.f} msg={msg} busy={busy} onF={setF} onClose={inchide} onSalveaza={programeaza} />
      )}
      {foaie && foaie.fel === 'lucrare' && lucrareDeschisa && (
        <FoaieLucrare d={d} l={lucrareDeschisa} f={foaie.f} msg={msg} busy={busy} onF={setL} onClose={inchide}
          onMontata={() => setFoaie({ fel: 'intreb', ce: 'montata', id: foaie.id, f: foaie.f, start: foaie.start, text: intrebareMontata(lucrareDeschisa, parseInt(foaie.f.mont, 10) || 0) })}
          onMuta={() => muta(lucrareDeschisa, foaie.f)}
          onSterge={() => setFoaie({ fel: 'intreb', ce: 'sterge', id: foaie.id, f: foaie.f, start: foaie.start, text: CAL_TEXT.sterge })}
          onClient={() => onClient(lucrareDeschisa.company_id)} />
      )}
      {foaie && foaie.fel === 'intreb' && (
        <Confirma title={foaie.ce === 'montata' ? 'Montată' : 'Șterge ziua'} text={foaie.text} busy={busy}
          okLabel={foaie.ce === 'montata' ? 'Montată' : 'Șterge'} danger={foaie.ce === 'sterge'}
          onOk={() => faIntrebarea(foaie)} onCancel={() => { inchide(); }} />
      )}
    </>
  );
}

// Un rând de lucrare (lista zilelor și foaia unei zile): cifra colorată, clientul și tot ce scrie pe web în eticheta ei.
function RandLucrare({ l, stari, onClick }: { l: CalLucrare; stari: Record<string, string>; onClick: () => void }) {
  return (
    <button type="button" class="mjc-rand" onClick={onClick} aria-label={titluLucrare(l, stari)}>
      <span class={'mjc-l ' + (esteMontata(l.status) ? 'mjc-mont' : 'mjc-prog')}>{l.masini}</span>
      <span class="mjc-rand-t">
        <b>{l.company_name || '—'}</b>
        <span class="mjc-rand-s">{masini(l.masini) + ' · ' + (l.partener_nume || 'instalator neales') + ' · ' + stareText(l, stari)}</span>
      </span>
      <Icon name="chevronR" size={16} />
    </button>
  );
}

// „De programat" (_mjcDeProgramatHtml): contractele semnate cu ce a mai rămas, cel mai strâns termen primul (ordinea
// serverului), plus stocul de aparate.
export function DeProgramat({ d, onProgrameaza }: { d: CalDate; onProgrameaza: (contractId: number) => void }) {
  return (
    <>
      <div class="ctr-h"><Icon name="clipboard" size={17} class="ic" /> De programat</div>
      <div class="ctr-sub">{CAL_TEXT.subDeProgramat}</div>
      {!(d.deProgramat || []).length ? <div class="ctr-empty">{CAL_TEXT.golDeProgramat}</div> : (
        <div class="ctr-list">
          {d.deProgramat.map((c) => (
            <div class="ctr-row" key={c.contract_id}>
              <div class="ctr-row-t">
                <b>{c.company_name || '—'}</b>
                {c.termen && <> <span class={'ctr-pill mjc-termen ' + termenFel(c.termen)}>{termenPastila(c.termen)}</span></>}
                <span class="ctr-row-s">{detaliiContract(c)}</span>
              </div>
              {c.ramase > 0 && (
                <div class="ctr-btns">
                  <button class="ctr-btn pri" onClick={() => onProgrameaza(c.contract_id)}><Icon name="calendar" size={15} /> Programează</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {(d.stoc || []).length > 0 && <div class="ctr-total mjc-stoc"><b>Aparate în stoc:</b> {stocText(d.stoc)}</div>}
    </>
  );
}

// „Programează montajul" (_mjcFormHtml): clientul, ziua, câte mașini (din cât a rămas), cine montează și — pe mașini —
// ce se mai montează, propus din câte mașini cât timp n-ai scris tu de mână.
export function FoaieProgramare({ d, f, msg, busy, onF, onClose, onSalveaza }: {
  d: CalDate; f: FormProg; msg: string; busy: boolean; onF: (f: FormProg) => void; onClose: () => boolean;
  onSalveaza: (c: CalContract, f: FormProg) => void;
}) {
  const ctrs = deProgramatActive(d);
  const c = contractulFormularului(d, f.contract_id);
  return (
    <Foaie titlu="Programează montajul" icon="calendar" onClose={onClose}>
      {!c ? (
        <div class="frm">
          <div class="mjc-text">{CAL_TEXT.nimic}</div>
          <div class="frm-actions"><button class="btn fl-btn2" onClick={() => onClose()}>Închide</button></div>
        </div>
      ) : (
        <div class="frm">
          <div class="fld"><label>Clientul</label>
            <select value={String(c.contract_id)} disabled={busy} onChange={(e: any) => onF(cuClient(d, f, parseInt(e.currentTarget.value, 10)))}>
              {ctrs.map((x) => <option value={String(x.contract_id)}>{optiuneClient(x)}</option>)}
            </select>
          </div>
          <div class="fld"><label>Ziua</label>
            <input type="date" value={f.zi} disabled={busy} onInput={(e: any) => onF({ ...f, zi: e.currentTarget.value })} />
          </div>
          <div class="fld"><label>{'Câte mașini (din ' + tipGps(c).ramase + ' rămase)'}</label>
            <input type="number" inputMode="numeric" min="1" max={tipGps(c).ramase} step="1" value={f.n} disabled={busy}
              onInput={(e: any) => onF(cuMasini(c, f, e.currentTarget.value))} />
          </div>
          <div class="fld"><label>Cine montează</label>
            <select value={f.part} disabled={busy} onChange={(e: any) => onF({ ...f, part: e.currentTarget.value })}>
              <option value="">— îl aleg mai târziu —</option>
              {instalatoriActivi(d.parteneri).map((p) => <option value={String(p.id)}>{p.name}</option>)}
            </select>
          </div>
          {alteTipuri(c).map((t) => (
            <div class="fld"><label>{t.eticheta + ' (din ' + t.ramase + ' rămase)'}</label>
              <input type="number" inputMode="numeric" min="0" max={t.ramase} step="1" value={f.alte[t.tip] || ''} disabled={busy}
                onInput={(e: any) => onF({ ...f, alte: { ...f.alte, [t.tip]: e.currentTarget.value }, atinse: { ...f.atinse, [t.tip]: true } })} />
            </div>
          ))}
          {c.termen && <div class="mjc-text mic">{termenLinie(c.termen)}</div>}
          {msg && <div class="ctr-msg">{msg}</div>}
          <div class="frm-actions">
            <button class="btn fl-btn2" disabled={busy} onClick={() => onClose()}>Renunț</button>
            <button class="btn btn-primary" disabled={busy} onClick={() => onSalveaza(c, f)}><Icon name="check" size={16} /> {busy ? 'Se programează…' : 'Programează'}</button>
          </div>
        </div>
      )}
    </Foaie>
  );
}

// O zi programată (_mjcLucrareHtml): cine, ce, și — cât e doar programată — montată, mutată, ștearsă.
export function FoaieLucrare({ d, l, f, msg, busy, onF, onClose, onMontata, onMuta, onSterge, onClient }: {
  d: CalDate; l: CalLucrare; f: FormLuc; msg: string; busy: boolean; onF: (f: FormLuc) => void; onClose: () => boolean;
  onMontata: () => void; onMuta: () => void; onSterge: () => void; onClient: () => void;
}) {
  const prog = !esteMontata(l.status);
  const ce = ceSeMonteaza(l.items);
  return (
    <Foaie titlu={(l.company_name || '—') + ' · ' + ziRo(l.zi)} icon="wrench" onClose={onClose}>
      <div class="frm">
        <div class="mjc-text">
          {masini(l.masini) + ' · ' + (l.partener_nume || 'instalator neales') + ' · ' + stareText(l, d.stari)}
          {ce && <span class="mjc-ce">{ce}</span>}
        </div>
        {prog && (
          <>
            <div class="ctr-h2" style="margin-top:2px">S-a montat?</div>
            <div class="fld"><label>Câte mașini s-au montat</label>
              <input type="number" inputMode="numeric" min="1" max={l.masini} step="1" value={f.mont} disabled={busy}
                onInput={(e: any) => onF({ ...f, mont: e.currentTarget.value })} />
            </div>
            <div class="mjc-text mic">{CAL_TEXT.maiPutine}</div>
            <button class="btn btn-primary" disabled={busy} onClick={onMontata}><Icon name="check" size={16} /> Montată</button>
            <div class="ctr-h2">Altă zi sau alt instalator</div>
            <div class="fld"><label>Ziua</label>
              <input type="date" value={f.mzi} disabled={busy} onInput={(e: any) => onF({ ...f, mzi: e.currentTarget.value })} />
            </div>
            <div class="fld"><label>Cine montează</label>
              <select value={f.mpart} disabled={busy} onChange={(e: any) => onF({ ...f, mpart: e.currentTarget.value })}>
                <option value="">— neales —</option>
                {instalatoriLucrare(d.parteneri, l).map((p) => <option value={String(p.id)}>{p.name}</option>)}
              </select>
            </div>
            <button class="btn fl-btn2" disabled={busy} onClick={onMuta}><Icon name="calendar" size={16} /> {busy ? 'Se mută…' : 'Mută'}</button>
          </>
        )}
        {msg && <div class="ctr-msg">{msg}</div>}
        <div class="ctr-btns" style="margin-top:2px">
          <button class="ctr-btn" disabled={busy} onClick={onClient}><Icon name="arrowRight" size={15} /> La client</button>
          {prog && <button class="ctr-btn danger" disabled={busy} onClick={onSterge}><Icon name="trash" size={15} /> Șterge ziua</button>}
        </div>
        <div class="frm-actions">
          <button class="btn fl-btn2" disabled={busy} onClick={() => onClose()}>Închide</button>
        </div>
      </div>
    </Foaie>
  );
}

// Foaia de jos (ca în Stoc). Închiderea (X, fundal) trece prin aceeași funcție ca „înapoi" de pe Android.
function Foaie({ titlu, icon, onClose, children }: { titlu: string; icon: 'calendar' | 'wrench'; onClose: () => boolean; children: any }) {
  return (
    <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet">
        <div class="sheet-h">
          <b class="mjc-foaie-t"><Icon name={icon} size={18} color="var(--ctr-ok)" /> {titlu}</b>
          <button class="h-btn" onClick={() => onClose()} aria-label="Închide"><Icon name="x" /></button>
        </div>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}
