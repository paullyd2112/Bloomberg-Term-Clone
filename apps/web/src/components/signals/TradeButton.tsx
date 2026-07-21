"use client";

import Link from "next/link";

type Props = {
  assetType: string;
  identifier: string;
  direction: string;
  entryPrice: number | null;
};

export default function TradeButton({ assetType, identifier, direction, entryPrice }: Props) {
  const dir = direction === "BUY" || direction === "YES" ? "LONG" : "SHORT";
  const params = new URLSearchParams({
    asset_type: assetType,
    identifier,
    direction: dir,
    ...(entryPrice != null ? { entry_price: String(entryPrice) } : {}),
  });

  return (
    <Link
      href={`/dashboard/portfolio?${params}`}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded transition-colors"
      title="Take this trade"
    >
      Trade
    </Link>
  );
}
