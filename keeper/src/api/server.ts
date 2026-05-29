import express from "express";
import cors from "cors";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { getOrCreateAssociatedTokenAccount, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { FundingRegistry } from "../registry/funding-registry";
import { Logger } from "../logger/sqlite";
import { VaultClient } from "../vault/vault-client";
import type { SimulatedPosition } from "../executor/simulated-executor";

export function createApi(
  registry: FundingRegistry,
  logger: Logger,
  vault: VaultClient,
  dashboardOrigin: string,
  getPositions: () => SimulatedPosition[] = () => [],
  keeperConfig?: { rpcUrl: string; keeperKey: string; usdcMint: string },
): express.Application {
  const app = express();

  app.use(cors({ origin: dashboardOrigin }));
  app.use(express.json());

  app.get("/api/funding-rates", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=5");
    res.json(registry.snapshot());
  });

  app.get("/api/spreads", (req, res) => {
    const asset = (req.query["asset"] as string) ?? "SOL-PERP";
    res.setHeader("Cache-Control", "public, max-age=5");
    res.json(registry.pairwiseSpreads(asset));
  });

  app.get("/api/funding-rate-history", (req, res) => {
    const lookback = parseInt((req.query["lookback"] as string) ?? String(30 * 60_000), 10);
    const since = Date.now() - lookback;
    res.setHeader("Cache-Control", "public, max-age=10");
    res.json(logger.getFundingRates(since));
  });

  app.get("/api/spread-history", (req, res) => {
    const lookback = parseInt((req.query["lookback"] as string) ?? String(24 * 3600_000), 10);
    const asset = (req.query["asset"] as string) ?? undefined;
    const since = Date.now() - lookback;
    const spreads = logger.getSpreads(since);
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json(asset ? spreads.filter((s) => s.asset === asset) : spreads);
  });

  app.get("/api/positions", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(getPositions());
  });

  app.get("/api/nav", async (_req, res) => {
    try {
      const snapshot = await vault.getSnapshot();
      const history = logger.getNavHistory(7 * 24 * 60 * 60 * 1000);
      res.setHeader("Cache-Control", "public, max-age=30");
      res.json({ snapshot, history });
    } catch {
      res.json({ snapshot: { tvl: 0, totalShares: 0, navPerShare: 1, lastUpdated: Date.now() }, history: [] });
    }
  });

  app.get("/api/trades", (req, res) => {
    const since = parseInt((req.query["since"] as string) ?? "0", 10);
    const limit = Math.min(parseInt((req.query["limit"] as string) ?? "20", 10), 100);
    // Phase 3: query trades table; for now return empty
    res.setHeader("Cache-Control", "public, max-age=10");
    res.json([]);
  });

  app.get("/api/replay", (req, res) => {
    const from = parseInt((req.query["from"] as string) ?? "0", 10);
    const to = parseInt((req.query["to"] as string) ?? String(Date.now()), 10);
    const fundingRates = logger.getFundingRates(from);
    const spreads = logger.getSpreads(from);
    res.setHeader("Cache-Control", "public, max-age=30");
    res.json({
      fundingRates: fundingRates.filter((r) => r.lastUpdated <= to),
      spreads: spreads.filter((s) => s.computedAt <= to),
      trades: [],
    });
  });

  // Devnet faucet — mints test USDC to the requesting wallet (50 USDC per call)
  app.post("/api/faucet", async (req, res) => {
    if (!keeperConfig?.keeperKey || !keeperConfig.usdcMint || !keeperConfig.rpcUrl) {
      res.status(503).json({ error: "Faucet not configured" });
      return;
    }
    const { address } = req.body as { address?: string };
    if (!address) { res.status(400).json({ error: "address required" }); return; }

    try {
      const connection = new Connection(keeperConfig.rpcUrl, "confirmed");
      const kp = Keypair.fromSeed(Buffer.from(keeperConfig.keeperKey, "base64").slice(0, 32));
      const mint = new PublicKey(keeperConfig.usdcMint);
      const recipient = new PublicKey(address);

      const ata = await getOrCreateAssociatedTokenAccount(connection, kp, mint, recipient);
      const sig = await mintTo(
        connection,
        kp,
        mint,
        ata.address,
        kp,
        50 * 1_000_000, // 50 USDC
      );
      res.json({ ok: true, sig, amount: 50 });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, uptime: process.uptime(), venues: {} });
  });

  app.get("/api/stats", async (_req, res) => {
    try {
      const snapshot = await vault.getSnapshot();
      const navHistory = logger.getNavHistory(7 * 24 * 3600_000);

      // Compute APR from NAV history
      const currentNav = navHistory.at(-1)?.navPerShare ?? 1;
      const nav24hAgo = navHistory.find((p) => p.timestamp >= Date.now() - 24 * 3600_000)?.navPerShare;
      const nav7dAgo = navHistory[0]?.navPerShare;
      const apr24h = nav24hAgo != null && nav24hAgo > 0
        ? ((currentNav / nav24hAgo - 1) * 365 * 100)
        : 0;
      const apr7d = nav7dAgo != null && nav7dAgo > 0 && navHistory.length > 1
        ? ((currentNav / nav7dAgo - 1) * 52 * 100)
        : 0;

      // Count total spread opportunities logged as proxy for trade activity
      const spreads = logger.getSpreads(0);
      const totalTrades = getPositions().length;

      res.setHeader("Cache-Control", "public, max-age=15");
      res.json({
        tvl: snapshot.tvl,
        apr24h: parseFloat(apr24h.toFixed(2)),
        apr7d: parseFloat(apr7d.toFixed(2)),
        uptimePct: 100,
        totalTrades,
        spreadOpportunities: spreads.length,
        winRate: 0,
      });
    } catch {
      res.json({ tvl: 0, apr24h: 0, apr7d: 0, uptimePct: 100, totalTrades: 0, winRate: 0 });
    }
  });

  return app;
}
