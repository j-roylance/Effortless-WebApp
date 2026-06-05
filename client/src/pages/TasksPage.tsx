import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Task, TokenBalances } from "../api/types";
import { TaskCard } from "../components/TaskCard";
import { Toast } from "../components/Toast";
import { isTaskPastDue } from "../domain/recurrence";
import {
  TASK_SECTIONS,
  TASK_SECTION_LABEL,
  groupTasksBySection,
  type TaskSection,
} from "../domain/tasks";
import { TIERS, type RewardTier } from "../domain/tiers";

function TaskSectionBlock({
  section,
  tasks,
  pastDue,
  onAchieve,
  achieving,
}: {
  section: TaskSection;
  tasks: Task[];
  pastDue?: boolean;
  onAchieve: (id: string) => void;
  achieving: boolean;
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

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api<{ tasks: Task[] }>("/tasks"),
  });

  const { data: tokenData } = useQuery({
    queryKey: ["tokens"],
    queryFn: () => api<TokenBalances>("/tokens"),
  });

  const achieveMutation = useMutation({
    mutationFn: (id: string) =>
      api<{ token: { tier: RewardTier } }>(`/tasks/${id}/achieve`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
      setToast(`+1 ${data.token.tier} Token`);
    },
    onError: (err: Error) => setToast(err.message),
  });

  const tasks = tasksData?.tasks ?? [];
  const activeBySection = useMemo(() => groupTasksBySection(tasks, false), [tasks]);
  const pastDueBySection = useMemo(() => groupTasksBySection(tasks, true), [tasks]);
  const hasPastDue = useMemo(() => tasks.some((t) => isTaskPastDue(t.dueAt)), [tasks]);

  const balances = tokenData?.balances;
  const totalTokens = balances
    ? TIERS.reduce((sum, t) => sum + (balances[t] ?? 0), 0)
    : 0;

  const handleAchieve = (id: string) => achieveMutation.mutate(id);

  return (
    <>
      <div className="page-header">
        <h2 style={{ margin: 0, fontSize: "0.85rem" }}>Tasks</h2>
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
              Complete tasks to earn tokens.
            </p>
          )}
        </div>
      )}

      {isLoading && <p className="empty-state">Loading tasks…</p>}

      {!isLoading && tasks.length === 0 && (
        <div className="empty-state neon-card">
          <p>No tasks yet.</p>
          <p>Tap + to add your first to-do.</p>
        </div>
      )}

      {!isLoading &&
        TASK_SECTIONS.map((section) => (
          <TaskSectionBlock
            key={section}
            section={section}
            tasks={activeBySection[section]}
            onAchieve={handleAchieve}
            achieving={achieveMutation.isPending}
          />
        ))}

      {!isLoading && hasPastDue && (
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
            />
          ))}
        </section>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
