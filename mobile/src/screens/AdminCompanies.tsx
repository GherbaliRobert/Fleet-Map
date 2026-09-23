import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './admin.css';
import './detail.css'; // .sheet*, .btn*

// Super-admin: Companii — datele de contact, modulele, abonamentul (citit din ofertă) și plățile.
// Toate endpoint-urile sunt requireSuperadmin pe server → non-super primește 403 (ecranul e oricum ascuns din meniu).
//
// RA Tracks NU are planuri: prețul unei firme vine DOAR din oferta scrisă pe ea (companies.custom_plan).
// Oferta, datele juridice (CUI, adresă, IBAN), cota RA Insight pe cont și contractul se fac de pe web.
// Nici firma nouă nu se mai face de aici: „Creează companie" a devenit pe web „Client nou", trei pași
// (firmă + contract + administrator). O firmă făcută doar cu numele ar rămâne fără niciun administrator.
// Aceleași texte ca pe web (_RAX_MODS).
const FEATURES = [
  { key: 'agents', label: 'Agenți AI', sub: 'Master — permite rularea agenților AI (pornit implicit, sunt gratuiți)' },
  { key: 'ai_assistant', label: 'Asistent AI', sub: 'Chat AI + RA Insight în aplicație' },
  { key: 'etransport', label: 'e-Transport', sub: 'Modul ANAF e-Transport (coduri UIT)' },
  { key: 'tahograf', label: 'Tahograf', sub: 'Analiză fișiere tahograf (.ddd)' },
];
// Metodele de plată, aceleași ca pe web (fișa firmei → „Înregistrează plată"). Transferul e implicit.
const PAY_METHODS = [{ v: 'transfer', l: 'Transfer bancar' }, { v: 'cash', l: 'Numerar' }, { v: 'card', l: 'Card' }, { v: 'manual', l: 'Manual / altul' }];
function fmtDate(s: any) { if (!s) return '—'; try { return new Date(isNaN(Number(s)) ? s : Number(s)).toLocaleDateString('ro-RO'); } catch { return String(s).slice(0, 10); } }
function fmtLei(v: any) { return (Number(v) || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' lei'; }
// „20 de întrebări", dar „5 întrebări" — acordul românesc cu numerele.
function nDe(n: number, w: string) { const r = Math.abs(n) % 100; return n + ((r === 0 && n !== 0) || r >= 20 ? ' de ' : ' ') + w; }
function nrVeh(n: number) { return n === 1 ? '1 vehicul' : nDe(n, 'vehicule'); }
function nrUseri(n: number) { return n === 1 ? '1 utilizator' : nDe(n, 'utilizatori'); }
// Suma unei plăți = abonamentul lunar din ofertă × lunile alese (ca pe web). Fără ofertă → gol.
function sumaAuto(ov: any, luni: any): string {
  const pl = Number(ov && ov.price && ov.price.monthlyTotal) || 0;
  if (!ov || !ov.offer || pl <= 0) return '';
  const m = Math.max(1, parseInt(luni) || 1);
  return (Math.round(pl * m * 100) / 100).toFixed(2);
}
// Fondul RA Insight al firmei, doar de citit (se pune de pe web, „Abonament & plăți").
// Serverul (aiQuotaState) folosește limita veche DOAR când firma n-are niciun fond: nici pe cont, nici fix.
function areFondAi(ov: any): boolean {
  const q = (ov && ov.ai_quota) || {};
  return Number(q.questionsPerSeat) > 0 || Number(q.questions) > 0;
}
function aiFondTxt(ov: any, c: any, aiOn: boolean): string {
  if (!aiOn) return 'modul oprit';
  const q = (ov && ov.ai_quota) || {};
  if (Number(q.questionsPerSeat) > 0) return nDe(Number(q.questionsPerSeat), 'întrebări') + '/cont' + (Number(q.seatPriceRON) > 0 ? ' · ' + fmtLei(q.seatPriceRON) + '/cont' : '');
  if (Number(q.questions) > 0) return nDe(Number(q.questions), 'întrebări') + '/lună, fond fix pe firmă';
  if (Number(c && c.ai_monthly_limit) > 0) return 'după limita de mai sus';
  return 'nelimitat';
}

export function AdminCompanies() {
  const loc = useLocation();
  const [items, setItems] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState<any | null>(null);
  const [ov, setOv] = useState<any | null>(null);
  const [ovErr, setOvErr] = useState(false);
  const [form, setForm] = useState<any>({});
  const [feat, setFeat] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  // Firma deschisă ACUM în fișă. Fișa unei firme mari se încarcă greu: dacă între timp ai deschis alta,
  // răspunsul întârziat al primei NU are voie să ajungă pe a doua (i-ar pune CUI-ul, IBAN-ul și prețul
  // altei firme — iar „Salvează datele" le-ar și scrie în bază).
  const cur = useRef<number | null>(null);
  const esteFirma = (o: any, id: any) => !!(o && o.company && id != null && Number(o.company.id) === Number(id));

  function reload() {
    setErr('');
    Api.companies().then(setItems).catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setItems([]); });
  }
  useEffect(reload, []);

  function open(c: any) {
    cur.current = Number(c.id);
    setSel(c); setOv(null); setOvErr(false); setFeat({});
    const lim = Number(c.ai_monthly_limit) > 0 ? String(c.ai_monthly_limit) : '';
    setForm({ name: c.name || '', contact_email: c.contact_email || '', phone: c.phone || '', ai_limit: lim, ai_limit0: lim, pay_months: '1', pay_amount: '', pay_touched: false, pay_method: 'transfer', pay_note: '' });
    Api.companyOverview(c.id).then((o: any) => {
      // Răspuns venit după ce fișa s-a închis sau s-a deschis altă firmă → se aruncă.
      if (cur.current !== Number(c.id) || !esteFirma(o, c.id)) return;
      setOv(o);
      const f = (o && (o.features || (o.company && o.company.features))) || c.features || {};
      setFeat(Object.assign({}, f));
      // Suma plății se completează singură din ofertă — doar dacă omul n-a scris-o deja de mână.
      setForm((p: any) => (p.pay_touched ? p : { ...p, pay_amount: sumaAuto(o, p.pay_months) }));
    }).catch(() => { if (cur.current === Number(c.id)) setOvErr(true); });
  }
  function close() { cur.current = null; setSel(null); setOv(null); }
  const sf = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  // Fișa firmei, doar dacă e chiar a firmei deschise (altfel null — ca și cum nu s-ar fi încărcat încă).
  const ovCur = sel && esteFirma(ov, sel.id) ? ov : null;

  async function saveBasics() {
    if (!sel) return;
    const id = sel.id;
    const name = String(form.name || '').trim();
    if (name.length < 2) { showToast('Nume prea scurt.', true); return; }
    setSaving(true);
    try {
      // Serverul schimbă DOAR câmpurile primite (de pe 23.09). Datele juridice (CUI, Reg. Com., adresă, IBAN,
      // bancă) se editează doar pe web, deci nu se trimit: nu le poate goli și nici scrie peste o corectură
      // făcută între timp pe web.
      await Api.updateCompany(id, {
        name,
        contact_email: String(form.contact_email || '').trim() || null,
        phone: String(form.phone || '').trim() || null,
      });
      // Limita AI se trimite doar dacă s-a schimbat. Gol = nelimitat (ca pe web).
      const v = String(form.ai_limit ?? '').trim();
      if (v !== String(form.ai_limit0 ?? '')) await Api.setCompanyAiLimit(id, v === '' ? null : Math.max(0, parseInt(v) || 0));
      showToast('Salvat'); if (cur.current === Number(id)) close(); reload();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); }
  }
  async function toggleFeat(key: string) {
    if (!sel) return;
    if (!ovCur) { showToast(ovErr ? 'Fișa firmei nu s-a încărcat — apasă „Reîncearcă".' : 'Se încarcă fișa firmei…', ovErr); return; } // modulele se schimbă doar după ce s-au citit cele ale firmei deschise
    const id = sel.id;
    const prev = feat, on = !feat[key];
    setFeat(Object.assign({}, feat, { [key]: on }));
    // Doar modulul atins, ca pe web — restul rămân cum le-a scris oferta.
    try { const r: any = await Api.setCompanyFeatures(id, { [key]: on }); if (r && r.features && cur.current === Number(id)) setFeat(Object.assign({}, r.features)); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); if (cur.current === Number(id)) setFeat(prev); }
  }
  async function recordPay() {
    if (!sel) return;
    const c = sel;
    setSaving(true);
    const amt = String(form.pay_amount ?? '').trim();
    const note = String(form.pay_note ?? '').trim();
    try {
      await Api.recordPayment(c.id, { months: Math.max(1, parseInt(form.pay_months) || 1), amount: amt !== '' ? amt : null, method: form.pay_method || 'transfer', note: note || null });
      showToast('Plată înregistrată');
      if (cur.current === Number(c.id)) open(c);
      reload();
    }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); }
  }
  async function del() {
    if (!sel || !confirm('Ștergi compania „' + sel.name + '"? Trebuie să fie goală (fără vehicule/utilizatori).')) return;
    setSaving(true);
    try { await Api.deleteCompany(sel.id); showToast('Companie ștearsă'); close(); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare (compania nu e goală?)', true); } finally { setSaving(false); }
  }

  const co = (ovCur && ovCur.company) || sel || {};
  const admini = ((ovCur && ovCur.users) || []).filter((u: any) => (u.role === 'company_admin' || u.role === 'admin') && u.active !== false);
  const areFond = areFondAi(ovCur);
  const juridic: [string, any][] = [['CUI / CIF', co.cui], ['Nr. Reg. Com.', co.reg_com], ['Adresă', co.address], ['IBAN', co.iban], ['Bancă', co.bank_name]];

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Companii</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && items.length === 0 && !err && <div class="adm-empty"><Icon name="layers" size={40} class="ic" /><div>Nicio companie.</div></div>}
        {items != null && items.length > 0 && (
          <div class="adm-list">
            {items.map((c: any) => (
              <button class="adm-item" onClick={() => open(c)}>
                <span class="ic-wrap"><Icon name="layers" size={19} /></span>
                <span class="mid">
                  <div class="nm">{c.name}{c.is_demo ? ' · DEMO' : ''}</div>
                  <div class="sub">{nrVeh(Number(c.device_count) || 0) + ' · ' + nrUseri(Number(c.user_count) || 0)}</div>
                </span>
                <span class="rt"><Icon name="chevronR" size={18} color="var(--text-muted)" /></span>
              </button>
            ))}
          </div>
        )}
        {items != null && !err && (
          <div style="font-size:12px;color:var(--text-muted);line-height:1.45;margin-top:14px;padding:10px 12px;border:1px dashed var(--border);border-radius:10px">
            Clientul nou se deschide de pe web: Companii → „Client nou" — firma, contractul și administratorul, în trei pași.
          </div>
        )}
      </div>

      {sel && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !saving) close(); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="layers" size={18} color="var(--accent)" /> {sel.name}</b><button class="h-btn" onClick={close}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Nume</label><input value={form.name} onInput={(e: any) => sf('name', e.target.value)} /></div>
                <div class="frm-row">
                  <div class="fld"><label>Email</label><input type="email" value={form.contact_email} onInput={(e: any) => sf('contact_email', e.target.value)} /></div>
                  <div class="fld"><label>Telefon</label><input type="tel" value={form.phone} onInput={(e: any) => sf('phone', e.target.value)} /></div>
                </div>
                <div class="fld">
                  <label>Limită AI lunară (întrebări)</label>
                  <input type="number" inputMode="numeric" min="0" step="10" value={form.ai_limit} onInput={(e: any) => sf('ai_limit', e.target.value)} placeholder="gol = nelimitat" />
                  <div style="font-size:11.5px;color:var(--text-muted);line-height:1.4;margin-top:4px">
                    {areFond
                      ? 'Firma are fond RA Insight — limita asta nu se mai aplică.'
                      : 'Număr maxim de întrebări AI pe lună. Contează doar la firmele fără fond RA Insight. Gol = nelimitat.'}
                  </div>
                </div>
                <button class="btn btn-primary" disabled={saving} onClick={saveBasics}>{saving ? 'Se salvează…' : 'Salvează datele'}</button>
              </div>

              <div class="adm-sec2">Date juridice</div>
              {juridic.filter(([, v]) => v).map(([k, v]) => <div class="adm-kv"><span class="k">{k}</span><span style="text-align:right;word-break:break-word">{v}</span></div>)}
              {!juridic.some(([, v]) => v) && <div style="color:var(--text-muted);font-size:13px">Necompletate.</div>}
              <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px">Datele juridice se modifică de pe web (Companii → firma → Detalii).</div>

              <div class="adm-sec2">Module active</div>
              {FEATURES.map((f) => (
                <div class="adm-tgl">
                  <span class="lbl">{f.label}{f.sub ? <small>{f.sub}</small> : null}</span>
                  <span class={'sw' + (feat[f.key] ? ' on' : '')} onClick={() => toggleFeat(f.key)} role="switch" aria-checked={!!feat[f.key]} />
                </div>
              ))}

              <div class="adm-sec2">Abonament &amp; plăți</div>
              {!ovCur && !ovErr && <div class="spin" style="margin:6px auto" />}
              {!ovCur && ovErr && (
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;color:var(--text-muted);padding:4px 0">
                  <span>Fișa firmei nu s-a încărcat.</span>
                  <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);padding:6px 12px" onClick={() => sel && open(sel)}>Reîncearcă</button>
                </div>
              )}
              {ovCur && (ovCur.offer ? (
                <>
                  <div class="adm-kv"><span class="k">Abonament lunar (din ofertă)</span><span><b>{fmtLei(ovCur.price && ovCur.price.monthlyTotal)}</b></span></div>
                  <div style="font-size:11.5px;color:var(--text-muted);padding:2px 0 4px">fără TVA{Number(ovCur.ai_quota && ovCur.ai_quota.seatPriceRON) > 0 ? ' · conturile RA Insight se facturează separat' : ''}</div>
                </>
              ) : (
                <div style="font-size:12.5px;color:var(--text-muted);line-height:1.45;padding:4px 0 6px">Fără ofertă — 0 lei. Oferta se pune de pe web, „Abonament &amp; plăți".</div>
              ))}
              {ovCur && <div class="adm-kv"><span class="k">RA Insight</span><span style="text-align:right">{aiFondTxt(ovCur, co, !!feat.ai_assistant)}</span></div>}
              <div class="adm-kv"><span class="k">Acces până la</span><span>{fmtDate(ovCur && ovCur.access && (ovCur.access.until || ovCur.access.access_until))}</span></div>
              <div class="frm-row" style="margin-top:10px">
                <div class="fld"><label>Luni</label><input type="number" inputMode="numeric" min="1" max="36" value={form.pay_months}
                  onInput={(e: any) => { const v = e.target.value; setForm((p: any) => ({ ...p, pay_months: v, pay_amount: p.pay_touched ? p.pay_amount : sumaAuto(ovCur, v) })); }} /></div>
                <div class="fld"><label>Sumă (RON)</label><input type="number" inputMode="decimal" min="0" step="0.01" value={form.pay_amount}
                  onInput={(e: any) => { const v = e.target.value; setForm((p: any) => ({ ...p, pay_amount: v, pay_touched: true })); }} placeholder="opțional" /></div>
              </div>
              {ovCur && ovCur.offer && <div style="font-size:11.5px;color:var(--text-muted);margin-top:2px">Suma = abonamentul lunar × lunile alese. O poți modifica.</div>}
              {/* Plata se face prin transfer bancar (decizia din 15.09) — de aceea e metoda implicită, ca pe web. */}
              <div class="frm-row" style="margin-top:8px">
                <div class="fld"><label>Metodă</label>
                  <select value={form.pay_method} onChange={(e: any) => sf('pay_method', e.target.value)}>
                    {PAY_METHODS.map((m) => <option value={m.v}>{m.l}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Notă (nr. factură)</label><input value={form.pay_note} onInput={(e: any) => sf('pay_note', e.target.value)} placeholder="ex. F 2026-0123" /></div>
              </div>
              <button class="btn btn-primary" style="margin-top:8px" disabled={saving} onClick={recordPay}>Înregistrează plata + extinde accesul</button>

              <div class="adm-sec2">Administratorii firmei{ovCur ? ' (' + (admini.length ? admini.length + (admini.length === 1 ? ' activ' : ' activi') : 'niciunul') + ')' : ''}</div>
              {!ovCur && !ovErr && <div class="spin" style="margin:6px auto" />}
              {!ovCur && ovErr && (
                <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:13px;color:var(--text-muted);padding:4px 0">
                  <span>Fișa firmei nu s-a încărcat.</span>
                  <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);padding:6px 12px" onClick={() => sel && open(sel)}>Reîncearcă</button>
                </div>
              )}
              {ovCur && admini.length > 0 && (
                <>
                  <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
                    {admini.map((u: any) => <span class="adm-pill ok">{u.full_name || u.username}</span>)}
                  </div>
                  <div style="font-size:12px;color:var(--text-muted);line-height:1.45">Firma își face singură administratorii, din contul ei. Noi intervenim doar dacă rămâne fără niciunul.</div>
                </>
              )}
              {ovCur && admini.length === 0 && (
                <>
                  <div style="font-size:12.5px;line-height:1.45;color:var(--orange);border:1px solid var(--orange);background:color-mix(in srgb, var(--orange) 10%, transparent);border-radius:9px;padding:9px 11px">
                    Firma n-are niciun administrator activ — nimeni de acolo nu poate adăuga colegi, atribui mașini sau boteza roluri.
                  </div>
                  <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px">Administratorul se adaugă de pe web (Companii → firma → Utilizatori).</div>
                </>
              )}

              <div class="adm-sec2">Periculos</div>
              <button class="btn btn-danger-ghost" disabled={saving} onClick={del}><Icon name="trash" size={16} /> Șterge compania</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
