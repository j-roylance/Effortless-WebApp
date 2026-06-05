import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { RewardTier } from "../domain/tiers";

/**
 * After navigating with `state: { tokenReward }` (e.g. from TaskFormPage),
 * enqueue the tier and clear location state so refresh does not replay it.
 */
export function useTokenRewardFromNavigation(
  enqueue: (tiers: RewardTier[]) => void,
  clearPath: string
) {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const state = location.state as { tokenReward?: RewardTier } | null;
    if (!state?.tokenReward) return;

    enqueue([state.tokenReward]);
    navigate(clearPath, { replace: true, state: {} });
  }, [location.state, clearPath, navigate, enqueue]);
}
