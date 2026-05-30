import Link from "next/link";
import { AppShell } from "../components/AppShell";
import { FundingSection } from "../components/FundingSection";
import { NavChart } from "../components/NavChart";
import { PositionList } from "../components/PositionList";
import { TradeHistory } from "../components/TradeHistory";
import { DashboardStats } from "./dashboard-stats";

export default function DashboardPage() {
  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-[20px] font-semibold tracking-[-0.03em] text-text-primary">Overview</h1>
            <p className="section-label mt-1">Cross-venue funding rate vault</p>
          </div>
          <Link href="/vault" className="btn-primary h-9 px-4 hidden sm:inline-flex items-center shrink-0">
            Deposit
          </Link>
        </div>

        <DashboardStats />
        <FundingSection />

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <NavChart />
          <PositionList />
        </div>

        <TradeHistory />
      </div>
    </AppShell>
  );
}
