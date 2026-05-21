"use client";

import { create } from "zustand";
import type { MarketVertical, SubscriptionTier } from "@/types";

interface AppState {
  activeVertical: MarketVertical;
  setActiveVertical: (v: MarketVertical) => void;

  subscription: SubscriptionTier;
  setSubscription: (t: SubscriptionTier) => void;

  selectedSignalId: string | null;
  setSelectedSignalId: (id: string | null) => void;

  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeVertical: "stocks",
  setActiveVertical: (v) => set({ activeVertical: v }),

  subscription: "free",
  setSubscription: (t) => set({ subscription: t }),

  selectedSignalId: null,
  setSelectedSignalId: (id) => set({ selectedSignalId: id }),

  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),
}));
