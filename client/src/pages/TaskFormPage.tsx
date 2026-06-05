import { FormEvent, useEffect, useState, type CSSProperties } from "react";
import { useNavigate, useParams } from "react-router-dom";
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
import { TIERS, type RewardTier } from "../domain/tiers";

export function TaskFormPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [tier, setTier] = useState<RewardTier>("Bronze");
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
        setTier(task.tier);
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
    if (enableScheduled && (!scheduledDate || !scheduledTime)) {
      return "Do date requires a date and time";
    }
    if (enableDue && (!dueDate || !dueTime)) {
      return "Due date requires a date and time";
    }
    if (recurrence === "Weekly" && daysOfWeek.length === 0) {
      return "Pick at least one day for weekly recurrence";
    }
    if (recurrence === "Monthly" && daysOfMonth.length === 0) {
      return "Pick at least one day for monthly recurrence";
    }
    return null;
  }

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validationError = validateForm();
      if (validationError) throw new Error(validationError);

      const body = {
        name,
        tier,
        section,
        persistAfterDone,
        scheduledAt: enableScheduled
          ? toISOFromLocal(scheduledDate, scheduledTime)
          : null,
        durationMinutes:
          enableScheduled && durationMinutes
            ? Number.parseInt(durationMinutes, 10)
            : null,
        dueAt: enableDue ? toISOFromLocal(dueDate, dueTime) : null,
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
      if (isNew && "token" in data) {
        navigate("/", { state: { tokenReward: data.token.tier } });
      } else {
        navigate("/");
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      navigate("/");
    },
  });

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
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0, fontSize: "0.85rem" }}>
          {isNew ? "New task" : "Edit task"}
        </h2>
        <button type="button" className="neon-btn neon-btn-sm" onClick={() => navigate("/")}>
          Back
        </button>
      </div>

      <form
        className="neon-card"
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

        <div className="form-field">
          <label htmlFor="tier">Tier when achieved</label>
          <select
            id="tier"
            className="neon-select"
            value={tier}
            onChange={(e) => setTier(e.target.value as RewardTier)}
          >
            {TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <fieldset className="schedule-fieldset">
          <label className="schedule-toggle">
            <input
              type="checkbox"
              checked={enableScheduled}
              onChange={(e) => setEnableScheduled(e.target.checked)}
            />
            Set do date &amp; planned length
          </label>
          {enableScheduled && (
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
            />
            Set due date
          </label>
          {enableDue && (
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
