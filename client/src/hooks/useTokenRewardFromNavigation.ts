import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { RewardTier } from "../domain/tiers";

type NavigationRewardState = {
  tokenReward?: RewardTier;
  toast?: string;
};

/**
 * Consume `location.state` after form navigation: token modal queue + optional toast.
 * Ref guard prevents StrictMode from enqueueing the same reward twice in dev.
 */
export function useTokenRewardFromNavigation(
  enqueue: (tiers: RewardTier[]) => void,
  clearPath: string,
  onToast?: (message: string) => void
) {
  const location = useLocation();
  const navigate = useNavigate();
  const consumedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const state = location.state as NavigationRewardState | null;
    if (!state?.tokenReward && !state?.toast) return;

    const key = `${location.key}:${JSON.stringify(state)}`;
    if (consumedKeyRef.current === key) return;
    consumedKeyRef.current = key;

    if (state.tokenReward) enqueue([state.tokenReward]);
    if (state.toast && onToast) onToast(state.toast);

    navigate(clearPath, { replace: true, state: {} });
  }, [location.state, location.key, clearPath, navigate, enqueue, onToast]);
}
