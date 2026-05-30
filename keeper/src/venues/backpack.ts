import crypto from "crypto";
import WebSocket from "ws";
import { Config } from "../config";
import {
  FundingRateInfo,
  OrderResult,
  PlaceOrderParams,
  Position,
  Venue,
  VenueAdapter,
} from "./index";
import { normalizeToHourlyDecimal, hourlyToAnnualizedPct } from "../strategy/normalize";

const BASE_URL = "https://api.backpack.exchange";
const WS_URL = "wss://ws.backpack.exchange";
const WINDOW = 5000;

// Backpack's edge occasionally drops a TCP connection mid-request; a single retry
// with a tight timeout recovers without losing the 30s poll cycle.
async function fetchWithRetry(url: string, init?: RequestInit, attempts = 3, timeoutMs = 5_000): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctl.signal });
      clearTimeout(t);
      return res;
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
  }
  throw lastErr;
}

const PERP_SYMBOLS = [
  "SOL_USDC_PERP", "BTC_USDC_PERP", "ETH_USDC_PERP",
  "HYPE_USDC_PERP", "SUI_USDC_PERP", "DOGE_USDC_PERP",
];

export class BackpackAdapter implements VenueAdapter {
  readonly venue: Venue = "backpack";

  private apiKey: string;
  private apiSecret: string;
  private ws: WebSocket | null = null;
  private fundingCallbacks = new Map<string, Set<(info: FundingRateInfo) => void>>();
  private markPriceCallbacks = new Map<string, Set<(price: number) => void>>();
  private latestFunding = new Map<string, FundingRateInfo>();

  constructor(private config: Config) {
    this.apiKey = config.BACKPACK_API_KEY;
    this.apiSecret = config.BACKPACK_API_SECRET;
  }

  async init(): Promise<void> {
    this._connectWs();
  }

