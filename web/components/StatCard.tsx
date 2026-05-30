interface StatCardProps {
  label: string;
  value: string;
  delta?: { value: string; positive: boolean };
  helper?: string;
  loading?: boolean;
  inline?: boolean;
}

export function StatCard({ label, value, delta, helper, loading, inline }: StatCardProps) {
  if (loading) {
    const wrap = inline ? "metric-cell space-y-2" : "panel p-4 space-y-2.5";
    return (
      <div className={wrap}>
        <div className="skeleton h-2 w-16" />
        <div className="skeleton h-7 w-24" />
      </div>
    );
  }

  if (inline) {
    return (
      <div className="metric-cell">
        <p className="text-[12px] text-text-tertiary mb-1.5">{label}</p>
        <p className="tabular-mono text-[22px] font-medium text-text-primary leading-none tracking-tight">{value}</p>
        {(delta || helper) && (
          <p className="mt-1.5 text-[11px] tabular-mono text-text-disabled">
            {delta && (
              <span className={delta.positive ? "text-positive" : "text-negative"}>{delta.value}</span>
            )}
            {helper && <span className="ml-1">{helper}</span>}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="panel p-4">
      <p className="text-[12px] text-text-tertiary mb-1.5">{label}</p>
      <p className="tabular-mono text-[22px] font-medium text-text-primary leading-none tracking-tight">{value}</p>
      {(delta || helper) && (
        <p className="mt-1.5 text-[11px] tabular-mono">
          {delta && (
            <span className={delta.positive ? "text-positive" : "text-negative"}>{delta.value}</span>
          )}
          {helper && <span className="text-text-disabled ml-1.5">{helper}</span>}
        </p>
      )}
    </div>
  );
}
