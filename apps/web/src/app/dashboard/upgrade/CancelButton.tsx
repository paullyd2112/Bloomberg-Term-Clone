"use client";

import { useState } from "react";

type Step = "idle" | "loading" | "offer" | "confirming" | "done";

export default function CancelButton({ cancelAt }: { cancelAt?: string | null }) {
  const [step, setStep] = useState<Step>("idle");
  const [discount, setDiscount] = useState<{ percent: number; months: number } | null>(null);
  const [tier, setTier] = useState("");
  const [error, setError] = useState("");
  const [pendingCancelAt, setPendingCancelAt] = useState(cancelAt ?? null);

  async function handleCancel() {
    setStep("loading");
    setError("");
    try {
      const res = await fetch("/api/stripe/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "check" }),
      });
      const data = await res.json();
      if (data.eligible && data.discount) {
        setDiscount(data.discount);
        setTier(data.tier);
        setStep("offer");
      } else {
        setStep("confirming");
      }
    } catch {
      setError("Something went wrong.");
      setStep("idle");
    }
  }

  async function acceptOffer() {
    setStep("loading");
    try {
      const res = await fetch("/api/stripe/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept_offer" }),
      });
      if (res.ok) {
        setStep("done");
      } else {
        setError("Failed to apply discount.");
        setStep("idle");
      }
    } catch {
      setError("Something went wrong.");
      setStep("idle");
    }
  }

  async function confirmCancel() {
    setStep("loading");
    try {
      const res = await fetch("/api/stripe/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.immediate) {
          window.location.reload();
        } else {
          setPendingCancelAt(data.cancel_at);
          setStep("idle");
        }
      } else {
        setError("Cancellation failed. Try again or contact support.");
        setStep("idle");
      }
    } catch {
      setError("Something went wrong.");
      setStep("idle");
    }
  }

  if (pendingCancelAt) {
    const endDate = new Date(pendingCancelAt).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
    return (
      <div className="bg-amber-500/[0.06] border border-amber-500/20 rounded-xl p-4 text-center space-y-1">
        <p className="text-sm font-semibold text-amber-400">
          Your subscription is canceled
        </p>
        <p className="text-xs text-zinc-400">
          You&apos;ll keep access until <span className="text-white font-medium">{endDate}</span>.
          No further charges will be made.
        </p>
      </div>
    );
  }

  if (step === "done") {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
        <p className="text-sm font-semibold text-emerald-400">
          Discount applied! {discount?.percent}% off for the next {discount?.months} months.
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          Glad you&apos;re staying.
        </p>
      </div>
    );
  }

  if (step === "offer" && discount) {
    return (
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-white">Before you go...</p>
          <p className="text-xs text-zinc-400 mt-1">
            We&apos;d hate to lose you. How about {discount.percent}% off your {tier.charAt(0).toUpperCase() + tier.slice(1)} plan
            for the next {discount.months} months?
          </p>
        </div>
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={acceptOffer}
            className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-sm py-2.5 rounded-lg transition-colors"
          >
            Keep my plan at {discount.percent}% off
          </button>
          <button
            onClick={() => setStep("confirming")}
            className="px-4 py-2.5 text-sm text-zinc-500 hover:text-white transition-colors"
          >
            No thanks
          </button>
        </div>
      </div>
    );
  }

  if (step === "confirming") {
    return (
      <div className="bg-red-500/[0.06] border border-red-500/20 rounded-xl p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-white">Are you sure?</p>
          <p className="text-xs text-zinc-400 mt-1">
            Your subscription will be canceled at the end of your current billing period.
            You&apos;ll keep access until then, and no further charges will be made.
          </p>
        </div>
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
        <div className="flex gap-3">
          <button
            onClick={() => setStep("idle")}
            className="flex-1 bg-white/[0.06] hover:bg-white/[0.1] text-white font-medium text-sm py-2.5 rounded-lg transition-colors"
          >
            Never mind
          </button>
          <button
            onClick={confirmCancel}
            className="px-4 py-2.5 text-sm text-red-400 hover:text-red-300 font-medium transition-colors"
          >
            Cancel subscription
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={handleCancel}
      disabled={step === "loading"}
      className="text-xs text-zinc-600 hover:text-zinc-400 disabled:opacity-50 transition-colors"
    >
      {step === "loading" ? "Loading..." : "Cancel subscription"}
    </button>
  );
}
