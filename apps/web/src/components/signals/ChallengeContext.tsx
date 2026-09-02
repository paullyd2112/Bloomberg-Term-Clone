"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

type ChallengeCtx = {
  hasActiveChallenge: boolean;
  challengeAssetClass: string | null;
};

const ChallengeContext = createContext<ChallengeCtx>({
  hasActiveChallenge: false,
  challengeAssetClass: null,
});

export function useChallengeContext() {
  return useContext(ChallengeContext);
}

export function ChallengeProvider({ children }: { children: ReactNode }) {
  const [ctx, setCtx] = useState<ChallengeCtx>({
    hasActiveChallenge: false,
    challengeAssetClass: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/challenges")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        if (data.active) {
          setCtx({
            hasActiveChallenge: true,
            challengeAssetClass: data.active.asset_class,
          });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <ChallengeContext.Provider value={ctx}>
      {children}
    </ChallengeContext.Provider>
  );
}
