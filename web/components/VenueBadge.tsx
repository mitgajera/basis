"use client";

import { VenueLogo, venueColor } from "./VenueLogo";

interface VenueBadgeProps {
  venue: string;
  size?: "sm" | "md";
  showLogo?: boolean;
}

export function VenueBadge({ venue, size = "md", showLogo = true }: VenueBadgeProps) {
  const color = venueColor(venue);
  const logoSize = size === "sm" ? 16 : 20;
  const textSize = size === "sm" ? "text-[11px]" : "text-[12px]";

  return (
    <span className={`inline-flex items-center gap-2 ${textSize}`}>
      {showLogo && <VenueLogo venue={venue} size={logoSize} />}
      <span className="capitalize font-medium" style={{ color }}>
        {venue}
      </span>
    </span>
  );
}
