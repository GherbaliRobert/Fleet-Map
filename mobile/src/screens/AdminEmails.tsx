import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { FmMsg, FmScreen, poartaFirma, type FmMesaj } from '../components/FirmaUi';
import './admin.css'; // .frm, .fld

// „Adrese de email" (web: Setări → Notificări), pentru adminul firmei: agenda firmei — dispecerat@,
// contabilitate@ — care primește alerte și rapoarte pe lângă conturile oamenilor. O adresă NU primește nimic
// până nu e confirmată din inbox: altfel oricine își face cont ar trimite emailuri de pe serverul nostru
// oriunde. Limita de 20 de adrese, cele 5 confirmări pe oră și adresa dublă sunt ale serverului; telefonul
// arată refuzul cu vorbele lui. Mesajul despre confirmare e CINSTIT: dacă emailul n-a plecat, o spunem.
export function AdminEmails() {
  const p = poartaFirma('manageUsers', 'Adrese de email', 'Agenda de adrese e a unei firme');
  if (p) return p;
  return <AdminEmailsEcran />;
}

function stare(a: any) {
  return a.confirmed_at
    ? { t: 'confirmată', c: 'var(--fm-ok)', ok: true }
    : { t: 'așteaptă confirmarea', c: 'var(--orange)', ok: false };
}

