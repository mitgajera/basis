import express from "express";
import cors from "cors";
import { FundingRegistry } from "../registry/funding-registry";
import { Logger } from "../logger/sqlite";
import { VaultClient } from "../vault/vault-client";

export function createApi(
  registry: FundingRegistry,
  logger: Logger,
  vault: VaultClient,
  dashboardOrigin: string,
): express.Application {
  const app = express();

  app.use(cors({ origin: dashboardOrigin }));
  app.use(express.json());

  app.get("/api/funding-rates", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=5");
    res.json(registry.snapshot());
  });

  app.get("/api/spreads", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=5");
    res.json(registry.pairwiseSpreads("SOL-PERP"));
  });

  app.get("/api/positions", (_req, res) => {
    // Positions are stored in-process; the main loop exposes them via a shared ref
    // Phase 3 will wire this up from the executor state
    res.setHeader("Cache-Control", "public, max-age=5");
    res.json([]);
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
    res.json({ fundingRates: fundingRates.filter((r) => r.lastUpdated <= to), spreads: spreads.filter((s) => s.computedAt <= to) });
  });

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, uptime: process.uptime(), venues: {} });
  });

  app.get("/api/stats", async (_req, res) => {
    try {
      const snapshot = await vault.getSnapshot();
      res.setHeader("Cache-Control", "public, max-age=30");
      res.json({
        tvl: snapshot.tvl,
        apr24h: 0,
        apr7d: 0,
        uptimePct: 100,
        totalTrades: 0,
        winRate: 0,
      });
    } catch {
      res.json({ tvl: 0, apr24h: 0, apr7d: 0, uptimePct: 100, totalTrades: 0, winRate: 0 });
    }
  });

  return app;
}
