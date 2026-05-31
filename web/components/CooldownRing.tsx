interface CooldownRingProps {
  remainingMs: number;
  totalMs: number;
  size?: number;
  stroke?: number;
  ready?: boolean;
  children?: React.ReactNode;
}

export function CooldownRing({
  remainingMs,
  totalMs,
  size = 132,
  stroke = 6,
  ready = false,
  children,
}: CooldownRingProps) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = totalMs > 0 ? Math.min(Math.max(remainingMs / totalMs, 0), 1) : 0;
  const dash = ready ? 0 : c * pct;

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke="var(--border-subtle)"
          strokeWidth={stroke}
          fill="none"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={ready ? "var(--accent)" : "var(--text-tertiary)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={ready ? 0 : c - dash}
          style={{
            transition: "stroke-dashoffset 800ms var(--ease-out), stroke 220ms var(--ease-out)",
            filter: ready ? "drop-shadow(0 0 8px rgba(52, 211, 153, 0.55))" : undefined,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
