import { clusterApiUrl, Connection } from "@solana/web3.js";

const cluster = (process.env["NEXT_PUBLIC_SOLANA_CLUSTER"] ?? "devnet") as "devnet" | "mainnet-beta";

export const connection = new Connection(
  process.env["NEXT_PUBLIC_RPC_URL"] ?? clusterApiUrl(cluster),
  "confirmed",
);
