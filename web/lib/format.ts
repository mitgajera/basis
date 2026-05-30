export function formatUsd(value: number, opts?: { compact?: boolean; signed?: boolean }): string {
  const prefix = opts?.signed && value > 0 ? "+" : "";
  const abs = Math.abs(value);
  const useCompact = opts?.compact === true && abs >= 1000;

  if (useCompact && abs >= 1000) {
    return (
      prefix +
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(value)
    );
  }

  const maxFrac = abs < 1 ? 4 : 2;
  const minFrac = abs < 1 ? 4 : 2;
  return (
    prefix +
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: minFrac,
      maximumFractionDigits: maxFrac,
    }).format(value)
  );
}

export function formatPct(value: number, decimals = 2): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(decimals)}%`;
}

export function formatAnnualizedPct(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function formatBps(value: number): string {
  return `${(value * 10000).toFixed(1)} bps`;
}

export function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.floor((Date.now() - timestamp) / 1000);
  if (diffSec < 5) return "just now";
  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}

export function formatShares(value: number): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}
