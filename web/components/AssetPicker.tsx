"use client";

import { useState, useRef, useEffect } from "react";
import type { Asset } from "./FundingSection";

export const ASSET_META: Record<Asset, { ticker: string; name: string; logo: string }> = {
  "SOL-PERP":  { ticker: "SOL",  name: "Solana",      logo: "https://assets.coingecko.com/coins/images/4128/small/solana.png" },
  "BTC-PERP":  { ticker: "BTC",  name: "Bitcoin",     logo: "https://assets.coingecko.com/coins/images/1/small/bitcoin.png" },
  "ETH-PERP":  { ticker: "ETH",  name: "Ethereum",    logo: "https://assets.coingecko.com/coins/images/279/small/ethereum.png" },
  "HYPE-PERP": { ticker: "HYPE", name: "Hyperliquid", logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/32196.png" },
  "SUI-PERP":  { ticker: "SUI",  name: "Sui",         logo: "https://assets.coingecko.com/coins/images/26375/small/sui_asset.jpeg" },
  "DOGE-PERP": { ticker: "DOGE", name: "Dogecoin",    logo: "https://assets.coingecko.com/coins/images/5/small/dogecoin.png" },
};

export const ALL_ASSETS = Object.keys(ASSET_META) as Asset[];

function CoinLogo({ src, ticker, size = 18 }: { src: string; ticker: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span style={{
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        width: size, height: size, borderRadius: "50%",
        background: "#1A1A1A", color: "#71717A",
        fontSize: Math.floor(size * 0.45), fontWeight: 700, fontFamily: "monospace", flexShrink: 0,
      }}>{ticker[0]}</span>
    );
  }
  return (
    <img
      src={src} alt={ticker} width={size} height={size}
      style={{ borderRadius: "50%", width: size, height: size, objectFit: "contain", flexShrink: 0 }}
      onError={() => setFailed(true)}
    />
  );
}

export function AssetPicker({ value, onChange }: { value: Asset; onChange: (a: Asset) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const meta = ASSET_META[value];

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-2.5 py-1 rounded-md border border-border-subtle bg-bg-surface-2 hover:border-border-default transition-colors duration-150 text-[12px] text-text-primary group"
      >
        <CoinLogo src={meta.logo} ticker={meta.ticker} size={16} />
        <span className="font-semibold tracking-wide">{meta.ticker}</span>
        <svg
          className={`w-3 h-3 text-text-disabled transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 rounded-lg border border-border-default bg-bg-surface shadow-2xl min-w-[170px] py-1 overflow-hidden">
          {ALL_ASSETS.map((asset) => {
            const m = ASSET_META[asset];
            const active = asset === value;
            return (
              <button
                key={asset}
                onClick={() => { onChange(asset); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] transition-colors duration-75 ${
                  active ? "bg-bg-surface-2 text-text-primary" : "text-text-secondary hover:bg-bg-surface-2 hover:text-text-primary"
                }`}
              >
                <CoinLogo src={m.logo} ticker={m.ticker} size={18} />
                <span className="font-semibold">{m.ticker}</span>
                <span className="text-[11px] text-text-disabled ml-auto">{m.name}</span>
                {active && (
                  <svg className="w-3 h-3 text-accent shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
