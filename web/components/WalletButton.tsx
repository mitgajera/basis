"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

function truncateAddress(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export function WalletButton() {
  const { publicKey, disconnect, connected } = useWallet();
  const { setVisible } = useWalletModal();

  if (connected && publicKey) {
    return (
      <button
        type="button"
        onClick={() => disconnect()}
        className="field h-9 px-3.5 text-[12px] font-medium text-text-primary tabular-mono hover:border-border-strong transition-[border-color,box-shadow] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
        title="Disconnect wallet"
      >
        {truncateAddress(publicKey.toBase58())}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setVisible(true)}
      className="btn-primary h-9 px-4 text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
    >
      Connect
    </button>
  );
}
