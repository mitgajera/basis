import { NextResponse } from "next/server";

const STATUS_PAGE_SLUG = process.env.UPTIMEROBOT_STATUS_SLUG ?? "JrNzCZ12Cu";

export const revalidate = 60;

export async function GET() {
  try {
    const res = await fetch(
      `https://stats.uptimerobot.com/api/getMonitorList/${STATUS_PAGE_SLUG}`,
      { next: { revalidate: 60 } }
    );
    if (!res.ok) throw new Error(`upstream ${res.status}`);
    const json = await res.json();
    const raw = json?.statistics?.uptime?.l1?.ratio;
    const uptime24h = raw != null ? parseFloat(raw) : null;
    return NextResponse.json({ uptime24h });
  } catch {
    return NextResponse.json({ uptime24h: null });
  }
}
