"use client";

import { useState } from "react";

export default function TierSelect({
  userId,
  currentTier,
}: {
  userId: string;
  currentTier: string;
}) {
  const [tier, setTier]       = useState(currentTier);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);

  async function handleChange(newTier: string) {
    if (newTier === tier) return;
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/admin/users/${userId}/tier`, {
      method:  "PATCH",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ tier: newTier }),
    });
    setSaving(false);
    if (res.ok) {
      setTier(newTier);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={tier}
        disabled={saving}
        onChange={(e) => handleChange(e.target.value)}
        className="bg-zinc-800 border border-zinc-700 text-white text-xs rounded px-2 py-1 focus:outline-none focus:border-zinc-500 disabled:opacity-50"
      >
        <option value="free">free</option>
        <option value="pro">pro</option>
        <option value="elite">elite</option>
      </select>
      {saved && <span className="text-green-400 text-xs">✓</span>}
    </div>
  );
}
