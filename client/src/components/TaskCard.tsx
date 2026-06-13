import { Link } from "react-router-dom";
import type { Task } from "../api/types";
import {
  formatDateTime,
  formatDuration,
  isTaskAchievedToday,
  recurrenceSummary,
} from "../domain/recurrence";
import { rewardSummary } from "../domain/rewards";
import { TierBadge } from "./TierBadge";

export function TaskCard({
  task,
  onAchieve,
  achieving,
  pastDue,
}: {
  task: Task;
  onAchieve: (id: string) => void;
  achieving: boolean;
  pastDue?: boolean;
}) {
  const repeatLabel = recurrenceSummary(task.recurrence, task.recurrenceConfig);
  const achievedToday = isTaskAchievedToday(task.achievedAt);
  const rewardLabel = rewardSummary(
    task.rewardKind,
    task.tier,
    task.rewardLikeLabel,
    task.customRewardLabel
  );

  return (
    <article className={`task-card neon-card${pastDue ? " task-card--past-due" : ""}`}>
      <div className="task-card-header">
        <div>
          <h4 style={{ margin: "0 0 0.35rem", fontSize: "1.1rem" }}>{task.name}</h4>
          {task.rewardKind === "Token" && task.tier ? (
            <TierBadge tier={task.tier} />
          ) : (
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-dim)",
                fontFamily: "var(--font-display)",
              }}
            >
              {rewardLabel}
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
