// Super-admin: „Montaj" (Business, imediat după Companii) — secțiunea partenerilor de montaj, ca pe web
// (raxLoadMontaj, MJ_FILE): trei file, Parteneri · Contracte cu partenerii · Lucrări.
//
//   • Parteneri — fișa completă a firmei care montează (components/ParteneriMontaj.tsx). Pe fiecare rând scrie
//     dacă are contract; dacă n-are, „Fă contract" e chiar acolo.
//   • Contracte cu partenerii — același drum ca la clienți: în lucru → aprobat → trimis la semnat → semnat →
//     încheiat. Partenerul e PRESTATORUL, noi BENEFICIARUL. Fiecare lipsă are butonul ei, chiar pe cartonaș — și
//     un buton care chiar o închide: tarifele lipsesc din CONTRACT (Anexa nr. 1, înghețată la creare), deci
//     fișa partenerului singură nu le aduce acolo; le aduce „Reia tarifele" (`tarife_din_partener`, pe server).
//   • Lucrări — toate montajele, de la toți clienții, cu marja socotită de SERVER. Doar privirea de sus: o lucrare
//     se programează și se editează DOAR din fișa clientului (fila Contract), unde duce „La client".
//
// Telefonul NU hotărăște nimic din toate astea: trecerile (_trecereContract), ce lipsește (`lipsuri`), capătul
// (`sfarsit`), refuzurile („e semnat, nu se mai schimbă", „are contract semnat, nu se șterge") și marja lucrărilor
// vin de la server, cu vorbele lui. Hârtia (PDF-ul contractului) și actul semnat vin din generatorul serverului,
// prin salveazaDeLaServer (HartieBtns / DescarcaFisier). Clientul nu vede nimic de aici: rutele sunt requireSuperadmin.
import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { Confirma } from '../components/FlotaUi';
import { AlegeFisier, CapEcran, DescarcaFisier, HartieBtns, Pill, type FisierAles } from '../components/ContractUi';
import { ParteneriMontaj } from '../components/ParteneriMontaj';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import { MONTAJ_TIPURI, azi, inputZi, lei, luniOptiuni, luniText, zile } from '../lib/contracte';
import { MJ_LIPSA, MJ_LIPSURI_FIRMA, mjStare, ziLaPranz } from '../lib/montajSectiune';
import { rutaDosar } from '../lib/companii';
import { nrDe } from '../lib/numar';
import './admin.css';
import './detail.css';
import './contracte.css';
import './montaj.css';

type Fila = 'parteneri' | 'contracte' | 'lucrari';
const MJ_FILE: [Fila, string][] = [['parteneri', 'Parteneri'], ['contracte', 'Contracte cu partenerii'], ['lucrari', 'Lucrări']];

type Date_ = {
  parteneri: any[]; contracte: any[]; fara: { id: number; name: string }[]; trimite: boolean;
  lucrari: any[]; stari: Record<string, string>;
};
type Dlg = { fel: 'aproba' | 'amtrimis' | 'trimite' | 'incheie' | 'sterge' | 'semnat' | 'retarif'; c: any } | null;

// Fila și filtrele se țin minte cât trăiește aplicația: „La client" duce în fișa firmei, iar „înapoi" trebuie să
// întoarcă omul pe aceeași filă, cu aceleași filtre, nu la începutul secțiunii.
let filaTinuta: Fila = 'parteneri';
const filtruTinut = { stare: '', part: '' };

