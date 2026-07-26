"use client";

import { clsx } from "clsx";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

type RuleStatus = "ok" | "warning" | "breach";

type Rule = {
  label: string;
  status: RuleStatus;
  current: string;
  limit: string;
};

type Props = {
  rules: Rule[];
  profileLabel: string;
};

const STATUS_CONFIG: Record<RuleStatus, { icon: typeof CheckCircle2; color: string; bg: string; border: string }> = {
  ok: {
    icon: CheckCircle2,
    color: "text-[#00d4aa]",
    bg: "bg-[#00d4aa]/5",
    border: "border-[#00d4aa]/20",
  },
  warning: {
    icon: AlertTriangle,
    color: "text-amber-400",
    bg: "bg-amber-500/5",
    border: "border-amber-500/20",
  },
  breach: {
    icon: XCircle,
    color: "text-red-400",
    bg: "bg-red-500/5",
    border: "border-red-500/20",
  },
};

export default function RulesPanel({ rules, profileLabel }: Props) {
  const allOk = rules.every((r) => r.status === "ok");
  const hasBreach = rules.some((r) => r.status === "breach");

  return (
    <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "h-2 w-2 rounded-full",
              hasBreach ? "bg-red-400" : allOk ? "bg-[#00d4aa]" : "bg-amber-400",
            )}
          />
          <h3 className="text-[11px] font-mono font-semibold uppercase tracking-[0.15em] text-zinc-500">
            Trading Rules
          </h3>
        </div>
        <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-wider">
          {profileLabel}
        </span>
      </div>

      {/* Rules list */}
      <div className="divide-y divide-white/[0.04]">
        {rules.map((rule) => {
          const cfg = STATUS_CONFIG[rule.status];
          const Icon = cfg.icon;
          return (
            <div
              key={rule.label}
              className={clsx(
                "flex items-center gap-3 px-5 py-3 transition-colors",
                cfg.bg,
              )}
            >
              <Icon className={clsx("h-4 w-4 flex-shrink-0", cfg.color)} />
              <div className="flex-1 min-w-0">
                <span className="text-xs text-zinc-300">{rule.label}</span>
              </div>
              <div className="flex items-baseline gap-1.5 flex-shrink-0">
                <span className={clsx("font-mono text-xs font-semibold tabular-nums", cfg.color)}>
                  {rule.current}
                </span>
                <span className="text-[10px] text-zinc-600 font-mono">/ {rule.limit}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
