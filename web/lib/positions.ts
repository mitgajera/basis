export type KeeperPosition = {
  opportunityId: string;
  venue: string;
  asset: string;
  side: string;
  notionalUsd: number;
  entryPrice?: number;
  unrealizedPnl?: number;
};

export function groupByOpportunity(positions: KeeperPosition[]): Map<string, KeeperPosition[]> {
  const map = new Map<string, KeeperPosition[]>();
  for (const p of positions) {
    const list = map.get(p.opportunityId) ?? [];
    list.push(p);
    map.set(p.opportunityId, list);
  }
  return map;
}

/** e.g. "SOL · backpack long / pacifica short" */
export function spreadLabel(legs: KeeperPosition[]): string {
  const asset = (legs[0]?.asset ?? "").replace("-PERP", "") || "—";
  const longVenue = legs.find((l) => l.side === "long")?.venue;
  const shortVenue = legs.find((l) => l.side === "short")?.venue;
  if (longVenue && shortVenue) {
    return `${asset} · ${longVenue} long / ${shortVenue} short`;
  }
  if (legs.length === 1) {
    return `${asset} · ${legs[0]!.venue} ${legs[0]!.side}`;
  }
  return asset;
}
