"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

export default function ShareButton({ signalId }: { signalId: number }) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/signal/${signalId}`
        : `/signal/${signalId}`;

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback for browsers that block clipboard without user gesture context
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }

    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleShare}
      title="Copy share link"
      className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors flex items-center gap-1"
    >
      {copied ? (
        <span className="flex items-center gap-1 text-emerald-400">
          <Check className="h-3 w-3" />
          Copied!
        </span>
      ) : (
        <>
          <Share2 className="h-3 w-3" />
          <span>Share</span>
        </>
      )}
    </button>
  );
}
