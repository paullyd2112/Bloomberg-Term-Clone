import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(n: number, decimals = 2): string {
  if (Math.abs(n) >= 1_000_000_000)
    return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (Math.abs(n) >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000)
    return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(decimals);
}

export function formatCurrency(n: number, symbol = "$"): string {
  if (Math.abs(n) >= 1_000_000_000)
    return `${symbol}${(n / 1_000_000_000).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000)
    return `${symbol}${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)
    return `${symbol}${(n / 1_000).toFixed(1)}K`;
  return `${symbol}${n.toFixed(2)}`;
}

export function formatPercent(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function timeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}
