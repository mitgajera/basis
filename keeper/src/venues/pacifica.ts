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
import { hourlyToAnnualizedPct } from "../strategy/normalize";

// Official Pacifica endpoints (from Python SDK constants.py)
const REST_URL = "https://api.pacifica.fi/api/v1";
const WS_URL = "wss://ws.pacifica.fi/ws";

// Pacifica market data is ONLY available via WebSocket (REST market endpoints return 404).
// The "prices" channel delivers per-market ticker updates every ~5 seconds.

export class PacificaAdapter implements VenueAdapter {
  readonly venue: Venue = "pacifica";

  private ws: WebSocket | null = null;
  private latestFunding = new Map<string, FundingRateInfo>();
  private fundingCallbacks = new Map<string, Set<(info: FundingRateInfo) => void>>();
  private markPriceCallbacks = new Map<string, Set<(price: number) => void>>();
  private readyPromise: Promise<void>;
  private readyResolve!: () => void;
  private wsConnected = false;

  constructor(private config: Config) {
    this.readyPromise = new Promise((resolve) => {
      this.readyResolve = resolve;
    });
  }

  async init(): Promise<void> {
    this._connectWs();
    // Wait up to 10s for first WS message; proceed anyway so the process doesn't stall
    await Promise.race([
      this.readyPromise,
      new Promise<void>((resolve) => setTimeout(resolve, 10_000)),
    ]);
  }

