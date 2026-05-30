"use client";

import { useState } from "react";

export const ASSET_META: Record<string, { ticker: string; name: string; logo: string }> = {
  "SOL-PERP":  { ticker: "SOL",  name: "Solana",   logo: "https://assets.coingecko.com/coins/images/4128/small/solana.png" },
  "BTC-PERP":  { ticker: "BTC",  name: "Bitcoin",  logo: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png" },
  "ETH-PERP":  { ticker: "ETH",  name: "Ethereum", logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" },
  "HYPE-PERP": { ticker: "HYPE", name: "Hyperliquid", logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/32196.png" },
  "SUI-PERP":  { ticker: "SUI",  name: "Sui",      logo: "https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg" },
  "DOGE-PERP": { ticker: "DOGE", name: "Dogecoin", logo: "https://assets.coingecko.com/coins/images/5/small/dogecoin.png" },
};

export function AssetIcon({ asset, size = 20 }: { asset: string; size?: number }) {
  const meta = ASSET_META[asset] ?? { ticker: asset.slice(0, 3), name: asset, logo: "" };
  const [failed, setFailed] = useState(false);

  if (!failed && meta.logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={meta.logo}
        alt=""
        width={size}
        height={size}
        className="token-ring"
        style={{ width: size, height: size, padding: 2 }}
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span
      className="token-ring inline-flex items-center justify-center font-mono font-bold text-text-tertiary"
      style={{ width: size, height: size, fontSize: Math.max(8, Math.floor(size * 0.42)) }}
    >
      {meta.ticker.slice(0, 2)}
    </span>
  );
}
