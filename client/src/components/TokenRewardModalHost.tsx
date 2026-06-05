import { TokenRewardModal } from "./TokenRewardModal";
import type { RewardTier } from "../domain/tiers";

/** Renders the token celebration modal when a tier is queued. */
export function TokenRewardModalHost({
  tier,
  onClose,
}: {
  tier: RewardTier | null;
  onClose: () => void;
}) {
  if (!tier) return null;
  return <TokenRewardModal tier={tier} onClose={onClose} />;
}
