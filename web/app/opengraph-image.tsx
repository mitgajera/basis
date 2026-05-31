import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "basis. — delta-neutral funding-rate yield on Solana";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OG() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 88px",
          background:
            "radial-gradient(900px 600px at 30% 0%, rgba(52,211,153,0.14), transparent 70%), #0B0B0C",
          color: "#F2F2F4",
          fontFamily: "Inter, system-ui, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <svg width="44" height="44" viewBox="0 0 32 32" fill="none">
            <path
              d="M16 7L24 23H8L16 7Z"
              stroke="#34D399"
              strokeWidth="2"
              strokeLinejoin="round"
              fill="#34D399"
              fillOpacity="0.18"
            />
            <circle cx="16" cy="23" r="1.6" fill="#34D399" />
          </svg>
          <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: "-0.04em", display: "flex" }}>
            basis
            <span style={{ color: "#34D399" }}>.</span>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              fontSize: 84,
              fontWeight: 600,
              lineHeight: 1.02,
              letterSpacing: "-0.04em",
              maxWidth: 960,
              display: "flex",
              flexDirection: "column",
            }}
          >
            <span>Delta-neutral funding-</span>
            <span>
              rate yield on{" "}
              <span style={{ color: "#34D399" }}>Solana</span>.
            </span>
          </div>
          <div
            style={{
              fontSize: 22,
              color: "#9A9AA8",
              letterSpacing: "-0.01em",
              maxWidth: 880,
            }}
          >
            Cross-venue spreads · Backpack · Hyperliquid · Phoenix · Pacifica
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 16,
            color: "#63636E",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          <span>devnet · open beta</span>
          <span>basis.app</span>
        </div>
      </div>
    ),
    { ...size }
  );
}
