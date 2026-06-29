import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './admin.css';
import './detail.css';

// Super-admin: Ofertare Live — calculator preț (vehicule GPS/CAN/FMS + AI + retenție) + secțiune MONTAJ (cost unic) + oferte salvate + export PDF.
// Endpoint-uri /api/admin/offers* sunt requireSuperadmin.
function num(v: any) { const n = parseFloat(v); return isFinite(n) ? n : 0; }
const DEF_PRICES = { pPlain: 29, pCan: 45, pFms: 65, pAiA: 150, pAiAg: 300, ret12: 0, ret24: 50, ret36: 100, retCustom: 0, mGps: 100, mLvCan: 60, mCanInc: 50, mFms: 60, mUninstall: 60, mReplace: 130, mTravel: 2 };
const DEF_CFG = { clName: '', clCui: '', clContact: '', offerName: '', nVeh: '10', nCan: '0', nFms: '0', aiA: false, aiAg: false, retTier: '6', contractMonths: '12', notes: '', qGps: '', qLvCan: '', qCanInc: '', qFms: '', qUninstall: '', qReplace: '', kmTravel: '' };

function calc(cfg: any, p: any) {
  const nVeh = Math.max(0, Math.round(num(cfg.nVeh)));
  const nCan = Math.min(Math.max(0, Math.round(num(cfg.nCan))), nVeh);
  const nFms = Math.min(Math.max(0, Math.round(num(cfg.nFms))), Math.max(0, nVeh - nCan));
  const nPlain = Math.max(0, nVeh - nCan - nFms);
  const lines: { label: string; total: number }[] = [];
  if (nPlain > 0) lines.push({ label: 'Vehicule GPS (fără CAN) × ' + nPlain, total: nPlain * p.pPlain });
  if (nCan > 0) lines.push({ label: 'Vehicule cu CAN × ' + nCan, total: nCan * p.pCan });
  if (nFms > 0) lines.push({ label: 'Vehicule FMS × ' + nFms, total: nFms * p.pFms });
  if (cfg.aiA) lines.push({ label: 'Asistent AI', total: p.pAiA });
  if (cfg.aiAg) lines.push({ label: 'Agenți AI', total: p.pAiAg });
  const retA = cfg.retTier === '12' ? p.ret12 : cfg.retTier === '24' ? p.ret24 : cfg.retTier === '36' ? p.ret36 : 0;
  if (retA > 0) lines.push({ label: 'Păstrare date ' + cfg.retTier + ' luni', total: retA });
  const monthly = lines.reduce((s, l) => s + l.total, 0);
  const m: { label: string; total: number }[] = [];
  const addM = (label: string, qty: number, unit: number) => { if (qty > 0) m.push({ label, total: qty * unit }); };
  addM('Instalare dispozitiv GPS', num(cfg.qGps), p.mGps);
  addM('Instalare LV-CAN', num(cfg.qLvCan), p.mLvCan);
  addM('Instalare CAN încorporat', num(cfg.qCanInc), p.mCanInc);
  addM('Instalare FMS (tahograf)', num(cfg.qFms), p.mFms);
  addM('Dezinstalare echipament', num(cfg.qUninstall), p.mUninstall);
  addM('Înlocuire echipament', num(cfg.qReplace), p.mReplace);
  addM('Deplasare (' + Math.round(num(cfg.kmTravel)) + ' km)', num(cfg.kmTravel), p.mTravel);
  const montaj = m.reduce((s, l) => s + l.total, 0);
  const cm = Math.max(1, Math.round(num(cfg.contractMonths) || 12));
  return { nPlain, nCan, nFms, lines, monthly, mLines: m, montaj, annual: monthly * 12, contractTotal: monthly * cm, initial: montaj + monthly };
}

