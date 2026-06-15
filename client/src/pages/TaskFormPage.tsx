import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Task } from "../api/types";
import {
  RECURRENCE_LABEL,
  TASK_RECURRENCES,
  WEEKDAY_LABELS,
  toISOFromLocal,
  toLocalDateInput,
  toLocalTimeInput,
  type RecurrenceConfig,
  type TaskRecurrence,
} from "../domain/recurrence";
import {
  TASK_SECTIONS,
  TASK_SECTION_COLOR,
  TASK_SECTION_LABEL,
  normalizeSection,
  type TaskSection,
} from "../domain/tasks";
import { PageHeader } from "../components/PageHeader";
import { TaskRewardsEditor, taskToRewardsList } from "../components/TaskRewardsEditor";
import type { UserLike } from "../api/types";
import type { MilestoneReward } from "../domain/rewards";
import type { RewardTier } from "../domain/tiers";

export function TaskFormPage({
  embedded = false,
  initialDate,
  returnTo: returnToProp,
  onClose,
}: {
  embedded?: boolean;
  initialDate?: string;
  returnTo?: string;
  onClose?: () => void;
} = {}) {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const returnTo =
    returnToProp ??
    (location.state as { returnTo?: string } | null)?.returnTo ??
    "/";

  const [name, setName] = useState("");
  const [taskRewards, setTaskRewards] = useState<MilestoneReward[]>([
    { kind: "token", tier: "Bronze" },
  ]);
  const [section, setSection] = useState<TaskSection>("Could");
  const [persistAfterDone, setPersistAfterDone] = useState(true);
  const [error, setError] = useState("");

  const [enableScheduled, setEnableScheduled] = useState(false);
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledTime, setScheduledTime] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");

  const [enableDue, setEnableDue] = useState(false);
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");

  const [recurrence, setRecurrence] = useState<TaskRecurrence>("None");
  const [recurrenceTime, setRecurrenceTime] = useState("09:00");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [daysOfMonth, setDaysOfMonth] = useState<number[]>([]);

  useEffect(() => {
    if (isNew && initialDate) {
      setEnableScheduled(true);
      setScheduledDate(initialDate);
      setScheduledTime("09:00");
    }
  }, [isNew, initialDate]);

  const { data: likesData } = useQuery({
    queryKey: ["likes"],
    queryFn: () => api<{ likes: UserLike[] }>("/likes"),
  });
  const likes = likesData?.likes ?? [];

  const { data } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api<{ tasks: Task[] }>("/tasks"),
    enabled: !isNew,
  });

  useEffect(() => {
    if (!isNew && data?.tasks) {
      const task = data.tasks.find((t) => t.id === id);
      if (task) {
        setName(task.name);
        setTaskRewards(taskToRewardsList(task));
        setSection(normalizeSection(task.section));
        setPersistAfterDone(task.persistAfterDone);

        setEnableScheduled(!!task.scheduledAt);
        setScheduledDate(toLocalDateInput(task.scheduledAt));
        setScheduledTime(toLocalTimeInput(task.scheduledAt) || "09:00");
        setDurationMinutes(task.durationMinutes ? String(task.durationMinutes) : "");

        setEnableDue(!!task.dueAt);
        setDueDate(toLocalDateInput(task.dueAt));
        setDueTime(toLocalTimeInput(task.dueAt) || "17:00");

        setRecurrence(task.recurrence);
        const cfg = task.recurrenceConfig;
        setRecurrenceTime(cfg?.time ?? "09:00");
        setDaysOfWeek(cfg?.daysOfWeek ?? []);
        setDaysOfMonth(cfg?.daysOfMonth ?? []);
      }
    }
  }, [isNew, id, data]);

  function toggleDayOfWeek(day: number) {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  }

  function toggleDayOfMonth(day: number) {
    setDaysOfMonth((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort((a, b) => a - b)
    );
  }

  function buildRecurrenceConfig(): RecurrenceConfig | null {
    if (recurrence === "None") return null;
    const config: RecurrenceConfig = { time: recurrenceTime };
    if (recurrence === "Weekly") config.daysOfWeek = daysOfWeek;
    if (recurrence === "Monthly") config.daysOfMonth = daysOfMonth;
    return config;
  }

  function validateForm(): string | null {
    if (!name.trim()) return "Name is required";
    if (recurrence === "None") {
      if (enableScheduled && (!scheduledDate || !scheduledTime)) {
        return "Do date requires a date and time";
      }
      if (enableDue && (!dueDate || !dueTime)) {
        return "Due date requires a date and time";
      }
    }
    if (recurrence === "Weekly" && daysOfWeek.length === 0) {
      return "Pick at least one day for weekly recurrence";
    }
    if (recurrence === "Monthly" && daysOfMonth.length === 0) {
      return "Pick at least one day for monthly recurrence";
    }
    for (const reward of taskRewards) {
      if (reward.kind === "token" && !reward.tier) {
        return "Token reward requires a tier";
      }
      if (reward.kind === "like" && !reward.likeId) {
        return "Select a like for each like reward";
      }
      if (reward.kind === "custom" && !reward.label.trim()) {
        return "Custom reward requires a label";
      }
    }
    return null;
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validationError = validateForm();
      if (validationError) throw new Error(validationError);

      const isRepeating = recurrence !== "None";
      const activeRewards = taskRewards.filter(
        (reward): reward is Exclude<MilestoneReward, { kind: "none" }> => reward.kind !== "none"
      );
      const body = {
        name,
        rewards: activeRewards,
        section,
        persistAfterDone,
        scheduledAt: isRepeating
          ? null
          : enableScheduled
            ? toISOFromLocal(scheduledDate, scheduledTime)
            : null,
        durationMinutes:
          (isRepeating || enableScheduled) && durationMinutes
            ? Number.parseInt(durationMinutes, 10)
            : null,
        dueAt: isRepeating
          ? null
          : enableDue
            ? toISOFromLocal(dueDate, dueTime)
            : null,
        recurrence,
        recurrenceConfig: buildRecurrenceConfig(),
      };

      if (isNew) {
        return api<{ task: Task; token: { tier: RewardTier } }>("/tasks", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      return api<{ task: Task }>(`/tasks/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
      if (embedded && onClose) {
        onClose();
        if (isNew && "token" in data) {
          navigate(returnTo, { state: { tokenReward: data.token.tier } });
        }
        return;
      }
      if (isNew && "token" in data) {
        navigate(returnTo, { state: { tokenReward: data.token.tier } });
      } else {
        navigate(returnTo);
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      if (embedded && onClose) {
        onClose();
      } else {
        navigate(returnTo);
      }
    },
  });

  function handleBack() {
    if (embedded && onClose) {
      onClose();
    } else {
      navigate(returnTo);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const validationError = validateForm();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    saveMutation.mutate();
  }

  return (
    <div className={embedded ? "task-form-embedded" : undefined}>
      <PageHeader
        title={isNew ? "New task" : "Edit task"}
        action={
          <button type="button" className="neon-btn neon-btn-sm" onClick={handleBack}>
            Back
          </button>
        }
      />

      <form
        className={embedded ? undefined : "neon-card"}
        onSubmit={handleSubmit}
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        {error && <p className="form-error">{error}</p>}

        <div className="form-field">
          <label htmlFor="name">Task name</label>
          <input
            id="name"
            className="neon-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="form-field">
          <span
            style={{
              display: "block",
              marginBottom: "0.35rem",
              color: "var(--text-dim)",
              fontSize: "0.85rem",
            }}
          >
            Section
          </span>
          <div className="task-section-picker">
            {TASK_SECTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`section-pill${section === option ? " active" : ""}`}
                style={{ "--pill-color": TASK_SECTION_COLOR[option] } as CSSProperties}
                onClick={() => setSection(option)}
              >
                {TASK_SECTION_LABEL[option]}
              </button>
            ))}
          </div>
        </div>

        <TaskRewardsEditor
          idPrefix="task-reward"
          rewards={taskRewards}
          onChange={setTaskRewards}
          likes={likes}
        />

        <fieldset className="schedule-fieldset">
          <label className="schedule-toggle">
            <input
              type="checkbox"
              checked={enableScheduled}
              onChange={(e) => setEnableScheduled(e.target.checked)}
              disabled={recurrence !== "None"}
            />
            Set do date &amp; planned length
          </label>
          {recurrence === "None" && enableScheduled && (
            <div className="schedule-fields">
              <div className="datetime-row">
                <input
                  type="date"
                  className="neon-input"
                  value={scheduledDate}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
                <input
                  type="time"
                  className="neon-input"
                  value={scheduledTime}
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>
              <label htmlFor="duration" className="schedule-sub-label">
                Planned length (minutes)
              </label>
              <input
                id="duration"
                type="number"
                min={1}
                max={1440}
                className="neon-input"
                placeholder="e.g. 30"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
            </div>
          )}
        </fieldset>

        <fieldset className="schedule-fieldset">
          <label className="schedule-toggle">
            <input
              type="checkbox"
              checked={enableDue}
              onChange={(e) => setEnableDue(e.target.checked)}
              disabled={recurrence !== "None"}
            />
            Set due date
          </label>
          {recurrence === "None" && enableDue && (
            <div className="schedule-fields">
              <div className="datetime-row">
                <input
                  type="date"
                  className="neon-input"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
                <input
                  type="time"
                  className="neon-input"
                  value={dueTime}
                  onChange={(e) => setDueTime(e.target.value)}
                />
              </div>
              <p className="schedule-hint">After this time the task moves to Past Due.</p>
            </div>
          )}
        </fieldset>

        <fieldset className="schedule-fieldset">
          <span className="schedule-sub-label">Repeating do date</span>
          <div className="recurrence-type-row">
            {TASK_RECURRENCES.map((option) => (
              <button
                key={option}
                type="button"
                className={`section-pill${recurrence === option ? " active" : ""}`}
                style={{ "--pill-color": "var(--cyan)" } as CSSProperties}
                onClick={() => setRecurrence(option)}
              >
                {option === "None" ? "None" : RECURRENCE_LABEL[option]}
              </button>
            ))}
          </div>
          {recurrence !== "None" && (
            <div className="schedule-fields">
              <label htmlFor="recurrenceTime" className="schedule-sub-label">
                Time of day
              </label>
              <input
                id="recurrenceTime"
                type="time"
                className="neon-input"
                value={recurrenceTime}
                onChange={(e) => setRecurrenceTime(e.target.value)}
              />

              {recurrence === "Weekly" && (
                <>
                  <span className="schedule-sub-label">Days of week</span>
                  <div className="day-picker-row">
                    {WEEKDAY_LABELS.map((label, index) => (
                      <button
                        key={label}
                        type="button"
                        className={`day-pill${daysOfWeek.includes(index) ? " active" : ""}`}
                        onClick={() => toggleDayOfWeek(index)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {recurrence === "Monthly" && (
                <>
                  <span className="schedule-sub-label">Days of month</span>
                  <div className="month-day-grid">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <button
                        key={day}
                        type="button"
                        className={`day-pill day-pill--compact${
                          daysOfMonth.includes(day) ? " active" : ""
                        }`}
                        onClick={() => toggleDayOfMonth(day)}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </>
              )}

              <label htmlFor="repeatDuration" className="schedule-sub-label">
                Planned length (minutes)
              </label>
              <input
                id="repeatDuration"
                type="number"
                min={1}
                max={1440}
                className="neon-input"
                placeholder="e.g. 30"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
              />
              <p className="schedule-hint">
                Optional estimate of how long the task takes (shown on the task card).
              </p>
            </div>
          )}
        </fieldset>

        <div className="form-field">
          <span
            style={{
              display: "block",
              marginBottom: "0.35rem",
              color: "var(--text-dim)",
              fontSize: "0.85rem",
            }}
          >
            After achieved
          </span>
          <div className="radio-group">
            <label>
              <input
                type="radio"
                name="persist"
                checked={persistAfterDone}
                onChange={() => setPersistAfterDone(true)}
              />
              Stay on list
            </label>
            <label>
              <input
                type="radio"
                name="persist"
                checked={!persistAfterDone}
                onChange={() => setPersistAfterDone(false)}
              />
              One-time (remove after achieved)
            </label>
          </div>
        </div>

        {isNew && (
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-dim)" }}>
            Adding a new task earns +1 Bronze Token.
          </p>
        )}

        <button
          type="submit"
          className="neon-btn neon-btn-primary"
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving…" : "Save"}
        </button>

        {!isNew && (
          <button
            type="button"
            className="neon-btn"
            style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
            onClick={() => {
              if (confirm("Delete this task?")) deleteMutation.mutate();
            }}
          >
            Delete
          </button>
        )}
      </form>
    </div>
  );
}
