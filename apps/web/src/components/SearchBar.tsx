"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

type SearchResult = {
  identifier: string;
  asset_type: string;
  price: number | null;
  change_24h: number | null;
};

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedIdx, setSelectedIdx] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleChange(value: string) {
    setQuery(value);
    setSelectedIdx(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(value.trim())}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.results ?? []);
          setOpen(true);
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }, 200);
  }

  function navigateTo(result: SearchResult) {
    setOpen(false);
    setQuery("");
    setResults([]);
    router.push(`/dashboard/asset/${result.asset_type}/${result.identifier}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && selectedIdx >= 0) {
      e.preventDefault();
      navigateTo(results[selectedIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
    }
  }

  function formatPrice(price: number | null) {
    if (price === null) return "";
    if (price >= 1) return `$${price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    return `$${price}`;
  }

  return (
    <div ref={ref} className="relative w-full max-w-xs">
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search ticker..."
          className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-md pl-8 pr-14 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-green-500/50 transition-colors"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex text-[10px] text-zinc-600 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5">
          {"⌘"}K
        </kbd>
      </div>

      {open && (
        <div className="absolute top-full mt-1 left-0 w-full bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
          {loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-500">Searching...</div>
          )}
          {!loading && results.length === 0 && query.trim() && (
            <div className="px-3 py-2 text-xs text-zinc-500">No results for &quot;{query}&quot;</div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.asset_type}:${r.identifier}`}
              onClick={() => navigateTo(r)}
              onMouseEnter={() => setSelectedIdx(i)}
              className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                i === selectedIdx ? "bg-zinc-800" : "hover:bg-zinc-800/50"
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white font-mono">{r.identifier}</span>
                <span className="text-[10px] text-zinc-500 capitalize bg-zinc-800 px-1.5 py-0.5 rounded">
                  {r.asset_type}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {r.price !== null && (
                  <span className="text-xs text-zinc-400 tabular-nums">{formatPrice(r.price)}</span>
                )}
                {r.change_24h !== null && (
                  <span className={`text-[10px] tabular-nums ${r.change_24h >= 0 ? "text-green-400" : "text-red-400"}`}>
                    {r.change_24h >= 0 ? "+" : ""}{Number(r.change_24h).toFixed(2)}%
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