  async shutdown(): Promise<void> {
    this.ws?.close();
    this.ws = null;
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; reason?: string }> {
    const t0 = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/api/v1/status`);
      const latencyMs = Date.now() - t0;
      if (!res.ok) return { ok: false, latencyMs, reason: `HTTP ${res.status}` };
      return { ok: true, latencyMs };
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - t0, reason: String(e) };
    }
  }

  async getFundingRate(asset: string): Promise<FundingRateInfo> {
    const symbol = this._toSymbol(asset);
    const res = await fetchWithRetry(`${BASE_URL}/api/v1/markPrices?symbol=${encodeURIComponent(symbol)}`);
    if (!res.ok) throw new Error(`Backpack getFundingRate failed: ${res.status}`);
    const rows = (await res.json()) as Array<{
      fundingRate: string;
      indexPrice: string;
      markPrice: string;
      nextFundingTimestamp: number;
      symbol: string;
    }>;
    const data = rows[0];
    if (!data) throw new Error(`Backpack getFundingRate: no data for ${symbol}`);

    // Backpack funding rate is 1h_decimal (hourly settlement)
    const hourlyRate = normalizeToHourlyDecimal(parseFloat(data.fundingRate), "hourly_decimal");
    const info: FundingRateInfo = {
      venue: "backpack",
      asset,
      hourlyRate,
      annualizedPct: hourlyToAnnualizedPct(hourlyRate),
      nextFundingTimestamp: Math.floor(data.nextFundingTimestamp / 1000),
      markPrice: parseFloat(data.markPrice),
      indexPrice: parseFloat(data.indexPrice),
      lastUpdated: Date.now(),
    };
    this.latestFunding.set(asset, info);
    return info;
  }

  async getMarkPrice(asset: string): Promise<number> {
    const info = await this.getFundingRate(asset);
    return info.markPrice;
  }

  async getPositions(): Promise<Position[]> {
    const res = await this._signedGet("/api/v1/position", "positionQuery");
    if (!res.ok) throw new Error(`Backpack getPositions failed: ${res.status}`);
    const data = (await res.json()) as Array<{
      symbol: string;
      side: string;
      quantity: string;
      notionalValue: string;
      entryPrice: string;
      unrealizedPnl: string;
      marginRatio: string;
    }>;

    return data
      .filter((p) => p.symbol.includes("PERP"))
      .map((p) => ({
        venue: "backpack" as Venue,
        asset: this._fromSymbol(p.symbol),
        side: p.side === "Long" ? "long" : "short",
        size: parseFloat(p.quantity),
        notionalUsd: parseFloat(p.notionalValue),
        entryPrice: parseFloat(p.entryPrice),
        unrealizedPnl: parseFloat(p.unrealizedPnl),
        marginRatio: parseFloat(p.marginRatio),
      }));
  }

  async getCollateralBalance(): Promise<number> {
    const res = await this._signedGet("/api/v1/capital", "balanceQuery");
    if (!res.ok) throw new Error(`Backpack getCollateralBalance failed: ${res.status}`);
    const data = (await res.json()) as Array<{ symbol: string; available: string }>;
    const usdc = data.find((b) => b.symbol === "USDC");
    return usdc ? parseFloat(usdc.available) : 0;
  }

  subscribeFunding(asset: string, cb: (info: FundingRateInfo) => void): () => void {
    if (!this.fundingCallbacks.has(asset)) this.fundingCallbacks.set(asset, new Set());
    this.fundingCallbacks.get(asset)!.add(cb);
    const latest = this.latestFunding.get(asset);
    if (latest) cb(latest);
    return () => this.fundingCallbacks.get(asset)?.delete(cb);
  }

  subscribeMarkPrice(asset: string, cb: (price: number) => void): () => void {
    if (!this.markPriceCallbacks.has(asset)) this.markPriceCallbacks.set(asset, new Set());
    this.markPriceCallbacks.get(asset)!.add(cb);
    return () => this.markPriceCallbacks.get(asset)?.delete(cb);
  }

  async placeOrder(params: PlaceOrderParams): Promise<OrderResult> {
    const bodyParams: Record<string, string> = {
      orderType: params.type === "market" ? "Market" : "Limit",
      quantity: String(params.sizeUsd),
      side: params.side === "long" ? "Bid" : "Ask",
      symbol: this._toSymbol(params.asset),
    };
    if (params.limitPrice != null) bodyParams["price"] = String(params.limitPrice);
    if (params.reduceOnly) bodyParams["reduceOnly"] = "true";

    const res = await this._signedPost("/api/v1/order", bodyParams, "orderExecute");
    if (!res.ok) throw new Error(`Backpack placeOrder failed: ${res.status} ${await res.text()}`);
    const data = (await res.json()) as {
      id: string;
      executedQuantity: string;
      executedQuoteQuantity: string;
      fee: string;
      status: string;
    };

    const filledSize = parseFloat(data.executedQuantity ?? "0");
    const filledQuote = parseFloat(data.executedQuoteQuantity ?? "0");
    return {
      orderId: data.id,
      filledSize,
      filledPrice: filledSize > 0 ? filledQuote / filledSize : 0,
      feeUsd: parseFloat(data.fee ?? "0"),
      status: data.status === "Filled" ? "filled" : data.status === "PartiallyFilled" ? "partial" : "failed",
    };
  }

  async closePosition(asset: string): Promise<OrderResult> {
    return this.placeOrder({ asset, side: "short", sizeUsd: 0, type: "market", reduceOnly: true });
  }

  // ── private helpers ──────────────────────────────────────────────────────

  private _toSymbol(asset: string): string {
    // "SOL-PERP" → "SOL_USDC_PERP"
    return asset.replace("-PERP", "_USDC_PERP");
  }

  private _fromSymbol(symbol: string): string {
    // "SOL_USDC_PERP" → "SOL-PERP"
    return symbol.replace("_USDC_PERP", "-PERP");
  }

  /** Sign with ED25519. Message = "instruction=<name>&<sorted_params>&timestamp=<ts>&window=<window>" */
  private _sign(message: string): string {
    const seed = Buffer.from(this.apiSecret, "base64");
    // PKCS8 DER wrapper for Ed25519 (RFC 8410)
    const der = Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed,
    ]);
    const privateKey = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    const sig = crypto.sign(null, Buffer.from(message, "utf8"), privateKey);
    return sig.toString("base64");
  }

  private async _signedGet(path: string, instruction: string, queryParams: Record<string, string> = {}): Promise<Response> {
    const timestamp = Date.now();
    const sorted = Object.entries(queryParams).sort(([a], [b]) => a.localeCompare(b));
    const paramStr = sorted.length > 0 ? sorted.map(([k, v]) => `${k}=${v}`).join("&") + "&" : "";
    const message = `instruction=${instruction}&${paramStr}timestamp=${timestamp}&window=${WINDOW}`;
    const sig = this._sign(message);

    const url = sorted.length > 0
      ? `${BASE_URL}${path}?${sorted.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&")}`
      : `${BASE_URL}${path}`;

    return fetch(url, {
      headers: {
        "X-API-Key": this.apiKey,
        "X-Timestamp": String(timestamp),
        "X-Window": String(WINDOW),
        "X-Signature": sig,
      },
    });
  }

  private async _signedPost(path: string, bodyParams: Record<string, string>, instruction: string): Promise<Response> {
    const timestamp = Date.now();
    const sorted = Object.entries(bodyParams).sort(([a], [b]) => a.localeCompare(b));
    const paramStr = sorted.map(([k, v]) => `${k}=${v}`).join("&");
    const message = `instruction=${instruction}&${paramStr}&timestamp=${timestamp}&window=${WINDOW}`;
    const sig = this._sign(message);

    return fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
        "X-Timestamp": String(timestamp),
        "X-Window": String(WINDOW),
        "X-Signature": sig,
      },
      body: JSON.stringify(Object.fromEntries(sorted)),
    });
  }

  private _connectWs(): void {
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.on("open", () => {
      const params = PERP_SYMBOLS.flatMap((s) => [`markPrice.${s}`, `fundingRate.${s}`]);
      ws.send(JSON.stringify({ method: "SUBSCRIBE", params }));
    });

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
        this._handleWsMessage(msg);
      } catch {
        // ignore malformed frames
      }
    });

    ws.on("close", () => {
      setTimeout(() => this._connectWs(), 5000);
    });

    ws.on("error", () => {
      ws.close();
    });
  }

  private _handleWsMessage(msg: Record<string, unknown>): void {
    const stream = msg["stream"] as string | undefined;
    const data = msg["data"] as Record<string, unknown> | undefined;
    if (!stream || !data) return;

    if (stream.startsWith("markPrice.")) {
      const price = parseFloat(data["markPrice"] as string);
      const asset = this._fromSymbol(stream.replace("markPrice.", ""));
      for (const cb of this.markPriceCallbacks.get(asset) ?? []) cb(price);
    }

    if (stream.startsWith("fundingRate.")) {
      const asset = this._fromSymbol(stream.replace("fundingRate.", ""));
      const hourlyRate = normalizeToHourlyDecimal(
        parseFloat(data["fundingRate"] as string),
        "hourly_decimal",
      );
      const info: FundingRateInfo = {
        venue: "backpack",
        asset,
        hourlyRate,
        annualizedPct: hourlyToAnnualizedPct(hourlyRate),
        nextFundingTimestamp: (data["nextFundingTime"] as number) ?? 0,
        markPrice: parseFloat((data["markPrice"] as string) ?? "0"),
        indexPrice: parseFloat((data["indexPrice"] as string) ?? "0"),
        lastUpdated: Date.now(),
      };
      this.latestFunding.set(asset, info);
      for (const cb of this.fundingCallbacks.get(asset) ?? []) cb(info);
    }
  }
}
