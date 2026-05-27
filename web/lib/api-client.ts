import type { FundingRateInfo, SpreadOpportunity, Position, VaultSnapshot, Stats } from "@basis/shared";

const API_BASE = process.env["NEXT_PUBLIC_API_URL"] ?? "http://localhost:3001";

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  getFundingRates: () => get<FundingRateInfo[]>("/api/funding-rates"),
  getSpreads: () => get<SpreadOpportunity[]>("/api/spreads"),
  getPositions: () => get<Position[]>("/api/positions"),
  getNav: () => get<{ snapshot: VaultSnapshot; history: { timestamp: number; navPerShare: number }[] }>("/api/nav"),
  getTrades: (since = 0, limit = 20) => get<unknown[]>(`/api/trades?since=${since}&limit=${limit}`),
  getReplay: (from: number, to: number) =>
    get<{ fundingRates: FundingRateInfo[]; spreads: SpreadOpportunity[] }>(`/api/replay?from=${from}&to=${to}`),
  getHealth: () => get<{ ok: boolean; uptime: number; venues: Record<string, unknown> }>("/api/health"),
  getStats: () => get<Stats & { tvl: number }>("/api/stats"),
};
