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

export function useTrades(limit = 20) {
  return useSWR(`${API}/api/trades?limit=${limit}`, fetcher, {
    refreshInterval: 15_000,
    revalidateOnFocus: false,
  });
}

export function useHealth() {
  return useSWR(`${API}/api/health`, fetcher, {
    refreshInterval: 10_000,
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

export async function requestFaucet(address: string): Promise<{ ok: boolean; sig?: string; error?: string }> {
  const res = await fetch(`${API}/api/faucet`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });
  return res.json();
}

export function useReplay(fromTs: number | null, toTs: number | null) {
  return useSWR(
    fromTs && toTs ? `${API}/api/replay?from=${fromTs}&to=${toTs}` : null,
    fetcher,
    { revalidateOnFocus: false, revalidateIfStale: false }
  );
}
