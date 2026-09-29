import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { refreshMe } from '../app/store';
import { Icon, type IconName } from '../components/Icon';
import { FmMsg, FmScreen, poartaFirma, type FmMesaj } from '../components/FirmaUi';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import './detail.css'; // .sheet*
import './admin.css';  // .sw (comutatorul), .fld, .frm-actions

// „Roluri" (web: Setări → Conturi și roluri), pentru adminul firmei. Firma își BOTEAZĂ rolurile („Dispecer" →
// „Operator depou") și TAIE din ce are voie fiecare; poate face și roluri proprii, pornite dintr-unul standard.
// Nu poate adăuga drepturi: serverul primește lista de TĂIERI și o cerne prin ce are rolul oricum. Toate
// regulile (limita de 20, „rolul e folosit de N persoane", numele de minim 2 litere) sunt ale serverului —
// telefonul arată refuzul cu vorbele lui. Bifele se țin pe telefon până la „Salvează", ca pe web.
export function AdminRoles() {
  const p = poartaFirma('manageUsers', 'Roluri', 'Rolurile sunt ale unei firme');
  if (p) return p;
  return <AdminRolesEcran />;
}

type Camp = 'drepturi' | 'ecrane' | 'editari' | 'rapoarte';
type Bifa = { cheie: string; eticheta: string; grup?: string; are: boolean };
const FILE: [Camp, string, IconName][] = [
  ['drepturi', 'Ce poate face', 'key'],
  ['ecrane', 'Ce ecrane vede', 'eye'],
  ['editari', 'Ce poate edita', 'edit'],
  ['rapoarte', 'Ce rapoarte scoate', 'report'],
];
const CAMPURI: Camp[] = ['drepturi', 'ecrane', 'editari', 'rapoarte'];
// Rolurile de pornire pentru „Rol nou", cu ce poate fiecare — aceleași cuvinte ca pe web (ROL_BAZE).
const ROL_BAZE: [string, string, string][] = [
  ['manager', 'Manager', 'Vede toată flota și o modifică: mașini, șoferi, alerte, documente.'],
  ['dispatcher', 'Dispecer', 'Vede mașinile care i se dau, confirmă alerte și scoate rapoarte.'],
  ['viewer', 'Viewer', 'Doar se uită la mașinile care i se dau. Nu modifică nimic.'],
];

type Edit = { r: any; nume: string; draft: Record<Camp, Bifa[]>; fila: Camp; msg: FmMesaj; busy: boolean };
type Nou = { nume: string; baza: string; eroare: string; lucrez: boolean };

const numeRol = (r: any) => (r && (r.nume || r.numeStandard || r.rol)) || '';
// Câte lucruri a scos firma din rol, la un loc — cifra de pe eticheta din listă.
const taiate = (r: any) => CAMPURI.reduce((n, c) => n + ((r && r[c]) || []).filter((x: any) => !x.are).length, 0);
const copie = (r: any): Record<Camp, Bifa[]> => {
  const o: any = {};
  CAMPURI.forEach((c) => { o[c] = ((r && r[c]) || []).map((x: any) => ({ cheie: String(x.cheie), eticheta: x.eticheta, grup: x.grup, are: !!x.are })); });
  return o;
};
const culese = (l: Bifa[]) => l.filter((d) => !d.are).map((d) => d.cheie);

