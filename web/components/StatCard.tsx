interface StatCardProps {
  label: string;
  value: string;
  delta?: { value: string; positive: boolean };
  helper?: string;
  loading?: boolean;
  accent?: boolean;
}

export function StatCard({ label, value, delta, helper, loading, accent }: StatCardProps) {
  if (loading) {
    return (
      <div className="rounded-xl border border-border-subtle bg-bg-surface p-4 space-y-3">
        <div className="skeleton h-2 w-24 rounded" />
        <div className="skeleton h-8 w-32 rounded" />
        <div className="skeleton h-2.5 w-20 rounded" />
      </div>
    );
  }

  return (
    <div
      className={`relative rounded-xl p-4 overflow-hidden transition-all duration-200 glass-card hover:brightness-110 ${
        accent ? "ring-1 ring-accent/10" : ""
      }`}
    >
      {/* Accent glow top-left */}
      {accent && (
        <div
          className="pointer-events-none absolute -top-8 -left-8 h-24 w-24 rounded-full opacity-[0.06]"
          style={{ background: "radial-gradient(circle, var(--accent) 0%, transparent 70%)" }}
        />
      )}

      {/* Left accent bar */}
      {accent && (
        <div className="absolute left-0 top-4 bottom-4 w-[2px] rounded-r-full bg-accent/50" />
      )}

      {/* Label */}
      <p className="text-[10px] uppercase tracking-[0.12em] text-text-disabled font-medium mb-3 pl-px">
        {label}
      </p>

      {/* Value */}
      <p className={`tabular-mono font-semibold leading-none mb-2 tracking-tight ${
        accent ? "text-[28px] text-text-primary" : "text-[24px] text-text-secondary"
      }`}>
        {value}
      </p>

      {/* Delta / helper */}
      {delta ? (
        <p className={`text-[11px] tabular-mono font-medium ${delta.positive ? "text-positive" : "text-negative"}`}>
          {delta.value}
          {helper && <span className="text-text-disabled font-normal ml-1.5">{helper}</span>}
        </p>
      ) : helper ? (
        <p className="text-[11px] text-text-disabled">{helper}</p>
      ) : null}
    </div>
  );
}
