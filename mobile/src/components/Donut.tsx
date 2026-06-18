import { useEffect, useRef } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import Chart from 'chart.js/auto';

export function Donut({ data, colors, center, size = 200 }: {
  data: number[]; colors: string[]; center?: ComponentChildren; size?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chart = useRef<Chart | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    chart.current = new Chart(ref.current, {
      type: 'doughnut',
      data: { datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
      options: { cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: false } }, responsive: true, maintainAspectRatio: true, animation: { duration: 350 } },
    });
    return () => { chart.current?.destroy(); chart.current = null; };
  }, []);

  useEffect(() => {
    const c = chart.current; if (!c) return;
    c.data.datasets[0].data = data;
    c.update();
  }, [data.join(',')]);

  return (
    <div style={`position:relative;width:${size}px;height:${size}px;margin:0 auto`}>
      <canvas ref={ref} />
      {center && <div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">{center}</div>}
    </div>
  );
}
