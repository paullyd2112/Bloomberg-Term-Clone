"use client";

import { useEffect, useState } from "react";

type PriceData = {
  price: number | null;
  change_24h: number | null;
  volume: number | null;
  metadata: Record<string, unknown> | null;
  captured_at: string;
};

function LiveClock() {
  const [time, setTime] = useState("");

  useEffect(() => {
    function update() {
      setTime(
        new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        })
      );
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  if (!time) return null;

  return (
    <span className="text-xs text-zinc-600 tabular-nums">
      Updated {time}
    </span>
  );
}

export default function PriceHeader({
  price: data,
  assetType,
}: {
  price: PriceData;
  assetType: string;
}) {
  const price  = data.price;
  const change = data.change_24h;

  const formattedPrice =
    price == null
      ? "—"
      : assetType === "prediction"
      ? `${(price * 100).toFixed(1)}%`
      : price >= 1000
      ? `$${price.toLocaleString(undefined, { maximumFractionDigits: 2 })}`
      : `$${Number(price).toFixed(4).replace(/\.?0+$/, "")}`;

  return (
    <div className="flex items-baseline gap-3 flex-wrap">
      <span className="text-3xl font-bold text-white font-mono tabular-nums">
        {formattedPrice}
      </span>
      {change != null && (
        <span
          className={`text-sm font-semibold tabular-nums ${
            change >= 0 ? "text-green-400" : "text-red-400"
          }`}
        >
          {change >= 0 ? "+" : ""}{Number(change).toFixed(2)}%
        </span>
      )}
      <LiveClock />
    </div>
  );
}
