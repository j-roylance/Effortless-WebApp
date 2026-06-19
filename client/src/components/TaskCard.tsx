import { Link } from "react-router-dom";
import type { RewardTier, SpinPityStatus, Task } from "../api/types";
import type { SpinOutcomeWeights } from "../domain/spin-odds";
import {
  formatDateTime,
  formatDuration,
  isTaskAchievedToday,
  recurrenceSummary,
} from "../domain/recurrence";
import { rewardSummaries } from "../domain/task-rewards";
import { SpinPityHintForTier } from "./SpinPityHint";
import { TierBadge } from "./TierBadge";

export function TaskCard({
  task,
  onAchieve,
  achieving,
  pastDue,
  pityByTier,
  baseSpinWeights,
}: {
  task: Task;
  onAchieve: (id: string) => void;
  achieving: boolean;
  pastDue?: boolean;
  pityByTier?: Record<RewardTier, SpinPityStatus>;
  baseSpinWeights?: SpinOutcomeWeights;
}) {
  const repeatLabel = recurrenceSummary(task.recurrence, task.recurrenceConfig);
  const achievedToday = isTaskAchievedToday(task.achievedAt);
  const rewards = task.rewards ?? [];
  const summaries = rewardSummaries(rewards);

  return (
    <article className={`task-card neon-card${pastDue ? " task-card--past-due" : ""}`}>
      <div className="task-card-header">
        <div>
          <h4 style={{ margin: "0 0 0.35rem", fontSize: "1.1rem" }}>{task.name}</h4>
          {rewards.length > 0 ? (
            <div className="task-reward-badges">
              {rewards.map((reward, index) =>
                reward.kind === "token" ? (
                  <span key={`${task.id}-token-${index}`} className="task-reward-token">
                    <TierBadge tier={reward.tier} />
                    {pityByTier && baseSpinWeights && (
                      <SpinPityHintForTier
                        tier={reward.tier}
                        pityByTier={pityByTier}
                        baseWeights={baseSpinWeights}
                      />
                    )}
                  </span>
                ) : (
                  <span key={`${task.id}-reward-${index}`} className="task-reward-chip">
                    {summaries[index]}
                  </span>
                )
              )}
            </div>
          ) : (
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-dim)",
                fontFamily: "var(--font-display)",
              }}
            >
              No reward
            </span>
          )}
          {!task.persistAfterDone && (
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
        <Link to={`/tasks/${task.id}/edit`} className="icon-btn" aria-label="Edit task">
          ✎
        </Link>
      </div>

      {(task.scheduledAt || task.dueAt || repeatLabel) && (
        <div className="task-schedule-meta">
          {task.scheduledAt && (
            <span>
              Do: {formatDateTime(task.scheduledAt)}
              {task.durationMinutes ? ` · ${formatDuration(task.durationMinutes)}` : ""}
            </span>
          )}
          {task.dueAt && (
            <span className={pastDue ? "task-due-overdue" : undefined}>
              Due: {formatDateTime(task.dueAt)}
            </span>
          )}
          {repeatLabel && <span>{repeatLabel}</span>}
        </div>
      )}

      <div className="task-card-actions">
        <button
          type="button"
          className="neon-btn neon-btn-primary"
          style={{ flex: 1 }}
          onClick={() => onAchieve(task.id)}
          disabled={achieving || achievedToday}
        >
          {achievedToday ? "Achieved today" : "Achieve"}
        </button>
      </div>
    </article>
  );
}
