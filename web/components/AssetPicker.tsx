"use client";

import { useState, useRef, useEffect } from "react";
import { AssetIcon, ASSET_META } from "./AssetIcon";
import { cn } from "../lib/utils";

export const ALL_ASSETS = [
  "SOL-PERP",
  "BTC-PERP",
  "ETH-PERP",
  "HYPE-PERP",
  "SUI-PERP",
  "DOGE-PERP",
] as const;

export type Asset = (typeof ALL_ASSETS)[number];

export function AssetPicker({ value, onChange }: { value: Asset; onChange: (a: Asset) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const meta = ASSET_META[value]!;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="field flex items-center gap-2 px-2.5 py-1.5 text-[12px] font-semibold text-text-primary hover:border-border-strong transition-colors"
      >
        <AssetIcon asset={value} size={18} />
        <span className="tabular-mono">{meta.ticker}</span>
        <span className="text-[20px] text-text-disabled ml-0.5">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[180px] panel py-1 shadow-xl">
          {ALL_ASSETS.map((asset) => {
            const m = ASSET_META[asset]!;
            const active = asset === value;
            return (
              <button
                key={asset}
                type="button"
                onClick={() => { onChange(asset); setOpen(false); }}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors",
                  active ? "bg-accent-muted" : "hover:bg-bg-surface-2"
                )}
              >
                <AssetIcon asset={asset} size={22} />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[12px] font-semibold tabular-mono", active ? "text-accent" : "text-text-primary")}>
                    {m.ticker}
                  </p>
                  <p className="text-[10px] text-text-disabled truncate">{m.name}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
