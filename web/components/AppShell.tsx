"use client";

import { Header } from "./Header";
import { KeeperOfflineBanner } from "./KeeperOfflineBanner";

export function AppShell({
  children,
  narrow,
}: {
  children: React.ReactNode;
  narrow?: boolean;
}) {
  return (
    <div className="min-h-screen">
      <Header />
      <main
        className={`mx-auto w-full px-4 sm:px-6 pb-12 pt-5 ${
          narrow ? "flex justify-center" : "max-w-[1360px]"
        }`}
      >
        <div className={narrow ? "w-full max-w-[440px]" : "w-full"}>
          <KeeperOfflineBanner />
          {children}
        </div>
      </main>
    </div>
  );
}
