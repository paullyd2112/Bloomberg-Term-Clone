import Link from "next/link";
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
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-8 text-center space-y-4">
          <div className="text-3xl">🔔</div>
          <h2 className="text-white font-semibold text-lg">Alerts</h2>
          <p className="text-zinc-400 text-sm leading-relaxed max-w-sm mx-auto">
            Get notified when a signal fires, a price crosses your target, or news drops for any asset. Checked every 30 minutes. Pro and Elite only.
          </p>
          <Link
            href="/dashboard/upgrade"
            className="inline-block bg-green-500 hover:bg-green-400 text-black font-semibold text-sm px-5 py-2.5 rounded transition-colors"
          >
            Upgrade to Pro →
          </Link>
        </div>
      </div>
    );
  }

  const alerts  = await fetchAlerts(user!.id);
  const active  = alerts.filter((a) => a.is_active);
  const paused  = alerts.filter((a) => !a.is_active);

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold text-white">Alerts</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            {active.length} active · checked every 30 min
          </p>
        </div>
        <AddAlertModal />
      </div>

      {/* Browser push opt-in */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <PushToggle />
      </div>

      {/* How it works */}
      {alerts.length === 0 && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl py-14 text-center space-y-4">
          <div className="text-3xl">🔔</div>
          <p className="text-zinc-400 text-sm font-medium">No alerts yet</p>
          <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto mt-4">
            {[
              { icon: "⚡", label: "Signal fires", desc: "When Plebs rates an asset BUY or SELL" },
              { icon: "◎", label: "Price target", desc: "When price crosses your threshold" },
              { icon: "📰", label: "News drop",   desc: "When new headlines appear" },
            ].map((item) => (
              <div key={item.label} className="bg-zinc-800/50 rounded-lg p-3 text-center">
                <div className="text-xl mb-1">{item.icon}</div>
                <div className="text-xs font-medium text-white">{item.label}</div>
                <div className="text-[11px] text-zinc-500 mt-0.5 leading-snug">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active alerts */}
      {active.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">
            Active <span className="text-zinc-700 font-normal">{active.length}</span>
          </h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {active.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {/* Paused alerts */}
      {paused.length > 0 && (
        <div>
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-2">
            Paused <span className="text-zinc-700 font-normal">{paused.length}</span>
          </h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
            {paused.map((alert) => (
              <AlertRow key={alert.id} alert={alert} />
            ))}
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <p className="text-xs text-zinc-700 text-center">
          Alerts check every 30 minutes. Alerts will appear on your dashboard when triggered.
        </p>
      )}
    </div>
  );
}
