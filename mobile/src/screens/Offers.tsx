import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { API_BASE } from '../api/client';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './admin.css';
import './detail.css';

// Super-admin: Ofertare Live — calculator preț (vehicule GPS/CAN/FMS + AI + retenție incl. custom) + secțiune MONTAJ
// (cost unic) + echipamente + oferte salvate + export PDF. PARITATE 1:1 cu web (raxLoadOfertare): aceleași prețuri
// default, aceeași formulă (rotunjire la 2 zecimale), aceeași formă config { cfg, prices } → ofertele fac round-trip
// între web și APK. Endpoint-uri /api/admin/offers* sunt requireSuperadmin.
function num(v: any) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
function r2(x: number) { return Math.round(x * 100) / 100; }
const DEF_PRICES = { pPlain: 29, pCan: 45, pFms: 65, pAiA: 150, pAiAg: 300, ret12: 0, ret24: 50, ret36: 100, retCustom: 0, mGps: 100, mLvCan: 60, mCanInc: 50, mFms: 60, mUninstall: 60, mReplace: 130, mTravel: 2, dFmc130: 55, dFmc150: 95, dFmc650: 120, dLvCan: 60 };
const DEF_CFG = { clName: '', clCui: '', clContact: '', offerName: '', nVeh: '10', nCan: '0', nFms: '0', aiA: false, aiAg: false, retTier: '6', retCustomMonths: '', contractMonths: '12', notes: '', qGps: '', qLvCan: '', qCanInc: '', qFms: '', qUninstall: '', qReplace: '', kmTravel: '', dq130: '', dq150: '', dq650: '', dqLvCan: '' };

type Line = { label: string; qty: number; unit: number; total: number; perKm?: boolean };

function calc(cfg: any, p: any) {
  const nVeh = Math.max(0, Math.round(num(cfg.nVeh)));
  const nCan = Math.min(Math.max(0, Math.round(num(cfg.nCan))), nVeh);
  const nFms = Math.min(Math.max(0, Math.round(num(cfg.nFms))), Math.max(0, nVeh - nCan));
  const nPlain = Math.max(0, nVeh - nCan - nFms);
  const lines: Line[] = [];
  const addL = (label: string, qty: number, unit: number) => { if (qty > 0) lines.push({ label, qty, unit, total: qty * unit }); };
  addL('Vehicule GPS (fără CAN)', nPlain, p.pPlain);
  addL('Vehicule cu CAN', nCan, p.pCan);
  addL('Vehicule cu FMS (camioane)', nFms, p.pFms);
  if (cfg.aiA) lines.push({ label: 'Asistent AI', qty: 1, unit: p.pAiA, total: p.pAiA });
  if (cfg.aiAg) lines.push({ label: 'Agenți AI', qty: 1, unit: p.pAiAg, total: p.pAiAg });
  const retA = cfg.retTier === '12' ? p.ret12 : cfg.retTier === '24' ? p.ret24 : cfg.retTier === '36' ? p.ret36 : cfg.retTier === 'custom' ? p.retCustom : 0;
  const retLabel = cfg.retTier === 'custom' ? ((Math.round(num(cfg.retCustomMonths)) || 0) + ' luni') : (cfg.retTier + ' luni');
  if (retA > 0) lines.push({ label: 'Păstrare date ' + retLabel, qty: 1, unit: retA, total: retA });
  const monthly = lines.reduce((s, l) => s + l.total, 0);
  const m: Line[] = [];
  const addM = (label: string, qty: number, unit: number, perKm?: boolean) => { if (qty > 0) m.push({ label, qty, unit, total: qty * unit, perKm: !!perKm }); };
  // Cantitățile de montaj/echipamente se rotunjesc la întreg ÎNAINTE de calcul — identic cu web (_ofReadCfg
  // rotunjește la citire) → totalurile live + PDF-ul coincid chiar dacă s-ar tasta o valoare fracționară.
  addM('Instalare dispozitiv GPS', Math.round(num(cfg.qGps)), p.mGps);
  addM('Instalare soluție cu LV-CAN', Math.round(num(cfg.qLvCan)), p.mLvCan);
  addM('Instalare cu CAN încorporat', Math.round(num(cfg.qCanInc)), p.mCanInc);
  addM('Instalare FMS (tahograf)', Math.round(num(cfg.qFms)), p.mFms);
  addM('Dezinstalare echipament', Math.round(num(cfg.qUninstall)), p.mUninstall);
  addM('Înlocuire echipament', Math.round(num(cfg.qReplace)), p.mReplace);
  addM('Deplasare (' + Math.round(num(cfg.kmTravel)) + ' km)', Math.round(num(cfg.kmTravel)), p.mTravel, true);
  const montaj = m.reduce((s, l) => s + l.total, 0);
  const hw: Line[] = [];
  const addH = (label: string, qty: number, unit: number) => { if (qty > 0) hw.push({ label, qty, unit, total: qty * unit }); };
  addH('Teltonika FMC130', Math.round(num(cfg.dq130)), p.dFmc130);
  addH('Teltonika FMC150', Math.round(num(cfg.dq150)), p.dFmc150);
  addH('Teltonika FMC650', Math.round(num(cfg.dq650)), p.dFmc650);
  addH('Modul LV-CAN200', Math.round(num(cfg.dqLvCan)), p.dLvCan);
  const hwTotal = hw.reduce((s, l) => s + l.total, 0);
  const cm = Math.max(1, Math.round(num(cfg.contractMonths) || 12));
  return { nPlain, nCan, nFms, retLabel, lines, monthly: r2(monthly), mLines: m, montaj: r2(montaj), hwLines: hw, hwTotal: r2(hwTotal), annual: r2(monthly * 12), contractTotal: r2(monthly * cm), initial: r2(montaj + monthly) };
}

