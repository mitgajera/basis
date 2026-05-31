import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Faucet",
  description: "Mint test USDC on devnet to try the vault.",
};

export default function FaucetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
