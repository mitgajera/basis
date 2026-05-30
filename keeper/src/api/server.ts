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
    const lookback = parseInt(
      (req.query["lookback"] as string) ?? String(24 * 3600_000),
      10,
    );
    const since = Date.now() - lookback;
    const limit = Math.min(Math.max(parseInt((req.query["limit"] as string) ?? "25", 10), 1), 100);
    const offset = Math.max(parseInt((req.query["offset"] as string) ?? "0", 10), 0);
    const { trades, total } = logger.getTradesPage(since, limit, offset);
    res.setHeader("Cache-Control", "public, max-age=5");
    res.json({ trades, total, limit, offset, lookback });
  });

  app.get("/api/pnl-history", (req, res) => {
    const lookback = parseInt((req.query["lookback"] as string) ?? String(24 * 3600_000), 10);
    const points = logger.getPnlHistory(lookback);
    const unrealized = getPositions().reduce((s, p) => s + p.unrealizedPnl, 0);
    const now = Date.now();
    const realized = points.length > 0 ? points[points.length - 1]!.value : 0;
    const lastTs = points.length > 0 ? points[points.length - 1]!.timestamp : now - lookback;

    if (now - lastTs > 5_000 || points.length === 0) {
      points.push({ timestamp: now, value: realized + unrealized });
    } else {
      points[points.length - 1] = { timestamp: now, value: realized + unrealized };
    }

    res.setHeader("Cache-Control", "no-store");
    res.json({ points, realized, unrealized, total: realized + unrealized });
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

  // Devnet faucet — mints 50 test USDC, rate-limited to one mint per 2 hours per wallet
  const FAUCET_COOLDOWN_MS = 2 * 60 * 60_000;

  // GET — returns cooldown state for a wallet (used by the UI to render the button)
  app.get("/api/faucet/status", (req, res) => {
    const address = (req.query["address"] as string | undefined)?.trim();
    if (!address) { res.status(400).json({ error: "address required" }); return; }
    const last = logger.getFaucetLastMint(address);
    const now = Date.now();
    const elapsed = last == null ? Infinity : now - last;
    const remainingMs = Math.max(0, FAUCET_COOLDOWN_MS - elapsed);
    res.setHeader("Cache-Control", "no-store");
    res.json({
      address,
      cooldownMs: FAUCET_COOLDOWN_MS,
      lastMintMs: last,
      remainingMs,
      ready: remainingMs === 0,
    });
  });

  app.post("/api/faucet", async (req, res) => {
    if (!keeperConfig?.keeperKey || !keeperConfig.usdcMint || !keeperConfig.rpcUrl) {
      res.status(503).json({ error: "Faucet not configured" });
      return;
    }
    const { address } = req.body as { address?: string };
    if (!address) { res.status(400).json({ error: "address required" }); return; }

    // Cooldown check (2h per wallet)
    const last = logger.getFaucetLastMint(address);
    if (last != null) {
      const elapsed = Date.now() - last;
      if (elapsed < FAUCET_COOLDOWN_MS) {
        const remainingMs = FAUCET_COOLDOWN_MS - elapsed;
        res.status(429).json({
          error: "cooldown",
          remainingMs,
          cooldownMs: FAUCET_COOLDOWN_MS,
          message: `Faucet on cooldown. Try again in ${Math.ceil(remainingMs / 60_000)} min.`,
        });
        return;
      }
    }

    try {
      const connection = new Connection(keeperConfig.rpcUrl, "confirmed");
      const kp = Keypair.fromSeed(Buffer.from(keeperConfig.keeperKey, "base64").slice(0, 32));
      const mint = new PublicKey(keeperConfig.usdcMint);
      const recipient = new PublicKey(address);

      const ata = await getOrCreateAssociatedTokenAccount(connection, kp, mint, recipient);
      const sig = await mintTo(connection, kp, mint, ata.address, kp, 50 * 1_000_000);

      // Record the mint AFTER it succeeds, so failed mints don't burn the cooldown
      logger.recordFaucetMint(address);

      res.json({ ok: true, sig, amount: 50, cooldownMs: FAUCET_COOLDOWN_MS });
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

      // Annualize NAV growth, but dampen short windows: divide by at least
      // ANNUALIZE_FLOOR_MS so a 2-minute sample isn't multiplied ~260,000× into
      // nonsense. Early on the figure is conservative; it converges to the true
      // APR as real elapsed time exceeds the floor. Capped for safety.
      const ANNUALIZE_FLOOR_MS = 60 * 60_000; // treat windows shorter than 1h as 1h
      const YEAR_MS = 365 * 24 * 3600_000;
      const APR_CAP = 50;                      // clamp display to ±50%
      const computeApr = (windowMs: number): number | null => {
        const cutoff = Date.now() - windowMs;
        const pts = navHistory.filter((p) => p.timestamp >= cutoff && p.navPerShare >= 0.5);
        if (pts.length < 2) return null;
        const first = pts[0]!, last = pts[pts.length - 1]!;
        const elapsedMs = last.timestamp - first.timestamp;
        if (elapsedMs <= 0) return null;
        const growth = last.navPerShare / first.navPerShare - 1;
        const apr = (growth / Math.max(elapsedMs, ANNUALIZE_FLOOR_MS)) * YEAR_MS * 100;
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