function esc(s: any) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
// PDF bogat, identic ca format cu web (raxOfExportPdf): logo, antet OFERTĂ, valabilitate 30 zile, coloane Cant./Unitar/Subtotal, font Nunito.
function buildPdfHtml(cfg: any, r: any) {
  const logoUrl = API_BASE + '/logo-mark-light.png';
  const today = new Date();
  const dstr = today.toLocaleDateString('ro-RO');
  const validUntil = new Date(today.getTime() + 30 * 86400000).toLocaleDateString('ro-RO');
  const rows = r.lines.map((l: Line) => `<tr><td>${esc(l.label)}</td><td style="text-align:center">${l.qty}</td><td style="text-align:right">${l.unit.toFixed(2)} lei</td><td style="text-align:right;font-weight:700">${l.total.toFixed(2)} lei</td></tr>`).join('');
  const mrows = r.mLines.map((l: Line) => `<tr><td>${esc(l.label)}</td><td style="text-align:center">${l.qty}${l.perKm ? ' km' : ''}</td><td style="text-align:right">${l.unit.toFixed(2)} lei${l.perKm ? '/km' : ''}</td><td style="text-align:right;font-weight:700">${l.total.toFixed(2)} lei</td></tr>`).join('');
  const hrows = r.hwLines.map((l: Line) => `<tr><td>${esc(l.label)}</td><td style="text-align:center">${l.qty}</td><td style="text-align:right">${l.unit.toFixed(2)} €</td><td style="text-align:right;font-weight:700">${l.total.toFixed(2)} €</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ofertă ${esc(cfg.clName || 'RA Tracks')}</title>
  <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800&display=swap" rel="stylesheet"><style>
  *{box-sizing:border-box;margin:0;padding:0}body{font-family:"Nunito",-apple-system,Arial,sans-serif;color:#1a2235;padding:26px;max-width:820px;margin:0 auto;font-size:13px;line-height:1.55}
  .head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #16a34a;padding-bottom:16px;margin-bottom:22px}.brand{font-size:24px;font-weight:800;color:#16a34a;display:flex;align-items:center;gap:6px}.brand img{height:34px}
  .muted{color:#667085;font-size:11.5px}h2{font-size:15px;margin:18px 0 8px;color:#16a34a}table{width:100%;border-collapse:collapse;margin:8px 0}th{background:#f1f5f9;text-align:left;padding:8px 10px;font-size:11px;text-transform:uppercase;color:#475569}td{padding:8px 10px;border-bottom:1px solid #e2e8f0}
  .total{text-align:right;font-size:20px;font-weight:800;color:#16a34a;margin-top:12px}.box{border:1px solid #e2e8f0;border-radius:8px;padding:12px 14px;margin-bottom:8px}.grid2{display:flex;gap:14px}.grid2>div{flex:1}.foot{margin-top:26px;font-size:11px;color:#667085;border-top:1px solid #e2e8f0;padding-top:12px}@media print{.noprint{display:none}body{padding:8px}}</style></head><body>
  <div class="head"><div class="brand"><img src="${esc(logoUrl)}" onerror="this.style.display='none'">RA Tracks</div><div style="text-align:right"><div style="font-size:18px;font-weight:800">OFERTĂ</div><div class="muted">Data: ${dstr}</div><div class="muted">Valabilă până: ${validUntil}</div></div></div>
  <div class="grid2"><div class="box"><div class="muted">Către</div><div style="font-weight:700;font-size:14px">${esc(cfg.clName || '—')}</div>${cfg.clCui ? '<div class="muted">CUI: ' + esc(cfg.clCui) + '</div>' : ''}${cfg.clContact ? '<div class="muted">' + esc(cfg.clContact) + '</div>' : ''}</div>
  <div class="box"><div class="muted">Configurație</div><div>${Math.max(0, Math.round(num(cfg.nVeh)))} vehicule (${r.nPlain} GPS · ${r.nCan} CAN · ${r.nFms} FMS)</div><div class="muted">Păstrare date: ${esc(r.retLabel)}${(cfg.aiA || cfg.aiAg) ? ' · AI inclus' : ''}</div></div></div>
  <h2>Detaliere preț (lunar)</h2><table><thead><tr><th>Componentă</th><th style="text-align:center">Cant.</th><th style="text-align:right">Unitar</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody></table>
  <div class="total">Total lunar: ${r.monthly.toFixed(2)} lei</div><div style="text-align:right" class="muted">Anual: ${r.annual.toFixed(2)} lei · Contract ${Math.max(1, Math.round(num(cfg.contractMonths) || 12))} luni: ${r.contractTotal.toFixed(2)} lei (fără TVA)</div>
  ${r.montaj > 0 ? `<h2>Montaj (cost unic)</h2><table><thead><tr><th>Operațiune</th><th style="text-align:center">Cant.</th><th style="text-align:right">Unitar</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${mrows}</tbody></table><div class="total">Total montaj: ${r.montaj.toFixed(2)} lei</div><div style="text-align:right" class="muted">Cost inițial (montaj + prima lună): ${r.initial.toFixed(2)} lei (fără TVA)</div>` : ''}
  ${r.hwTotal > 0 ? `<h2>Echipamente (cost unic)</h2><table><thead><tr><th>Echipament</th><th style="text-align:center">Cant.</th><th style="text-align:right">Unitar</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>${hrows}</tbody></table><div class="total">Total echipamente: ${r.hwTotal.toFixed(2)} €</div><div style="text-align:right" class="muted">Echipamentele se facturează o singură dată (fără TVA)</div>` : ''}
  ${cfg.notes ? '<h2>Observații</h2><div class="box">' + esc(cfg.notes).replace(/\n/g, '<br>') + '</div>' : ''}
  <div class="foot">RA Tracks · ratrack.ro · Ofertă generată automat. Prețurile nu includ TVA.</div>
  <div class="noprint" style="margin-top:20px;text-align:center"><button onclick="window.print()" style="background:#16a34a;color:#fff;border:0;border-radius:8px;padding:11px 22px;font-size:15px;font-weight:700">🖨 Printează / Salvează PDF</button></div>
  </body></html>`;
}

export function Offers() {
  const loc = useLocation();
  const [offers, setOffers] = useState<any[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [cfg, setCfg] = useState<any>({ ...DEF_CFG });
  const [prices, setPrices] = useState<any>({ ...DEF_PRICES });
  const [showTariffs, setShowTariffs] = useState(false);
  const [saving, setSaving] = useState(false);

  function loadList() { Api.offers().then(setOffers).catch(() => setOffers([])); }
  useEffect(loadList, []);

  const r = useMemo(() => calc(cfg, prices), [cfg, prices]);
  const sc = (k: string, v: any) => setCfg((p: any) => ({ ...p, [k]: v }));
  const sp = (k: string, v: any) => setPrices((p: any) => ({ ...p, [k]: num(v) }));

  function reset() { setEditingId(null); setCfg({ ...DEF_CFG }); setPrices({ ...DEF_PRICES }); showToast('Ofertă nouă'); }
  function loadOffer(o: any) {
    const c = (o.config && o.config.cfg) || {}, pr = (o.config && o.config.prices) || {};
    setEditingId(o.id);
    setCfg(Object.assign({}, DEF_CFG, mapInCfg(c), { offerName: o.name || c.offerName || '', clName: c.client?.name || o.client_name || '', clCui: c.client?.cui || o.client_cui || '', clContact: c.client?.contact || o.client_contact || '', notes: c.notes || o.notes || '' }));
    setPrices(Object.assign({}, DEF_PRICES, pr));
    window.scrollTo(0, 0);
  }

  async function save() {
    if (!cfg.clName && !cfg.offerName) { showToast('Pune un nume de client sau de ofertă', true); return; }
    setSaving(true);
    const savedCfg = mapOutCfg(cfg);
    const payload = { name: cfg.offerName || ('Ofertă ' + (cfg.clName || '')), client_name: cfg.clName, client_cui: cfg.clCui, client_contact: cfg.clContact, config: { cfg: savedCfg, prices }, monthly_total: r.monthly, currency: 'RON', notes: cfg.notes };
    try {
      if (editingId) await Api.updateOffer(editingId, payload); else { const o = await Api.createOffer(payload); setEditingId(o?.id || null); }
      showToast(editingId ? 'Ofertă actualizată' : 'Ofertă salvată'); loadList();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); }
  }
  async function del(id: number) {
    if (!confirm('Ștergi această ofertă?')) return;
    try { await Api.deleteOffer(id); showToast('Ofertă ștearsă'); if (editingId === id) reset(); loadList(); } catch (e: any) { showToast(e?.message || 'Eroare', true); }
  }
  function exportPdf() {
    const html = buildPdfHtml(cfg, r);
    try {
      const url = 'data:text/html;charset=utf-8,' + encodeURIComponent(html);
      (window as any).open(url, '_system') || window.open(url, '_blank');
    } catch { showToast('Nu pot deschide PDF-ul aici; oferta e salvată și se exportă din web.', true); }
  }

  const fNum = (k: string, ph?: string) => <input type="number" inputMode="numeric" value={cfg[k]} onInput={(e: any) => sc(k, e.target.value)} placeholder={ph} />;
  const pNum = (k: string) => <input type="number" inputMode="numeric" value={prices[k]} onInput={(e: any) => sp(k, e.target.value)} />;

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Ofertare Live</div>
        <button class="h-btn" onClick={reset} aria-label="Ofertă nouă"><Icon name="plus" size={20} /></button>
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        <div class="frm">
          <div class="adm-sec2" style="margin-top:0">Client</div>
          <div class="fld"><label>Nume client</label><input value={cfg.clName} onInput={(e: any) => sc('clName', e.target.value)} placeholder="Ex: Transport SRL" /></div>
          <div class="frm-row">
            <div class="fld"><label>CUI</label><input value={cfg.clCui} onInput={(e: any) => sc('clCui', e.target.value)} /></div>
            <div class="fld"><label>Contact</label><input value={cfg.clContact} onInput={(e: any) => sc('clContact', e.target.value)} /></div>
          </div>
          <div class="fld"><label>Nume ofertă</label><input value={cfg.offerName} onInput={(e: any) => sc('offerName', e.target.value)} placeholder="Ex: Ofertă standard" /></div>

          <div class="adm-sec2">Vehicule</div>
          <div class="frm-row">
            <div class="fld"><label>Total</label>{fNum('nVeh')}</div>
            <div class="fld"><label>din care CAN</label>{fNum('nCan')}</div>
            <div class="fld"><label>din care FMS</label>{fNum('nFms')}</div>
          </div>

          <div class="adm-sec2">Opțiuni</div>
          <div class="adm-tgl"><span class="lbl">Asistent AI</span><input type="number" inputMode="numeric" value={prices.pAiA} onInput={(e: any) => sp('pAiA', e.target.value)} class="adm-price" /><span style="font-size:11px;color:var(--text-muted)">lei</span><span class={'sw' + (cfg.aiA ? ' on' : '')} onClick={() => sc('aiA', !cfg.aiA)} /></div>
          <div class="adm-tgl"><span class="lbl">Agenți AI (RA Optimize / Care)</span><input type="number" inputMode="numeric" value={prices.pAiAg} onInput={(e: any) => sp('pAiAg', e.target.value)} class="adm-price" /><span style="font-size:11px;color:var(--text-muted)">lei</span><span class={'sw' + (cfg.aiAg ? ' on' : '')} onClick={() => sc('aiAg', !cfg.aiAg)} /></div>
          <div class="frm-row">
            <div class="fld"><label>Păstrare date</label>
              <select value={cfg.retTier} onChange={(e: any) => sc('retTier', e.target.value)}>
                <option value="6">6 luni (inclus)</option><option value="12">12 luni</option><option value="24">24 luni</option><option value="36">36 luni</option><option value="custom">Custom…</option>
              </select>
            </div>
            <div class="fld"><label>Contract (luni)</label>{fNum('contractMonths')}</div>
          </div>
          {cfg.retTier === 'custom' && <div class="fld"><label>Păstrare — luni custom</label>{fNum('retCustomMonths', 'ex: 18')}</div>}

          <div class="adm-sec2">Montaj (cost unic, opțional)</div>
          <div class="frm-row">
            <div class="fld"><label>Instalare GPS</label>{fNum('qGps')}</div>
            <div class="fld"><label>LV-CAN</label>{fNum('qLvCan')}</div>
            <div class="fld"><label>CAN încorporat</label>{fNum('qCanInc')}</div>
          </div>
          <div class="frm-row">
            <div class="fld"><label>FMS (tahograf)</label>{fNum('qFms')}</div>
            <div class="fld"><label>Dezinstalare</label>{fNum('qUninstall')}</div>
            <div class="fld"><label>Înlocuire</label>{fNum('qReplace')}</div>
          </div>
          <div class="fld"><label>Deplasare (km)</label>{fNum('kmTravel')}</div>

          <div class="adm-sec2">Echipamente (cost unic, EUR)</div>
          <div class="frm-row">
            <div class="fld"><label>FMC130</label>{fNum('dq130')}</div>
            <div class="fld"><label>FMC150</label>{fNum('dq150')}</div>
            <div class="fld"><label>FMC650</label>{fNum('dq650')}</div>
          </div>
          <div class="fld"><label>Modul LV-CAN200 (extra, la FMC130/650)</label>{fNum('dqLvCan')}</div>

          <div class="fld"><label>Observații (apar pe PDF)</label><textarea value={cfg.notes} onInput={(e: any) => sc('notes', e.target.value)} rows={2} /></div>

          <button class="adm-act" style="align-self:flex-start" onClick={() => setShowTariffs((v) => !v)}><Icon name="settings" size={14} /> Tarife (editabile) {showTariffs ? '▲' : '▼'}</button>
          {showTariffs && (
            <div class="pf-card">
              <div class="frm-row"><div class="fld"><label>Vehicul GPS</label>{pNum('pPlain')}</div><div class="fld"><label>Vehicul CAN</label>{pNum('pCan')}</div><div class="fld"><label>Vehicul FMS</label>{pNum('pFms')}</div></div>
              <div style="font-size:11px;color:var(--text-muted);margin:2px 0 6px">Prețul AI (Asistent / Agenți) se editează în „Opțiuni", lângă comutator.</div>
              <div class="frm-row"><div class="fld"><label>Ret. 12l</label>{pNum('ret12')}</div><div class="fld"><label>Ret. 24l</label>{pNum('ret24')}</div><div class="fld"><label>Ret. 36l</label>{pNum('ret36')}</div></div>
              <div class="fld"><label>Retenție custom (lei/lună)</label>{pNum('retCustom')}</div>
              <div class="adm-sec2" style="margin-top:8px">Montaj (lei/buc · deplasare lei/km)</div>
              <div class="frm-row"><div class="fld"><label>GPS</label>{pNum('mGps')}</div><div class="fld"><label>LV-CAN</label>{pNum('mLvCan')}</div><div class="fld"><label>CAN înc.</label>{pNum('mCanInc')}</div></div>
              <div class="frm-row"><div class="fld"><label>FMS</label>{pNum('mFms')}</div><div class="fld"><label>Dezinst.</label>{pNum('mUninstall')}</div><div class="fld"><label>Înlocuire</label>{pNum('mReplace')}</div></div>
              <div class="fld"><label>Deplasare (lei/km)</label>{pNum('mTravel')}</div>
              <div class="adm-sec2" style="margin-top:8px">Echipamente (EUR/buc)</div>
              <div class="frm-row"><div class="fld"><label>FMC130</label>{pNum('dFmc130')}</div><div class="fld"><label>FMC150</label>{pNum('dFmc150')}</div><div class="fld"><label>FMC650</label>{pNum('dFmc650')}</div></div>
              <div class="fld"><label>LV-CAN200</label>{pNum('dLvCan')}</div>
            </div>
          )}
        </div>

        {/* Rezumat */}
        <div class="pf-card" style="margin-top:14px">
          <h3>Rezumat ofertă</h3>
          {r.lines.map((l) => <div class="adm-kv"><span class="k">{l.label}{l.qty > 1 ? ' × ' + l.qty : ''}</span><span>{l.total.toFixed(0)} lei</span></div>)}
          <div style="display:flex;justify-content:space-between;align-items:baseline;border-top:2px solid var(--accent);padding-top:10px;margin-top:8px"><span style="font-size:13px;color:var(--text-muted)">Total lunar</span><span style="font-size:24px;font-weight:800;color:var(--accent)">{r.monthly.toFixed(0)} lei</span></div>
          <div class="adm-kv"><span class="k">Anual (×12)</span><span>{r.annual.toFixed(0)} lei</span></div>
          <div class="adm-kv"><span class="k">Contract {cfg.contractMonths} luni</span><span>{r.contractTotal.toFixed(0)} lei</span></div>
          {r.montaj > 0 && (<>
            <div class="adm-sec2">Montaj (cost unic)</div>
            {r.mLines.map((l) => <div class="adm-kv"><span class="k">{l.label}</span><span>{l.total.toFixed(0)} lei</span></div>)}
            <div class="adm-kv"><span class="k"><b>Total montaj</b></span><span><b>{r.montaj.toFixed(0)} lei</b></span></div>
            <div class="adm-kv"><span class="k">Total inițial (montaj + prima lună)</span><span>{r.initial.toFixed(0)} lei</span></div>
          </>)}
          {r.hwTotal > 0 && (<>
            <div class="adm-sec2">Echipamente (cost unic)</div>
            {r.hwLines.map((l) => <div class="adm-kv"><span class="k">{l.label}</span><span>{l.total.toFixed(0)} €</span></div>)}
            <div class="adm-kv"><span class="k"><b>Total echipamente</b></span><span><b>{r.hwTotal.toFixed(0)} €</b></span></div>
          </>)}
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
          <button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se salvează…' : (editingId ? 'Actualizează oferta' : 'Salvează oferta')}</button>
          <button class="btn" style="background:var(--bg-panel);border:1px solid var(--border);color:var(--text-primary)" onClick={exportPdf}><Icon name="report" size={16} /> Export PDF</button>
        </div>

        {offers && offers.length > 0 && (<>
          <div class="adm-sec2">Oferte salvate ({offers.length})</div>
          <div class="adm-list">
            {offers.map((o: any) => (
              <div class="adm-item" style="cursor:default">
                <span class="ic-wrap"><Icon name="report" size={19} /></span>
                <span class="mid" onClick={() => loadOffer(o)} style="cursor:pointer">
                  <div class="nm">{o.name || '—'}</div>
                  <div class="sub">{(o.client_name || '—') + ' · ' + Number(o.monthly_total || 0).toFixed(0) + ' ' + (o.currency || 'RON')}</div>
                </span>
                <span class="rt"><button class="adm-act danger" onClick={() => del(o.id)}><Icon name="trash" size={14} /></button></span>
              </div>
            ))}
          </div>
        </>)}
      </div>
    </div>
  );
}

