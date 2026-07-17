"use client";

import { useState } from "react";
import { Check } from "lucide-react";

type Experience = "beginner" | "intermediate" | "advanced";
type AssetPref  = "stocks" | "crypto" | "predictions";

const EXPERIENCE_OPTIONS: { value: Experience; label: string }[] = [
  { value: "beginner",     label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced",     label: "Advanced" },
];

const ASSET_OPTIONS: { value: AssetPref; label: string }[] = [
  { value: "crypto",       label: "Crypto" },
  { value: "predictions",  label: "Predictions" },
];

type Props = {
  initialFullName:    string;
  initialPhone:       string;
  initialExperience:  Experience | null;
  initialAssets:      AssetPref[];
  initialEmailAlerts: boolean;
  initialSmsAlerts:   boolean;
};

export default function SettingsForm({
  initialFullName,
  initialPhone,
  initialExperience,
  initialAssets,
  initialEmailAlerts,
  initialSmsAlerts,
}: Props) {
  const [fullName, setFullName]     = useState(initialFullName);
  const [phone, setPhone]           = useState(initialPhone);
  const [experience, setExperience] = useState<Experience | null>(initialExperience);
  const [assets, setAssets]         = useState<Set<AssetPref>>(new Set(initialAssets));
  const [emailAlerts, setEmailAlerts] = useState(initialEmailAlerts);
  const [smsAlerts, setSmsAlerts]     = useState(initialSmsAlerts);
  const [saving, setSaving]         = useState(false);
  const [status, setStatus]         = useState<"idle" | "saved" | "error">("idle");

  function toggleAsset(a: AssetPref) {
    setAssets((prev) => {
      const next = new Set(prev);
      if (next.has(a)) next.delete(a); else next.add(a);
      return next;
    });
  }

  async function handleSave() {
    if (!fullName.trim()) return;
    setSaving(true);
    setStatus("idle");
    try {
      const res = await fetch("/api/profile", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          full_name:          fullName.trim(),
          phone_number:       phone.trim() || null,
          trading_experience: experience ?? undefined,
          asset_preferences:  assets.size > 0 ? Array.from(assets) : undefined,
          email_alerts:       emailAlerts,
          sms_alerts:         smsAlerts,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      setStatus("saved");
    } catch {
      setStatus("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-white/[0.03] border border-white/[0.06] ring-hairline rounded-xl p-5 space-y-5">
      <h2 className="flex items-center gap-2.5 font-mono text-[11px] font-semibold text-zinc-500 uppercase tracking-[0.18em]">
        <span className="text-emerald-400 text-[10px] leading-none">●</span>
        Profile
      </h2>

      {/* Name */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1" htmlFor="full_name">
          Full name
        </label>
        <input
          id="full_name"
          type="text"
          value={fullName}
          onChange={(e) => { setFullName(e.target.value); setStatus("idle"); }}
          className="w-full max-w-md bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
          placeholder="Your name"
        />
      </div>

      {/* Phone */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1" htmlFor="phone">
          Phone number <span className="text-zinc-600">(optional)</span>
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => { setPhone(e.target.value); setStatus("idle"); }}
          className="w-full max-w-md bg-white/[0.04] border border-white/[0.1] rounded-lg px-3 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 transition-colors"
          placeholder="+1 (555) 123-4567"
        />
      </div>

      {/* Experience */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">Trading experience</label>
        <div className="flex gap-2 flex-wrap">
          {EXPERIENCE_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setExperience(opt.value); setStatus("idle"); }}
              className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                experience === opt.value
                  ? "border-emerald-500/40 bg-emerald-500/10 text-white"
                  : "border-white/[0.1] bg-white/[0.03] text-zinc-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Asset preferences */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">Markets you trade</label>
        <div className="flex gap-2 flex-wrap">
          {ASSET_OPTIONS.map((opt) => {
            const selected = assets.has(opt.value);
            return (
              <button
                key={opt.value}
                onClick={() => { toggleAsset(opt.value); setStatus("idle"); }}
                className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                  selected
                    ? "border-emerald-500/40 bg-emerald-500/10 text-white"
                    : "border-white/[0.1] bg-white/[0.03] text-zinc-400 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Notifications */}
      <div>
        <label className="block text-xs text-zinc-400 mb-1.5">Notifications</label>
        <label className="inline-flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={emailAlerts}
            onChange={(e) => { setEmailAlerts(e.target.checked); setStatus("idle"); }}
            className="accent-emerald-500 w-4 h-4"
          />
          <span className="text-sm text-zinc-300">
            Email me when my alerts fire
          </span>
        </label>
        <p className="text-[11px] text-zinc-600 mt-1.5">
          Get an email the moment a signal, price, or news alert you set is triggered.
        </p>
        <label className="inline-flex items-center gap-2.5 cursor-pointer select-none mt-3">
          <input
            type="checkbox"
            checked={smsAlerts}
            onChange={(e) => { setSmsAlerts(e.target.checked); setStatus("idle"); }}
            className="accent-emerald-500 w-4 h-4"
          />
          <span className="text-sm text-zinc-300">
            Text me when my alerts fire
          </span>
        </label>
        <p className="text-[11px] text-zinc-600 mt-1.5">
          Requires a phone number above. Standard messaging rates may apply.
        </p>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-1">
        <button
          onClick={handleSave}
          disabled={saving || !fullName.trim()}
          className="bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-black font-bold px-5 py-2.5 rounded-lg transition-colors text-sm"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
        {status === "saved" && (
          <span className="flex items-center gap-1 text-sm text-emerald-400">
            <Check className="h-3.5 w-3.5" />
            Saved
          </span>
        )}
        {status === "error" && <span className="text-sm text-red-400">Something went wrong</span>}
      </div>
    </div>
  );
}
