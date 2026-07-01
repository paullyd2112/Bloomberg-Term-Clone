"use client";

import { useState, useEffect, useRef } from "react";
import { Share2, Check, Link2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type ShareProps = {
  signalId: number;
  ticker?: string;
  direction?: string;
  confidence?: number;
};

function XIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function ThreadsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12.186 24h-.007C5.461 23.956.057 18.51 0 11.737c0-6.639 5.37-12.01 12.186-12.01 6.817 0 12.186 5.37 12.186 12.01 0 6.773-5.46 12.22-12.186 12.263zm5.441-9.163c-.152-.686-.47-1.227-.95-1.614-.336-.27-.745-.467-1.212-.586a8.09 8.09 0 00-.249-.862c-.635-1.699-1.897-2.715-3.532-3.053a4.87 4.87 0 00-.83-.074c-1.034 0-1.952.354-2.658 1.025l1.065 1.203c.448-.426 1.01-.642 1.593-.642.154 0 .312.016.471.05 1.016.21 1.81.905 2.232 1.952.156.389.268.822.335 1.291a5.84 5.84 0 00-1.598-.222c-.524 0-1.03.07-1.5.208-1.378.405-2.263 1.395-2.394 2.68-.073.71.112 1.394.52 1.927.468.61 1.18.97 2.002 1.012.08.004.162.006.244.006.905 0 1.736-.323 2.395-.934.507-.47.873-1.089 1.085-1.836.296.174.535.4.704.676.296.484.378 1.09.23 1.706-.322 1.339-1.296 2.393-2.74 2.966-1.268.504-2.69.56-3.637.56h-.067c-1.39-.01-2.583-.345-3.544-.998-1.08-.733-1.837-1.826-2.25-3.25-.393-1.353-.596-2.917-.596-4.646 0-1.729.203-3.293.596-4.646.413-1.424 1.17-2.517 2.25-3.25.96-.653 2.153-.987 3.544-.998h.067c1.4.011 2.607.35 3.588 1.008 1.063.714 1.817 1.766 2.242 3.127l1.611-.482c-.523-1.7-1.476-3.032-2.834-3.944C14.616.6 13.078.172 11.346.161h-.08c-1.72.01-3.248.433-4.544 1.257C5.344 2.309 4.388 3.64 3.825 5.387 3.348 6.847 3.104 8.52 3.104 10.37c0 1.85.244 3.524.721 4.983.563 1.747 1.52 3.078 2.842 3.957 1.295.862 2.825 1.306 4.544 1.317h.08c1.166 0 2.622-.072 4.168-.687 1.842-.733 3.147-2.131 3.586-3.952.239-.994.191-2.043-.317-2.988z" />
    </svg>
  );
}

function RedditIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z" />
    </svg>
  );
}

export default function ShareButton({ signalId, ticker, direction, confidence }: ShareProps) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const referralCodeRef = useRef<string | null>(null);
  const fetchedRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase
        .from("profiles")
        .select("referral_code")
        .eq("id", user.id)
        .single()
        .then(({ data }) => {
          if (data?.referral_code) {
            referralCodeRef.current = data.referral_code as string;
          }
        });
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function getUrl() {
    const base =
      typeof window !== "undefined"
        ? `${window.location.origin}/signal/${signalId}`
        : `https://plebs.finance/signal/${signalId}`;
    return referralCodeRef.current ? `${base}?ref=${referralCodeRef.current}` : base;
  }

  function getShareText() {
    if (!ticker || !direction) return "Check out this AI trading signal on Plebs.finance";
    const conf = confidence ? ` at ${confidence}% confidence` : "";
    return `${ticker} — ${direction} signal${conf} on Plebs.finance`;
  }

  async function copyLink() {
    const url = getUrl();
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
    }
    setCopied(true);
    setOpen(false);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareToX() {
    const url = getUrl();
    const text = getShareText();
    window.open(
      `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`,
      "_blank",
      "noopener,noreferrer,width=550,height=420",
    );
    setOpen(false);
  }

  function shareToThreads() {
    const url = getUrl();
    const text = `${getShareText()} ${url}`;
    window.open(
      `https://threads.net/intent/post?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer,width=550,height=420",
    );
    setOpen(false);
  }

  function shareToReddit() {
    const url = getUrl();
    const title = getShareText();
    window.open(
      `https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`,
      "_blank",
      "noopener,noreferrer,width=550,height=600",
    );
    setOpen(false);
  }

  const ITEMS = [
    { label: "Copy link", icon: <Link2 className="h-3.5 w-3.5" />, action: copyLink },
    { label: "Share on X", icon: <XIcon className="h-3.5 w-3.5" />, action: shareToX },
    { label: "Share on Threads", icon: <ThreadsIcon className="h-3.5 w-3.5" />, action: shareToThreads },
    { label: "Share on Reddit", icon: <RedditIcon className="h-3.5 w-3.5" />, action: shareToReddit },
  ];

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        title="Share signal"
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

      {open && (
        <div className="absolute bottom-full right-0 mb-1.5 w-44 bg-zinc-900 border border-white/[0.1] rounded-lg shadow-xl z-50 py-1 animate-in fade-in slide-in-from-bottom-2 duration-150">
          {ITEMS.map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-colors"
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
