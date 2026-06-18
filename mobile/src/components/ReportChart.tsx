import { useEffect, useRef } from 'preact/hooks';
import Chart from 'chart.js/auto';
import type { ReportChartDef } from '../api/endpoints';

const PALETTE = ['#3FE07D', '#f59e0b', '#ef4444', '#38bdf8', '#a78bfa', '#eab308', '#22c55e', '#fb7185'];

export function ReportChart({ def }: { def: ReportChartDef }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const isLine = def.type === 'line';
    const isPie = def.type === 'doughnut' || def.type === 'pie';
    const single = def.datasets.length === 1;
    const datasets = def.datasets.map((ds, i) => {
      const c = PALETTE[i % PALETTE.length];
      if (isLine) return { label: ds.label, data: ds.data, borderColor: c, backgroundColor: c + '33', fill: true, tension: 0.3, pointRadius: 2 };
      return { label: ds.label, data: ds.data, backgroundColor: single ? def.labels.map((_, j) => PALETTE[j % PALETTE.length]) : c };
    });
    const cs = getComputedStyle(document.body);
    Chart.defaults.color = (cs.getPropertyValue('--text-muted') || '#8A93A3').trim();
    const grid = (cs.getPropertyValue('--border') || '#242A31').trim();

    chart.current = new Chart(ref.current, {
      type: isPie ? (def.type as any) : (isLine ? 'line' : 'bar'),
      data: { labels: def.labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: !single || isPie, position: 'bottom' } },
        scales: isPie ? {} : { x: { grid: { color: grid } }, y: { beginAtZero: true, grid: { color: grid } } },
        animation: { duration: 350 },
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
