"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import AddPositionForm, { type Prefill } from "./AddPositionForm";

export default function AddPositionModal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [prefill, setPrefill] = useState<Prefill | undefined>(undefined);

  useEffect(() => {
    if (searchParams.get("log") !== "1") return;

    const assetType = searchParams.get("asset_type");
    const identifier = searchParams.get("identifier");
    const direction = searchParams.get("direction");
    const entryPrice = searchParams.get("entry_price");

    setPrefill({
      assetType: assetType === "crypto" ? "crypto" : "stock",
      identifier: identifier ?? "",
      direction: direction === "SHORT" ? "SHORT" : "LONG",
      entryPrice: entryPrice ?? "",
    });
    setOpen(true);

    // Strip the query params so refreshing/revisiting this URL later doesn't
    // silently reopen the modal with stale prefill data.
    router.replace("/dashboard/portfolio");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function close() {
    setOpen(false);
    setPrefill(undefined);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-medium text-zinc-300 hover:text-white border border-white/[0.1] hover:border-white/20 bg-white/[0.03] hover:bg-white/[0.06] px-3 py-1.5 rounded-lg transition-colors"
      >
        <Plus className="h-3.5 w-3.5" /> Add position
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={close}
          />
          <div className="relative bg-zinc-950/95 backdrop-blur-xl border border-white/[0.08] ring-hairline rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-semibold text-white tracking-tight mb-4">
              {prefill ? "Log this call" : "Add position"}
            </h2>
            <AddPositionForm onClose={close} prefill={prefill} />
          </div>
        </div>
      )}
    </>
  );
}
