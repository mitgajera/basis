import WebSocket from "ws";

// Dumps the raw Pacifica "prices" WS payload for HYPE so we can see exactly
// which funding field/sign matches the exchange UI's "Next Funding".
const WS_URL = "wss://ws.pacifica.fi/ws";

const ws = new WebSocket(WS_URL);
let printed = 0;

ws.on("open", () => {
  console.log("connected; subscribing to prices…");
  ws.send(JSON.stringify({ method: "subscribe", params: { source: "prices" } }));
});

ws.on("message", (raw) => {
  try {
    const msg = JSON.parse(raw.toString()) as Record<string, unknown>;
    if (msg["channel"] !== "prices" || !Array.isArray(msg["data"])) return;
    const hype = (msg["data"] as Array<Record<string, unknown>>).find(
      (d) => String(d["symbol"]).toUpperCase().includes("HYPE"),
    );
    if (hype) {
      console.log("HYPE raw entry:", JSON.stringify(hype, null, 2));
      if (++printed >= 2) { ws.close(); process.exit(0); }
    }
  } catch { /* ignore */ }
});

ws.on("error", (e) => { console.error("ws error", e); process.exit(1); });
setTimeout(() => { console.log("timeout — no HYPE data"); process.exit(1); }, 15_000);
