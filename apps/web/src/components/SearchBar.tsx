"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

type SearchResult = {
  identifier: string;
  asset_type: string;
  price: number | null;
  change_24h: number | null;
  tracked?: boolean;
  name?: string;
};

export default function SearchBar() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ingesting, setIngesting] = useState<string | null>(null);
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

  async function handleSelect(result: SearchResult) {
    if (result.tracked === false) {
      setIngesting(result.identifier);
      try {
        const res = await fetch("/api/ingest-on-demand", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            asset_type: result.asset_type,
            identifier: result.identifier,
          }),
        });
        if (!res.ok) {
          setIngesting(null);
          return;
        }
      } catch {
        setIngesting(null);
        return;
      }
      setIngesting(null);
    }
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
      handleSelect(results[selectedIdx]);
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
    <div ref={ref} className="relative w-full max-w-xs z-50">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" strokeWidth={2} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search any ticker..."
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg pl-8 pr-14 py-1.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/40 focus:bg-white/[0.05] transition-colors"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden sm:inline-flex font-mono text-[10px] text-zinc-500 bg-white/[0.04] border border-white/[0.08] rounded px-1.5 py-0.5">
          {"⌘"}K
        </kbd>
      </div>

      {open && (
        <div className="absolute top-full mt-2 left-0 w-full bg-zinc-950/95 backdrop-blur-xl border border-white/[0.08] rounded-xl shadow-2xl ring-hairline z-50 overflow-hidden">
          {loading && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-zinc-500">Searching...</div>
          )}
          {!loading && results.length === 0 && query.trim() && (
            <div className="px-3 py-2 text-xs text-zinc-500">No results for &quot;{query}&quot;</div>
          )}
          {results.map((r, i) => (
            <button
              key={`${r.asset_type}:${r.identifier}`}
              onClick={() => handleSelect(r)}
              onMouseEnter={() => setSelectedIdx(i)}
              disabled={ingesting === r.identifier}
              className={`w-full flex items-center justify-between px-3 py-2 text-left transition-colors ${
                i === selectedIdx ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
              } ${ingesting === r.identifier ? "opacity-60 cursor-wait" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white font-mono">{r.identifier}</span>
                <span className="text-[10px] text-zinc-400 capitalize bg-white/[0.05] border border-white/[0.06] px-1.5 py-0.5 rounded">
                  {r.asset_type}
                </span>
                {r.tracked === false && (
                  <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded">
                    {ingesting === r.identifier ? "Loading..." : "Click to add"}
                  </span>
                )}
                {r.name && (
                  <span className="text-[10px] text-zinc-500 truncate max-w-[100px]">{r.name}</span>
                )}
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