export function Montaj() {
  const loc = useLocation();
  const [fila, setFilaS] = useState<Fila>(filaTinuta);
  const [d, setD] = useState<Date_ | null>(null);
  const [err, setErr] = useState('');
  const [deschidePart, setDeschidePart] = useState<number | null>(null); // „Completează" → fișa partenerului
  const [editC, setEditC] = useState<any | null>(null);
  const [dlg, setDlg] = useState<Dlg>(null);
  const [busy, setBusy] = useState(false);
  const [urca, setUrca] = useState<number | null>(null);
  const cerere = useRef(0);
  const faInCurs = useRef(false);
  const dinTarife = useRef<any>(null); // contractul din care „Completează" a deschis fișa pentru tarifele lipsă

  // Butonul „înapoi" de pe Android închide foaia de confirmare deschisă (Aprobă, Am trimis-o, Trimite la semnat,
  // Încheie, Șterge ciorna, Reia tarifele), nu tot ecranul Montaj — cu adresa sau motivul scris în ea cu tot.
  // Cât se lucrează, rămâne. „E semnat" își are paza ei (SemnatFoaie), iar o întrebare nu se deschide niciodată
  // peste editarea contractului.
  useInapoiInchide(!!dlg && dlg.fel !== 'semnat', () => { if (busy) return false; setDlg(null); return true; });
  // „Trimite" refuzat pentru goluri pe hârtie deschide fișa partenerului — dar abia DUPĂ ce s-a închis întrebarea,
  // nu în aceeași randare: două foi păzite schimbate deodată lăsau în istoric intrarea întrebării, iar „înapoi"
  // de pe Android nu mai făcea nimic după ce închideai fișa (ca la contractele clienților, ContractPasi).
  const [dupaTrimite, setDupaTrimite] = useState<any>(null);
  useEffect(() => { if (!dupaTrimite || dlg) return; const c = dupaTrimite; setDupaTrimite(null); completeaza(c); }, [dupaTrimite, dlg]);

  // Cele trei liste pleacă împreună; fiecare cade separat pe gol, ca pe web.
  async function incarca(): Promise<Date_ | null> {
    const nr = ++cerere.current;
    setErr('');
    let prima = '';
    const prinde = (e: any): null => {
      if (!prima) prima = e && e.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare');
      return null;
    };
    const [p, c, l] = await Promise.all([
      Api.montajParteneri().catch(prinde), Api.montajContracte().catch(prinde), Api.montajLucrari().catch(prinde),
    ]);
    if (nr !== cerere.current) return null; // a pornit între timp o reîncărcare mai nouă
    const nou: Date_ = {
      parteneri: Array.isArray(p) ? p : [],
      contracte: (c && c.contracte) || [], fara: (c && c.fara_contract) || [], trimite: !!(c && c.trimite_pe_email),
      lucrari: (l && l.lucrari) || [], stari: (l && l.stari) || {},
    };
    setD(nou);
    if (p == null && c == null && l == null) setErr(prima);
    return nou;
  }
  useEffect(() => { incarca(); }, []);

  // Schimbarea filei închide editarea de contract deschisă (ca raxMjFila).
  function setFila(f: Fila) { filaTinuta = f; setFilaS(f); setEditC(null); }
  const inapoi = () => { if (history.length > 1) history.back(); else loc.route('/meniu'); };

  // „Completează": fișa partenerului, pe fila Parteneri (ca raxPartEdit din _mjLipsuriHtml). Venită din tarifele
  // lipsă ale unui contract nesemnat, fișa e doar primul pas: după salvare se propune „Reia tarifele" (dupaFisa).
  function completeaza(c: any, pentruTarife = false) {
    dinTarife.current = pentruTarife ? c : null;
    setFila('parteneri');
    setDeschidePart(Number(c.partener_id));
  }
  // Fișa deschisă de „Completează" s-a salvat. Dacă venea din tarifele lipsă și partenerul are ACUM tarife scrise,
  // următorul pas e să intre și în contract — altfel lipsa ar rămâne pe cartonaș, oricât ai completa fișa.
  function dupaFisa(p: any) {
    const c = dinTarife.current;
    dinTarife.current = null;
    if (c && p && Number(c.partener_id) === Number(p.id) && Object.keys(p.tarife || {}).length) setDlg({ fel: 'retarif', c });
  }

  // „Fă contract": ciornă cu termenii obișnuiți, apoi fila Contracte și editarea contractului nou (raxMjContractNou).
  async function faContract(pid: number) {
    if (faInCurs.current) return;
    faInCurs.current = true;
    try {
      const j: any = await Api.createMontajContract({ partener_id: pid, months: 12, auto_renew: true, notice_days: 30, plata_zile: 30 });
      showToast('Contractul ' + ((j && j.number) || '') + ' e în lucru ✓');
      setFila('contracte');
      const nou = await incarca();
      const c = (nou && nou.contracte.find((x) => Number(x.id) === Number(j && j.id))) || j;
      if (c) setEditC(c);
    } catch (e: any) { showToast(e?.message || 'Eroare', true); } // 409: are deja un contract — vorbele serverului
    finally { faInCurs.current = false; }
  }

  // Un pas pe drumul contractului. Regula trecerilor e pe server; refuzul lui apare ca atare.
  async function put(c: any, corp: any, ok: string) {
    if (busy) return;
    setBusy(true);
    try {
      await Api.updateMontajContract(Number(c.id), corp);
      showToast(ok);
      setDlg(null);
      incarca();
    } catch (e: any) { setDlg(null); showToast(e?.message || 'Eroare', true); }
    finally { setBusy(false); }
  }
  // „Trimite la semnat": email cu PDF-ul atașat, scris și trimis de server (raxMjTrimite).
  async function trimite(c: any, catre?: string) {
    if (busy) return;
    setBusy(true);
    try {
      const j = await Api.sendMontajContract(Number(c.id), { catre: String(catre || '').trim() });
      setDlg(null);
      showToast('Trimis la ' + ((j && j.trimis_la) || '') + ' ✓');
      incarca();
    } catch (e: any) {
      setDlg(null);
      showToast(e?.message || 'Eroare', true);
      // Goluri pe hârtie (CUI, sediu, reprezentant): serverul refuză cu 400 și atunci se deschide fișa partenerului,
      // exact ca pe web (raxMjTrimite). Ce lipsește spune lista de pe rând (`c.lipsuri`), făcută de ACEEAȘI regulă ca
      // refuzul (_lipsuriPartener) — eroarea aplicației nu poartă corpul răspunsului, doar mesajul lui (29.09).
      if (e?.status === 400 && (c.lipsuri || []).some((k: string) => ['cui', 'sediu', 'reprezentant'].indexOf(k) >= 0)) setDupaTrimite(c);
      // Fără email pe server (503): lista spune din nou `trimite_pe_email`, iar butonul devine „Am trimis-o".
      else if (e?.status === 503) incarca();
    } finally { setBusy(false); }
  }
  // „Reia tarifele": Anexa nr. 1 se reface din fișa partenerului — pe SERVER (`tarife_din_partener`), doar cât
  // contractul e nesemnat; un contract semnat e refuzat acolo, cu vorbele lui. Ce a intrat se citește din răspuns.
  async function reiaTarife(c: any) {
    if (busy) return;
    setBusy(true);
    try {
      const j: any = await Api.updateMontajContract(Number(c.id), { tarife_din_partener: true });
      setDlg(null);
      if (Object.keys((j && j.tarife) || {}).length) showToast('Tarifele partenerului au intrat în contract ✓');
      else showToast('Partenerul n-are încă tarife scrise — completează-i întâi fișa.', true);
      incarca();
    } catch (e: any) { setDlg(null); showToast(e?.message || 'Eroare', true); }
    finally { setBusy(false); }
  }
  async function stergeCiorna(c: any) {
    if (busy) return;
    setBusy(true);
    try { await Api.deleteMontajContract(Number(c.id)); setDlg(null); incarca(); }
    catch (e: any) { setDlg(null); showToast(e?.message || 'Eroare', true); }
    finally { setBusy(false); }
  }
  // „Încarcă semnat" (lipsește actul la un contract în vigoare).
  async function urcaSemnat(c: any, f: FisierAles) {
    if (urca != null) return;
    setUrca(Number(c.id));
    try {
      await Api.uploadMontajContractFile(Number(c.id), { name: f.name, b64: f.b64 });
      showToast('Contractul semnat e în dosar ✓');
      incarca();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setUrca(null); }
  }

  const nr: Record<Fila, number> = { parteneri: d ? d.parteneri.length : 0, contracte: d ? d.contracte.length : 0, lucrari: d ? d.lucrari.length : 0 };

  return (
    <div class="screen">
      <CapEcran titlu="Montaj" onBack={inapoi} onRefresh={() => { setD(null); incarca(); }} />
      <div class="content">
        <div class="ctr-wrap">
          {d == null && !err && <div class="spin" style="margin:30px auto" />}
          {err && <div class="ctr-err">{err}</div>}
          {d != null && (
            <div class="ctr-chips" role="tablist">
              {MJ_FILE.map(([k, et]) => (
                <button role="tab" aria-selected={fila === k} class={'ctr-chip' + (fila === k ? ' on' : '')} onClick={() => setFila(k)}>
                  {et} · <b>{nr[k]}</b>
                </button>
              ))}
            </div>
          )}
          {d != null && fila === 'parteneri' && (
            <ParteneriMontaj lista={d.parteneri} contracte={d.contracte} onSchimbat={() => { incarca(); }}
              onFaContract={faContract} deschide={deschidePart} onDeschis={() => setDeschidePart(null)} onSalvatDeschis={dupaFisa} />
          )}
          {d != null && fila === 'contracte' && contracte(d)}
          {d != null && fila === 'lucrari' && <Lucrari d={d} onClient={(id) => loc.route(rutaDosar(id))} />}
        </div>
      </div>

      {editC && <EditContract c={editC} onInchide={() => setEditC(null)} onSalvat={() => { setEditC(null); incarca(); }} />}
      {dlg && dlg.fel === 'semnat' && <SemnatFoaie c={dlg.c} onInchide={() => setDlg(null)} onGata={() => { setDlg(null); incarca(); }} />}
      {dlg && dlg.fel === 'aproba' && (
        <Confirma title="Aprobă contractul" busy={busy} okLabel="Aprobă"
          text={'Aprobi contractul ' + (dlg.c.number || '') + ' cu ' + (dlg.c.partener_name || 'partenerul') + '?\n\nDin clipa asta hârtia nu mai e ciornă: se poate trimite la semnat.'}
          onOk={() => put(dlg.c, { status: 'aprobat' }, 'Contract aprobat ✓ — urmează „Trimite la semnat"')}
          onCancel={() => { if (!busy) setDlg(null); }} />
      )}
      {dlg && dlg.fel === 'amtrimis' && (
        <Confirma title="Am trimis-o" busy={busy} okLabel="Da, l-am trimis"
          text={'L-ai trimis tu partenerului?\n\nContractul trece pe „trimis". Când vine semnat, apeși „E semnat" și îl încarci.'}
          onOk={() => put(dlg.c, { status: 'trimis' }, 'Marcat „trimis" ✓')}
          onCancel={() => { if (!busy) setDlg(null); }} />
      )}
      {dlg && dlg.fel === 'trimite' && (
        <Confirma title="Trimite la semnat" busy={busy} okLabel="Trimite"
          text={'Contractul ' + (dlg.c.number || '') + ' pleacă pe email la ' + (dlg.c.partener_name || 'partener') + ', cu PDF-ul atașat. Răspunsul lui — contractul semnat — vine la adresa noastră.'}
          field={{ label: 'Adresa partenerului', type: 'email', value: dlg.c.email || '', placeholder: 'office@firma.ro' }}
          onOk={(v) => trimite(dlg.c, v)} onCancel={() => { if (!busy) setDlg(null); }} />
      )}
      {dlg && dlg.fel === 'incheie' && (
        <Confirma title="Încheie contractul" danger busy={busy} okLabel="Încheie contractul"
          text="Închei contractul cu partenerul? Se trece data de azi ca dată a încetării. Lucrările deja comandate se execută și se plătesc."
          field={{ label: 'Motivul încetării (rămâne în dosar)', placeholder: 'ex. denunțare cu preaviz' }}
          onOk={(v) => put(dlg.c, { status: 'incheiat', ended_reason: String(v || '').trim() || null }, 'Contract încheiat')}
          onCancel={() => { if (!busy) setDlg(null); }} />
      )}
      {dlg && dlg.fel === 'sterge' && (
        <Confirma title="Șterge ciorna" danger busy={busy} okLabel="Șterge"
          text="Ștergi ciorna contractului? Partenerul rămâne, doar hârtia asta dispare."
          onOk={() => stergeCiorna(dlg.c)} onCancel={() => { if (!busy) setDlg(null); }} />
      )}
      {dlg && dlg.fel === 'retarif' && (
        <Confirma title="Reia tarifele" busy={busy} okLabel="Reia tarifele"
          text={'Reiei în Anexa nr. 1 a contractului ' + (dlg.c.number || '') + ' tarifele de azi ale partenerului ' + (dlg.c.partener_name || '') + '?' +
            (dlg.c.status === 'trimis' ? '\n\nContractul a plecat deja la partener fără ele: după asta, trimite-i-l din nou.' : '')}
          onOk={() => reiaTarife(dlg.c)} onCancel={() => { if (!busy) setDlg(null); }} />
      )}
    </div>
  );

  // ── Fila „Contracte cu partenerii" (_mjContracteHtml) ──
  function contracte(d: Date_) {
    return (
      <>
        {d.fara.length > 0 && (
          <div class="ctr-band warn">
            <div class="ctr-band-t">Parteneri fără contract</div>
            {d.fara.map((p) => (
              <div class="mj-fara">
                <b>{p.name}</b>
                <button class="ctr-btn pri" onClick={() => faContract(Number(p.id))}><Icon name="fileSignature" size={15} /> Fă contract</button>
              </div>
            ))}
          </div>
        )}
        <div class="ctr-h"><Icon name="fileSignature" size={17} class="ic" /> Contracte cu partenerii</div>
        <div class="ctr-sub">Același drum ca la clienți: în lucru → aprobat → trimis la semnat → semnat. Partenerul e PRESTATORUL, noi BENEFICIARUL; tarifele lui intră în Anexa nr. 1, iar Anexa nr. 2 e acordul GDPR (el vede date ale clienților noștri).</div>
        {!d.contracte.length
          ? <div class="ctr-empty">Niciun contract cu un partener încă. Se face din fila Parteneri („Fă contract").</div>
          : <div class="ctr-list">{d.contracte.map((c) => cardContract(c, d.trimite))}</div>}
      </>
    );
  }

  function cardContract(c: any, trimitePeEmail: boolean) {
    const st = mjStare(c.status), semnat = c.status === 'activ' || c.status === 'incheiat';
    const perioada = c.start_at
      ? <>{zile(c.start_at) + ' → ' + (c.sfarsit ? zile(c.sfarsit) : 'nedeterminat')}</>
      : <>{c.months ? luniText(Number(c.months)) : 'nedeterminat'}<span class="ctr-small">fără dată de început</span></>;
    return (
      <div class="ctr-card">
        <div class="ctr-card-h">
          <span class="mid">
            <span class="nm">{c.partener_name || '—'}</span>
            {c.cui && <span class="ctr-small">{c.cui}</span>}
          </span>
          <Pill fel={st[1]}>{st[0]}</Pill>
        </div>
        <div class="ctr-kv"><span class="k">Contract</span><span class="v">{c.number || '—'}</span></div>
        <div class="ctr-kv"><span class="k">Perioada</span><span class="v">{perioada}</span></div>
        {pas(c, trimitePeEmail)}
        {lipsuri(c)}
        <div class="ctr-btns">
          <HartieBtns path={'/api/montaj/contracte/' + c.id + '/pdf'} ce="Contractul" nume="contract-montaj.pdf" />
          {c.has_file && <DescarcaFisier path={'/api/montaj/contracte/' + c.id + '/file'} ce="Contractul semnat" eticheta="Actul semnat" />}
          {semnat
            ? (c.status === 'activ' && <button class="ctr-btn" onClick={() => setDlg({ fel: 'incheie', c })}><Icon name="ban" size={15} /> Încheie</button>)
            : (
              <>
                <button class="ctr-btn" onClick={() => setEditC(c)}><Icon name="edit" size={15} /> Editează</button>
                <button class="ctr-btn danger" onClick={() => setDlg({ fel: 'sterge', c })}><Icon name="trash" size={15} /> Șterge</button>
              </>
            )}
        </div>
      </div>
    );
  }

  // Pasul următor (_mjPasHtml): ciornă → Aprobă; aprobat → Trimite la semnat / Am trimis-o; trimis → E semnat (+ Retrimite).
  function pas(c: any, trimitePeEmail: boolean) {
    let info: string | null = null, butoane: any = null;
    if (c.status === 'ciorna') {
      butoane = <button class="ctr-btn pri" onClick={() => setDlg({ fel: 'aproba', c })}><Icon name="check" size={15} /> Aprobă</button>;
    } else if (c.status === 'aprobat') {
      if (trimitePeEmail) {
        butoane = <button class="ctr-btn pri" onClick={() => setDlg({ fel: 'trimite', c })}><Icon name="mail" size={15} /> Trimite la semnat</button>;
      } else {
        // Butonul nu minte: fără email pe server, contractul îl trimiți tu (descarcă-l mai jos).
        info = 'Emailul nu e configurat pe server: descarcă contractul și trimite-l tu.';
        butoane = <button class="ctr-btn pri" onClick={() => setDlg({ fel: 'amtrimis', c })}><Icon name="mail" size={15} /> Am trimis-o</button>;
      }
    } else if (c.status === 'trimis') {
      info = c.sent_at ? 'trimis pe ' + zile(c.sent_at) + (c.sent_to ? ' la ' + c.sent_to : '') : null;
      butoane = (
        <>
          <button class="ctr-btn pri" onClick={() => setDlg({ fel: 'semnat', c })}><Icon name="fileSignature" size={15} /> E semnat</button>
          {trimitePeEmail && <button class="ctr-btn" onClick={() => setDlg({ fel: 'trimite', c })}><Icon name="refresh" size={15} /> Retrimite</button>}
        </>
      );
    }
    if (!butoane) return null;
    return (
      <div class="mj-pas">
        {info && <span class="ctr-small">{info}</span>}
        <div class="ctr-btns">{butoane}</div>
      </div>
    );
  }

  // Ce lipsește (_mjLipsuriHtml): lipsurile le dă serverul; fiecare are butonul ei — unul care chiar o închide.
  // „tarife" = Anexa nr. 1 a CONTRACTULUI e goală (înghețată la creare din fișa de atunci). Fișa partenerului o
  // repară doar dacă nici el n-are tarife (și atunci, după salvare, se propune „Reia tarifele"). Dacă partenerul
  // le are deja, butonul e „Reia tarifele"; pe un contract semnat nu se mai schimbă nimic — o spunem, fără buton.
  function lipsuri(c: any) {
    const l: string[] = c.lipsuri || [];
    const semnat = c.status === 'activ';
    const p = ((d && d.parteneri) || []).find((x) => Number(x.id) === Number(c.partener_id));
    const tarifeAparte = l.indexOf('tarife') >= 0 && (semnat || !!(p && Object.keys(p.tarife || {}).length));
    const firma = l.filter((k) => MJ_LIPSURI_FIRMA.indexOf(k) >= 0 && !(k === 'tarife' && tarifeAparte));
    const actul = l.indexOf('actul') >= 0;
    if (c.status === 'incheiat' || (!firma.length && !actul && !tarifeAparte)) {
      return <div class="ctr-kv"><span class="k">Ce lipsește</span><span class="v">—</span></div>;
    }
    return (
      <div class="mj-lipsuri">
        <span class="k">Ce lipsește</span>
        {firma.length > 0 && (
          <div class="mj-lipsa">
            <span>lipsește {firma.map((k) => MJ_LIPSA[k]).join(', ')}</span>
            <button class="ctr-btn" onClick={() => completeaza(c, firma.indexOf('tarife') >= 0)}><Icon name="edit" size={15} /> Completează</button>
          </div>
        )}
        {tarifeAparte && (
          <div class="mj-lipsa">
            <span>lipsesc tarifele din Anexa nr. 1</span>
            {semnat
              ? <span class="mj-lipsa-nota">Contractul e semnat și nu se mai schimbă: alte tarife se fac printr-un contract nou.</span>
              : <button class="ctr-btn" onClick={() => setDlg({ fel: 'retarif', c })}><Icon name="refresh" size={15} /> Reia tarifele</button>}
          </div>
        )}
        {actul && (
          <div class="mj-lipsa">
            <span>lipsește contractul semnat (PDF)</span>
            <AlegeFisier busy={urca === Number(c.id)} etFisier="Încarcă semnat" onFile={(f) => urcaSemnat(c, f)} />
          </div>
        )}
      </div>
    );
  }
}

// ── Editarea unui contract NESEMNAT (_mjEditHtml / raxMjEditSalveaza) ──
// Semnat = încuiat: serverul refuză cu 400 („Alte tarife sau altă durată se fac printr-un contract nou"), iar
// refuzul apare pe foaie. Data de început se scrie la PRÂNZ, ca pe web (vezi ziLaPranz).
type FormC = { luni: string; renew: string; preaviz: string; plata: string; start: string; zona: string; our: string; ourrole: string; retarif: boolean };
function formC(c: any): FormC {
  const rep = (c && c.our_rep) || {};
  return {
    luni: c && c.months != null ? String(c.months) : '',
    renew: c && c.auto_renew === false ? '0' : '1',
    preaviz: String(c && c.notice_days != null ? c.notice_days : 30),
    plata: String(c && c.plata_zile != null ? c.plata_zile : 30),
    start: inputZi(c && c.start_at), zona: (c && c.zona) || '',
    our: rep.name || '', ourrole: rep.role || '', retarif: false,
  };
}

function EditContract({ c, onInchide, onSalvat }: { c: any; onInchide: () => void; onSalvat: () => void }) {
  const [f, setF] = useState<FormC>(() => formC(c));
  const start = useRef(JSON.stringify(formC(c))); // formularul cum s-a deschis — „înapoi" întreabă doar dacă s-a schimbat ceva
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  // Întoarce true dacă foaia s-a închis. Aceeași întrebare pentru X, fundal și „înapoi" de pe Android.
  function inchide(): boolean {
    if (busy) return false;
    if (JSON.stringify(f) !== start.current && !confirm('Închizi fără să salvezi?\n\nCe ai scris la contract se pierde.')) return false;
    onInchide();
    return true;
  }
  useInapoiInchide(!!c, inchide);
  const sf = (k: keyof FormC, v: any) => { setMsg(''); setF((x) => ({ ...x, [k]: v })); };

  async function salveaza() {
    if (busy) return;
    const intreg = (v: string) => { const n = parseInt(v, 10); return isFinite(n) ? n : null; };
    const corp = {
      months: f.luni === '' ? null : parseInt(f.luni, 10), auto_renew: f.renew !== '0',
      notice_days: intreg(f.preaviz), plata_zile: intreg(f.plata), zona: f.zona.trim(),
      start_at: ziLaPranz(f.start),
      our_rep: f.our.trim() ? { name: f.our.trim(), role: f.ourrole.trim() } : null,
      tarife_din_partener: f.retarif,
    };
    setBusy(true);
    setMsg('');
    try {
      await Api.updateMontajContract(Number(c.id), corp);
      showToast('Contract salvat ✓');
      setBusy(false);
      onSalvat();
    } catch (e: any) {
      setBusy(false);
      setMsg(e?.message || 'Eroare');
    }
  }

  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) inchide(); }}>
      <div class="sheet">
        <div class="sheet-h">
          <b><Icon name="fileSignature" size={18} color="var(--ctr-ok)" /> Contractul {c.number || ''} — {c.partener_name || ''}</b>
          <button class="h-btn" onClick={() => inchide()} aria-label="Închide"><Icon name="x" /></button>
        </div>
        <div class="sheet-body">
          <div class="frm">
            <div class="fld"><label>Durata</label>
              <select value={f.luni} onChange={(e: any) => sf('luni', e.target.value)}>
                {luniOptiuni(c.months == null ? '' : c.months).map(([v, et]) => <option value={v}>{et}</option>)}
              </select>
            </div>
            <div class="fld"><label>La termen</label>
              <select value={f.renew} onChange={(e: any) => sf('renew', e.target.value)}>
                <option value="1">se reînnoiește singur</option>
                <option value="0">se oprește</option>
              </select>
            </div>
            <div class="fld"><label>Preaviz de denunțare (zile)</label>
              <input type="number" inputMode="numeric" min="0" step="1" placeholder="30" value={f.preaviz} onInput={(e: any) => sf('preaviz', e.target.value)} />
            </div>
            <div class="fld"><label>Plata facturii lui (zile)</label>
              <input type="number" inputMode="numeric" min="0" step="1" placeholder="30" value={f.plata} onInput={(e: any) => sf('plata', e.target.value)} />
            </div>
            <div class="fld"><label>Începe la</label>
              <input type="date" value={f.start} onInput={(e: any) => sf('start', e.target.value)} />
            </div>
            <div class="fld"><label>Zona</label>
              <input value={f.zona} placeholder="ex. Timiș, Arad" onInput={(e: any) => sf('zona', e.target.value)} />
            </div>
            <div class="fld"><label>Cine semnează la noi</label>
              <input value={f.our} placeholder="nume și prenume" onInput={(e: any) => sf('our', e.target.value)} />
            </div>
            <div class="fld"><label>Funcția</label>
              <input value={f.ourrole} placeholder="Administrator" onInput={(e: any) => sf('ourrole', e.target.value)} />
            </div>
            <label class="ctr-semn-b">
              <input type="checkbox" checked={f.retarif} onChange={(e: any) => sf('retarif', !!e.target.checked)} />
              <span>Reia tarifele de azi ale partenerului în Anexa nr. 1</span>
            </label>
            {msg && <div class="ctr-msg">{msg}</div>}
            <div class="frm-actions">
              <button class="btn fl-btn2" disabled={busy} onClick={onInchide}>Renunț</button>
              <button class="btn btn-primary" disabled={busy} onClick={salveaza}><Icon name="check" size={16} /> {busy ? 'Se salvează…' : 'Salvează contractul'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── „E semnat" (raxMjSemnat): data semnării + fișierul semnat. Întâi urcă fișierul, apoi trece pe „semnat".
// Din clipa asta contractul nu se mai modifică. Data se scrie la prânz, ca pe web.
function SemnatFoaie({ c, onInchide, onGata }: { c: any; onInchide: () => void; onGata: () => void }) {
  const [ziS, setZi] = useState(azi());
  const [busy, setBusy] = useState(false);
  function inchide(): boolean { if (busy) return false; onInchide(); return true; }
  useInapoiInchide(!!c, inchide);

  async function peFisier(fis: FisierAles) {
    if (busy) return;
    setBusy(true);
    try {
      await Api.uploadMontajContractFile(Number(c.id), { name: fis.name, b64: fis.b64 });
    } catch (e: any) { setBusy(false); showToast(e?.message || 'Eroare', true); return; }
    try {
      await Api.updateMontajContract(Number(c.id), { status: 'activ', signed_at: ziLaPranz(ziS) || Date.now() });
      showToast('Contract semnat și în dosar ✓');
    } catch (e: any) {
      showToast(e?.message || 'Eroare', true); // fișierul a urcat: lista se reîncarcă oricum
    }
    setBusy(false);
    onGata();
  }

  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) inchide(); }}>
      <div class="sheet">
        <div class="sheet-h">
          <b><Icon name="fileSignature" size={18} color="var(--ctr-ok)" /> Contractul e semnat?</b>
          <button class="h-btn" onClick={() => inchide()} aria-label="Închide"><Icon name="x" /></button>
        </div>
        <div class="sheet-body">
          <div class="frm">
            <div style="font-size:14.5px;line-height:1.5;white-space:pre-line">
              {'Contractul ' + (c.number || '') + ' e semnat de amândoi?\n\nAlegi fișierul semnat primit de la partener. Din clipa asta contractul nu se mai modifică.'}
            </div>
            <div class="fld"><label>Data semnării</label>
              <input type="date" value={ziS} disabled={busy} onInput={(e: any) => setZi(e.target.value)} />
            </div>
            <div class="ctr-btns" style="margin-top:0">
              <AlegeFisier busy={busy} etFisier="Alege fișierul semnat" onFile={peFisier} />
            </div>
            <div class="frm-actions">
              <button class="btn fl-btn2" disabled={busy} onClick={onInchide}>Renunță</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Fila „Lucrări" (_mjLucrariHtml): toate montajele, de la toți clienții. Doar privirea de sus — o lucrare se
