// Tiny inline-SVG sparkline (area + line + endpoint dot). Server-renderable,
// no data fabrication — it draws exactly the series it's given.
export function Sparkline({
  series,
  width = 84,
  height = 28,
}: {
  series: number[];
  width?: number;
  height?: number;
}) {
  if (series.length < 2 || series.every((v) => v === 0)) {
    // Nothing to show yet — a faint baseline keeps the card layout steady.
    return (
      <svg width={width} height={height} className="text-muted-foreground/40" aria-hidden>
        <line
          x1="0"
          y1={height - 2}
          x2={width}
          y2={height - 2}
          stroke="currentColor"
          strokeWidth="1"
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = max - min || 1;
  const stepX = width / (series.length - 1);
  const pad = 3;
  const usableH = height - pad * 2;

  const points = series.map((v, i) => {
    const x = i * stepX;
    const y = pad + usableH - ((v - min) / range) * usableH;
    return [x, y] as const;
  });

  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg width={width} height={height} className="text-primary overflow-visible" aria-hidden>
      <path d={area} fill="currentColor" fillOpacity="0.14" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r="2.4" fill="currentColor" />
    </svg>
  );
}
