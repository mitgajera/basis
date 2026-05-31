import { NextResponse } from "next/server";

const STATUS_PAGE_SLUG = process.env.UPTIMEROBOT_STATUS_SLUG ?? "JrNzCZ12Cu";

export const revalidate = 30;

export async function GET() {
  try {
    const res = await fetch(
      `https://stats.uptimerobot.com/api/getMonitorList/${STATUS_PAGE_SLUG}`,
      { next: { revalidate: 30 } }
    );
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const json = await res.json();
    // Prefer monitor-level "ratio" (what UptimeRobot's public page shows).
    // Fall back to last-24h (l1) if that's missing.
    const monitorRatio = json?.data?.[0]?.ratio?.ratio;
    const l1Ratio = json?.statistics?.uptime?.l1?.ratio;
    const raw = monitorRatio ?? l1Ratio;
    const uptime24h = raw != null ? parseFloat(raw) : null;
    return NextResponse.json({ uptime24h });
  } catch {
    return NextResponse.json({ uptime24h: null });
  }
}
