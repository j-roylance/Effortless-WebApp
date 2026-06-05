import { useCallback, useState } from "react";
import type { RewardTier } from "../domain/tiers";

/** Queue tier modals so task achieve can show task token then daily bonuses in sequence. */
export function useTokenRewardQueue() {
  const [queue, setQueue] = useState<RewardTier[]>([]);

  const current = queue[0] ?? null;

  const enqueue = useCallback((tiers: RewardTier[]) => {
    const filtered = tiers.filter(Boolean);
    if (filtered.length === 0) return;
    setQueue((prev) => [...prev, ...filtered]);
  }, []);

  const dismissCurrent = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  return { current, enqueue, dismissCurrent };
}
