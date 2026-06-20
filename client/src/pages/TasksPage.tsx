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
import { rewardsFromAchieve } from "../domain/achieve-rewards";
import { todayDateInput } from "../domain/calendar";
import { formatDateTime, isTaskPastDue } from "../domain/recurrence";
import {
  TASK_SECTIONS,
  TASK_SECTION_LABEL,
  TASK_TIME_BUCKETS,
  TASK_TIME_BUCKET_LABEL,
  groupTasksByTimeAndSection,
  normalizeSection,
  timeBucketHasTasks,
  type TaskSection,
  type TaskTimeBucket,
} from "../domain/tasks";
import { TIERS } from "../domain/tiers";
import { SpinPityHintForTier } from "../components/SpinPityHint";
import { DEFAULT_DAILY_SETTINGS, type DailySettings } from "../domain/daily";

function TaskSectionBlock({
  section,
  tasks,
  onAchieve,
  achieving,
  pityByTier,
  baseSpinWeights,
}: {
  section: TaskSection;
  tasks: Task[];
  onAchieve: (id: string) => void;
  achieving: boolean;
  pityByTier?: Record<RewardTier, SpinPityStatus>;
  baseSpinWeights?: SpinOutcomeWeights;
}) {
  const sectionClass = section.toLowerCase();

  return (
    <section className={`task-section task-section--${sectionClass}`}>
      <h3 className="task-section-title">{TASK_SECTION_LABEL[section]}</h3>

      {tasks.length === 0 ? (
        <p className="task-section-empty">No {sectionClass} tasks</p>
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              pastDue={isTaskPastDue(task.dueAt)}
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

function TaskTimeBlock({
  bucket,
  bySection,
  onAchieve,
  achieving,
  pityByTier,
  baseSpinWeights,
}: {
  bucket: TaskTimeBucket;
  bySection: Record<TaskSection, Task[]>;
  onAchieve: (id: string) => void;
  achieving: boolean;
  pityByTier?: Record<RewardTier, SpinPityStatus>;
  baseSpinWeights?: SpinOutcomeWeights;
}) {
  if (!timeBucketHasTasks(bySection)) return null;

  return (
    <section className={`task-time-block task-time-block--${bucket}`}>
      <h2 className="task-time-title">{TASK_TIME_BUCKET_LABEL[bucket]}</h2>
      {TASK_SECTIONS.map((section) => (
        <TaskSectionBlock
          key={`${bucket}-${section}`}
          section={section}
          tasks={bySection[section]}
          onAchieve={onAchieve}
          achieving={achieving}
          pityByTier={pityByTier}
          baseSpinWeights={baseSpinWeights}
        />
      ))}
    </section>
  );
}

function ArchivedTasksSection({
  show,
  onToggle,
  tasks,
  isLoading,
  isError,
  onRetry,
  onRestore,
  restoringId,
}: {
  show: boolean;
  onToggle: () => void;
  tasks: Task[];
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onRestore: (id: string) => void;
  restoringId: string | null;
}) {
  return (
    <section className="task-archived-block">
      <button type="button" className="task-archived-toggle" onClick={onToggle}>
        {show ? "Hide archived tasks" : "Show archived tasks"}
      </button>

      {show && (
        <div className="task-archived-panel">
          <h2 className="task-archived-title">
            Archived{tasks.length > 0 ? ` (${tasks.length})` : ""}
          </h2>
          {isLoading && <p className="task-section-empty">Loading archived tasks…</p>}
          {isError && (
            <p className="task-section-empty">
              Could not load archived tasks.{" "}
              <button type="button" className="link-btn" onClick={onRetry}>
                Retry
              </button>
            </p>
          )}
          {!isLoading && !isError && tasks.length === 0 && (
            <p className="task-section-empty">No archived tasks</p>
          )}
          {!isLoading && !isError && tasks.length > 0 && (
            <div className="task-list">
              {tasks.map((task) => (
                <article key={task.id} className="task-card task-card--archived neon-card">
                  <div className="task-card-header">
                    <div>
                      <h4 style={{ margin: "0 0 0.35rem", fontSize: "1.1rem" }}>{task.name}</h4>
                      <p className="task-archived-meta">
                        {TASK_SECTION_LABEL[normalizeSection(task.section)]}
                        {task.archivedAt
                          ? ` · Removed ${formatDateTime(task.archivedAt)}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="task-card-actions">
                    <button
                      type="button"
                      className="neon-btn neon-btn-primary"
                      style={{ flex: 1 }}
                      onClick={() => onRestore(task.id)}
                      disabled={restoringId === task.id}
                    >
                      {restoringId === task.id ? "Restoring…" : "Restore"}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export function TasksPage() {
  const queryClient = useQueryClient();
  const location = useLocation();
  const [showTokens, setShowTokens] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
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

  const {
    data: archivedData,
    isLoading: archivedLoading,
    isError: archivedError,
    refetch: refetchArchived,
  } = useQuery({
    queryKey: ["tasks", "archived"],
    queryFn: () => api<{ tasks: Task[] }>("/tasks/archived"),
    enabled: showArchived,
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
      queryClient.invalidateQueries({ queryKey: ["tasks", "archived"] });
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
      queryClient.invalidateQueries({ queryKey: ["likes"] });
      enqueueReward(rewardsFromAchieve(data));
    },
    onError: (err: Error) => setToast(err.message),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) =>
      api<{ task: Task }>(`/tasks/${id}/restore`, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tasks", "archived"] });
    },
    onError: (err: Error) => setToast(err.message),
  });

  const tasks = tasksData?.tasks ?? [];
  const archivedTasks = archivedData?.tasks ?? [];
  const tasksByTimeAndSection = useMemo(
    () => groupTasksByTimeAndSection(tasks, todayDateInput()),
    [tasks]
  );

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

      {!isLoading &&
        !isError &&
        TASK_TIME_BUCKETS.map((bucket) => (
          <TaskTimeBlock
            key={bucket}
            bucket={bucket}
            bySection={tasksByTimeAndSection[bucket]}
            onAchieve={handleAchieve}
            achieving={achieveMutation.isPending}
            pityByTier={pityByTier}
            baseSpinWeights={baseSpinWeights}
          />
        ))}

      {!isLoading && !isError && (
        <ArchivedTasksSection
          show={showArchived}
          onToggle={() => setShowArchived((v) => !v)}
          tasks={archivedTasks}
          isLoading={showArchived && archivedLoading}
          isError={showArchived && archivedError}
          onRetry={() => refetchArchived()}
          onRestore={(id) => restoreMutation.mutate(id)}
          restoringId={restoreMutation.isPending ? restoreMutation.variables ?? null : null}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <RewardModalHost reward={reward} onClose={dismissReward} />
    </>
  );
}
