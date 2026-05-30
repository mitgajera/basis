"use client";

import { useState } from "react";

const VENUE_LOGOS: Record<string, string[]> = {
  backpack: [
    "/venues/backpack.png",
    "https://dl.svgcdn.com/png/token-branded/backpack-200.png",
  ],
  phoenix: [
    "/venues/phoenix.png",
    "https://wsrv.nl/?url=https%3A%2F%2Fmedia.thegrid.id%2Fid1765793847-mr72l6rQSHGrAtN29BKMcg%2F7%2Fid1765793847-cWj_byC7SE-MViAQXY2Hdw%2Fid1761223287-yofTwDGNQzWuWUaALp4d4Q%2Fimage-1765949451.jpg&w=120&h=120&dpr=2&quality=80&output=webp",
  ],
  pacifica: [
    "https://app.pacifica.fi/favicon.ico",
    "/venues/pacifica.png",
    "https://pacifica.fi/apple-touch-icon.png",
  ],
  drift: [
    "/venues/drift.png",
    "https://app.drift.trade/apple-touch-icon.png",
  ],
  jupiter: [
    "/venues/jupiter.png",
    "https://station.jup.ag/img/jupiter-logo.svg",
  ],
  hyperliquid: [
    "/venues/hyperliquid.png",
    "https://s2.coinmarketcap.com/static/img/coins/64x64/32196.png",
  ],
};

export const VENUE_COLORS: Record<string, string> = {
  backpack:    "var(--venue-backpack)",
  pacifica:    "var(--venue-pacifica)",
  phoenix:     "var(--venue-phoenix)",
  drift:       "var(--venue-drift)",
  jupiter:     "var(--venue-jupiter)",
  hyperliquid: "var(--venue-hyperliquid)",
};

/** Hex values for canvas charts (lightweight-charts cannot use CSS vars) */
export const VENUE_CHART_COLORS: Record<string, string> = {
  backpack:    "#4F8EF7",
  pacifica:    "#E06B9A",
  phoenix:     "#E8752A",
  drift:       "#D4AF0A",
  jupiter:     "#14B87A",
  hyperliquid: "#8BC34A",
};

export function VenueLogo({ venue, size = 18 }: { venue: string; size?: number }) {
  const key = venue.toLowerCase();
  const urls = VENUE_LOGOS[key] ?? [];
  const [idx, setIdx] = useState(0);
  const color = VENUE_COLORS[key] ?? "#55555F";

  if (idx < urls.length) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={urls[idx]}
        alt=""
        width={size}
        height={size}
        className="token-ring"
        style={{ width: size, height: size, padding: 2 }}
        onError={() => setIdx((i) => i + 1)}
      />
    );
  }

  return (
    <span
      className="token-ring inline-flex items-center justify-center font-mono font-bold"
      style={{
        width: size,
        height: size,
        fontSize: Math.max(8, Math.floor(size * 0.48)),
        background: color,
        color: "#09090B",
        border: "none",
      }}
    >
      {venue[0]?.toUpperCase()}
    </span>
  );
}

export function venueColor(venue: string): string {
  return VENUE_COLORS[venue.toLowerCase()] ?? "#55555F";
}
