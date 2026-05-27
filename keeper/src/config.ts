import * as dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env var: ${key}`);
  return val;
}

function optional(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export interface Config {
  HELIUS_RPC_URL: string;
  HELIUS_WS_URL: string;
  KEEPER_PRIVATE_KEY: string;
  VAULT_PROGRAM_ID: string;
  USDC_MINT: string;
  BACKPACK_API_KEY: string;
  BACKPACK_API_SECRET: string;
  PACIFICA_PROGRAM_ID: string;
  PHOENIX_PROGRAM_ID: string;
  USE_FALLBACK_VENUES: boolean;
  LIVE_TRADING: boolean;
  LOG_DB_PATH: string;
  API_PORT: number;
  DASHBOARD_ORIGIN: string;
}

export function loadConfig(): Config {
  return {
    HELIUS_RPC_URL: required("HELIUS_RPC_URL"),
    HELIUS_WS_URL: required("HELIUS_WS_URL"),
    KEEPER_PRIVATE_KEY: required("KEEPER_PRIVATE_KEY"),
    VAULT_PROGRAM_ID: optional("VAULT_PROGRAM_ID", ""),
    USDC_MINT: optional(
      "USDC_MINT",
      "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    ),
    BACKPACK_API_KEY: optional("BACKPACK_API_KEY", ""),
    BACKPACK_API_SECRET: optional("BACKPACK_API_SECRET", ""),
    PACIFICA_PROGRAM_ID: optional("PACIFICA_PROGRAM_ID", ""),
    PHOENIX_PROGRAM_ID: optional("PHOENIX_PROGRAM_ID", ""),
    USE_FALLBACK_VENUES: optional("USE_FALLBACK_VENUES", "false") === "true",
    LIVE_TRADING: optional("LIVE_TRADING", "false") === "true",
    LOG_DB_PATH: optional("LOG_DB_PATH", "./data/basis.db"),
    API_PORT: parseInt(optional("API_PORT", "3001"), 10),
    DASHBOARD_ORIGIN: optional("DASHBOARD_ORIGIN", "http://localhost:3000"),
  };
}