// editează DOAR din fișa clientului (fila Contract), unde duce „La client". Marja o dă serverul (`marja`).
function Lucrari({ d, onClient }: { d: Date_; onClient: (companyId: any) => void }) {
  const [fStare, setFStare] = useState(filtruTinut.stare);
  const [fPart, setFPart] = useState(filtruTinut.part);
  const stari = d.stari || {};
  const toate = d.lucrari;
  const lista = toate.filter((m) => {
    if (fStare && m.status !== fStare) return false;
    if (fPart && String(m.partener_id == null ? '' : m.partener_id) !== fPart) return false;
    return true;
  });
  const ce = (m: any) => (m.items || []).map((r: any) => {
    const t = MONTAJ_TIPURI.find((x) => x[0] === r.tip);
    return (r.buc || 0) + '× ' + (t ? t[1] : r.tip);
  }).join(', ');
  const suma = (k: string) => lista.reduce((s, m) => s + (Number(m[k]) || 0), 0);

  return (
    <>
      <div class="ctr-h"><Icon name="wrench" size={17} class="ic" /> Lucrările de montaj</div>
      <div class="ctr-sub">Toate lucrările, de la toți clienții. Se programează și se editează din fișa clientului (fila Contract) — de acolo intră în contractul lui.</div>
      <div class="mj-filtre">
        <select aria-label="Starea lucrării" value={fStare} onChange={(e: any) => { filtruTinut.stare = e.target.value; setFStare(e.target.value); }}>
          <option value="">toate stările</option>
          {Object.keys(stari).map((k) => <option value={k}>{stari[k]}</option>)}
        </select>
        <select aria-label="Partenerul" value={fPart} onChange={(e: any) => { filtruTinut.part = e.target.value; setFPart(e.target.value); }}>
          <option value="">toți partenerii</option>
          {d.parteneri.map((p) => <option value={String(p.id)}>{p.name}</option>)}
        </select>
      </div>
      {!lista.length ? (
        <div class="ctr-empty">{toate.length ? 'Nicio lucrare pentru filtrul ăsta.' : 'Nicio lucrare de montaj încă. Se face din fișa clientului, fila Contract.'}</div>
      ) : (
        <>
          <div class="ctr-total">
            {nrDe(lista.length, 'lucrare', 'lucrări')} · clientul plătește <b>{lei(suma('total_client'))}</b> · partenerii ne costă <b>{lei(suma('total_partener'))}</b> · rămâne la noi <b class="ctr-ok-txt">{lei(suma('marja'))}</b>
          </div>
          <div class="ctr-list">
            {lista.map((m) => (
              <div class="ctr-card">
                <div class="ctr-card-h">
                  <span class="mid">
                    <span class="nm">{m.company_name || '—'}</span>
                    <span class="ctr-small">{m.data_lucrare ? zile(m.data_lucrare) : 'fără dată'}</span>
                  </span>
                  <Pill>{stari[m.status] || m.status}</Pill>
                </div>
                <div class="ctr-kv"><span class="k">Partener</span><span class="v">{m.partener_nume || <span class="ctr-small" style="margin:0">neales</span>}</span></div>
                <div class="ctr-kv"><span class="k">Lucrarea</span><span class="v">{ce(m) || '—'}</span></div>
                <div class="ctr-kv"><span class="k">Clientul plătește</span><span class="v">{lei(m.total_client)}</span></div>
                <div class="ctr-kv"><span class="k">Ne costă</span><span class="v">{lei(m.total_partener)}</span></div>
                <div class="ctr-kv"><span class="k">Rămâne</span><span class="v mj-rama">{lei(m.marja)}</span></div>
                <div class="ctr-btns">
                  <button class="ctr-btn" disabled={m.company_id == null} onClick={() => onClient(m.company_id)}><Icon name="arrowRight" size={15} /> La client</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
