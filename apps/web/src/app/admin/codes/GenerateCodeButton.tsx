"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function GenerateCodeButton() {
  const router  = useRouter();
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    await fetch("/api/admin/codes", { method: "POST" });
    router.refresh();
    setBusy(false);
  }

  return (
    <button
      onClick={generate}
      disabled={busy}
      className="text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg transition-colors"
    >
      {busy ? "Generating…" : "+ Generate code"}
    </button>
  );
}
