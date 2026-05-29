import { Header } from "../components/Header";
import { FundingSection } from "../components/FundingSection";
import { NavChart } from "../components/NavChart";
import { PositionList } from "../components/PositionList";
import { TradeHistory } from "../components/TradeHistory";
import { DashboardStats } from "./dashboard-stats";

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-bg-base">
      <Header />
      <main className="mx-auto max-w-screen-2xl px-6 pt-5 pb-10 space-y-4">
        <DashboardStats />
        <FundingSection />
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <NavChart />
          <PositionList />
        </div>
        <TradeHistory />
      </main>
    </div>
  );
}
