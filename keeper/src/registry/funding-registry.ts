import { FundingRateInfo, Venue } from "../venues/index";

export interface SpreadOpportunity {
  asset: string;
  longVenue: Venue;
  shortVenue: Venue;
  spreadAnnualizedPct: number;
  longRate: number;
  shortRate: number;
  computedAt: number;
}

export class FundingRegistry {
  private state = new Map<string, FundingRateInfo>();

  private key(venue: Venue, asset: string): string {
    return `${venue}:${asset}`;
  }

  upsert(info: FundingRateInfo): void {
    this.state.set(this.key(info.venue, info.asset), info);
  }

  get(venue: Venue, asset: string): FundingRateInfo | undefined {
    return this.state.get(this.key(venue, asset));
  }

  getAllForAsset(asset: string): FundingRateInfo[] {
    return Array.from(this.state.values()).filter((r) => r.asset === asset);
  }

  // Sign convention: positive rate = longs pay shorts.
  // Short on the venue where longs pay more (higher rate).
  // Long on the venue where longs pay less (lower rate).
  pairwiseSpreads(asset: string): SpreadOpportunity[] {
    const rates = this.getAllForAsset(asset);
    const opportunities: SpreadOpportunity[] = [];

    for (let i = 0; i < rates.length; i++) {
      for (let j = i + 1; j < rates.length; j++) {
        const a = rates[i]!;
        const b = rates[j]!;

        let shortVenue: FundingRateInfo;
        let longVenue: FundingRateInfo;

        if (a.annualizedPct >= b.annualizedPct) {
          shortVenue = a;
          longVenue = b;
        } else {
          shortVenue = b;
          longVenue = a;
        }

        const spreadAnnualizedPct = shortVenue.annualizedPct - longVenue.annualizedPct;
        if (spreadAnnualizedPct <= 0) continue;

        opportunities.push({
          asset,
          longVenue: longVenue.venue,
          shortVenue: shortVenue.venue,
          spreadAnnualizedPct,
          longRate: longVenue.annualizedPct,
          shortRate: shortVenue.annualizedPct,
          computedAt: Date.now(),
        });
      }
    }

    return opportunities.sort((a, b) => b.spreadAnnualizedPct - a.spreadAnnualizedPct);
  }

  snapshot(): FundingRateInfo[] {
    return Array.from(this.state.values());
  }

  isStale(venue: Venue, asset: string, maxAgeMs: number): boolean {
    const info = this.get(venue, asset);
    if (!info) return true;
    return Date.now() - info.lastUpdated > maxAgeMs;
  }
}
