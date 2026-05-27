export function hourlyToAnnualizedPct(hourlyRate: number): number {
  return hourlyRate * 24 * 365 * 100;
}

export function annualizedToHourly(annualizedPct: number): number {
  return annualizedPct / 100 / 24 / 365;
}

export function navPerShare(totalAssets: number, totalShares: number): number {
  if (totalShares === 0) return 1;
  return totalAssets / totalShares;
}

export function sharesFromDeposit(
  amount: number,
  totalAssets: number,
  totalShares: number,
): number {
  if (totalShares === 0) return amount;
  return (amount * totalShares) / totalAssets;
}

export function usdcFromShares(
  shares: number,
  totalAssets: number,
  totalShares: number,
): number {
  if (totalShares === 0) return 0;
  return (shares * totalAssets) / totalShares;
}

export function fundingPnl(
  positionSize: number,
  hourlyRate: number,
  hoursHeld: number,
): number {
  return positionSize * hourlyRate * hoursHeld;
}
