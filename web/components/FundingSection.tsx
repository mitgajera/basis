"use client";

import { useState } from "react";
import { FundingRateTable } from "./FundingRateTable";
import { FundingChart } from "./FundingChart";
import { SpreadChart } from "./SpreadChart";
import { AssetPicker, type Asset } from "./AssetPicker";

export type { Asset };

export function FundingSection() {
  const [asset, setAsset] = useState<Asset>("SOL-PERP");

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Markets</h2>
        <AssetPicker value={asset} onChange={setAsset} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <FundingRateTable asset={asset} />
        <FundingChart asset={asset} />
      </div>

      <SpreadChart asset={asset} />
    </section>
  );
}
