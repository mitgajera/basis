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
const ASSET_SYMBOL = "SOL_USDC_PERP";

export class BackpackAdapter implements VenueAdapter {
  readonly venue: Venue = "backpack";

  private apiKey: string;
  private apiSecret: string;
  private ws: WebSocket | null = null;
  private fundingCallbacks = new Map<string, Set<(info: FundingRateInfo) => void>>();
  private markPriceCallbacks = new Map<string, Set<(price: number) => void>>();
  private latestFunding = new Map<string, FundingRateInfo>();
  private initTime = 0;

  constructor(private config: Config) {
    this.apiKey = config.BACKPACK_API_KEY;
    this.apiSecret = config.BACKPACK_API_SECRET;
  }

  async init(): Promise<void> {
    this.initTime = Date.now();
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
    // markPrices returns funding rate, mark/index price, and next funding timestamp in one call
    const res = await fetch(`${BASE_URL}/api/v1/markPrices?symbol=${symbol}`);
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

    // Backpack funding rate is in 8h_decimal format (three periods per day)
    const hourlyRate = normalizeToHourlyDecimal(parseFloat(data.fundingRate), "8h_decimal");
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
    const res = await this._signedGet("/api/v1/position");
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
    const res = await this._signedGet("/api/v1/capital");
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
    const body = {
      symbol: this._toSymbol(params.asset),
      side: params.side === "long" ? "Bid" : "Ask",
      orderType: params.type === "market" ? "Market" : "Limit",
      quantity: String(params.sizeUsd),
      price: params.limitPrice != null ? String(params.limitPrice) : undefined,
      reduceOnly: params.reduceOnly ?? false,
    };

    const res = await this._signedPost("/api/v1/order", body);
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
    return this.placeOrder({
      asset,
      side: "short",
      sizeUsd: 0,
      type: "market",
      reduceOnly: true,
    });
  }

  // ── private helpers ──────────────────────────────────────────────────────

  private _toSymbol(asset: string): string {
    if (asset === "SOL-PERP") return ASSET_SYMBOL;
    return asset.replace("-", "_");
  }

  private _fromSymbol(symbol: string): string {
    return symbol.replace(/_USDC/, "-").replace(/_PERP/, "-PERP");
  }

  private _sign(method: string, path: string, timestamp: number, body: string): string {
    const message = `${method}\n${path}\n${timestamp}\n${body}`;
    return crypto.createHmac("sha256", this.apiSecret).update(message).digest("base64");
  }

  private async _signedGet(path: string): Promise<Response> {
    const timestamp = Date.now();
    const sig = this._sign("GET", path, timestamp, "");
    return fetch(`${BASE_URL}${path}`, {
      headers: {
        "X-API-Key": this.apiKey,
        "X-Timestamp": String(timestamp),
        "X-Signature": sig,
      },
    });
  }

  private async _signedPost(path: string, body: unknown): Promise<Response> {
    const timestamp = Date.now();
    const bodyStr = JSON.stringify(body);
    const sig = this._sign("POST", path, timestamp, bodyStr);
    return fetch(`${BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
        "X-Timestamp": String(timestamp),
        "X-Signature": sig,
      },
      body: bodyStr,
    });
  }

  private _connectWs(): void {
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.on("open", () => {
      ws.send(JSON.stringify({
        method: "SUBSCRIBE",
        params: [`markPrice.${ASSET_SYMBOL}`, `fundingRate.${ASSET_SYMBOL}`],
      }));
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
      // reconnect after 5s
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
      const asset = "SOL-PERP";
      for (const cb of this.markPriceCallbacks.get(asset) ?? []) cb(price);
    }

    if (stream.startsWith("fundingRate.")) {
      const asset = "SOL-PERP";
      const hourlyRate = normalizeToHourlyDecimal(
        parseFloat(data["fundingRate"] as string),
        "8h_decimal",
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
