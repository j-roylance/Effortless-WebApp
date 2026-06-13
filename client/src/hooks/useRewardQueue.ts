import { useCallback, useState } from "react";
import type { RewardQueueItem } from "../domain/rewards";

/** Queue reward modals (tokens and definite rewards) in sequence. */
export function useRewardQueue() {
  const [queue, setQueue] = useState<RewardQueueItem[]>([]);

  const current = queue[0] ?? null;

  const enqueue = useCallback((items: RewardQueueItem[]) => {
    if (items.length === 0) return;
    setQueue((prev) => [...prev, ...items]);
  }, []);

  const dismissCurrent = useCallback(() => {
    setQueue((prev) => prev.slice(1));
  }, []);

  return { current, enqueue, dismissCurrent };
}
