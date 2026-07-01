import { createClient } from "@/lib/supabase/server";
import { SECTOR_MAP } from "@/lib/sectors";
import SectionHeader from "@/components/ui/SectionHeader";

type SectorStats = {
  sector: string;
  totalSignals: number;
  bullishPct: number;
  avgConfidence: number;
};

async function fetchSectorData(): Promise<SectorStats[]> {
  const supabase = createClient();

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const { data, error } = await supabase
    .from("signals")
    .select("identifier, direction, confidence")
    .eq("asset_type", "stock")
    .gte("confidence", 70)
    .gte("created_at", sevenDaysAgo.toISOString());

  if (error || !data) {
    console.error("SectorHeatmap fetch error:", error?.message);
    return [];
  }

  const sectorBuckets = new Map<
    string,
    { total: number; bullish: number; confidenceSum: number }
  >();

  for (const row of data) {
    const sector = SECTOR_MAP[row.identifier];
    if (!sector) continue;

    const bucket = sectorBuckets.get(sector) ?? {
      total: 0,
      bullish: 0,
      confidenceSum: 0,
    };

    bucket.total += 1;
    if (row.direction === "BUY" || row.direction === "YES") {
      bucket.bullish += 1;
    }
    bucket.confidenceSum += row.confidence ?? 0;
    sectorBuckets.set(sector, bucket);
  }

  const stats: SectorStats[] = Array.from(sectorBuckets.entries()).map(
    ([sector, b]) => ({
      sector,
      totalSignals: b.total,
      bullishPct: b.total > 0 ? (b.bullish / b.total) * 100 : 0,
      avgConfidence: b.total > 0 ? b.confidenceSum / b.total : 0,
    }),
  );

  stats.sort((a, b) => b.bullishPct - a.bullishPct);

  return stats;
}

function cardColor(bullishPct: number): string {
  if (bullishPct > 60) {
    const intensity = Math.min((bullishPct - 60) / 40, 1);
    if (intensity > 0.5) return "bg-emerald-500/10 border-emerald-500/20";
    return "bg-emerald-500/[0.06] border-emerald-500/15";
  }
  if (bullishPct < 40) {
    const intensity = Math.min((40 - bullishPct) / 40, 1);
    if (intensity > 0.5) return "bg-red-500/10 border-red-500/20";
    return "bg-red-500/[0.06] border-red-500/15";
  }
  return "bg-white/[0.03] border-white/[0.06]";
}

function pctColor(bullishPct: number): string {
  if (bullishPct > 60) return "text-emerald-400";
  if (bullishPct < 40) return "text-red-400";
  return "text-zinc-400";
}

export default async function SectorHeatmap() {
  const sectors = await fetchSectorData();

  if (sectors.length === 0) return null;

  return (
    <section>
      <SectionHeader divider className="mb-4">Sector ratings (7d)</SectionHeader>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {sectors.map((s) => (
          <div
            key={s.sector}
            className={`rounded-xl border px-4 py-3 ring-hairline ${cardColor(s.bullishPct)}`}
          >
            <div className="text-sm font-semibold text-white truncate">
              {s.sector}
            </div>
            <div className="flex items-baseline gap-2 mt-1.5">
              <span
                className={`text-lg font-bold tabular-nums ${pctColor(s.bullishPct)}`}
              >
                {s.bullishPct.toFixed(0)}%
              </span>
              <span className="text-[10px] text-zinc-500">bullish</span>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-xs text-zinc-400 tabular-nums">
                {s.totalSignals} signals
              </span>
              <span className="text-[10px] text-zinc-600">
                avg {s.avgConfidence.toFixed(0)}% conf
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
