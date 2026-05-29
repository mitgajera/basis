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
    res.setHeader("Cache-Control", "public, max-age=5");
    res.json(logger.getTrades(limit, since));
  });

  // On-chain devnet settlement state — backed NAV, last NAV tx, minted yield
  app.get("/api/settlement", async (_req, res) => {
    try {
      const settlement = await vault.getSettlement();
      res.setHeader("Cache-Control", "public, max-age=10");
      res.json(settlement);
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
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

      // Annualize by ACTUAL elapsed time between the window's first and last point.
      // Require a minimum window (≥1h) so tiny samples don't produce absurd APRs,
      // and cap the result so a transient blip can't display nonsense.
      const MIN_WINDOW_MS = 15 * 60_000;     // need ≥15m of data
      const APR_CAP = 100;                    // clamp display to ±100%
      const computeApr = (windowMs: number): number | null => {
        const cutoff = Date.now() - windowMs;
        const pts = navHistory.filter((p) => p.timestamp >= cutoff && p.navPerShare > 0);
        if (pts.length < 2) return null;
        const first = pts[0]!, last = pts[pts.length - 1]!;
        const elapsedMs = last.timestamp - first.timestamp;
        if (elapsedMs < MIN_WINDOW_MS) return null;
        const growth = last.navPerShare / first.navPerShare - 1;
        const apr = (growth / elapsedMs) * (365 * 24 * 3600_000) * 100;
        return Math.max(-APR_CAP, Math.min(APR_CAP, apr));
      };

      const apr24h = computeApr(24 * 3600_000);
      const apr7d = computeApr(7 * 24 * 3600_000);

      const spreads = logger.getSpreads(0);
      const totalTrades = getPositions().length;

      res.setHeader("Cache-Control", "public, max-age=15");
      res.json({
        tvl: snapshot.tvl,
        apr24h: apr24h != null ? parseFloat(apr24h.toFixed(2)) : null,
        apr7d: apr7d != null ? parseFloat(apr7d.toFixed(2)) : null,
        uptimePct: 100,
        totalTrades,
        spreadOpportunities: spreads.length,
        winRate: 0,
      });
    } catch {
      res.json({ tvl: 0, apr24h: null, apr7d: null, uptimePct: 100, totalTrades: 0, winRate: 0 });
    }
  });

  return app;
}
