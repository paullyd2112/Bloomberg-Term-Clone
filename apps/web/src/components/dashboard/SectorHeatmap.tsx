import { createClient } from "@/lib/supabase/server";
import { SECTOR_MAP } from "@/lib/sectors";

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
    .gte("created_at", sevenDaysAgo.toISOString());

  if (error || !data) {
    console.error("SectorHeatmap fetch error:", error?.message);
    return [];
  }

  // Group by sector
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

  // Sort by bullish % descending
  stats.sort((a, b) => b.bullishPct - a.bullishPct);

  return stats;
}

function cardColor(bullishPct: number): string {
  if (bullishPct > 60) {
    // Green gradient — stronger green the more bullish
    const intensity = Math.min((bullishPct - 60) / 40, 1);
    if (intensity > 0.5) return "bg-emerald-900/60 border-emerald-700";
    return "bg-emerald-900/30 border-emerald-800";
  }
  if (bullishPct < 40) {
    // Red gradient — stronger red the more bearish
    const intensity = Math.min((40 - bullishPct) / 40, 1);
    if (intensity > 0.5) return "bg-rose-900/60 border-rose-700";
    return "bg-rose-900/30 border-rose-800";
  }
  // Neutral
  return "bg-zinc-800/60 border-zinc-700";
}

function pctColor(bullishPct: number): string {
  if (bullishPct > 60) return "text-emerald-400";
  if (bullishPct < 40) return "text-rose-400";
  return "text-zinc-400";
}

export default async function SectorHeatmap() {
  const sectors = await fetchSectorData();

  if (sectors.length === 0) return null;

  return (
    <section>
      <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-2">
        Sector ratings (7d)
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
        {sectors.map((s) => (
          <div
            key={s.sector}
            className={`rounded-lg border px-3 py-2.5 ${cardColor(s.bullishPct)}`}
          >
            <div className="text-sm font-semibold text-white truncate">
              {s.sector}
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span
                className={`text-lg font-bold tabular-nums ${pctColor(s.bullishPct)}`}
              >
                {s.bullishPct.toFixed(0)}%
              </span>
              <span className="text-[10px] text-zinc-500">bullish</span>
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
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
