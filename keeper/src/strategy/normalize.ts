export type FundingFormat =
  | "hourly_decimal"
  | "hourly_bps"
  | "8h_decimal"
  | "annualized_pct";

export function normalizeToHourlyDecimal(raw: number, format: FundingFormat): number {
  switch (format) {
    case "hourly_decimal":
      return raw;
    case "hourly_bps":
      return raw / 10_000;
    case "8h_decimal":
      return raw / 8;
    case "annualized_pct":
      return raw / 100 / 24 / 365;
  }
}

export function hourlyToAnnualizedPct(hourlyRate: number): number {
  return hourlyRate * 24 * 365 * 100;
}