function AdminRolesEcran() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<FmMesaj>(null);
  const [ed, setEd] = useState<Edit | null>(null);
  const [nou, setNou] = useState<Nou | null>(null);

  async function load(): Promise<any[]> {
    setErr('');
    try {
      const d = await Api.companyRoles();
      const l = Array.isArray(d) ? d : [];
      setRows(l);
      return l;
    } catch (e: any) {
      setErr(e?.message || 'Nu s-au putut citi rolurile.');
      setRows(null);
      return [];
    }
  }
  useEffect(() => { load(); }, []);

  function deschide(r: any, m: FmMesaj = null) {
    setEd({ r, nume: r.nume || '', draft: copie(r), fila: 'drepturi', msg: m, busy: false });
  }
  const schimbat = (e: Edit) => (e.nume.trim() !== String(e.r.nume || '').trim())
    || CAMPURI.some((c) => e.draft[c].some((d, i) => { const o = (e.r[c] || [])[i]; return !o || !!o.are !== d.are; }));
  // Întoarce true dacă foaia s-a închis. Aceeași întrebare pentru X, fundal și butonul „înapoi" de pe Android.
  function inchide(): boolean {
    if (!ed) return true;
    if (ed.busy) return false;
    if (schimbat(ed) && !confirm('Închizi fără să salvezi?\n\nSchimbările făcute la rolul „' + numeRol(ed.r) + '” se pierd.')) return false;
    setEd(null);
    return true;
  }
  function inchideNou(): boolean {
    if (!nou) return true;
    if (nou.lucrez) return false;
    setNou(null);
    return true;
  }
  // „Înapoi" pe Android închide foaia (cu întrebarea de mai sus), nu pleacă de pe ecranul Roluri.
  useInapoiInchide(!!ed, inchide);
  useInapoiInchide(!!nou, inchideNou);
  function bifa(c: Camp, cheie: string, are: boolean) {
    setEd((p) => (p ? { ...p, draft: { ...p.draft, [c]: p.draft[c].map((d) => (d.cheie === cheie ? { ...d, are } : d)) } } : p));
  }
  function toate(c: Camp, are: boolean) {
    setEd((p) => (p ? { ...p, draft: { ...p.draft, [c]: p.draft[c].map((d) => ({ ...d, are })) } } : p));
  }

  async function salveaza() {
    if (!ed || ed.busy) return;
    const e = ed;
    setEd({ ...e, busy: true, msg: null });
    try {
      await Api.saveCompanyRole(e.r.rol, {
        nume: e.nume, taiate: culese(e.draft.drepturi), ecrane: culese(e.draft.ecrane),
        editari: culese(e.draft.editari), rapoarte: culese(e.draft.rapoarte),
      });
      setEd(null);
      setMsg({ t: 'Rol salvat.' });
      await load();
      refreshMe(); // dacă e chiar rolul meu, meniul își schimbă imediat ce arată
    } catch (x: any) {
      // Refuzul rămâne în foaie, cu bifele neatinse — omul nu trebuie să le refacă.
      setEd((p) => (p ? { ...p, busy: false, msg: { t: x?.message || 'Nu s-a putut salva.', rau: true } } : p));
    }
  }
  async function reseteaza() {
    if (!ed || ed.busy) return;
    const r = ed.r;
    const ce = r.propriu ? 'Ștergi rolul „' + numeRol(r) + '”?' : 'Rolul „' + numeRol(r) + '” revine la standard. Continui?';
    if (!confirm(ce)) return;
    setEd({ ...ed, busy: true, msg: null });
    try {
      await Api.resetCompanyRole(r.rol);
      setEd(null);
      setMsg({ t: r.propriu ? 'Rol șters.' : 'Rolul a revenit la standard.' });
      await load();
      refreshMe();
    } catch (x: any) {
      // Ex. „Rolul e folosit de 2 persoane. Mută-i pe alt rol întâi."
      setEd((p) => (p ? { ...p, busy: false, msg: { t: x?.message || 'Nu s-a putut.', rau: true } } : p));
    }
  }

  async function creeaza() {
    if (!nou || nou.lucrez) return;
    const nume = nou.nume.trim();
    if (!nume) { setNou({ ...nou, eroare: 'Scrie un nume pentru rol.' }); return; }
    setNou({ ...nou, eroare: '', lucrez: true });
    try {
      const x = await Api.createCompanyRole(nume, nou.baza);
      setNou(null);
      const l = await load();
      const r = l.find((y: any) => y && y.rol === (x && x.rol));
      if (r) deschide(r, { t: 'Rol creat. Acum taie din el ce nu-i trebuie.' });
      else setMsg({ t: 'Rol creat. Acum taie din el ce nu-i trebuie.' });
    } catch (e: any) {
      setNou((p) => (p ? { ...p, lucrez: false, eroare: e?.message || 'Nu s-a putut crea rolul.' } : p));
    }
  }

  return (
    <FmScreen titlu="Roluri">
      <p class="fm-note">Poți <b>redenumi</b> rolurile ca la tine în firmă și poți <b>tăia</b> din ce are voie fiecare. Nu poți adăuga drepturi peste cele standard — așa, o greșeală poate produce cel mult un rol cu mai puține drepturi, niciodată unul cu mai multe.</p>
      <FmMsg msg={msg} onClose={() => setMsg(null)} />
      {err && <div class="fm-msg rau" role="alert"><Icon name="alert" size={17} color="var(--red)" /><span>{err}</span></div>}
      {rows == null && !err && <div class="fm-empty"><div class="spin" style="margin:0 auto" /></div>}
      {rows != null && (
        <>
          {!rows.length && <div class="fm-empty">Niciun rol.</div>}
          <div class="fm-list">
            {rows.map((r) => {
              const n = taiate(r);
              const redenumit = !!r.nume && r.nume !== r.numeStandard;
              return (
                <button class="fm-row" onClick={() => { setMsg(null); deschide(r); }}>
                  <span class="mid">
                    <div class="nm">{numeRol(r)}</div>
                    {(r.propriu || redenumit) && (
                      <div class="sub">{r.propriu ? 'pornit de la ' + (r.numeStandard || r.baza) : 'rolul standard: ' + r.numeStandard}</div>
                    )}
                    {(r.propriu || n > 0) && (
                      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
                        {r.propriu && <span class="fm-pill plin">rol propriu</span>}
                        {n > 0 && <span class="fm-pill" style="color:var(--orange)">{n} tăiate</span>}
                      </div>
                    )}
                  </span>
                  <Icon name="chevronR" size={18} color="var(--text-muted)" />
                </button>
              );
            })}
          </div>
          <button class="btn btn-primary btn-block" style="margin-top:12px" onClick={() => { setMsg(null); setNou({ nume: '', baza: 'dispatcher', eroare: '', lucrez: false }); }}>
            <Icon name="plus" size={18} color="#06210f" /> Rol nou
          </button>
          <p class="fm-foot">Debifezi ceva → omul nu mai poate. Nu poți adăuga peste ce știe rolul standard, așa că o greșeală aici poate doar <b>strânge</b> drepturi, niciodată da mai multe. Rolul de <b>administrator</b> nu apare deloc: cine îl are trebuie să poată oricând intra înapoi și repara. Schimbările se aplică la <b>următoarea cerere</b> a omului — nu trebuie să se delogheze.</p>
        </>
      )}

      {ed && (() => {
        const r = ed.r;
        const lista = ed.draft[ed.fila] || [];
        const grupe: { g: string; l: Bifa[] }[] = [];
        lista.forEach((d) => {
          const g = d.grup || '';
          let x = grupe.find((y) => y.g === g);
          if (!x) { x = { g, l: [] }; grupe.push(x); }
          x.l.push(d);
        });
        const toateBifate = lista.length > 0 && lista.every((d) => d.are);
        const nBif = lista.filter((d) => d.are).length;
        return (
          <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) inchide(); }}>
            <div class="sheet" style="max-height:92vh">
              <div class="sheet-h"><b>{numeRol(r)}</b><button class="h-btn" onClick={inchide} aria-label="Închide"><Icon name="x" /></button></div>
              <div class="sheet-body">
                <FmMsg msg={ed.msg} onClose={() => setEd((p) => (p ? { ...p, msg: null } : p))} />
                <div class="fld">
                  <label for="rol-nume">Numele rolului, la voi în firmă</label>
                  <input id="rol-nume" type="text" maxLength={40} value={ed.nume} placeholder={r.numeStandard}
                    onInput={(e) => { const v = (e.target as HTMLInputElement).value; setEd((p) => (p ? { ...p, nume: v } : p)); }} />
                  <div class="muted" style="font-size:12px;line-height:1.45">
                    Aici îi dai numele cu care îl știe lumea la voi — de pildă „{r.numeStandard}” → „Operator depou”. Numele apare peste tot în aplicație, dar numai la voi în firmă; drepturile nu se schimbă cu el. Lași gol → rămâne <b>{r.numeStandard}</b>.{r.propriu ? <> <b>Rol făcut de voi.</b></> : null}
                  </div>
                </div>

                <div class="fm-chips scroll" style="margin-top:14px" role="tablist">
                  {FILE.map(([k, et, ic]) => (
                    <button class={'fm-chip' + (ed.fila === k ? ' on' : '')} role="tab" aria-selected={ed.fila === k}
                      onClick={() => setEd((p) => (p ? { ...p, fila: k } : p))}>
                      <Icon name={ic} size={15} /> {et}
                    </button>
                  ))}
                </div>

                {!lista.length ? (
                  <div class="fm-empty" style="padding:24px 10px">
                    {ed.fila === 'editari' ? 'Rolul ăsta nu modifică nimic în aplicație — nu are ce edita.' : 'Nimic de ales aici.'}
                  </div>
                ) : (
                  <>
                    <div style="display:flex;align-items:center;gap:10px;margin:2px 0 4px">
                      <button class="fm-btn" onClick={() => toate(ed.fila, !toateBifate)}>
                        <Icon name={toateBifate ? 'x' : 'check'} size={15} /> {toateBifate ? 'Debifează tot' : 'Bifează tot'}
                      </button>
                      <span class="muted" style="font-size:12.5px;margin-left:auto">{nBif} din {lista.length}</span>
                    </div>
                    {grupe.map((g) => (
                      <>
                        {g.g && <div class="fm-sec">{g.g}</div>}
                        <div class="fm-card" style="margin-bottom:6px">
                          {g.l.map((d) => (
                            <button class={'fm-tgl' + (d.are ? '' : ' taiat')} role="switch" aria-checked={d.are} onClick={() => bifa(ed.fila, d.cheie, !d.are)}>
                              <span class="lbl">{d.eticheta}</span>
                              <span class={'sw' + (d.are ? ' on' : '')} aria-hidden="true" />
                            </button>
                          ))}
                        </div>
                      </>
                    ))}
                  </>
                )}

                <div class="frm-actions" style="margin-top:14px">
                  <button class="btn btn-danger-ghost" disabled={ed.busy} onClick={reseteaza} style="font-size:14px">
                    <Icon name={r.propriu ? 'trash' : 'refresh'} size={16} /> {r.propriu ? 'Șterge rolul' : 'Revino la standard'}
                  </button>
                  <button class="btn btn-primary" disabled={ed.busy} onClick={salveaza}>{ed.busy ? 'Se salvează…' : 'Salvează'}</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {nou && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) inchideNou(); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="shield" size={18} color="var(--fm-ok)" /> Rol nou</b><button class="h-btn" onClick={inchideNou} aria-label="Închide"><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld">
                  <label for="rol-nm-nume">Cum îl numiți la voi în firmă</label>
                  <input id="rol-nm-nume" type="text" maxLength={40} placeholder="ex. Operator depou" value={nou.nume}
                    onInput={(e) => { const v = (e.target as HTMLInputElement).value; setNou((p) => (p ? { ...p, nume: v } : p)); }} />
                </div>
                <div class="fld">
                  <label>Pornește de la</label>
                  <div style="display:flex;flex-direction:column;gap:8px">
                    {ROL_BAZE.map(([k, n, d]) => (
                      <button type="button" class={'fm-baza' + (nou.baza === k ? ' on' : '')} aria-pressed={nou.baza === k}
                        onClick={() => setNou((p) => (p ? { ...p, baza: k } : p))}>
                        <b>{n}</b><span>{d}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div class="muted" style="font-size:12.5px;line-height:1.45">Rolul nou pornește cu drepturile acestuia, iar apoi <b>poți doar să tai</b> din ele. Nu are cum să ajungă mai puternic decât rolul de la care a pornit.</div>
                {nou.eroare && <FmMsg msg={{ t: nou.eroare, rau: true }} />}
                <div class="frm-actions">
                  <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" disabled={nou.lucrez} onClick={() => setNou(null)}>Renunță</button>
                  <button class="btn btn-primary" disabled={nou.lucrez} onClick={creeaza}>{nou.lucrez ? 'Se creează…' : 'Creează rolul'}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </FmScreen>
  );
}
