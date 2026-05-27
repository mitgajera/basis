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
  // Backpack Exchange
  BACKPACK_API_KEY: string;
  BACKPACK_API_SECRET: string;
  // Pacifica
  PACIFICA_API_URL: string;
  PACIFICA_WS_URL: string;
  PACIFICA_ACCOUNT_PUBLIC_KEY: string;
  // Phoenix Perpetuals
  PHOENIX_API_URL: string;
  PHOENIX_ACCESS_CODE: string;
  // Strategy
  USE_FALLBACK_VENUES: boolean;
  LIVE_TRADING: boolean;
  // Infra
  LOG_DB_PATH: string;
  API_PORT: number;
  DASHBOARD_ORIGIN: string;
}

export function loadConfig(): Config {
  return {
    HELIUS_RPC_URL: required("HELIUS_RPC_URL"),
    HELIUS_WS_URL: required("HELIUS_WS_URL"),
    KEEPER_PRIVATE_KEY: optional("KEEPER_PRIVATE_KEY", ""),
    VAULT_PROGRAM_ID: optional("VAULT_PROGRAM_ID", ""),
    USDC_MINT: optional("USDC_MINT", "Gh9ZwEmdLJ8DscKNTkTqPbNwLNNBjuSzaG9Vp2KGtKJr"),
    BACKPACK_API_KEY: optional("BACKPACK_API_KEY", ""),
    BACKPACK_API_SECRET: optional("BACKPACK_API_SECRET", ""),
    PACIFICA_API_URL: optional("PACIFICA_API_URL", "https://api.pacifica.fi/api/v1"),
    PACIFICA_WS_URL: optional("PACIFICA_WS_URL", "wss://ws.pacifica.fi/ws"),
    PACIFICA_ACCOUNT_PUBLIC_KEY: optional("PACIFICA_ACCOUNT_PUBLIC_KEY", ""),
    PHOENIX_API_URL: optional("PHOENIX_API_URL", "https://perp-api.phoenix.trade"),
    PHOENIX_ACCESS_CODE: optional("PHOENIX_ACCESS_CODE", ""),
    USE_FALLBACK_VENUES: optional("USE_FALLBACK_VENUES", "false") === "true",
    LIVE_TRADING: optional("LIVE_TRADING", "false") === "true",
    LOG_DB_PATH: optional("LOG_DB_PATH", "./data/basis.db"),
    API_PORT: parseInt(optional("API_PORT", "3001"), 10),
    DASHBOARD_ORIGIN: optional("DASHBOARD_ORIGIN", "http://localhost:3000"),
  };
}
