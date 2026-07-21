"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import AddPositionForm, { type PositionDefaults } from "./AddPositionForm";

export default function AddPositionModal({
  defaults,
  autoOpen = false,
}: {
  defaults?: PositionDefaults;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen);

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
            onClick={() => setOpen(false)}
          />
          <div className="relative bg-zinc-950/95 backdrop-blur-xl border border-white/[0.08] ring-hairline rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-semibold text-white tracking-tight mb-4">
              {defaults?.identifier ? `Trade ${defaults.identifier}` : "Add position"}
            </h2>
            <AddPositionForm onClose={() => setOpen(false)} defaults={defaults} />
          </div>
        </div>
      )}
    </>
  );
}
