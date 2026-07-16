import { ImageResponse } from "next/og";

/**
 * Social share card for the landing page (X/Discord/iMessage link previews).
 * Pure JSX + inline flex styles per ImageResponse constraints.
 */

export const runtime = "edge";
export const alt = "Plebs: 24/7 AI crypto signals, tracked to outcome.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ROWS = [
  { dir: "BUY", sym: "BTC", name: "Bitcoin", price: "$117,842", chg: "+1.62%", up: true },
  { dir: "BUY", sym: "SOL", name: "Solana", price: "$212.40", chg: "+4.87%", up: true },
  { dir: "SELL", sym: "ETH", name: "Ethereum", price: "$3,412", chg: "-2.18%", up: false },
];

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#09090b",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* ambient glow */}
        <div
          style={{
            position: "absolute",
            top: -160,
            left: 180,
            width: 700,
            height: 420,
            borderRadius: 9999,
            background: "rgba(16,185,129,0.14)",
            filter: "blur(110px)",
            display: "flex",
          }}
        />

        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: "64px 72px",
          }}
        >
          {/* Left: brand + headline */}
          <div style={{ display: "flex", flexDirection: "column", maxWidth: 620 }}>
            <div style={{ display: "flex", alignItems: "center" }}>
              <span style={{ fontSize: 36, fontWeight: 700, color: "#ffffff" }}>Plebs</span>
              <span style={{ fontSize: 36, fontWeight: 700, color: "#34d399" }}>.</span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                marginTop: 48,
                fontSize: 62,
                fontWeight: 700,
                lineHeight: 1.08,
                letterSpacing: -2,
              }}
            >
              <span style={{ color: "#ffffff" }}>Crypto never sleeps.</span>
              <span style={{ color: "#34d399" }}>Neither does your analyst.</span>
            </div>

            <div
              style={{
                display: "flex",
                marginTop: 40,
                fontSize: 24,
                color: "#a1a1aa",
              }}
            >
              24/7 AI signals on 50+ coins, tracked to outcome.
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                marginTop: 28,
                fontSize: 19,
                color: "#52525b",
                letterSpacing: 3,
              }}
            >
              CRYPTO · POLYMARKET · CONGRESS
            </div>
          </div>

          {/* Right: mini signal feed */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              width: 350,
              borderRadius: 20,
              border: "1px solid rgba(255,255,255,0.10)",
              background: "rgba(24,24,27,0.9)",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "16px 20px",
                borderBottom: "1px solid rgba(255,255,255,0.07)",
              }}
            >
              <span style={{ fontSize: 16, color: "#71717a" }}>live signal feed</span>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "4px 10px",
                  borderRadius: 8,
                  border: "1px solid rgba(16,185,129,0.4)",
                  background: "rgba(16,185,129,0.12)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    width: 8,
                    height: 8,
                    borderRadius: 9999,
                    background: "#34d399",
                    marginRight: 7,
                  }}
                />
                <span style={{ fontSize: 13, color: "#34d399", letterSpacing: 1 }}>LIVE</span>
              </div>
            </div>

            {ROWS.map((r) => (
              <div
                key={r.sym}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "18px 20px",
                  borderBottom: "1px solid rgba(255,255,255,0.05)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center" }}>
                  <div
                    style={{
                      display: "flex",
                      padding: "4px 10px",
                      borderRadius: 6,
                      border: r.up
                        ? "1px solid rgba(16,185,129,0.5)"
                        : "1px solid rgba(244,63,94,0.5)",
                      background: r.up ? "rgba(16,185,129,0.12)" : "rgba(244,63,94,0.12)",
                      color: r.up ? "#34d399" : "#fb7185",
                      fontSize: 13,
                      fontWeight: 700,
                      marginRight: 14,
                    }}
                  >
                    {r.dir}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    <span style={{ fontSize: 19, fontWeight: 700, color: "#ffffff" }}>{r.sym}</span>
                    <span style={{ fontSize: 13, color: "#52525b" }}>{r.name}</span>
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  <span style={{ fontSize: 18, color: "#ffffff" }}>{r.price}</span>
                  <span style={{ fontSize: 13, color: r.up ? "#34d399" : "#fb7185" }}>{r.chg}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
