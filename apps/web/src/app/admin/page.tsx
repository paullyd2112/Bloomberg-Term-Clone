import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function getStats() {
  const supabase = createAdminClient();

  const [profiles, signalsToday, signalsPending] = await Promise.all([
    supabase.from("profiles").select("tier") as unknown as Promise<{ data: { tier: string }[] | null }>,
    supabase
      .from("signals")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString()),
    supabase
      .from("signals")
      .select("id", { count: "exact", head: true })
      .eq("outcome", "PENDING"),
  ]);

  const tiers = { free: 0, pro: 0, elite: 0 };
  for (const p of profiles.data ?? []) {
    const t = p.tier as keyof typeof tiers;
    if (t in tiers) tiers[t]++;
  }

  return {
    tiers,
    total:          (profiles.data ?? []).length,
    signalsToday:   signalsToday.count ?? 0,
    signalsPending: signalsPending.count ?? 0,
  };
}

export default async function AdminOverview() {
  const stats = await getStats();

  const statCards = [
    { label: "Total users",      value: stats.total,          color: "text-white" },
    { label: "Free",             value: stats.tiers.free,     color: "text-zinc-400" },
    { label: "Pro",              value: stats.tiers.pro,      color: "text-green-400" },
    { label: "Elite",            value: stats.tiers.elite,    color: "text-purple-400" },
    { label: "Signals (24h)",    value: stats.signalsToday,   color: "text-white" },
    { label: "Pending signals",  value: stats.signalsPending, color: "text-amber-400" },
  ];

  return (
    <div className="space-y-6 max-w-4xl">
      <h1 className="text-lg font-bold text-white">Overview</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {statCards.map(({ label, value, color }) => (
          <div key={label} className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
            <div className="text-zinc-500 text-xs mt-1">{label}</div>
          </div>
        ))}
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 space-y-2">
        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3">Env checklist</p>
        {[
          "NEXT_PUBLIC_SUPABASE_URL",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY",
          "SUPABASE_SERVICE_ROLE_KEY",
          "STRIPE_SECRET_KEY",
          "STRIPE_WEBHOOK_SECRET",
          "ADMIN_EMAILS",
        ].map((key) => (
          <div key={key} className="flex items-center justify-between text-xs">
            <span className="font-mono text-zinc-400">{key}</span>
            <span className={process.env[key] ? "text-green-400" : "text-red-400"}>
              {process.env[key] ? "set" : "missing"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
