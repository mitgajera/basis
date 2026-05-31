import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vault",
  description: "Deposit USDC, receive bUSD shares. Track NAV per share over time.",
};

export default function VaultLayout({ children }: { children: React.ReactNode }) {
  return children;
}
