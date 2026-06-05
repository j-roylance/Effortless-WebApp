import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AchieveResult, BonusToken, Task } from "../api/types";
import { TokenRewardModal } from "../components/TokenRewardModal";
import { useTokenRewardQueue } from "../hooks/useTokenRewardQueue";
import { useAuth } from "../context/AuthContext";
import { TaskFormPage } from "./TaskFormPage";
import {
  CALENDAR_HOUR_HEIGHT,
  entriesForDay,
  formatHourLabel,
  isPlanningDone,
  minutesFromPointerY,
  dateTimeFromMinutes,
  setPlanningDone,
  todayDateInput,
  type CalendarEntry,
} from "../domain/calendar";
import { toLocalDateInput } from "../domain/recurrence";
import { TASK_SECTION_COLOR, normalizeSection } from "../domain/tasks";
import type { RewardTier } from "../domain/tiers";

function shiftDate(dateInput: string, deltaDays: number): string {
  const d = new Date(`${dateInput}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return toLocalDateInput(d.toISOString());
}

export function CalendarPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const gridRef = useRef<HTMLDivElement>(null);
  const dragListenersRef = useRef<{ move: (e: PointerEvent) => void; up: () => void } | null>(
    null
  );

  const [selectedDate, setSelectedDate] = useState(todayDateInput());
  const [showNewTask, setShowNewTask] = useState(false);
  const [planningTick, setPlanningTick] = useState(0);
  const { current: tokenReward, enqueue: enqueueTokenReward, dismissCurrent: dismissTokenReward } =
    useTokenRewardQueue();
  const [dragging, setDragging] = useState<CalendarEntry | null>(null);
  const [dragMinutes, setDragMinutes] = useState<number | null>(null);

  useEffect(() => {
    const state = location.state as { tokenReward?: RewardTier } | null;
    if (state?.tokenReward) {
      enqueueTokenReward([state.tokenReward]);
      navigate("/calendar", { replace: true, state: {} });
    }
  }, [location.state, navigate, enqueueTokenReward]);

  const { data: tasksData, isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: () => api<{ tasks: Task[] }>("/tasks"),
  });

  const tasks = tasksData?.tasks ?? [];
  const entries = useMemo(
    () => entriesForDay(tasks, selectedDate),
    [tasks, selectedDate]
  );

  const isToday = selectedDate === todayDateInput();
  const showPlanningButton = useMemo(
    () => isToday && !!user?.id && !isPlanningDone(user.id, todayDateInput()),
    [isToday, user?.id, planningTick]
  );

  const rescheduleMutation = useMutation({
    mutationFn: ({
      task,
      entry,
      minutes,
    }: {
      task: Task;
      entry: CalendarEntry;
      minutes: number;
    }) => {
      const iso = dateTimeFromMinutes(selectedDate, minutes);
      const body =
        entry.type === "do"
          ? {
              scheduledAt: iso,
              durationMinutes: task.durationMinutes,
              dueAt: task.dueAt,
            }
          : { dueAt: iso };
      return api(`/tasks/${task.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const achieveMutation = useMutation({
    mutationFn: (id: string) =>
      api<AchieveResult>(`/tasks/${id}/achieve`, { method: "POST" }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
      enqueueTokenReward([
        data.token.tier,
        ...(data.bonusTokens?.map((b) => b.tier) ?? []),
      ]);
    },
  });

  const planningMutation = useMutation({
    mutationFn: () =>
      api<{ token: BonusToken | null }>("/daily-settings/claim-planning", {
        method: "POST",
      }),
    onSuccess: (data) => {
      if (!user?.id) return;
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
      setPlanningDone(user.id, todayDateInput());
      setPlanningTick((t) => t + 1);
      if (data.token?.tier) enqueueTokenReward([data.token.tier]);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
  });

  function handlePlanningDone() {
    if (!user?.id || planningMutation.isPending) return;
    planningMutation.mutate();
  }

  function clearDragListeners() {
    const listeners = dragListenersRef.current;
    if (!listeners) return;
    window.removeEventListener("pointermove", listeners.move);
    window.removeEventListener("pointerup", listeners.up);
    dragListenersRef.current = null;
  }

  function beginDrag(entry: CalendarEntry, clientY: number) {
    clearDragListeners();
    setDragging(entry);

    let latestMinutes = entry.startMinutes;
    if (gridRef.current) {
      const rect = gridRef.current.getBoundingClientRect();
      latestMinutes = minutesFromPointerY(clientY, rect.top, gridRef.current.scrollTop);
      setDragMinutes(latestMinutes);
    }

    const onMove = (e: PointerEvent) => {
      if (!gridRef.current) return;
      const rect = gridRef.current.getBoundingClientRect();
      latestMinutes = minutesFromPointerY(e.clientY, rect.top, gridRef.current.scrollTop);
      setDragMinutes(latestMinutes);
    };

    const onUp = () => {
      rescheduleMutation.mutate({
        task: entry.task,
        entry,
        minutes: latestMinutes,
      });
      setDragging(null);
      setDragMinutes(null);
      clearDragListeners();
    };

    dragListenersRef.current = { move: onMove, up: onUp };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  useEffect(() => () => clearDragListeners(), []);

  const dateLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <>
      <div className="page-header">
        <h2 style={{ margin: 0, fontSize: "0.85rem" }}>Calendar</h2>
      </div>

      <div className="calendar-toolbar neon-card">
        <div className="calendar-date-nav">
          <button
            type="button"
            className="neon-btn neon-btn-sm"
            onClick={() => setSelectedDate((d) => shiftDate(d, -1))}
          >
            ‹
          </button>
          <span className="calendar-date-label">{dateLabel}</span>
          <button
            type="button"
            className="neon-btn neon-btn-sm"
            onClick={() => setSelectedDate((d) => shiftDate(d, 1))}
          >
            ›
          </button>
        </div>
        {!isToday && (
          <button
            type="button"
            className="neon-btn neon-btn-sm"
            onClick={() => setSelectedDate(todayDateInput())}
          >
            Today
          </button>
        )}
        {showPlanningButton && (
          <button
            type="button"
            className="neon-btn neon-btn-primary"
            onClick={handlePlanningDone}
            disabled={planningMutation.isPending}
          >
            {planningMutation.isPending ? "Saving…" : "Done planning today"}
          </button>
        )}
      </div>

      <p className="calendar-legend">
        <span className="calendar-legend-do">■ Do date</span>
        <span className="calendar-legend-due">□ Due date</span>
        <span className="calendar-legend-hint">Drag to reschedule</span>
      </p>

      {isLoading && <p className="empty-state">Loading calendar…</p>}

      <div className="calendar-scroll">
        <div className="calendar-grid" ref={gridRef}>
          {Array.from({ length: 24 }, (_, hour) => (
            <div key={hour} className="calendar-hour-row" style={{ height: CALENDAR_HOUR_HEIGHT }}>
              <span className="calendar-hour-label">{formatHourLabel(hour)}</span>
              <div className="calendar-hour-slot" />
            </div>
          ))}

          <div className="calendar-events-layer">
            {entries.map((entry) => {
              const isDraggingThis = dragging?.key === entry.key;
              const topMinutes = isDraggingThis && dragMinutes !== null
                ? dragMinutes
                : entry.startMinutes;
              const top = (topMinutes / 60) * CALENDAR_HOUR_HEIGHT;
              const height = (entry.durationMinutes / 60) * CALENDAR_HOUR_HEIGHT;
              const sectionColor = TASK_SECTION_COLOR[normalizeSection(entry.task.section)];

              return (
                <div
                  key={entry.key}
                  className={`calendar-event calendar-event--${entry.type}${
                    isDraggingThis ? " calendar-event--dragging" : ""
                  }`}
                  style={{
                    top,
                    height: Math.max(height, 28),
                    ...(entry.type === "do"
                      ? { backgroundColor: sectionColor, borderColor: sectionColor }
                      : { borderColor: sectionColor, color: sectionColor }),
                  }}
                  onPointerDown={(e) => {
                    if ((e.target as HTMLElement).closest("button, a")) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    beginDrag(entry, e.clientY);
                  }}
                >
                  <div className="calendar-event-body">
                    <span className="calendar-event-name">{entry.task.name}</span>
                    <span className="calendar-event-type">
                      {entry.type === "do" ? "Do" : "Due"}
                    </span>
                  </div>
                  <div className="calendar-event-actions">
                    <button
                      type="button"
                      className="calendar-action-btn"
                      onClick={() => achieveMutation.mutate(entry.taskId)}
                      disabled={achieveMutation.isPending}
                    >
                      Achieve
                    </button>
                    <Link
                      to={`/tasks/${entry.taskId}/edit`}
                      state={{ returnTo: "/calendar" }}
                      className="calendar-action-btn"
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      className="calendar-action-btn calendar-action-btn--danger"
                      onClick={() => {
                        if (confirm("Delete this task?")) {
                          deleteMutation.mutate(entry.taskId);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {!isLoading && entries.length === 0 && (
        <p className="empty-state" style={{ marginTop: "1rem" }}>
          No do or due dates on this day.
        </p>
      )}

      <button
        type="button"
        className="fab"
        aria-label="Add task"
        onClick={() => setShowNewTask(true)}
      >
        +
      </button>

      {showNewTask && (
        <div className="modal-overlay" onClick={() => setShowNewTask(false)} role="presentation">
          <div
            className="modal neon-card calendar-task-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
          >
            <TaskFormPage
              embedded
              initialDate={selectedDate}
              returnTo="/calendar"
              onClose={() => setShowNewTask(false)}
            />
          </div>
        </div>
      )}

      {tokenReward && (
        <TokenRewardModal tier={tokenReward} onClose={dismissTokenReward} />
      )}
    </>
  );
}
