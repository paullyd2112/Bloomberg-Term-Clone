"use client";

import { cn } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { Crown, X, Check, Zap } from "lucide-react";

const FREE_FEATURES = [
  "Top 3 signals per day (delayed 15 min)",
  "Basic stock & crypto watchlist",
  "Public prediction market odds",
  "Community signal feed",
];

const PRO_FEATURES = [
  "Real-time signals — all markets",
  "Full options flow + dark pool prints",
  "Whale trade alerts (crypto)",
  "Congressional trade tracking",
  "Cross-market correlation stories",
  "AI signal summaries",
  "Unlimited watchlists & alerts",
  "Prediction market deep data",
];

interface UpgradeModalProps {
  onClose: () => void;
}

export function UpgradeModal({ onClose }: UpgradeModalProps) {
  const { setSubscription } = useAppStore();

  function handleUpgrade() {
    // TODO: wire Stripe checkout
    setSubscription("pro");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-[#0f1117] border border-[#1e2433] rounded-xl w-[520px] max-h-[90vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-[#1e2433]">
          <div className="flex items-center gap-2">
            <Zap size={16} className="text-[#00d4aa]" fill="currentColor" />
            <span className="font-bold text-[#e2e8f0]">Flow<span className="text-[#00d4aa]">Desk</span> Pro</span>
          </div>
          <button onClick={onClose} className="p-1 rounded text-[#64748b] hover:text-[#e2e8f0] hover:bg-[#1e2433]">
            <X size={14} />
          </button>
        </div>

        <div className="p-5">
          {/* Hero */}
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[color-mix(in_srgb,#00d4aa_15%,transparent)] mb-3">
              <Crown size={20} className="text-[#00d4aa]" />
            </div>
            <h2 className="text-xl font-bold text-[#e2e8f0] mb-1">The edge, not the noise.</h2>
            <p className="text-sm text-[#64748b]">Real-time signals across stocks, crypto, and prediction markets — curated for retail traders.</p>
          </div>

          {/* Pricing */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {/* Free */}
            <div className="bg-[#141820] border border-[#1e2433] rounded-lg p-4">
              <div className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-1">Free</div>
              <div className="text-2xl font-bold text-[#e2e8f0] mb-3">$0<span className="text-sm font-normal text-[#64748b]">/mo</span></div>
              <ul className="space-y-2">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-[#64748b]">
                    <Check size={10} className="text-[#64748b] mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pro */}
            <div className="bg-[color-mix(in_srgb,#00d4aa_8%,#0f1117)] border border-[#00d4aa]/30 rounded-lg p-4 relative">
              <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                <span className="bg-[#00d4aa] text-[#0a0b0d] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
                  7-day free trial
                </span>
              </div>
              <div className="text-xs font-semibold text-[#00d4aa] uppercase tracking-wide mb-1">Pro</div>
              <div className="text-2xl font-bold text-[#e2e8f0] mb-3">$29<span className="text-sm font-normal text-[#64748b]">/mo</span></div>
              <ul className="space-y-2">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-xs text-[#94a3b8]">
                    <Check size={10} className="text-[#00d4aa] mt-0.5 flex-shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={handleUpgrade}
            className="w-full py-3 rounded-lg bg-[#00d4aa] text-[#0a0b0d] font-semibold text-sm hover:bg-[#00bfa0] transition-colors mb-2"
          >
            Start 7-day free trial
          </button>
          <p className="text-center text-[10px] text-[#64748b]">
            No credit card required for trial. Cancel anytime.
          </p>
        </div>
      </div>
    </div>
  );
}