function esc(s: any) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function buildPdfHtml(cfg: any, r: any) {
  const rows = r.lines.map((l: any) => `<tr><td>${esc(l.label)}</td><td style="text-align:right;font-weight:700">${l.total.toFixed(2)} lei</td></tr>`).join('');
  const mrows = r.mLines.map((l: any) => `<tr><td>${esc(l.label)}</td><td style="text-align:right;font-weight:700">${l.total.toFixed(2)} lei</td></tr>`).join('');
  return `<!DOCTYPE html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ofertă ${esc(cfg.clName || 'RA Tracks')}</title>
  <style>body{font-family:-apple-system,Arial,sans-serif;color:#1a2235;padding:22px;max-width:760px;margin:0 auto;font-size:13px;line-height:1.5}
  h1{font-size:22px;color:#16a34a;margin:0 0 4px}h2{font-size:15px;color:#16a34a;margin:18px 0 6px}.muted{color:#667085;font-size:12px}
  table{width:100%;border-collapse:collapse;margin:6px 0}td{padding:7px 9px;border-bottom:1px solid #e2e8f0}.total{text-align:right;font-size:18px;font-weight:800;color:#16a34a;margin-top:8px}
  .box{border:1px solid #e2e8f0;border-radius:8px;padding:11px 13px;margin-bottom:8px}</style></head><body>
  <h1>RA Tracks — Ofertă</h1><div class="muted">Data: ${new Date().toLocaleDateString('ro-RO')}</div>
  <div class="box"><b>Către:</b> ${esc(cfg.clName || '—')}${cfg.clCui ? '<br>CUI: ' + esc(cfg.clCui) : ''}${cfg.clContact ? '<br>' + esc(cfg.clContact) : ''}</div>
  <h2>Detaliere preț (lunar)</h2><table>${rows || '<tr><td>—</td><td></td></tr>'}</table>
  <div class="total">Total lunar: ${r.monthly.toFixed(2)} lei</div>
  <div class="muted" style="text-align:right">Anual: ${r.annual.toFixed(2)} lei · Contract ${cfg.contractMonths} luni: ${r.contractTotal.toFixed(2)} lei (fără TVA)</div>
  ${r.montaj > 0 ? `<h2>Montaj (cost unic)</h2><table>${mrows}</table><div class="total">Total montaj: ${r.montaj.toFixed(2)} lei</div><div class="muted" style="text-align:right">Cost inițial (montaj + prima lună): ${r.initial.toFixed(2)} lei</div>` : ''}
  ${cfg.notes ? '<h2>Observații</h2><div class="box">' + esc(cfg.notes).replace(/\n/g, '<br>') + '</div>' : ''}
  <div class="muted" style="margin-top:22px;border-top:1px solid #e2e8f0;padding-top:10px">RA Tracks · ratrack.ro · Prețurile nu includ TVA.</div>
  <div style="margin-top:16px;text-align:center"><button onclick="window.print()" style="background:#16a34a;color:#fff;border:0;border-radius:8px;padding:11px 22px;font-size:15px;font-weight:700">🖨 Printează / Salvează PDF</button></div>
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
          <div class="adm-tgl"><span class="lbl">Asistent AI</span><span class={'sw' + (cfg.aiA ? ' on' : '')} onClick={() => sc('aiA', !cfg.aiA)} /></div>
          <div class="adm-tgl"><span class="lbl">Agenți AI (RA Optimize / Care)</span><span class={'sw' + (cfg.aiAg ? ' on' : '')} onClick={() => sc('aiAg', !cfg.aiAg)} /></div>
          <div class="frm-row">
            <div class="fld"><label>Păstrare date</label>
              <select value={cfg.retTier} onChange={(e: any) => sc('retTier', e.target.value)}>
                <option value="6">6 luni (inclus)</option><option value="12">12 luni</option><option value="24">24 luni</option><option value="36">36 luni</option>
              </select>
            </div>
            <div class="fld"><label>Contract (luni)</label>{fNum('contractMonths')}</div>
          </div>

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

          <div class="fld"><label>Observații (apar pe PDF)</label><textarea value={cfg.notes} onInput={(e: any) => sc('notes', e.target.value)} rows={2} /></div>

          <button class="adm-act" style="align-self:flex-start" onClick={() => setShowTariffs((v) => !v)}><Icon name="settings" size={14} /> Tarife (editabile) {showTariffs ? '▲' : '▼'}</button>
          {showTariffs && (
            <div class="pf-card">
              <div class="frm-row"><div class="fld"><label>Vehicul GPS</label>{pNum('pPlain')}</div><div class="fld"><label>Vehicul CAN</label>{pNum('pCan')}</div><div class="fld"><label>Vehicul FMS</label>{pNum('pFms')}</div></div>
              <div class="frm-row"><div class="fld"><label>Asistent AI</label>{pNum('pAiA')}</div><div class="fld"><label>Agenți AI</label>{pNum('pAiAg')}</div></div>
              <div class="frm-row"><div class="fld"><label>Ret. 12l</label>{pNum('ret12')}</div><div class="fld"><label>Ret. 24l</label>{pNum('ret24')}</div><div class="fld"><label>Ret. 36l</label>{pNum('ret36')}</div></div>
              <div class="adm-sec2" style="margin-top:8px">Montaj (lei/buc · deplasare lei/km)</div>
              <div class="frm-row"><div class="fld"><label>GPS</label>{pNum('mGps')}</div><div class="fld"><label>LV-CAN</label>{pNum('mLvCan')}</div><div class="fld"><label>CAN înc.</label>{pNum('mCanInc')}</div></div>
              <div class="frm-row"><div class="fld"><label>FMS</label>{pNum('mFms')}</div><div class="fld"><label>Dezinst.</label>{pNum('mUninstall')}</div><div class="fld"><label>Înlocuire</label>{pNum('mReplace')}</div></div>
              <div class="fld"><label>Deplasare (lei/km)</label>{pNum('mTravel')}</div>
            </div>
          )}
        </div>

        {/* Rezumat */}
        <div class="pf-card" style="margin-top:14px">
          <h3>Rezumat ofertă</h3>
          {r.lines.map((l) => <div class="adm-kv"><span class="k">{l.label}</span><span>{l.total.toFixed(0)} lei</span></div>)}
          <div style="display:flex;justify-content:space-between;align-items:baseline;border-top:2px solid var(--accent);padding-top:10px;margin-top:8px"><span style="font-size:13px;color:var(--text-muted)">Total lunar</span><span style="font-size:24px;font-weight:800;color:var(--accent)">{r.monthly.toFixed(0)} lei</span></div>
          <div class="adm-kv"><span class="k">Anual (×12)</span><span>{r.annual.toFixed(0)} lei</span></div>
          <div class="adm-kv"><span class="k">Contract {cfg.contractMonths} luni</span><span>{r.contractTotal.toFixed(0)} lei</span></div>
          {r.montaj > 0 && (<>
            <div class="adm-sec2">Montaj (cost unic)</div>
            {r.mLines.map((l) => <div class="adm-kv"><span class="k">{l.label}</span><span>{l.total.toFixed(0)} lei</span></div>)}
            <div class="adm-kv"><span class="k"><b>Total montaj</b></span><span><b>{r.montaj.toFixed(0)} lei</b></span></div>
            <div class="adm-kv"><span class="k">Total inițial (montaj + prima lună)</span><span>{r.initial.toFixed(0)} lei</span></div>
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
  const mj = c.montaj || {};
  return {
    nVeh: String(c.nVeh ?? 10), nCan: String(c.nCan ?? 0), nFms: String(c.nFms ?? 0), aiA: !!c.aiA, aiAg: !!c.aiAg,
    retTier: c.retTier || '6', contractMonths: String(c.contractMonths ?? 12),
    qGps: mj.qGps ? String(mj.qGps) : '', qLvCan: mj.qLvCan ? String(mj.qLvCan) : '', qCanInc: mj.qCanInc ? String(mj.qCanInc) : '',
    qFms: mj.qFms ? String(mj.qFms) : '', qUninstall: mj.qUninstall ? String(mj.qUninstall) : '', qReplace: mj.qReplace ? String(mj.qReplace) : '', kmTravel: mj.kmTravel ? String(mj.kmTravel) : '',
  };
}
function mapOutCfg(cfg: any) {
  return {
    client: { name: cfg.clName, cui: cfg.clCui, contact: cfg.clContact }, offerName: cfg.offerName, notes: cfg.notes,
    nVeh: Math.round(num(cfg.nVeh)), nCan: Math.round(num(cfg.nCan)), nFms: Math.round(num(cfg.nFms)), aiA: !!cfg.aiA, aiAg: !!cfg.aiAg,
    retTier: cfg.retTier, contractMonths: Math.round(num(cfg.contractMonths) || 12),
    montaj: { qGps: Math.round(num(cfg.qGps)), qLvCan: Math.round(num(cfg.qLvCan)), qCanInc: Math.round(num(cfg.qCanInc)), qFms: Math.round(num(cfg.qFms)), qUninstall: Math.round(num(cfg.qUninstall)), qReplace: Math.round(num(cfg.qReplace)), kmTravel: Math.round(num(cfg.kmTravel)) },
  };
}
