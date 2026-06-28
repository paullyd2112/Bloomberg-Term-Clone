"use client";

import { useEffect, useRef } from "react";
import {
  createChart,
  AreaSeries,
  ColorType,
  type IChartApi,
  type UTCTimestamp,
} from "lightweight-charts";

export type PricePoint = { time: number; value: number };

export default function PriceChart({
  data,
  assetType,
}: {
  data: PricePoint[];
  assetType: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!containerRef.current || data.length === 0) return;

    const up = data.length < 2 || data[data.length - 1].value >= data[0].value;
    const lineColor = up ? "#4ade80" : "#f87171";
    const topColor = up ? "rgba(74, 222, 128, 0.25)" : "rgba(248, 113, 113, 0.25)";

    const chartHeight = containerRef.current.clientWidth < 500 ? 220 : 280;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#71717a",
        fontFamily: "ui-monospace, monospace",
      },
      grid: {
        vertLines: { color: "rgba(63, 63, 70, 0.2)" },
        horzLines: { color: "rgba(63, 63, 70, 0.2)" },
      },
      timeScale: {
        borderColor: "#27272a",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: { borderColor: "#27272a" },
      crosshair: { mode: 0 },
      width: containerRef.current.clientWidth,
      height: chartHeight,
      handleScroll: false,
      handleScale: false,
    });
    chartRef.current = chart;

    const series = chart.addSeries(AreaSeries, {
      lineColor,
      topColor,
      bottomColor: "rgba(0, 0, 0, 0)",
      lineWidth: 2,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });

    series.setData(
      data.map((d) => ({ time: d.time as UTCTimestamp, value: d.value })),
    );
    chart.timeScale().fitContent();

    const logo = containerRef.current.querySelector("#tv-attr-logo");
    if (logo) logo.remove();

    const handleResize = () => {
      if (containerRef.current) {
        const h = containerRef.current.clientWidth < 500 ? 220 : 280;
        chart.applyOptions({ width: containerRef.current.clientWidth, height: h });
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [data, assetType]);

  if (data.length === 0) {
    return (
      <div className="h-[220px] sm:h-[280px] flex items-center justify-center text-sm text-zinc-600">
        Not enough price history to chart yet.
      </div>
    );
  }

  return <div ref={containerRef} className="w-full" />;
}