// mapează montajul salvat (cfg.montaj.{qGps...}) în câmpurile plate ale formularului + invers
function mapInCfg(c: any) {
  const mj = c.montaj || {}, dv = c.devices || {};
  const st = (x: any) => (x || x === 0 ? String(x) : '');
  return {
    nVeh: String(c.nVeh ?? 10), nCan: String(c.nCan ?? 0), nFms: String(c.nFms ?? 0), aiA: !!c.aiA, aiAg: !!c.aiAg,
    retTier: c.retTier || '6', retCustomMonths: st(c.retCustomMonths), contractMonths: String(c.contractMonths ?? 12),
    qGps: st(mj.qGps), qLvCan: st(mj.qLvCan), qCanInc: st(mj.qCanInc),
    qFms: st(mj.qFms), qUninstall: st(mj.qUninstall), qReplace: st(mj.qReplace), kmTravel: st(mj.kmTravel),
    dq130: st(dv.d130), dq150: st(dv.d150), dq650: st(dv.d650), dqLvCan: st(dv.lvcan),
  };
}
function mapOutCfg(cfg: any) {
  return {
    client: { name: cfg.clName, cui: cfg.clCui, contact: cfg.clContact }, offerName: cfg.offerName, notes: cfg.notes,
    nVeh: Math.round(num(cfg.nVeh)), nCan: Math.round(num(cfg.nCan)), nFms: Math.round(num(cfg.nFms)), aiA: !!cfg.aiA, aiAg: !!cfg.aiAg,
    retTier: cfg.retTier, retCustomMonths: Math.round(num(cfg.retCustomMonths)), contractMonths: Math.round(num(cfg.contractMonths) || 12),
    montaj: { qGps: Math.round(num(cfg.qGps)), qLvCan: Math.round(num(cfg.qLvCan)), qCanInc: Math.round(num(cfg.qCanInc)), qFms: Math.round(num(cfg.qFms)), qUninstall: Math.round(num(cfg.qUninstall)), qReplace: Math.round(num(cfg.qReplace)), kmTravel: Math.round(num(cfg.kmTravel)) },
    devices: { d130: Math.round(num(cfg.dq130)), d150: Math.round(num(cfg.dq150)), d650: Math.round(num(cfg.dq650)), lvcan: Math.round(num(cfg.dqLvCan)) },
  };
}
