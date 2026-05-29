"use client";

import { useState } from "react";

// Local files take priority — drop PNGs into web/public/venues/<name>.png
// CDN fallbacks for each venue
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
    "/venues/pacifica.png",
    "https://pacifica.fi/apple-touch-icon.png",
    "https://pacifica.fi/favicon.ico",
  ],
  drift: [
    "/venues/drift.png",
    "https://app.drift.trade/apple-touch-icon.png",
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFwAAABcCAMAAADUMSJqAAAAY1BMVEUDAwX///8AAABNTU04ODjAwMH19fXm5uf6+voRERIpKSkxMTEtLS5kZGVVVVV0dHTs7OzY2Ninp6dtbW2IiIiRkZEhISLIyMitra2dnZ0XFxjS0tKBgYG2trZ8fH2Xl5hCQkMtTSL/AAADDklEQVRoge2Y2bKiQAyG4UcWRVkEUVHU93/K6XQSwDM1UwU0czFFLlzOsT5SWbrzx/M222yzzTabbMCa7P1aeCAo/bu3Ch1N6BuLajj33hDfPltRuaUDz2uK5ib4x8chHllskF2L9Cr4MHWDNwE5MzG5A1kp+LOD0APNDsgjJkZPoCrkUZeldKCOrJP3hJHxCbjIo4p8ER6n2DpsnGy7UTYlTn6Zzccj8P3Byd1Ds3nAIdTPswtngBsnA3DRSDYDzextZmYZrg5fKbOaTdOnJ33Uexad4U1WjJy8yOfY9OlTsxzMoDN8Bw2wnxgnoX1K2dQiqqfTR/BIKIWp9LTP5pDZ+2T6CB73DlOlB6M+fc70/QuOSINDlV5JNuMUJ/40Ne5f8L2Ba2bDts9m8hF6PLFmfoNnerCYGKN9KL2eE5jf4CbctWY207opgIe8L4UPB0ut9BCNfa+WwumgTKVnzXHGl0cGe6p1y+GElzbNpYQe/MNpKf0D3PzjxfSDVMoHtjJbJ3Cll0DJvXTjXzqBe5LWChU/5Dm5j/4G50CUEnVkLuGeRFuOzGbnFO5xtN/cnkHqGF5xFdqAZK7hSGzPH9eAe/ZEifaHdeBUjclhJTg1UnJcCZ5v8H8A/xrJncKpZ2gcXQPOV5kdR13DI5qz+MbUmdkR3EJpzuKpmdQQHMFTGXr8rjFzlp2KipehO4Gb6afpZ1mdmml+dgG3ilYEESn//U0ye1oGz9hhKxZFpZCi+HBmy5/wabc/qVC/z+GLp1CKSC+kx/Bo4rCIfb+ryIfFRdj00kvhdEFPG+csHqpu42wQROe9CGmBf3K6N2YII+x0V0HdKV9IVI+qhfosnydHB3Xbtb0gKqqqh5etn0wboL/wL1W3VOo5P4v+lByoXKuwmzSE/qTjIpIieo2+mAp50/TfLluPjNQtiUXVFyUK/+pkr9NvoR4ms0d7JOR3ki9L0Yzv1W13tPqiRO5uEzjaW5zv5iV1umTEcCRQBTpfj5ojgQf/1xqLXeN9u6OArLM0xmrkzTbbbLP/334BG4krTSTQVHsAAAAASUVORK5CYII=",
  ],
  jupiter: [
    "/venues/jupiter.png",
    "https://station.jup.ag/img/jupiter-logo.svg",
    "https://jup.ag/favicon.ico",
  ],
  hyperliquid: [
    "/venues/hyperliquid.png",
    "https://s2.coinmarketcap.com/static/img/coins/64x64/32196.png",
    "https://hyperliquid.xyz/favicon.ico",
  ],
};

const VENUE_COLORS: Record<string, string> = {
  pacifica:     "#A78BFA",
  phoenix:      "#F97316",
  backpack:     "#3B82F6",
  drift:        "#FACC15",
  jupiter:      "#00E5C8",
  hyperliquid:  "#84CC16",
};

export function VenueLogo({ venue, size = 16 }: { venue: string; size?: number }) {
  const key = venue.toLowerCase();
  const urls = VENUE_LOGOS[key] ?? [];
  const [idx, setIdx] = useState(0);
  const color = VENUE_COLORS[key] ?? "#71717A";

  if (idx < urls.length) {
    return (
      <img
        src={urls[idx]}
        alt={venue}
        width={size}
        height={size}
        style={{ borderRadius: 3, width: size, height: size, objectFit: "contain", flexShrink: 0 }}
        onError={() => setIdx((i) => i + 1)}
      />
    );
  }

  // All URLs failed — branded letter badge
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: 3,
        background: color,
        color: "#0A0A0A",
        fontSize: Math.floor(size * 0.55),
        fontWeight: 700,
        fontFamily: "monospace",
        flexShrink: 0,
      }}
    >
      {venue[0]?.toUpperCase()}
    </span>
  );
}
