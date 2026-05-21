"use client";

import { useState } from "react";
import AddAlertForm from "./AddAlertForm";

export default function AddAlertModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-3 py-1.5 rounded-lg transition-colors"
      >
        <span className="text-base leading-none">+</span> New alert
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="relative bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-base font-bold text-white mb-4">Create alert</h2>
            <AddAlertForm onClose={() => setOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
}