function AdminEmailsEcran() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState<FmMesaj>(null);
  const [email, setEmail] = useState('');
  const [eticheta, setEticheta] = useState('');
  const [adaug, setAdaug] = useState(false);
  const [busy, setBusy] = useState<string>(''); // „id:camp" sau „id:retrimite" / „id:sterge"

  async function load() {
    setErr('');
    try { const d = await Api.companyEmails(); setRows(Array.isArray(d) ? d : []); }
    catch (e: any) { setErr(e?.message || 'Nu s-a putut citi agenda de adrese.'); setRows(null); }
  }
  useEffect(() => { load(); }, []);

  // Bifele se salvează pe loc, ca pe web.
  async function bifeaza(a: any, camp: 'la_alerte' | 'la_rapoarte') {
    const val = !a[camp];
    setBusy(a.id + ':' + camp);
    try {
      await Api.setCompanyEmailUses(a.id, { [camp]: val });
      setRows((l) => (l || []).map((x) => (x.id === a.id ? { ...x, [camp]: val } : x)));
      setMsg(null);
    } catch (e: any) { setMsg({ t: e?.message || 'Nu s-a putut salva.', rau: true }); }
    finally { setBusy(''); }
  }
  async function adauga() {
    const e = email.trim();
    if (!e) { setMsg({ t: 'Scrie o adresă de email.', rau: true }); return; }
    setAdaug(true);
    try {
      const r: any = await Api.addCompanyEmail(e, eticheta);
      if (r && r.confirmareTrimisa === false) {
        setMsg({ t: 'Adresa a fost adăugată, dar emailul de confirmare NU a plecat. Verifică setările de email ale serverului sau apasă butonul de retrimitere.', rau: true });
      } else {
        setMsg({ t: 'Am trimis un email de confirmare la ' + e + '. Adresa începe să primească după ce se apasă linkul.' });
      }
      setEmail(''); setEticheta('');
    } catch (x: any) { setMsg({ t: x?.message || 'Nu s-a putut adăuga adresa.', rau: true }); }
    finally { setAdaug(false); }
    await load();
  }
  async function retrimite(a: any) {
    setBusy(a.id + ':retrimite');
    try {
      const r: any = await Api.resendCompanyEmail(a.id);
      setMsg(r && r.confirmareTrimisa === false
        ? { t: 'Emailul de confirmare nu a plecat — verifică setările de email ale serverului.', rau: true }
        : { t: 'Am trimis din nou emailul de confirmare.' });
    } catch (e: any) { setMsg({ t: e?.message || 'Nu s-a putut trimite.', rau: true }); }
    finally { setBusy(''); }
  }
  async function sterge(a: any) {
    if (!confirm('Ștergi adresa ' + a.email + ' din agendă?')) return;
    setBusy(a.id + ':sterge');
    try { await Api.deleteCompanyEmail(a.id); setMsg(null); }
    catch (e: any) { setMsg({ t: e?.message || 'Nu s-a putut șterge.', rau: true }); }
    finally { setBusy(''); }
    await load();
  }

  const neconf = (rows || []).filter((a) => !a.confirmed_at).length;

  return (
    <FmScreen titlu="Adrese de email">
      <p class="fm-note">Adresele firmei care primesc alerte și rapoarte, pe lângă conturile oamenilor. O adresă primește ceva <b>doar după ce e confirmată din inbox</b> — altfel oricine ar putea trimite emailuri, de pe serverul nostru, oriunde.</p>

      <div class="fm-card pad">
        <div class="frm">
          <div class="fld">
            <label for="adr-email">Adresa</label>
            <input id="adr-email" type="email" value={email} placeholder="adresa@firma.ro" autocomplete="off" autocapitalize="none" spellcheck={false}
              onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
          </div>
          <div class="fld">
            <label for="adr-et">La ce e</label>
            <input id="adr-et" type="text" value={eticheta} placeholder="la ce e (ex. Dispecerat)" maxLength={60}
              onInput={(e) => setEticheta((e.target as HTMLInputElement).value)} />
          </div>
          <button class="btn btn-primary btn-block" disabled={adaug} onClick={adauga}>
            {adaug ? 'Se adaugă…' : <><Icon name="plus" size={18} color="#06210f" /> Adaugă</>}
          </button>
        </div>
      </div>

      <FmMsg msg={msg} onClose={() => setMsg(null)} />
      {err && <div class="fm-msg rau" role="alert"><Icon name="alert" size={17} color="var(--red)" /><span>{err}</span></div>}
      {rows == null && !err && <div class="fm-empty"><div class="spin" style="margin:0 auto" /></div>}
      {rows != null && !rows.length && (
        <div class="fm-empty">
          <Icon name="mail" size={36} color="var(--text-muted)" />
          <b>Nicio adresă în agendă</b>
          Alertele merg deocamdată doar către conturile oamenilor. Adaugă aici o adresă comună, de tipul dispecerat@firma.ro.
        </div>
      )}
      {rows != null && rows.length > 0 && (
        <>
          <div class="fm-list">
            {rows.map((a) => {
              const st = stare(a);
              const bif = (camp: 'la_alerte' | 'la_rapoarte', et: string) => {
                const on = !!a[camp];
                return (
                  <button class={'fm-chip' + (on ? ' on' : '')} style="flex:1;justify-content:center" role="switch" aria-checked={on}
                    disabled={busy === a.id + ':' + camp} onClick={() => bifeaza(a, camp)}>
                    <Icon name={on ? 'check' : 'x'} size={15} /> {et}
                  </button>
                );
              };
              return (
                <div class="fm-row" style="flex-direction:column;align-items:stretch;gap:10px">
                  <div style="display:flex;align-items:center;gap:11px">
                    <span class="fm-dot" style={'background:' + st.c} />
                    <span class="mid" style="flex:1;min-width:0">
                      <div class="nm">{a.email}</div>
                      <div class="sub">{a.eticheta ? a.eticheta + ' · ' : ''}<b style={'color:' + st.c}>{st.t}</b></div>
                    </span>
                  </div>
                  <div style="display:flex;gap:8px">
                    {bif('la_alerte', 'Alerte')}
                    {bif('la_rapoarte', 'Rapoarte')}
                  </div>
                  <div class="fm-btns">
                    {!st.ok && (
                      <button class="fm-btn acc" style="flex:1" disabled={busy === a.id + ':retrimite'} onClick={() => retrimite(a)}>
                        {busy === a.id + ':retrimite' ? <div class="spin" style="width:15px;height:15px;border-width:2px" /> : <Icon name="mail" size={16} />} Retrimite confirmarea
                      </button>
                    )}
                    <button class="fm-btn rau" style={st.ok ? 'flex:1' : ''} disabled={busy === a.id + ':sterge'} onClick={() => sterge(a)} aria-label={'Șterge adresa ' + a.email}>
                      <Icon name="trash" size={16} /> Șterge
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <p class="fm-foot">
            Bifele spun <b>ce primește</b> fiecare adresă.{' '}
            {neconf
              ? <>Ai <b>{neconf}{neconf === 1 ? ' adresă neconfirmată' : ' adrese neconfirmate'}</b> — {neconf === 1 ? 'nu primește' : 'nu primesc'} nimic până nu se apasă linkul din emailul de confirmare.</>
              : 'Toate adresele sunt confirmate.'}
          </p>
        </>
      )}
    </FmScreen>
  );
}
