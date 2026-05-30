"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { clusterApiUrl } from "@solana/web3.js";
import { useMemo } from "react";
import { BasisToaster } from "../components/BasisToaster";
import { PositionToastWatcher } from "../components/PositionToastWatcher";
import { SWRConfig } from "swr";
/* Wallet modal styled in globals.css — default adapter CSS positions the dialog off-center */

export function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet");
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <SWRConfig value={{ onError: () => {} }}>
      <ConnectionProvider endpoint={endpoint}>
        <WalletProvider wallets={wallets} autoConnect>
          <WalletModalProvider>
            {children}
            <PositionToastWatcher />
            <BasisToaster />
          </WalletModalProvider>
        </WalletProvider>
      </ConnectionProvider>
    </SWRConfig>
  );
}
