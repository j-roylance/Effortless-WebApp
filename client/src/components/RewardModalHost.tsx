import { TokenRewardModal } from "./TokenRewardModal";
import { DefiniteRewardModal } from "./DefiniteRewardModal";
import type { RewardQueueItem } from "../domain/rewards";

export function RewardModalHost({
  reward,
  onClose,
}: {
  reward: RewardQueueItem | null;
  onClose: () => void;
}) {
  if (!reward) return null;
  if (reward.type === "token") {
    return <TokenRewardModal tier={reward.tier} onClose={onClose} />;
  }
  return <DefiniteRewardModal label={reward.label} onClose={onClose} />;
}
