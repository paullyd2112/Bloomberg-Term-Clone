"use client";

import { useState, useEffect, useRef } from "react";
import { Share2, Check } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function ShareButton({ signalId }: { signalId: number }) {
  const [copied, setCopied] = useState(false);
  const referralCodeRef = useRef<string | null>(null);
  const fetchedRef = useRef(false);

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

  const handleShare = async () => {
    const base =
      typeof window !== "undefined"
        ? `${window.location.origin}/signal/${signalId}`
        : `/signal/${signalId}`;

    const url = referralCodeRef.current
      ? `${base}?ref=${referralCodeRef.current}`
      : base;

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
