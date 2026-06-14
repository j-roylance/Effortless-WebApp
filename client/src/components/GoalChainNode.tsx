import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Goal } from "../api/types";

export function GoalChainNode({
  goal,
  visionId,
  isLast,
  onToggleComplete,
  onSaveName,
  onDelete,
  toggling,
  saving,
  deleting,
}: {
  goal: Goal;
  visionId: string;
  isLast: boolean;
  onToggleComplete: (goalId: string, completed: boolean) => void;
  onSaveName: (goalId: string, name: string) => void;
  onDelete: (goalId: string) => void;
  toggling: boolean;
  saving: boolean;
  deleting: boolean;
}) {
  const navigate = useNavigate();
  const completed = !!goal.completedAt;
  const [editing, setEditing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState(goal.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = toggling || saving || deleting;

  useEffect(() => {
    if (!editing) setDraft(goal.name);
  }, [goal.name, editing]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function commitEdit() {
    const trimmed = draft.trim();
    if (!trimmed) {
      setDraft(goal.name);
      setEditing(false);
      return;
    }
    if (trimmed !== goal.name) onSaveName(goal.id, trimmed);
    setEditing(false);
  }

  function handleDelete() {
    setMenuOpen(false);
    if (confirm("Delete this goal and all sub-goals?")) {
      onDelete(goal.id);
    }
  }

  return (
    <>
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
              disabled={busy}
              onClick={() => setMenuOpen(true)}
            >
              ✎
            </button>
          </div>
        </div>

        {!isLast && <div className="vision-chain-connector" aria-hidden />}
      </div>

      {menuOpen && (
        <div
          className="modal-overlay"
          onClick={() => setMenuOpen(false)}
          role="presentation"
        >
          <div
            className="goal-action-sheet neon-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="goal-action-title"
          >
            <h2 id="goal-action-title" className="goal-action-sheet-title">
              Goal options
            </h2>
            <p className="goal-action-sheet-name">{goal.name}</p>
            <div className="goal-action-sheet-actions">
              <button
                type="button"
                className="neon-btn neon-btn-primary"
                onClick={() => {
                  setMenuOpen(false);
                  setEditing(true);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="neon-btn"
                onClick={() => {
                  setMenuOpen(false);
                  navigate(`/visions/${visionId}/chain/${goal.id}`);
                }}
              >
                Step into
              </button>
              <button
                type="button"
                className="neon-btn goal-action-sheet-delete"
                disabled={deleting}
                onClick={handleDelete}
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                className="neon-btn"
                onClick={() => setMenuOpen(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
