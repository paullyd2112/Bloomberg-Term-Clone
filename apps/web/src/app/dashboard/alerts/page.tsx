import Link from "next/link";
import { Bell, Zap, Target, Newspaper, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { getUser, getUserTier } from "@/lib/user";
import { canAccessFeature } from "@/lib/tier";
import AlertRow from "@/components/alerts/AlertRow";
import AddAlertModal from "@/components/alerts/AddAlertModal";
import PushToggle from "@/components/notifications/PushToggle";

export const revalidate = 60;

type Alert = {
  id: number;
  asset_type: string;
  identifier: string;
  trigger_type: "signal_fired" | "price_threshold" | "news_drop";
  threshold: number | null;
  is_active: boolean;
  created_at: string;
  last_fired_at: string | null;
};

async function fetchAlerts(userId: string): Promise<Alert[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("alerts")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data as Alert[]) ?? [];
}

export default async function AlertsPage() {
  const user = await getUser();
  const tier = await getUserTier();

  if (!canAccessFeature(tier, "alerts")) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-2xl p-8 text-center flex flex-col items-center gap-4">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
            <Bell className="h-6 w-6" />
          </span>
          <h2 className="text-white font-semibold text-lg tracking-tight">Alerts</h2>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-sm">
            Get notified when a signal fires, a price crosses your target, or news drops for any asset. Checked every 30 minutes. Pro and Elite only.
          </p>
          <Link
            href="/dashboard/upgrade"
            className="inline-flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm px-5 py-2.5 rounded-lg transition-colors"
          >
            Upgrade to Pro
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const alerts  = await fetchAlerts(user!.id);
  const active  = alerts.filter((a) => a.is_active);
  const paused  = alerts.filter((a) => !a.is_active);

  return (
    <div className="p-5 md:p-8 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
              <Bell className="h-4 w-4" />
            </span>
            <h1 className="text-xl font-semibold tracking-tight text-white">Alerts</h1>
          </div>
          <p className="text-sm text-zinc-500">
            <span className="tabular-nums text-zinc-300">{active.length}</span> active · checked every 30 min
          </p>
        </div>
        <AddAlertModal />
      </div>

      {/* Browser push opt-in */}
      <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-4">
        <PushToggle />
      </div>

      {/* How it works */}
      {alerts.length === 0 && (
        <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl py-14 text-center flex flex-col items-center gap-4">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-emerald-700/30 bg-emerald-500/10 text-emerald-400">
            <Bell className="h-6 w-6" />
          </span>
          <p className="text-zinc-300 text-sm font-medium">No alerts yet</p>
          <div className="grid grid-cols-3 gap-3 max-w-md mx-auto mt-2">
            {[
              { icon: Zap, label: "Signal fires", desc: "When Plebs rates an asset BUY or SELL" },
              { icon: Target, label: "Price target", desc: "When price crosses your threshold" },
              { icon: Newspaper, label: "News drop",   desc: "When new headlines appear" },
            ].map((item) => (
              <div key={item.label} className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3 text-center flex flex-col items-center gap-1.5">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] text-emerald-400">
                  <item.icon className="h-4 w-4" />
                </span>
                <div className="text-xs font-medium text-white">{item.label}</div>
                <div className="text-[11px] text-zinc-500 leading-snug">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active alerts */}
      {active.length > 0 && (
        <div>
          <h2 className="flex items-center gap-2.5 font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.18em] mb-3">
            <span className="text-emerald-400 text-[10px] leading-none">●</span>
            Active <span className="text-zinc-600 font-normal tabular-nums">{active.length}</span>
          </h2>
          <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl overflow-hidden">
            {active.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {/* Paused alerts */}
      {paused.length > 0 && (
        <div>
          <h2 className="flex items-center gap-2.5 font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.18em] mb-3">
            <span className="text-zinc-600 text-[10px] leading-none">●</span>
            Paused <span className="text-zinc-600 font-normal tabular-nums">{paused.length}</span>
          </h2>
          <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl overflow-hidden">
            {paused.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <p className="text-xs text-zinc-600 text-center">
          Alerts check every 30 minutes. Alerts will appear on your dashboard when triggered.
        </p>
      )}
    </div>
  );
}
