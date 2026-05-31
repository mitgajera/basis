"use client";

import { useHealth, useUptime } from "../lib/api-client";

type State = "live" | "degraded" | "offline";

function classify(isLive: boolean, uptime24h: number | null | undefined): State {
  if (!isLive) return "offline";
  if (uptime24h != null && uptime24h < 95) return "degraded";
  return "live";
}

const LABEL: Record<State, string> = {
  live: "Live",
  degraded: "Degraded",
  offline: "Offline",
};

export function StatusPill() {
  const { data: health } = useHealth();
  const { data: uptime } = useUptime();
  const state = classify(health?.ok === true, uptime?.uptime24h);
  const label = LABEL[state];
  const ratio = uptime?.uptime24h;

  return (
    <span
      className="status-pill tabular-mono"
      data-state={state}
      title={ratio != null ? `${ratio.toFixed(2)}% uptime · last 24h` : undefined}
    >
      <span className={`status-dot ${state === "live" ? "live-dot" : ""}`} />
      {label}
      {ratio != null && state !== "offline" && (
        <span className="text-text-tertiary ml-0.5">· {ratio.toFixed(1)}%</span>
      )}
    </span>
  );
}
