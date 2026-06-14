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
    return (
      <TokenRewardModal tier={reward.tier} headline={reward.headline} onClose={onClose} />
    );
  }
  return (
    <DefiniteRewardModal
      label={reward.label}
      headline={reward.headline}
      onClose={onClose}
    />
  );
}
