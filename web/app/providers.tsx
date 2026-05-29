"use client";

import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { clusterApiUrl } from "@solana/web3.js";
import { useMemo } from "react";
import { Toaster } from "sonner";
import { SWRConfig } from "swr";
import "@solana/wallet-adapter-react-ui/styles.css";

export function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL ?? clusterApiUrl("devnet");
  const wallets = useMemo(() => [new PhantomWalletAdapter()], []);

  return (
    <SWRConfig value={{ onError: () => {} }}>
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          {children}
          <Toaster
            theme="dark"
            position="bottom-right"
            gap={10}
            offset={20}
            toastOptions={{
              duration: 5000,
              classNames: {
                toast: "basis-toast",
                title: "basis-toast-title",
                description: "basis-toast-desc",
                actionButton: "basis-toast-action",
                closeButton: "basis-toast-close",
                icon: "basis-toast-icon",
              },
            }}
          />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
    </SWRConfig>
  );
}
