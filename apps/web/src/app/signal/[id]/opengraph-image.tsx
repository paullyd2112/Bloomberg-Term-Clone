import { ImageResponse } from "next/og";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const alt = "Plebs.finance Signal";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const DIRECTION_COLOR: Record<string, string> = {
  BUY:  "#4ade80",
  YES:  "#4ade80",
  SELL: "#f87171",
  NO:   "#f87171",
  HOLD: "#facc15",
};

export default async function OGImage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data } = await supabase
    .from("signals")
    .select("direction, identifier, confidence")
    .eq("id", params.id)
    .single();

  const direction  = data?.direction ?? "HOLD";
  const identifier = data?.identifier ?? "---";
  const confidence = data?.confidence ?? 0;
  const dirColor   = DIRECTION_COLOR[direction] ?? DIRECTION_COLOR.HOLD;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#09090b",
          fontFamily: "sans-serif",
        }}
      >
        {/* Branding */}
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "0.05em",
            color: "#a1a1aa",
            marginBottom: 48,
            display: "flex",
          }}
        >
          <span>PLEBS</span>
          <span style={{ color: "#4ade80" }}>.FINANCE</span>
        </div>

        {/* Direction badge */}
        <div
          style={{
            fontSize: 64,
            fontWeight: 800,
            color: dirColor,
            letterSpacing: "0.04em",
            marginBottom: 16,
            display: "flex",
          }}
        >
          {direction}
        </div>

        {/* Ticker */}
        <div
          style={{
            fontSize: 48,
            fontWeight: 700,
            color: "#ffffff",
            marginBottom: 32,
            display: "flex",
          }}
        >
          {identifier}
        </div>

        {/* Confidence */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
          }}
        >
          {/* Bar background */}
          <div
            style={{
              width: 320,
              height: 16,
              borderRadius: 8,
              backgroundColor: "#27272a",
              display: "flex",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                width: `${confidence}%`,
                height: "100%",
                borderRadius: 8,
                backgroundColor:
                  confidence >= 75 ? "#22c55e" : confidence >= 50 ? "#f59e0b" : "#71717a",
              }}
            />
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 600,
              color: "#d4d4d8",
              display: "flex",
            }}
          >
            {confidence}%
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
