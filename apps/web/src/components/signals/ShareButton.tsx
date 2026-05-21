"use client";

import { useState } from "react";

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
        <span className="text-green-400">Copied!</span>
      ) : (
        <>
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          <span>Share</span>
        </>
      )}
    </button>
  );
}
