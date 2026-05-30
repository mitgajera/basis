"use client";

import { Header } from "./Header";

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
        className={`mx-auto w-full px-4 sm:px-6 pb-12 pt-6 ${
          narrow ? "flex justify-center" : "max-w-[1360px]"
        }`}
      >
        <div className={narrow ? "w-full max-w-[440px]" : "w-full"}>{children}</div>
      </main>
    </div>
  );
}
