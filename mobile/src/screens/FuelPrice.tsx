import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { ReportChart } from '../components/ReportChart';
import { Icon } from '../components/Icon';
import './reports.css';
import './stats.css';

// Etichetă axă X (număr de zile de la epocă → „D lună 'YY").
const _MON = ['ian.', 'feb.', 'mar.', 'apr.', 'mai', 'iun.', 'iul.', 'aug.', 'sep.', 'oct.', 'noi.', 'dec.'];
function fpTick(v: number) { const d = new Date(v * 86400000); return d.getDate() + ' ' + _MON[d.getMonth()] + ' ’' + String(d.getFullYear()).slice(2); }

const TYPES = [
  { k: 'motorina', label: 'Motorină', color: '#f59e0b' },
  { k: 'benzina', label: 'Benzină', color: '#3FE07D' },
  { k: 'gpl', label: 'GPL', color: '#38BDF8' },
];

export function FuelPrice() {
  const [days, setDays] = useState(90);
  const [cur, setCur] = useState<any | null>(null);
  const [hist, setHist] = useState<any[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    setLoading(true); setErr('');
    Promise.all([Api.fuelPrices(), Api.fuelPriceHistory(days)])
      .then(([c, h]: any) => { setCur(c); setHist((h && h.history) || []); })
      .catch((e: any) => setErr(e?.message || 'Eroare'))
      .finally(() => setLoading(false));
  }, [days]);

  const auto = cur?.auto || {}, eff = cur?.effective || {}, comp = cur?.company || {};
  // Axă X LINIARĂ pe „ziua" (număr) → spațierea reflectă timpul real + etichete cu ziua/luna/anul (ca pe web).
  const dnum = (day: string) => { const t = Date.parse(day + 'T00:00:00'); return isFinite(t) ? Math.round(t / 86400000) : null; };
  const xs: number[] = hist ? hist.map((h) => dnum(h.day)).filter((x): x is number => x != null) : [];
  const trend = (hist && xs.length) ? {
    type: 'line', title: 'Preț național vs. prețul companiei (lei/L)', xLinear: true, xTick: fpTick, yZero: false, labels: [],
    datasets: [
      ...TYPES.map((t) => ({ label: t.label, color: t.color, data: hist.filter((h) => dnum(h.day) != null && h[t.k] != null).map((h) => ({ x: dnum(h.day), y: h[t.k] })) })),
      ...TYPES.filter((t) => { const v = parseFloat(comp[t.k]); return Number.isFinite(v) && v > 0; })
        .map((t) => ({ label: t.label + ' (companie)', color: t.color, dash: true, fill: false, data: [{ x: Math.min(...xs), y: Number(comp[t.k]) }, { x: Math.max(...xs), y: Number(comp[t.k]) }] })),
    ],
  } : null;
  const hasTrend = !!(trend && trend.datasets.some((ds: any) => (ds.data || []).length));

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()}><Icon name="chevronL" /></button>
        <div class="h-title">Preț combustibil</div>
      </header>
      <div class="content has-tabbar">
        {loading ? <div class="center-msg"><div class="spin" style="margin:0 auto" /></div>
          : err ? <div class="center-msg" style="color:var(--red)">{err}</div>
            : (
              <>
                <div class="rp-summary">
                  {TYPES.map((t) => {
                    const nat = auto[t.k], e = eff[t.k], hasOverride = comp[t.k] != null && comp[t.k] !== '';
                    const val = e != null ? e : nat;
                    return (
                      <div class="rp-kpi" style={'border-color:' + t.color}>
                        <div class="v" style={'color:' + t.color}>{val != null ? Number(val).toFixed(2) : '—'} <span style="font-size:11px;color:var(--text-muted)">lei/L</span></div>
                        <div class="l">{t.label}{hasOverride ? ' · preț companie' : (nat != null ? ' · național' : '')}</div>
                        {hasOverride && nat != null && <div style="font-size:10px;color:var(--text-muted);margin-top:2px">național: {Number(nat).toFixed(2)}</div>}
                      </div>
                    );
                  })}
                </div>

                <div class="rp-periods" style="padding:8px 14px">
                  {[30, 90, 365].map((n) => (
                    <button class={'rp-period' + (days === n ? ' on' : '')} onClick={() => setDays(n)}>{n === 365 ? '1 an' : n + ' zile'}</button>
                  ))}
                </div>

                {hasTrend ? <ReportChart def={trend as any} />
                  : <div class="center-msg" style="font-size:13px">Istoricul se acumulează zilnic — încă nu sunt suficiente date pentru grafic.</div>}

                <div style="padding:4px 16px 24px;font-size:11.5px;color:var(--text-muted);line-height:1.5">
                  Sursa: <b>{cur?.source || 'PretCarburant.ro'}</b> — media națională (CC BY 4.0), actualizată de 2×/zi și acumulată zilnic.
                  Puncte istorice de referință (ultimul an): <b>GlobalPetrolPrices.com</b>. „Preț companie" = tariful setat în Setări (linia punctată).
                </div>
              </>
            )}
      </div>
    </div>
  );
}
