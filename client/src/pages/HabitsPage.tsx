import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Habit, TokenBalances } from "../api/types";
import { TIERS, type RewardTier } from "../domain/tiers";
import { TierBadge } from "../components/TierBadge";
import { Toast } from "../components/Toast";

export function HabitsPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const navigate = useNavigate();
  const [showTokens, setShowTokens] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const msg = (location.state as { toast?: string } | null)?.toast;
    if (msg) {
      setToast(msg);
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname, navigate]);

  const { data: habitsData, isLoading } = useQuery({
    queryKey: ["habits"],
    queryFn: () => api<{ habits: Habit[] }>("/habits"),
  });

  const { data: tokenData } = useQuery({
    queryKey: ["tokens"],
    queryFn: () => api<TokenBalances>("/tokens"),
  });

  const achieveMutation = useMutation({
    mutationFn: (id: string) =>
      api<{ token: { tier: RewardTier } }>(`/habits/${id}/achieve`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
      setToast(`+1 ${data.token.tier} Token`);
    },
    onError: (err: Error) => setToast(err.message),
  });

  const habits = habitsData?.habits ?? [];
  const balances = tokenData?.balances;
  const totalTokens = balances
    ? TIERS.reduce((sum, t) => sum + (balances[t] ?? 0), 0)
    : 0;

  return (
    <>
      <div className="page-header">
        <h2 style={{ margin: 0, fontSize: "0.85rem" }}>Goals & Habits</h2>
        <button
          type="button"
          className="token-chip"
          onClick={() => setShowTokens((v) => !v)}
        >
          {totalTokens} tokens
        </button>
      </div>

      {showTokens && balances && (
        <div className="token-panel neon-card" style={{ marginBottom: "1rem" }}>
          {TIERS.map((tier) =>
            balances[tier] > 0 ? (
              <div key={tier} className="token-row">
                <span>{tier}</span>
                <span>{balances[tier]}</span>
              </div>
            ) : null
          )}
          {totalTokens === 0 && (
            <p style={{ margin: 0, color: "var(--text-dim)", fontSize: "0.9rem" }}>
              Achieve habits to earn tokens.
            </p>
          )}
        </div>
      )}

      {isLoading && <p className="empty-state">Loading habits…</p>}

      {!isLoading && habits.length === 0 && (
        <div className="empty-state neon-card">
          <p>No habits yet.</p>
          <p>Tap + to add your first goal.</p>
        </div>
      )}

      <div className="habit-list">
        {habits.map((habit) => (
          <article key={habit.id} className="habit-card neon-card">
            <div className="habit-card-header">
              <div>
                <h3 style={{ margin: "0 0 0.35rem", fontSize: "1.1rem" }}>{habit.name}</h3>
                <TierBadge tier={habit.tier} />
                {!habit.persistAfterDone && (
                  <span
                    style={{
                      marginLeft: "0.5rem",
                      fontSize: "0.7rem",
                      color: "var(--text-dim)",
                    }}
                  >
                    One-time
                  </span>
                )}
              </div>
              <Link to={`/habits/${habit.id}/edit`} className="icon-btn" aria-label="Edit">
                ✎
              </Link>
            </div>
            <div className="habit-card-actions">
              <button
                type="button"
                className="neon-btn neon-btn-primary"
                style={{ flex: 1 }}
                onClick={() => achieveMutation.mutate(habit.id)}
                disabled={achieveMutation.isPending}
              >
                Achieve
              </button>
            </div>
          </article>
        ))}
      </div>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