  async shutdown(): Promise<void> {
    this.ws?.close();
    this.ws = null;
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; reason?: string }> {
    const t0 = Date.now();
    try {
      // loan_pool is one of the few confirmed-working REST endpoints
      const res = await fetch(`${REST_URL}/loan_pool`);
      const latencyMs = Date.now() - t0;
      if (!res.ok) return { ok: false, latencyMs, reason: `HTTP ${res.status}` };
      return { ok: this.wsConnected, latencyMs, reason: this.wsConnected ? undefined : "WS not connected" };
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - t0, reason: String(e) };
    }
  }

  async getFundingRate(asset: string): Promise<FundingRateInfo> {
    const cached = this.latestFunding.get(asset);
    if (cached) return cached;
    // Wait up to 10s for WS data to arrive
    await Promise.race([
      new Promise<void>((resolve) => {
        const unsub = this.subscribeFunding(asset, () => {
          unsub();
          resolve();
        });
      }),
      new Promise<void>((_, reject) => setTimeout(() => reject(new Error("Pacifica: timeout waiting for funding data")), 10_000)),
    ]);
    const info = this.latestFunding.get(asset);
    if (!info) throw new Error(`Pacifica getFundingRate: no data for ${asset}`);
    return info;
  }

  async getMarkPrice(asset: string): Promise<number> {
    const info = await this.getFundingRate(asset);
    return info.markPrice;
  }

  async getPositions(): Promise<Position[]> {
    const pubKey = this.config.PACIFICA_ACCOUNT_PUBLIC_KEY;
    if (!pubKey) return [];
    try {
      const res = await fetch(`${REST_URL}/positions?account=${pubKey}`);
      if (!res.ok) return [];
      const body = (await res.json()) as { success: boolean; data?: Array<{
        market: string;
        side: string;
        size: string;
        notional: string;
        entry_price: string;
        unrealized_pnl: string;
        margin_ratio: string;
      }> };
      if (!body.success || !body.data) return [];
      return body.data.map((p) => ({
        venue: "pacifica" as Venue,
        asset: this._fromMarket(p.market),
        side: p.side?.toLowerCase() === "long" ? "long" : "short",
        size: parseFloat(p.size ?? "0"),
        notionalUsd: parseFloat(p.notional ?? "0"),
        entryPrice: parseFloat(p.entry_price ?? "0"),
        unrealizedPnl: parseFloat(p.unrealized_pnl ?? "0"),
        marginRatio: parseFloat(p.margin_ratio ?? "0"),
      }));
    } catch {
      return [];
    }
  }

  async getCollateralBalance(): Promise<number> {
    const pubKey = this.config.PACIFICA_ACCOUNT_PUBLIC_KEY;
    if (!pubKey) return 0;
    try {
      const res = await fetch(`${REST_URL}/account/balance/USDC?account=${pubKey}`);
      if (!res.ok) return 0;
      const body = (await res.json()) as { success: boolean; data?: { available: string } };
      return body.success && body.data ? parseFloat(body.data.available) : 0;
    } catch {
      return 0;
    }
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
    if (!this.config.KEEPER_PRIVATE_KEY) {
      throw new Error("Pacifica placeOrder: KEEPER_PRIVATE_KEY not set");
    }
    const operation = "create_market_order";
    const data = {
      market: this._toMarket(params.asset),
      side: params.side === "long" ? "buy" : "sell",
      size: String(params.sizeUsd),
      order_type: "market",
    };
    const signedReq = this._buildSignedRequest(operation, data);
    const res = await fetch(`${REST_URL}/orders/create_market`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signedReq),
    });
    if (!res.ok) throw new Error(`Pacifica placeOrder failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { success: boolean; data?: { order_id: string; filled_size: string; avg_price: string; fee: string; status: string } };
    const ord = body.data!;
    return {
      orderId: ord.order_id,
      filledSize: parseFloat(ord.filled_size ?? "0"),
      filledPrice: parseFloat(ord.avg_price ?? "0"),
      feeUsd: parseFloat(ord.fee ?? "0"),
      status: ord.status === "filled" ? "filled" : ord.status === "partial" ? "partial" : "failed",
    };
  }

  async closePosition(asset: string): Promise<OrderResult> {
    return this.placeOrder({ asset, side: "short", sizeUsd: 0, type: "market", reduceOnly: true });
  }

  // ── private helpers ──────────────────────────────────────────────────────

  // Pacifica uses bare asset symbol ("SOL") not "SOL-PERP"
  private _toMarket(asset: string): string {
    return asset.replace("-PERP", "");
  }

  private _fromMarket(market: string): string {
    return market.includes("-") ? market : `${market}-PERP`;
  }

  /** Build a signed request payload using the keeper's Solana ED25519 keypair */
  private _buildSignedRequest(operation: string, data: Record<string, string>): Record<string, unknown> {
    const timestamp = Date.now();
    const expiry_window = 5000;
    const signature_header = { timestamp, expiry_window, type: operation };
    const signature_payload = { ...data };

    const msgToSign = JSON.stringify(signature_header) + JSON.stringify(signature_payload);
    const seed = Buffer.from(this.config.KEEPER_PRIVATE_KEY, "base64").slice(0, 32);
    const der = Buffer.concat([
      Buffer.from("302e020100300506032b657004220420", "hex"),
      seed,
    ]);
    const privateKey = crypto.createPrivateKey({ key: der, format: "der", type: "pkcs8" });
    const sig = crypto.sign(null, Buffer.from(msgToSign, "utf8"), privateKey);

    // Derive public key from the seed using sodium or webcrypto
    const pubKey = crypto.createPublicKey(privateKey).export({ format: "der", type: "spki" }).slice(-32).toString("base64");

    return {
      account: this.config.PACIFICA_ACCOUNT_PUBLIC_KEY,
      signature: sig.toString("base64"),
      signature_header,
      signature_payload,
      public_key: pubKey,
    };
  }

  private _connectWs(): void {
    const ws = new WebSocket(WS_URL);
    this.ws = ws;

    ws.on("open", () => {
      this.wsConnected = true;
      // Python SDK format for public prices subscription
      ws.send(JSON.stringify({ method: "subscribe", params: { source: "prices" } }));
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
      this.wsConnected = false;
      setTimeout(() => this._connectWs(), 5000);
    });

    ws.on("error", () => {
      this.wsConnected = false;
      ws.close();
    });
  }

  private _handleWsMessage(msg: Record<string, unknown>): void {
    // Pacifica WS format: {"channel": "prices", "data": [{symbol, funding, mark, oracle, timestamp}, ...]}
    // funding: hourly decimal rate (can be negative)
    // mark: mark price, oracle: index/oracle price, timestamp: ms
    const channel = msg["channel"] as string | undefined;

    const processTicker = (data: Record<string, unknown>) => {
      const symbol = data["symbol"] as string | undefined;
      if (!symbol) return;
      const asset = this._fromMarket(symbol);

      const markPrice = parseFloat((data["mark"] as string) ?? "0");
      const indexPrice = parseFloat((data["oracle"] as string) ?? String(markPrice));
      const hourlyRate = parseFloat((data["funding"] as string) ?? "0");
      const timestampMs = parseFloat(String(data["timestamp"] ?? Date.now()));
      const tsSec = Math.floor(timestampMs / 1000);
      const nextFundingTimestamp = (Math.floor(tsSec / 3600) + 1) * 3600;

      if (!markPrice) return;

      const info: FundingRateInfo = {
        venue: "pacifica",
        asset,
        hourlyRate,
        annualizedPct: hourlyToAnnualizedPct(hourlyRate),
        nextFundingTimestamp,
        markPrice,
        indexPrice,
        lastUpdated: Date.now(),
      };

      this.latestFunding.set(asset, info);
      this.readyResolve();

      for (const cb of this.fundingCallbacks.get(asset) ?? []) cb(info);
      for (const cb of this.markPriceCallbacks.get(asset) ?? []) cb(markPrice);
    };

    if (channel === "prices" && Array.isArray(msg["data"])) {
      for (const item of msg["data"] as Array<Record<string, unknown>>) {
        processTicker(item);
      }
    } else if (channel === "ticker") {
      const data = msg["data"] as Record<string, unknown> | undefined;
      if (data) processTicker(data);
    }
  }
}
