import { VaultClient } from "./vault-client";
import { VenueAdapter, Venue } from "../venues/index";
import type { SimulatedPosition } from "../executor/simulated-executor";

export interface NavBreakdown {
  vaultUsdc: number;
  venueCollateral: number;
  unrealizedPnl: number;
  total: number;
}

export async function computeNav(
  vault: VaultClient,
  adapters: Map<Venue, VenueAdapter>,
  openPositions: SimulatedPosition[],
): Promise<NavBreakdown> {
  const [idleResult, ...collateralResults] = await Promise.allSettled([
    vault.getIdleBalance(),
    ...Array.from(adapters.values()).map((a) => a.getCollateralBalance()),
  ]);

  const vaultUsdc = idleResult.status === "fulfilled" ? idleResult.value : 0;

  const venueCollateral = collateralResults.reduce(
    (sum, r) => sum + (r.status === "fulfilled" ? r.value : 0),
    0,
  );

  const unrealizedPnl = openPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);

  return {
    vaultUsdc,
    venueCollateral,
    unrealizedPnl,
    total: vaultUsdc + venueCollateral + unrealizedPnl,
  };
}
