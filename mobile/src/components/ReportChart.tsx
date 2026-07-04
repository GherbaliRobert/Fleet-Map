import { useEffect, useRef } from 'preact/hooks';
import Chart from 'chart.js/auto';
import type { ReportChartDef } from '../api/endpoints';

const PALETTE = ['#3FE07D', '#38bdf8', '#f59e0b', '#a78bfa', '#fb7185', '#22c55e', '#eab308', '#f472b6'];

function fmtNum(v: any) {
  const n = Number(v);
  if (!isFinite(n)) return String(v == null ? '' : v);
  if (Math.abs(n) >= 1000) return n.toLocaleString('ro-RO', { maximumFractionDigits: 1 });
  return String(Math.round(n * 100) / 100);
}

export function ReportChart({ def }: { def: ReportChartDef }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const isLine = def.type === 'line';
    const isPie = def.type === 'doughnut' || def.type === 'pie';
    const single = def.datasets.length === 1;
    const cs = getComputedStyle(document.body);
    const textMuted = (cs.getPropertyValue('--text-muted') || '#8A93A3').trim();
    const textPrimary = (cs.getPropertyValue('--text-primary') || '#e8edf2').trim();
    const grid = (cs.getPropertyValue('--border') || '#242A31').trim();
    Chart.defaults.color = textMuted;
    Chart.defaults.font.family = "'Nunito', -apple-system, sans-serif";

    const datasets = def.datasets.map((ds, i) => {
      const c = (ds as any).color || PALETTE[i % PALETTE.length]; // culoare per-dataset opțională
      const dashed = !!(ds as any).dash;                          // linie punctată (ex. preț de referință)
      const noFill = dashed || (ds as any).fill === false;        // linie punctată/de referință → fără umplere
      if (isLine) return {
        label: ds.label, data: ds.data, borderColor: c, borderWidth: dashed ? 1.5 : 2.5, tension: dashed ? 0 : 0.35, fill: noFill ? false : true,
        borderDash: dashed ? [6, 4] : undefined,
        pointRadius: dashed ? 0 : 3, pointHoverRadius: dashed ? 0 : 6, pointBackgroundColor: c, pointBorderColor: '#0b0e11', pointBorderWidth: 1.5, pointHitRadius: 18,
        backgroundColor: (ctx: any) => {
          const area = ctx.chart.chartArea; if (!area) return c + '22';
          const g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
          g.addColorStop(0, c + '66'); g.addColorStop(1, c + '05'); return g;
        },
      } as any;
      return {
        label: ds.label, data: ds.data,
        backgroundColor: single ? def.labels.map((_, j) => PALETTE[j % PALETTE.length]) : c,
        hoverBackgroundColor: single ? def.labels.map((_, j) => PALETTE[j % PALETTE.length] + 'cc') : c + 'cc',
        borderRadius: 6, borderSkipped: false, maxBarThickness: 46,
      } as any;
    });

    // Plugin: valoarea deasupra barelor (doar dacă nu sunt prea multe → fără aglomerare)
    const valueLabels = {
      id: 'valueLabels',
      afterDatasetsDraw(ch: any) {
        if ((ch.data.labels || []).length > 16) return;
        const ctx = ch.ctx;
        ch.data.datasets.forEach((ds: any, di: number) => {
          const meta = ch.getDatasetMeta(di); if (meta.hidden) return;
          meta.data.forEach((el: any, idx: number) => {
            const v = ds.data[idx]; if (v == null) return;
            ctx.save();
            ctx.fillStyle = textPrimary; ctx.font = "700 9.5px 'Nunito', sans-serif"; ctx.textAlign = 'center';
            ctx.fillText(fmtNum(v), el.x, el.y - 5);
            ctx.restore();
          });
        });
      },
    };

    chart.current = new Chart(ref.current, {
      type: isPie ? (def.type as any) : (isLine ? 'line' : 'bar'),
      data: { labels: def.labels, datasets },
      plugins: single && !isPie && !isLine ? [valueLabels] : [],
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: isPie ? 'nearest' : 'index', intersect: false },
        layout: { padding: { top: 16, right: 4 } },
        plugins: {
          legend: { display: !single || isPie, position: 'bottom', labels: { usePointStyle: true, pointStyle: 'circle', padding: 14, font: { size: 11 } } },
          tooltip: {
            backgroundColor: 'rgba(11,14,17,.95)', borderColor: grid, borderWidth: 1, cornerRadius: 9, padding: 10,
            titleColor: '#ffffff', bodyColor: '#cfd6dd', titleFont: { weight: 700, size: 12.5 }, bodyFont: { size: 12 }, displayColors: !single,
            callbacks: {
              label: (c: any) => {
                const v = (c.parsed && c.parsed.y != null) ? c.parsed.y : c.parsed;
                return (c.dataset.label ? c.dataset.label + ': ' : '') + fmtNum(v);
              },
            },
          },
        },
        scales: isPie ? {} : {
          x: (def as any).xLinear
            ? { type: 'linear', grid: { display: false }, border: { color: grid }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 12, callback: (v: any) => { const f = (def as any).xTick; return f ? f(v) : v; } } }
            : { grid: { display: false }, border: { color: grid }, ticks: { font: { size: 10 }, maxRotation: 0, autoSkip: true, autoSkipPadding: 8 } },
          y: { beginAtZero: (def as any).yZero !== false, grid: { color: grid }, border: { display: false }, ticks: { font: { size: 10 }, maxTicksLimit: 6 } },
        },
        animation: { duration: 600, easing: 'easeOutQuart' },
      },
    });
    return () => { chart.current?.destroy(); chart.current = null; };
  }, [def]);

  return (
    <div class="rc-card">
      <div class="rc-title">{def.title}</div>
      <div class="rc-canvas"><canvas ref={ref} /></div>
    </div>
  );
}
