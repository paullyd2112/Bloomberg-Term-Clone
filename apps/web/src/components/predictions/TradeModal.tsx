"use client";

import { useState, useCallback, useEffect } from "react";
import { X, AlertTriangle, Loader2, CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";
import { useAccount, useSignTypedData } from "wagmi";
import { formatUnits } from "viem";
import { deriveClobCredentials, getCachedCredentials, type ClobCredentials } from "@/lib/polymarket/auth";
import { createOrder, getOrderBook, type OrderSide } from "@/lib/polymarket/clob";
import { checkOrderRisk, incrementTradeCount, recordLoss } from "@/lib/polymarket/risk";
import type { PredictionMarket } from "./PredictionCard";

type TradeModalProps = {
  market: PredictionMarket;
  onClose: () => void;
};

type OrderState = "idle" | "signing" | "submitting" | "success" | "error";

export default function TradeModal({ market, onClose }: TradeModalProps) {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [side, setSide] = useState<"YES" | "NO">("YES");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [amount, setAmount] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [orderState, setOrderState] = useState<OrderState>("idle");
  const [orderError, setOrderError] = useState("");
  const [orderId, setOrderId] = useState("");

  const currentPrice = side === "YES" ? market.yes_price : (market.no_price ?? 1 - market.yes_price);
  const effectivePrice = orderType === "limit" && limitPrice ? Number(limitPrice) : currentPrice;
  const amountNum = Number(amount) || 0;
  const shares = effectivePrice > 0 ? amountNum / effectivePrice : 0;
  const potentialPayout = shares;
  const maxLoss = amountNum;

  const impliedEdge = market.signal
    ? Math.abs((market.signal.confidence / 100) - currentPrice) * 100
    : null;

  const [estimatedFill, setEstimatedFill] = useState<number | null>(null);

  useEffect(() => {
    const tokenId = side === "YES"
      ? (market as Record<string, unknown>).yes_token_id as string | undefined
      : (market as Record<string, unknown>).no_token_id as string | undefined;
    if (!tokenId || orderType !== "market" || amountNum <= 0) {
      setEstimatedFill(null);
      return;
    }
    let cancelled = false;
    getOrderBook(tokenId).then((book) => {
      if (cancelled) return;
      const asks = book.asks.sort((a, b) => Number(a.price) - Number(b.price));
      let remainingUsd = amountNum;
      let totalShares = 0;
      let totalSpent = 0;
      for (const level of asks) {
        const px = Number(level.price);
        const levelShares = Number(level.size);
        const levelCostUsd = levelShares * px;
        const fillFraction = Math.min(1, remainingUsd / levelCostUsd);
        const sharesFilled = levelShares * fillFraction;
        const usdFilled = levelCostUsd * fillFraction;
        totalShares += sharesFilled;
        totalSpent += usdFilled;
        remainingUsd -= usdFilled;
        if (remainingUsd <= 0) break;
      }
      setEstimatedFill(totalShares > 0 ? totalSpent / totalShares : null);
    }).catch(() => setEstimatedFill(null));
    return () => { cancelled = true; };
  }, [side, market, orderType, amountNum, currentPrice]);

  const riskCheck = checkOrderRisk(amountNum, currentPrice, orderType === "market" ? estimatedFill : null);

  const handleTrade = useCallback(async () => {
    if (!address || !amountNum || !riskCheck.allowed) return;

    setOrderState("signing");
    setOrderError("");

    try {
      let creds: ClobCredentials | null = getCachedCredentials();
      if (!creds) {
        creds = await deriveClobCredentials(address, signTypedDataAsync as Parameters<typeof deriveClobCredentials>[1]);
      }

      setOrderState("submitting");

      const tokenId = side === "YES"
        ? (market as Record<string, unknown>).yes_token_id as string
        : (market as Record<string, unknown>).no_token_id as string;

      if (!tokenId) {
        throw new Error("Token ID not available for this market");
      }

      const result = await createOrder(creds, {
        tokenId,
        side: "BUY" as OrderSide,
        price: effectivePrice,
        size: shares,
        orderType: orderType === "market" ? "FOK" : "GTC",
      });

      if (result.success) {
        setOrderState("success");
        setOrderId(result.orderId || "");
        incrementTradeCount();
        if (amountNum > 0) recordLoss(amountNum);
      } else {
        throw new Error(result.errorMsg || "Order failed");
      }
    } catch (e) {
      setOrderState("error");
      setOrderError(e instanceof Error ? e.message : "Trade failed");
    }
  }, [address, amountNum, riskCheck.allowed, side, market, effectivePrice, shares, orderType, signTypedDataAsync]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-zinc-900 border border-white/[0.08] rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
          <h2 className="text-sm font-semibold text-white">
            Buy {side} — {market.title.slice(0, 60)}{market.title.length > 60 ? "…" : ""}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Context section */}
          <div className="space-y-1.5 text-xs">
            {market.signal && market.signal.direction !== "HOLD" && (
              <div className="flex justify-between">
                <span className="text-zinc-500">AI Signal</span>
                <span className="text-emerald-400 font-medium">
                  {market.signal.direction} {market.signal.confidence}% confidence
                </span>
              </div>
            )}
            {market.smart_money && market.smart_money.consensus_strength >= 0.6 && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Smart Money</span>
                <span className="text-blue-400 font-medium">
                  {market.smart_money.wallet_count} wallets — {market.smart_money.consensus_direction}
                </span>
              </div>
            )}
            {market.whale_activity && market.whale_activity.whale_count >= 2 && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Whale Activity</span>
                <span className="text-amber-400 font-medium">
                  {market.whale_activity.whale_count} trades · ${(market.whale_activity.total_usd / 1000).toFixed(0)}K {market.whale_activity.direction}
                </span>
              </div>
            )}
          </div>

          {/* Price + edge */}
          <div className="flex items-center gap-4 py-2 px-3 bg-white/[0.03] rounded-lg">
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Current {side}</div>
              <div className="text-lg font-bold text-white tabular-nums">${currentPrice.toFixed(2)}</div>
            </div>
            {impliedEdge !== null && impliedEdge > 0 && (
              <div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-wider">Implied Edge</div>
                <div className="text-lg font-bold text-emerald-400 tabular-nums">{impliedEdge.toFixed(0)}pp</div>
              </div>
            )}
          </div>

          {/* Side toggle */}
          <div className="flex gap-2">
            {(["YES", "NO"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSide(s)}
                className={clsx(
                  "flex-1 py-2 text-sm font-medium rounded-lg transition-colors",
                  side === s
                    ? s === "YES" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-white/[0.04] text-zinc-500 border border-white/[0.06] hover:bg-white/[0.06]",
                )}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Order type */}
          <div className="flex gap-2">
            {(["market", "limit"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setOrderType(t)}
                className={clsx(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize",
                  orderType === t
                    ? "bg-white/[0.1] text-white"
                    : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Amount input */}
          <div>
            <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Amount (USDC)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 tabular-nums"
            />
          </div>

          {/* Limit price */}
          {orderType === "limit" && (
            <div>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider block mb-1">Limit Price</label>
              <input
                type="number"
                min="0.01"
                max="0.99"
                step="0.01"
                value={limitPrice}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={currentPrice.toFixed(2)}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500/40 tabular-nums"
              />
            </div>
          )}

          {/* Payout estimate */}
          {amountNum > 0 && (
            <div className="flex justify-between text-xs py-2 px-3 bg-white/[0.03] rounded-lg">
              <div>
                <span className="text-zinc-500">Est. payout: </span>
                <span className="text-emerald-400 font-medium tabular-nums">
                  ${potentialPayout.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Max loss: </span>
                <span className="text-red-400 font-medium tabular-nums">${maxLoss.toFixed(2)}</span>
              </div>
            </div>
          )}

          {/* Risk warnings */}
          {riskCheck.warnings.length > 0 && (
            <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/10 rounded-lg p-2.5">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <div>{riskCheck.warnings.join(" · ")}</div>
            </div>
          )}
          {riskCheck.blocked && (
            <div className="flex items-start gap-2 text-xs text-red-400 bg-red-500/10 rounded-lg p-2.5">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0 mt-0.5" />
              <div>{riskCheck.blocked}</div>
            </div>
          )}

          {/* Error state */}
          {orderState === "error" && (
            <div className="text-xs text-red-400 bg-red-500/10 rounded-lg p-2.5">
              {orderError}
            </div>
          )}

          {/* Success state */}
          {orderState === "success" && (
            <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 rounded-lg p-2.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Order placed{orderId ? ` (${orderId.slice(0, 12)}…)` : ""}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-sm font-medium text-zinc-400 bg-white/[0.04] rounded-lg hover:bg-white/[0.08] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleTrade}
              disabled={
                !address ||
                !amountNum ||
                !riskCheck.allowed ||
                orderState === "signing" ||
                orderState === "submitting" ||
                orderState === "success"
              }
              className={clsx(
                "flex-1 py-2.5 text-sm font-semibold rounded-lg transition-colors flex items-center justify-center gap-2",
                !address
                  ? "bg-zinc-700 text-zinc-500 cursor-not-allowed"
                  : orderState === "success"
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed",
              )}
            >
              {orderState === "signing" && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Signing…</>}
              {orderState === "submitting" && <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting…</>}
              {orderState === "success" && "Done"}
              {orderState === "error" && "Retry"}
              {orderState === "idle" && (address ? "Confirm Trade" : "Connect Wallet First")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
