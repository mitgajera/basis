import useSWR from "swr";

const API = process.env.NEXT_PUBLIC_KEEPER_API_URL ?? "http://localhost:8080";

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`API ${r.status}`);
    return r.json();
  });

export function useFundingRates() {
  return useSWR(`${API}/api/funding-rates`, fetcher, {
    refreshInterval: 5_000,
    revalidateOnFocus: false,
  });
}

export function useSpreads(asset = "SOL-PERP") {
  return useSWR(`${API}/api/spreads?asset=${asset}`, fetcher, {
    refreshInterval: 5_000,
    revalidateOnFocus: false,
  });
}

export function useNav() {
  return useSWR(`${API}/api/nav`, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
}

export function useStats() {
  return useSWR(`${API}/api/stats`, fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: false,
  });
}

export function usePositions() {
  return useSWR(`${API}/api/positions`, fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: false,
  });
}

export const TRADES_LOOKBACK_MS = 24 * 3600_000;

export type TradeRecord = {
  opportunityId: string;
  venue: string;
  asset: string;
  side: string;
  sizeUsd: number;
  fillPrice: number | null;
  exitPrice: number | null;
  feeUsd: number;
  pnlUsd: number | null;
  status: string;
  openedAt: number;
  closedAt: number | null;
};

export interface TradesPageResponse {
  trades: TradeRecord[];
  total: number;
  limit: number;
  offset: number;
  lookback: number;
}

export function useTradesPage(page: number, pageSize = 25) {
  const offset = (page - 1) * pageSize;
  return useSWR<TradesPageResponse>(
    `${API}/api/trades?lookback=${TRADES_LOOKBACK_MS}&limit=${pageSize}&offset=${offset}`,
    fetcher,
    { refreshInterval: 10_000, revalidateOnFocus: false }
  );
}

export function useAllTrades(lookbackMs = TRADES_LOOKBACK_MS) {
  return useSWR<TradesPageResponse>(
    `${API}/api/trades?lookback=${lookbackMs}&limit=10000&offset=0`,
    fetcher,
    { refreshInterval: 10_000, revalidateOnFocus: false }
  );
}

export interface PnlHistoryResponse {
  points: Array<{ timestamp: number; value: number }>;
  realized: number;
  unrealized: number;
  total: number;
}

export function usePnlHistory(lookbackMs: number, enabled = true) {
  return useSWR<PnlHistoryResponse>(
    enabled ? `${API}/api/pnl-history?lookback=${lookbackMs}` : null,
    fetcher,
    { refreshInterval: 10_000, revalidateOnFocus: false }
  );
}

export function useHealth() {
  return useSWR(`${API}/api/health`, fetcher, {
    refreshInterval: 10_000,
    revalidateOnFocus: false,
  });
}

export function useUptime() {
  return useSWR<{ uptime24h: number | null }>(`/api/uptime`, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
}

export function useSettlement() {
  return useSWR(`${API}/api/settlement`, fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
  });
}

export function useFundingRateHistory(lookbackMs: number) {
  return useSWR(`${API}/api/funding-rate-history?lookback=${lookbackMs}`, fetcher, {
    refreshInterval: 30_000,
    revalidateOnFocus: false,
  });
}

export function useSpreadHistory(lookbackMs = 24 * 3600_000, asset = "SOL-PERP") {
  return useSWR(`${API}/api/spread-history?lookback=${lookbackMs}&asset=${asset}`, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 60_000,
  });
}

export interface FaucetResult {
  ok?: boolean;
  sig?: string;
  amount?: number;
  error?: string;
  remainingMs?: number;
  cooldownMs?: number;
  message?: string;
}

export async function requestFaucet(address: string): Promise<FaucetResult> {
  const res = await fetch(`${API}/api/faucet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  const body = (await res.json()) as FaucetResult;
  return { ...body, ok: res.ok };
}

export interface FaucetStatus {
  address: string;
  cooldownMs: number;
  lastMintMs: number | null;
  remainingMs: number;
  ready: boolean;
}

export function useFaucetStatus(address: string | null) {
  return useSWR<FaucetStatus>(
    address ? `${API}/api/faucet/status?address=${address}` : null,
    fetcher,
    { refreshInterval: 30_000, revalidateOnFocus: true }
  );
}

