import type Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@/lib/supabase/server";

export const PLEBY_TOOLS: Anthropic.Tool[] = [
  {
    name: "get_asset_overview",
    description:
      "Get the latest price, 24h change, and volume for an asset. Use this as your first call when the user asks about any specific stock, crypto, or prediction market.",
    input_schema: {
      type: "object",
      properties: {
        identifier: {
          type: "string",
          description: "Ticker symbol or contract identifier (e.g. 'NVDA', 'BTC', 'BTC>100k')",
        },
        asset_type: {
          type: "string",
          enum: ["stock", "crypto", "prediction"],
          description: "Type of asset",
        },
      },
      required: ["identifier", "asset_type"],
    },
  },
  {
    name: "get_recent_signals",
    description:
      "Get the most recent AI-generated trading signals for an asset, including direction, confidence, reasoning, and outcomes.",
    input_schema: {
      type: "object",
      properties: {
        identifier: { type: "string" },
        limit: { type: "integer", description: "Max signals to return (default 5)" },
      },
      required: ["identifier"],
    },
  },
  {
    name: "get_signal_accuracy",
    description:
      "Get historical signal accuracy stats for an asset — total signals, win rate, average confidence.",
    input_schema: {
      type: "object",
      properties: {
        identifier: { type: "string" },
        asset_type: { type: "string", enum: ["stock", "crypto", "prediction"] },
      },
      required: ["identifier", "asset_type"],
    },
  },
  {
    name: "get_news",
    description: "Get recent news headlines mentioning this asset.",
    input_schema: {
      type: "object",
      properties: {
        identifier: { type: "string" },
        limit: { type: "integer", description: "Max headlines (default 5)" },
      },
      required: ["identifier"],
    },
  },
  {
    name: "get_options_flow",
    description:
      "Get unusual options flow for a stock ticker — call/put sweeps with volume/OI ratios and premium.",
    input_schema: {
      type: "object",
      properties: {
        ticker: { type: "string" },
        limit: { type: "integer", description: "Max contracts (default 10)" },
      },
      required: ["ticker"],
    },
  },
  {
    name: "get_congressional_trades",
    description: "Get recent congressional trades for a stock ticker.",
    input_schema: {
      type: "object",
      properties: {
        ticker: { type: "string" },
        limit: { type: "integer", description: "Max trades (default 10)" },
      },
      required: ["ticker"],
    },
  },
  {
    name: "get_upcoming_earnings",
    description: "Get the next upcoming earnings event for a stock ticker.",
    input_schema: {
      type: "object",
      properties: {
        ticker: { type: "string" },
      },
      required: ["ticker"],
    },
  },
];

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  const supabase = createClient();

  try {
    switch (name) {
      case "get_asset_overview": {
        const { identifier, asset_type } = input as { identifier: string; asset_type: string };
        const { data } = await supabase
          .from("raw_prices")
          .select("price, volume, change_24h, captured_at")
          .eq("identifier", identifier.toUpperCase())
          .eq("asset_type", asset_type)
          .order("captured_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!data) return JSON.stringify({ error: `No price data found for ${identifier}` });
        return JSON.stringify(data);
      }

      case "get_recent_signals": {
        const { identifier, limit = 5 } = input as { identifier: string; limit?: number };
        const { data } = await supabase
          .from("signals")
          .select(
            "direction, confidence, reasoning, time_horizon, outcome, price_at_signal, outcome_price, created_at",
          )
          .eq("identifier", identifier.toUpperCase())
          .order("created_at", { ascending: false })
          .limit(limit);
        return JSON.stringify(data ?? []);
      }

      case "get_signal_accuracy": {
        const { identifier, asset_type } = input as { identifier: string; asset_type: string };
        const { data } = await supabase
          .from("asset_accuracy")
          .select("total_signals, wins, losses, neutrals, win_rate, avg_confidence, last_signal_at")
          .eq("identifier", identifier.toUpperCase())
          .eq("asset_type", asset_type)
          .maybeSingle();
        if (!data) return JSON.stringify({ error: `No accuracy data for ${identifier}` });
        return JSON.stringify(data);
      }

      case "get_news": {
        const { identifier, limit = 5 } = input as { identifier: string; limit?: number };
        const { data } = await supabase
          .from("news_items")
          .select("headline, source, sentiment_score, published_at, url")
          .eq("identifier", identifier.toUpperCase())
          .order("published_at", { ascending: false })
          .limit(limit);
        return JSON.stringify(data ?? []);
      }

      case "get_options_flow": {
        const { ticker, limit = 10 } = input as { ticker: string; limit?: number };
        const { data } = await supabase
          .from("options_flow")
          .select(
            "contract_type, strike, expiry, volume, open_interest, volume_oi_ratio, premium_usd, is_unusual, captured_at",
          )
          .eq("ticker", ticker.toUpperCase())
          .eq("is_unusual", true)
          .order("premium_usd", { ascending: false })
          .limit(limit);
        return JSON.stringify(data ?? []);
      }

      case "get_congressional_trades": {
        const { ticker, limit = 10 } = input as { ticker: string; limit?: number };
        const { data } = await supabase
          .from("congressional_trades")
          .select("politician, party, transaction, amount_range, trade_date, report_date")
          .eq("ticker", ticker.toUpperCase())
          .order("trade_date", { ascending: false })
          .limit(limit);
        return JSON.stringify(data ?? []);
      }

      case "get_upcoming_earnings": {
        const { ticker } = input as { ticker: string };
        const { data } = await supabase
          .from("earnings_events")
          .select("report_date, report_time, consensus_eps, whisper_eps, whisper_vs_consensus_pct")
          .eq("ticker", ticker.toUpperCase())
          .gte("report_date", new Date().toISOString().slice(0, 10))
          .order("report_date")
          .limit(1)
          .maybeSingle();
        if (!data) return JSON.stringify({ error: `No upcoming earnings for ${ticker}` });
        return JSON.stringify(data);
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    return JSON.stringify({ error: err instanceof Error ? err.message : "Tool error" });
  }
}
