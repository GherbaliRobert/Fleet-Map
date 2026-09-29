import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { Icon } from '../components/Icon';
import { LinkParolaSheet, pregatesteLinkul, type LinkParola } from '../components/LinkParolaSheet';
import { luniOptiuni, rolNostru, semnatariDin, zi } from '../lib/contracte';
import { EMAIL_OK, rutaDosar, rutaFisa } from '../lib/companii';
import './admin.css';
import './detail.css';
import './firma.css';
import './companii.css';

// „Client nou" (fondatori) — deschiderea unui client în trei pași, ca pe web (coNouStart … coNouCreeaza):
//   1. Firma — cu datele luate de la ANAF, ca să nu fie tastate greșit (opțional, pornind de la o ofertă);
//   2. Contractul — număr, date, durată, reînnoire, preaviz, cine semnează, acordul GDPR;
//   3. Administratorul — DOAR emailul, fără parolă (08.09 și 16.09): pleacă un link și omul și-o pune singur.
// Anexa cu aparatele NU e aici dinadins: la deschidere încă nu e adoptat niciun aparat.
//
// Din ofertă: se copiază numele, CUI-ul, contactul și durata. Socoteala ofertei pe rânduri (`din_oferta`)
// NU se face pe telefon — ar fi a doua scriere a regulilor de preț. O face serverul, cu ACEEAȘI funcție
// ca web-ul (`_coSocotealaOfertei`, prin /api/admin/offers/calc cu `contract: true` → `pentruContract`),
// și pleacă la contract ca pe web: fără ea firma rămânea la 0 lei (prețul pe mașină nu se scria), iar
// anexa pierdea rândurile lunare. Ce a scris serverul pe firmă se citește înapoi și se spune în ecranul de final.
// Adresa: /admin/client-nou[?oferta=<id>].

type Firma = { cui: string; name: string; reg_com: string; address: string; contact_email: string; phone: string; anaf: any };
type Ctr = {
  number: string; signed_at: string; start_at: string; months: string; auto_renew: boolean; notice_days: string;
  rep_name: string; rep_role: string; our_name: string; our_role: string; gdpr_kind: string;
};
type Gata = {
  id: number; name: string; cui: string; contract: string | null; contractId: number | null;
  admin: string | null; adminLink: string | null; offerTotal: number | null; pretPeFirma: boolean; avertismente: string[];
};
const PASI = ['Firma', 'Contractul', 'Administratorul'];
const firmaGoala = (): Firma => ({ cui: '', name: '', reg_com: '', address: '', contact_email: '', phone: '', anaf: null });
const contractGol = (): Ctr => ({
  number: '', signed_at: '', start_at: '', months: '12', auto_renew: true, notice_days: '30',
  rep_name: '', rep_role: 'Administrator', our_name: '', our_role: 'Administrator', gdpr_kind: 'anexa',
});

