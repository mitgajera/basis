"use client";

import { useState } from "react";
import { FundingRateTable } from "./FundingRateTable";
import { FundingChart } from "./FundingChart";
import { SpreadChart } from "./SpreadChart";
import { AssetPicker, ALL_ASSETS } from "./AssetPicker";

export type Asset = (typeof ALL_ASSETS)[number];

export function FundingSection() {
  const [asset, setAsset] = useState<Asset>("SOL-PERP");

  return (
    <div className="space-y-3">
      {/* Section header with inline asset picker */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <p className="text-[10px] uppercase tracking-widest text-text-disabled font-medium">Market</p>
          <AssetPicker value={asset} onChange={setAsset} />
        </div>
      </div>

      {/* Table + Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <FundingRateTable asset={asset} />
        <FundingChart asset={asset} />
      </div>

      {/* Spread chart */}
      <SpreadChart asset={asset} />
    </div>
  );
}
