interface SparklineProps {
  points: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  strokeWidth?: number;
  className?: string;
}

export function Sparkline({
  points,
  width = 120,
  height = 32,
  stroke = "var(--accent)",
  fill = "var(--accent-muted)",
  strokeWidth = 1.4,
  className = "",
}: SparklineProps) {
  if (!points || points.length < 2) {
    return (
      <svg width={width} height={height} className={className} aria-hidden>
        <line
          x1="0"
          x2={width}
          y1={height / 2}
          y2={height / 2}
          stroke="var(--border-subtle)"
          strokeDasharray="2 3"
        />
      </svg>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);

  const coords = points.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / range) * height;
    return [x, y] as const;
  });

  // Catmull-Rom-ish smooth curve via cubic bezier control points
  const d = coords
    .map(([x, y], i) => {
      if (i === 0) return `M ${x.toFixed(2)} ${y.toFixed(2)}`;
      const [px, py] = coords[i - 1]!;
      const cx = (px + x) / 2;
      return `C ${cx.toFixed(2)} ${py.toFixed(2)}, ${cx.toFixed(2)} ${y.toFixed(2)}, ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");

  const fillPath = `${d} L ${width.toFixed(2)} ${height} L 0 ${height} Z`;

  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path d={fillPath} fill={fill} />
      <path d={d} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
