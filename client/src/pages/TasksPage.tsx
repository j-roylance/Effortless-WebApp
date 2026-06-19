import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AchieveResult, RewardTier, SpinPityStatus, Task, TokenBalances } from "../api/types";
import type { SpinOutcomeWeights } from "../domain/spin-odds";
import { PageHeader } from "../components/PageHeader";
import { QueryErrorBanner } from "../components/QueryErrorBanner";
import { TaskCard } from "../components/TaskCard";
import { Toast } from "../components/Toast";
import { RewardModalHost } from "../components/RewardModalHost";
import { useTokenRewardFromNavigation } from "../hooks/useTokenRewardFromNavigation";
import { useRewardQueue } from "../hooks/useRewardQueue";
import { rewardsFromAchieve, rewardsFromPlanningClaim } from "../domain/achieve-rewards";
import { isTaskPastDue } from "../domain/recurrence";
import {
  TASK_SECTIONS,
  TASK_SECTION_LABEL,
  groupTasksBySection,
  type TaskSection,
} from "../domain/tasks";
import { TIERS } from "../domain/tiers";
import { SpinPityHintForTier } from "../components/SpinPityHint";
import { DEFAULT_DAILY_SETTINGS, type DailySettings } from "../domain/daily";

function TaskSectionBlock({
  section,
  tasks,
  pastDue,
  onAchieve,
  achieving,
  pityByTier,
  baseSpinWeights,
}: {
  section: TaskSection;
  tasks: Task[];
  pastDue?: boolean;
  onAchieve: (id: string) => void;
  achieving: boolean;
  pityByTier?: Record<RewardTier, SpinPityStatus>;
  baseSpinWeights?: SpinOutcomeWeights;
}) {
  const sectionClass = section.toLowerCase();

  return (
    <section
      className={`task-section task-section--${sectionClass}${
        pastDue ? " task-section--past-due-nested" : ""
      }`}
    >
      <h3 className="task-section-title">{TASK_SECTION_LABEL[section]}</h3>

      {tasks.length === 0 ? (
        <p className="task-section-empty">No {sectionClass} tasks</p>
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              pastDue={pastDue}
              onAchieve={onAchieve}
              achieving={achieving}
              pityByTier={pityByTier}
              baseSpinWeights={baseSpinWeights}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export function TasksPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [showTokens, setShowTokens] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const { current: reward, enqueue: enqueueReward, dismissCurrent: dismissReward } =
    useRewardQueue();

  useTokenRewardFromNavigation(
    (tiers) => enqueueReward(tiers.map((tier) => ({ type: "token", tier }))),
    location.pathname,
    setToast
  );

  const { data: tasksData, isLoading, isError, refetch } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api<{ tasks: Task[] }>("/tasks"),
  });

  const { data: tokenData } = useQuery({
    queryKey: ["tokens"],
    queryFn: () => api<TokenBalances>("/tokens"),
  });

  const { data: settingsData } = useQuery({
    queryKey: ["daily-settings"],
    queryFn: () => api<DailySettings>("/daily-settings"),
  });

  const achieveMutation = useMutation({
    mutationFn: (id: string) =>
      api<AchieveResult>(`/tasks/${id}/achieve`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
      queryClient.invalidateQueries({ queryKey: ["likes"] });
      enqueueReward(rewardsFromAchieve(data));
    },
    onError: (err: Error) => setToast(err.message),
  });

  const tasks = tasksData?.tasks ?? [];
  const activeBySection = useMemo(() => groupTasksBySection(tasks, false), [tasks]);
  const pastDueBySection = useMemo(() => groupTasksBySection(tasks, true), [tasks]);
  const hasPastDue = useMemo(() => tasks.some((t) => isTaskPastDue(t.dueAt)), [tasks]);

  const balances = tokenData?.balances;
  const pityByTier = tokenData?.pityByTier;
  const baseSpinWeights =
    settingsData?.spinOutcomeWeights ?? DEFAULT_DAILY_SETTINGS.spinOutcomeWeights;
  const totalTokens = balances
    ? TIERS.reduce((sum, t) => sum + (balances[t] ?? 0), 0)
    : 0;

  const handleAchieve = (id: string) => achieveMutation.mutate(id);

  return (
    <>
      <PageHeader
        title="Tasks"
        action={
          <button
            type="button"
            className="token-chip"
            onClick={() => setShowTokens((v) => !v)}
          >
            {totalTokens} tokens
          </button>
        }
      />

      {showTokens && balances && (
        <div className="token-panel neon-card" style={{ marginBottom: "1rem" }}>
          {TIERS.map((tier) =>
            balances[tier] > 0 ? (
              <div key={tier} className="token-row">
                <span>{tier}</span>
                <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <SpinPityHintForTier
                    tier={tier}
                    pityByTier={pityByTier}
                    baseWeights={baseSpinWeights}
                  />
                  <span>{balances[tier]}</span>
                </span>
              </div>
            ) : null
          )}
          {totalTokens === 0 && (
            <p style={{ margin: 0, color: "var(--text-dim)", fontSize: "0.9rem" }}>
              Complete tasks to earn tokens.
            </p>
          )}
        </div>
      )}

      {isLoading && <p className="empty-state">Loading tasks…</p>}

      {isError && (
        <QueryErrorBanner onRetry={() => refetch()} />
      )}

      {!isLoading && !isError && tasks.length === 0 && (
        <div className="empty-state neon-card">
          <p>No tasks yet.</p>
          <p>Tap + to add your first to-do.</p>
        </div>
      )}

      {!isLoading && !isError &&
        TASK_SECTIONS.map((section) => (
          <TaskSectionBlock
            key={section}
            section={section}
            tasks={activeBySection[section]}
            onAchieve={handleAchieve}
            achieving={achieveMutation.isPending}
            pityByTier={pityByTier}
            baseSpinWeights={baseSpinWeights}
          />
        ))}

      {!isLoading && !isError && hasPastDue && (
        <section className="past-due-block">
          <h2 className="past-due-title">Past Due</h2>
          {TASK_SECTIONS.map((section) => (
            <TaskSectionBlock
              key={`past-${section}`}
              section={section}
              tasks={pastDueBySection[section]}
              pastDue
              onAchieve={handleAchieve}
              achieving={achieveMutation.isPending}
              pityByTier={pityByTier}
              baseSpinWeights={baseSpinWeights}
            />
          ))}
        </section>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <RewardModalHost reward={reward} onClose={dismissReward} />
    </>
  );
}
