import { useEffect, useRef, useState } from "react";
import type { Goal } from "../api/types";

export function GoalChainNode({
  goal,
  isLast,
  onToggleComplete,
  onSaveName,
  toggling,
  saving,
}: {
  goal: Goal;
  isLast: boolean;
  onToggleComplete: (goalId: string, completed: boolean) => void;
  onSaveName: (goalId: string, name: string) => void;
  toggling: boolean;
  saving: boolean;
}) {
  const completed = !!goal.completedAt;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goal.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setDraft(goal.name);
  }, [goal.name, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commitEdit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (trimmed !== goal.name) onSaveName(goal.id, trimmed);
    setEditing(false);
  }

  return (
    <div className="vision-chain-step">
      <div
        className={`vision-chain-node neon-card${
          completed ? " vision-chain-node--completed" : ""
        }`}
      >
        {completed && <span className="vision-chain-check" aria-hidden>✓</span>}

        <div className="vision-chain-node-body">
          {editing ? (
            <input
              ref={inputRef}
              className="neon-input vision-chain-edit-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitEdit();
                }
                if (e.key === "Escape") {
                  setDraft(goal.name);
                  setEditing(false);
                }
              }}
              disabled={saving}
            />
          ) : (
            <span className="vision-chain-goal-name">{goal.name}</span>
          )}
        </div>

        <div className="vision-chain-node-actions">
          <button
            type="button"
            className={`vision-chain-check-btn${completed ? " vision-chain-check-btn--done" : ""}`}
            aria-label={completed ? "Mark goal incomplete" : "Mark goal complete"}
            disabled={toggling}
            onClick={() => onToggleComplete(goal.id, !completed)}
          >
            {completed ? "✓" : "○"}
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Edit goal"
            disabled={saving}
            onClick={() => setEditing(true)}
          >
            ✎
          </button>
        </div>
      </div>

      {!isLast && <div className="vision-chain-connector" aria-hidden />}
    </div>
  );
}