export function ClientNou() {
  const loc = useLocation();
  const ofertaCeruta = String(((loc.query || {}) as any).oferta || '');
  const [pas, setPas] = useState(1);
  const [firma, setFirma] = useState<Firma>(firmaGoala);
  const [ctr, setCtr] = useState<Ctr>(contractGol);
  const [adminEmail, setAdminEmail] = useState('');
  const [offerId, setOfferId] = useState<number | null>(null);
  const [offerTotal, setOfferTotal] = useState<number | null>(null);
  const [oferte, setOferte] = useState<any[] | null>(null);
  const [noi, setNoi] = useState<string[] | null>(null);
  const [msg, setMsg] = useState<{ t: string; rau?: boolean } | null>(null);
  const [lucrez, setLucrez] = useState(false);
  const [gata, setGata] = useState<Gata | null>(null);
  const [link, setLink] = useState<LinkParola | null>(null);
  const [anafBusy, setAnafBusy] = useState(false);

  // Ofertele încă nelegate de niciun contract (una care a devenit deja client nu se mai propune).
  function citesteOferte() {
    Api.offers().then((l) => setOferte((Array.isArray(l) ? l : []).filter((o: any) => !o.contract_id))).catch(() => setOferte([]));
  }
  useEffect(() => {
    citesteOferte();
    // Cine semnează din partea noastră: conturile de super-admin ACTIVE ale platformei — niciun nume scris în cod.
    Api.users().then((l) => setNoi((Array.isArray(l) ? l : [])
      .filter((u: any) => u.role === 'superadmin' && u.active !== false)
      .map((u: any) => String(u.full_name || u.username || '').trim()).filter(Boolean))).catch(() => setNoi([]));
  }, []);
  // De regulă semnează AMÂNDOI fondatorii: propunerea implicită e lista întreagă, cu funcția la plural.
  useEffect(() => {
    if (noi && noi.length && !ctr.our_name) setCtr((c) => ({ ...c, our_name: noi.join(' și '), our_role: rolNostru(noi.length) }));
  }, [noi]);
  // Venit din „Ofertare Live" cu oferta aleasă → pașii se umplu din ea.
  useEffect(() => { if (oferte && ofertaCeruta && !offerId) iaOferta(ofertaCeruta); }, [oferte, ofertaCeruta]);

  const sf = (k: keyof Firma, v: any) => setFirma((f) => ({ ...f, [k]: v }));
  const sc = (k: keyof Ctr, v: any) => setCtr((c) => ({ ...c, [k]: v }));

  // Umple datele firmei din ofertă. Contactul din ofertă e un singur câmp: cu @ → email, altfel telefon.
  function iaOferta(idS: string) {
    if (!idS) { setOfferId(null); setOfferTotal(null); return; }
    const o = (oferte || []).find((x) => String(x.id) === String(idS));
    if (!o) return;
    setOfferId(Number(o.id));
    setOfferTotal(Number(o.monthly_total) || 0);
    setFirma((f) => {
      const n = { ...f };
      if (o.client_name) n.name = o.client_name;
      if (o.client_cui) n.cui = o.client_cui;
      const ct = String(o.client_contact || '').trim();
      if (ct) { if (ct.indexOf('@') >= 0) n.contact_email = ct; else n.phone = ct; }
      return n;
    });
    // Durata a fost discutată în ofertă (`contractMonths`; `contract` la ofertele vechi).
    const cfg = (o.config && o.config.cfg) || {};
    const luni = parseInt(cfg.contractMonths || cfg.contract, 10);
    if (luni > 0 && luni <= 240) sc('months', String(luni));
  }

  async function anaf() {
    const cui = firma.cui.trim();
    if (!cui) { sf('anaf', { eroare: 'Scrie întâi CUI-ul.' }); return; }
    setAnafBusy(true);
    try {
      const j: any = await Api.anafFirma(cui);
      setFirma((f) => ({
        ...f, name: j.name || f.name, reg_com: j.reg_com || f.reg_com, address: j.address || f.address,
        phone: j.phone || f.phone, cui: j.cui || f.cui,
        anaf: { vat_payer: !!j.vat_payer, inactiva: !!j.inactiva, radiata: !!j.radiata },
      }));
    } catch (e: any) {
      // Fără răspuns (rețea / timp depășit) → nu am ajuns la ANAF; altfel, vorbele serverului („Nu am găsit firma" etc.).
      const retea = !e || e.status === 0 || e.status === 408;
      sf('anaf', { eroare: retea ? 'Nu am putut ajunge la ANAF.' : (e.message || 'Nu am găsit firma.') });
    } finally { setAnafBusy(false); }
  }

  function mergi(n: number) {
    setMsg(null);
    if (n === 2 && pas === 1 && !firma.name.trim()) { setMsg({ t: 'Denumirea firmei e obligatorie.', rau: true }); return; }
    setPas(n);
  }

  // Semnatarii noștri: bifele scriu în câmp; câmpul rămâne editabil (se poate semna și prin împuternicit).
  const alesi = semnatariDin(ctr.our_name);
  function bifaNoi(nume: string) {
    const lista = noi || [];
    const set = new Set(alesi.filter((x) => lista.indexOf(x) >= 0));
    if (set.has(nume)) set.delete(nume); else set.add(nume);
    const ordonat = lista.filter((x) => set.has(x));
    setCtr((c) => ({
      ...c, our_name: ordonat.join(' și '),
      our_role: (c.our_role === 'Administrator' || c.our_role === 'Administratori') ? rolNostru(ordonat.length) : c.our_role,
    }));
  }

  async function creeaza() {
    if (lucrez) return;
    if (!firma.name.trim()) { setMsg({ t: 'Denumirea firmei e obligatorie.', rau: true }); return; }
    const email = adminEmail.trim().toLowerCase();
    if (email && !EMAIL_OK.test(email)) { setMsg({ t: 'Adresa trebuie să fie un email valid (ex. ion.popescu@firma.ro).', rau: true }); return; }
    setLucrez(true); setMsg({ t: 'Lucrez…' });
    const av: string[] = [];
    let id: number;
    try {
      const co: any = await Api.createCompany({ name: firma.name.trim() });
      if (!co || !co.id) { setMsg({ t: (co && co.error) || 'Nu am putut crea firma.', rau: true }); setLucrez(false); return; }
      id = Number(co.id);
    } catch (e: any) { setMsg({ t: e?.message || 'Nu am putut crea firma.', rau: true }); setLucrez(false); return; }

    // Datele juridice se salvează imediat după creare — ruta de creare primește doar numele.
    try {
      await Api.updateCompany(id, { cui: firma.cui.trim(), reg_com: firma.reg_com.trim(), address: firma.address.trim(), contact_email: firma.contact_email.trim(), phone: firma.phone.trim() });
    } catch (e: any) { av.push('Datele juridice nu s-au salvat (' + (e?.message || 'eroare') + ') — completează-le din fișa firmei.'); }

    let contractId: number | null = null, numar: string | null = null;
    const c = ctr;
    if (c.rep_name.trim() || c.signed_at || c.start_at || c.number.trim() || offerId) {
      // Socoteala ofertei (prețul pe mașină + rândurile lunare ale anexei), făcută de server cu funcția
      // web-ului. Dacă nu vine, contractul se face oricum, cu suma lunară a ofertei — și se spune.
      let dinOferta: any = null;
      if (offerId) {
        try {
          const calc: any = await Api.offerCalc({ offer_id: offerId, contract: true });
          dinOferta = (calc && calc.pentruContract) || null;
          if (!dinOferta) av.push('Socoteala ofertei nu a venit de la server — anexa are doar suma lunară, iar prețul pe mașină se pune din fișa firmei, „Abonament & plăți".');
        } catch (e: any) {
          av.push('Socoteala ofertei nu s-a putut face (' + (e?.message || 'eroare') + ') — anexa are doar suma lunară, iar prețul pe mașină se pune din fișa firmei, „Abonament & plăți".');
        }
      }
      try {
        const ct: any = await Api.createContract(id, {
          number: c.number.trim() || null, status: 'ciorna', offer_id: offerId || null,
          din_oferta: dinOferta,
          signed_at: zi(c.signed_at), start_at: zi(c.start_at), months: c.months === '' ? null : parseInt(c.months),
          auto_renew: !!c.auto_renew, notice_days: parseInt(c.notice_days) || 30,
          client_rep: { name: c.rep_name.trim(), role: c.rep_role.trim() }, our_rep: { name: c.our_name.trim(), role: c.our_role.trim() },
          gdpr: { kind: c.gdpr_kind },
        });
        if (ct && ct.id) { contractId = Number(ct.id); numar = ct.number || null; }
      } catch (e: any) { av.push('Contractul nu s-a salvat: ' + (e?.message || 'eroare') + '.'); }
    }

    let adminOk: string | null = null, adminLink: string | null = null;
    if (email) {
      // Fără parolă, mereu: pleacă invitația și omul își pune singur parola.
      try {
        const a: any = await Api.addCompanyAdmin(id, { username: email });
        if (a && a.invited) adminOk = email;
        else if (a && a.link) { adminLink = email; setLink(await pregatesteLinkul({ email, link: a.link, motiv: 'Emailul de invitație NU a plecat' })); }
        else av.push((a && a.warning) || 'Contul de administrator e făcut, dar linkul nu a plecat.');
      } catch (e: any) { av.push('Firma e creată, dar contul de admin nu: ' + (e?.message || 'eroare')); }
    }

    // Ce a scris serverul pe firmă din ofertă (prețul pe mașină, pentru factură) — citit, nu presupus.
    let pretPeFirma = false;
    if (offerId) { try { const ov: any = await Api.companyOverview(id); pretPeFirma = !!(ov && ov.offer); } catch { /* rămâne nespus */ } }

    setGata({ id, name: firma.name.trim(), cui: firma.cui.trim(), contract: numar, contractId, admin: adminOk, adminLink,
      offerTotal: offerId ? offerTotal : null, pretPeFirma, avertismente: av });
    setMsg(null);
    setLucrez(false);
    citesteOferte(); // o ofertă tocmai a devenit client — lista trebuie recitită
  }

  function altClient() {
    setGata(null); setPas(1); setFirma(firmaGoala()); setAdminEmail(''); setOfferId(null); setOfferTotal(null); setMsg(null);
    const c = contractGol();
    if (noi && noi.length) { c.our_name = noi.join(' și '); c.our_role = rolNostru(noi.length); }
    setCtr(c);
    if (ofertaCeruta) loc.route('/admin/client-nou', true);
  }

  const a = firma.anaf;
  const camp = (label: string, val: string, on: (v: string) => void, ph: string, type = 'text') => (
    <div class="fld"><label>{label}</label>
      <input type={type} value={val} placeholder={ph} autocapitalize={type === 'email' ? 'none' : undefined}
        inputMode={type === 'number' ? 'numeric' : undefined} onInput={(e: any) => on(e.target.value)} /></div>
  );

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/admin/companies')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Client nou</div>
        <div style="width:36px" />
      </header>
      <div class="content co-page">
        {gata ? (
          <div class="co-box ok co-gata">
            <strong><Icon name="check" size={16} color="var(--co-ok)" /> {gata.name} e deschis</strong>
            <ul>
              <li>Firma e creată{gata.cui ? ', cu CUI ' + gata.cui : ''}.</li>
              <li>{gata.contract
                ? <>Contractul <b>{gata.contract}</b> e salvat, în lucru.{gata.offerTotal
                  ? (gata.pretPeFirma
                    ? ' Prețul din ofertă (' + Math.round(gata.offerTotal) + ' lei/lună) e trecut în anexă și scris pe firmă, pentru factură.'
                    : ' Prețul din ofertă (' + Math.round(gata.offerTotal) + ' lei/lună) e trecut în anexă. Pe firmă nu s-a scris încă prețul pe mașină — pune-l din fișa firmei, „Abonament & plăți".')
                  : ''}</>
                : 'Fără contract încă.'}</li>
              <li>{gata.admin
                ? <>Invitația a plecat la <b>{gata.admin}</b> — își pune singur parola.</>
                : gata.adminLink
                  ? <>Contul lui <b>{gata.adminLink}</b> e făcut, dar emailul n-a plecat — trimite-i tu linkul de parolă.</>
                  : 'Fără administrator încă.'}</li>
            </ul>
            {gata.avertismente.map((t) => <div class="co-msg rau">{t}</div>)}
            <div class="co-note" style="font-size:13px;margin:10px 0 12px">Mai departe: adoptă aparatele clientului, apoi treci-le în anexa contractului și descarcă ciorna de semnat.</div>
            <div class="fm-btns">
              {gata.contractId
                ? <button class="btn btn-primary" style="flex:1" onClick={() => loc.route(rutaDosar(gata.id))}><Icon name="fileSignature" size={16} color="#06210F" /> Deschide dosarul</button>
                : <button class="btn btn-primary" style="flex:1" onClick={() => loc.route(rutaFisa(gata.id))}><Icon name="layers" size={16} color="#06210F" /> Deschide fișa firmei</button>}
              <button class="fm-btn" style="flex:1" onClick={altClient}>Deschid alt client</button>
            </div>
            {gata.adminLink && link == null && (
              <div class="co-note">Linkul de parolă îl găsești oricând în fișa firmei → Utilizatori, sau îl retrimiți din Utilizatori.</div>
            )}
          </div>
        ) : (
          <>
            <div class="co-note" style="font-size:13px;margin:0 2px 12px">Deschiderea unui client trece prin trei pași: datele firmei (luate de la ANAF), contractul cu durata și acordul GDPR, apoi contul de administrator.</div>
            <div class="co-pasi">
              {PASI.map((n, i) => {
                const k = i + 1, st = k < pas ? 'gata' : (k === pas ? 'acum' : '');
                return <div class={'co-pas ' + st}><span class="n">{k < pas ? '✓' : k}</span><span class="t">{n}</span></div>;
              })}
            </div>

            {pas === 1 && (
              <div class="frm">
                {oferte && oferte.length > 0 && (
                  <div class="fld"><label>Pornește de la o ofertă</label>
                    <select value={offerId != null ? String(offerId) : ''} onChange={(e: any) => iaOferta(e.target.value)}>
                      <option value="">— fără ofertă, scriu datele de mână —</option>
                      {oferte.map((o) => <option value={String(o.id)}>{(o.client_name || o.name || '#' + o.id) + ' · ' + Number(o.monthly_total || 0).toFixed(0) + ' ' + (o.currency || 'RON') + '/lună'}</option>)}
                    </select>
                    {offerId != null && (
                      <div class="co-msg bun"><Icon name="check" size={13} color="var(--co-ok)" /> Datele clientului și prețul de {Number(offerTotal || 0).toFixed(0)} lei/lună vin din ofertă — nu le mai scrii încă o dată.</div>
                    )}
                  </div>
                )}
                <div class="fld"><label>CUI / CIF</label>
                  <div style="display:flex;gap:8px">
                    <input style="flex:1;min-width:0" value={firma.cui} placeholder="ex. RO12345678" onInput={(e: any) => sf('cui', e.target.value)} />
                    <button class="fm-btn acc" disabled={anafBusy} onClick={anaf}><Icon name="download" size={15} /> {anafBusy ? 'Întreb ANAF…' : 'Preia de la ANAF'}</button>
                  </div>
                  {a && (a.eroare
                    ? <div class="co-msg rau">{a.eroare}</div>
                    : <>
                      <div class="co-msg bun"><Icon name="check" size={13} color="var(--co-ok)" /> Preluat de la ANAF{a.vat_payer ? ' · plătitoare de TVA' : ' · neplătitoare de TVA'}</div>
                      {(a.radiata || a.inactiva) && <div class="co-msg rau">⚠ {[a.radiata ? 'firma apare RADIATĂ la ANAF' : '', a.inactiva ? 'firma e declarată INACTIVĂ' : ''].filter(Boolean).join(' · ')}</div>}
                    </>)}
                </div>
                {camp('Denumire', firma.name, (v) => sf('name', v), 'Transport Alfa SRL')}
                {camp('Nr. Reg. Com.', firma.reg_com, (v) => sf('reg_com', v), 'J40/1234/2020')}
                {camp('Sediu', firma.address, (v) => sf('address', v), 'Str. …, oraș, județ')}
                {camp('Email contact', firma.contact_email, (v) => sf('contact_email', v), 'contact@firma.ro', 'email')}
                {camp('Telefon', firma.phone, (v) => sf('phone', v), '07xx xxx xxx', 'tel')}
              </div>
            )}

            {pas === 2 && (
              <div class="frm">
                {camp('Număr contract', ctr.number, (v) => sc('number', v), 'se propune automat')}
                <div class="frm-row">
                  {camp('Data semnării', ctr.signed_at, (v) => sc('signed_at', v), '', 'date')}
                  {camp('Începe la', ctr.start_at, (v) => sc('start_at', v), '', 'date')}
                </div>
                <div class="frm-row">
                  <div class="fld"><label>Durata</label>
                    <select value={ctr.months} onChange={(e: any) => sc('months', e.target.value)}>
                      {luniOptiuni(ctr.months).map(([v, l]) => <option value={v}>{l}</option>)}
                    </select></div>
                  <div class="fld"><label>La termen</label>
                    <select value={ctr.auto_renew ? '1' : '0'} onChange={(e: any) => sc('auto_renew', e.target.value === '1')}>
                      <option value="1">se reînnoiește singur</option>
                      <option value="0">se oprește</option>
                    </select></div>
                </div>
                {camp('Preaviz de reziliere (zile)', ctr.notice_days, (v) => sc('notice_days', v), '30', 'number')}

                <div class="fm-sec" style="margin:6px 0 0">Cine semnează</div>
                <div class="frm-row">
                  {camp('Reprezentantul clientului', ctr.rep_name, (v) => sc('rep_name', v), 'nume și prenume')}
                  {camp('Funcția', ctr.rep_role, (v) => sc('rep_role', v), 'Administrator')}
                </div>
                <div class="fld"><label>Din partea noastră semnează</label>
                  {(noi || []).length > 0 && (
                    <div class="fm-card" style="margin:0 0 6px;padding:0 12px">
                      {(noi || []).map((n) => {
                        const on = alesi.indexOf(n) >= 0;
                        return (
                          <button class={'co-chk' + (on ? ' on' : '')} role="checkbox" aria-checked={on} onClick={() => bifaNoi(n)}>
                            <span class="bx">{on ? <Icon name="check" size={14} /> : null}</span><span class="mid">{n}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <input value={ctr.our_name} placeholder="nume și prenume" onInput={(e: any) => sc('our_name', e.target.value)} />
                </div>
                {camp('Funcția', ctr.our_role, (v) => sc('our_role', v), 'Administrator')}
                <div class="fld"><label>Acordul GDPR</label>
                  <select value={ctr.gdpr_kind} onChange={(e: any) => sc('gdpr_kind', e.target.value)}>
                    <option value="anexa">anexă la contract (ultima anexă)</option>
                    <option value="separat">act semnat separat</option>
                  </select></div>
                <div class="co-note" style="margin:0">Fără acordul ăsta noi ținem datele de localizare ale șoferilor clientului fără temei — e obligatoriu, nu opțional.</div>
              </div>
            )}

            {pas === 3 && (
              <div class="frm">
                {camp('Email administrator', adminEmail, setAdminEmail, 'aici pleacă invitația', 'email')}
                <div class="co-note" style="margin:0">Omul primește pe email un link prin care își pune SINGUR parola. Noi nu o vedem și nu o știm niciodată. Poți sări peste pasul ăsta și adăuga administratorul mai târziu.</div>
              </div>
            )}

            <div class="co-nav">
              {pas > 1
                ? <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" disabled={lucrez} onClick={() => mergi(pas - 1)}><Icon name="chevronL" size={16} /> Înapoi</button>
                : <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" onClick={() => loc.route('/admin/companies')}>Renunț</button>}
              {pas < 3
                ? <button class="btn btn-primary" onClick={() => mergi(pas + 1)}>Mai departe <Icon name="arrowRight" size={16} color="#06210F" /></button>
                : <button class="btn btn-primary" disabled={lucrez} onClick={creeaza}><Icon name="check" size={16} color="#06210F" /> {lucrez ? 'Lucrez…' : 'Deschide clientul'}</button>}
            </div>
            {msg && <div class={'co-msg' + (msg.rau ? ' rau' : '')}>{msg.t}</div>}
          </>
        )}
      </div>
      {link && <LinkParolaSheet data={link} onClose={() => setLink(null)} />}
    </div>
  );
}
