import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { AchieveResult, BonusToken, Task, TokenBalances } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { QueryErrorBanner } from "../components/QueryErrorBanner";
import { Toast } from "../components/Toast";
import { RewardModalHost } from "../components/RewardModalHost";
import { SpinPityHintForTier } from "../components/SpinPityHint";
import { useTokenRewardFromNavigation } from "../hooks/useTokenRewardFromNavigation";
import { useRewardQueue } from "../hooks/useRewardQueue";
import { rewardsFromAchieve, rewardsFromPlanningClaim } from "../domain/achieve-rewards";
import { useAuth } from "../context/AuthContext";
import { TaskFormPage } from "./TaskFormPage";
import { TaskRewardGlyphs } from "../components/TaskRewardGlyphs";
import {
  CALENDAR_HOUR_HEIGHT,
  entriesForDay,
  formatHourLabel,
  isPlanningDone,
  layoutCalendarEntries,
  minutesFromPointerY,
  dateTimeFromMinutes,
  setPlanningDone,
  todayDateInput,
  type CalendarEntry,
} from "../domain/calendar";
import { isTaskAchievedToday, toLocalDateInput } from "../domain/recurrence";
import { TASK_SECTION_COLOR, normalizeSection } from "../domain/tasks";
import { TIERS } from "../domain/tiers";
import { DEFAULT_DAILY_SETTINGS, type DailySettings } from "../domain/daily";

function shiftDate(dateInput: string, deltaDays: number): string {
  const d = new Date(`${dateInput}T12:00:00`);
  d.setDate(d.getDate() + deltaDays);
  return toLocalDateInput(d.toISOString());
}

export function CalendarPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const gridRef = useRef<HTMLDivElement>(null);
  const dragListenersRef = useRef<{ move: (e: PointerEvent) => void; up: () => void } | null>(
    null
  );

  const [selectedDate, setSelectedDate] = useState(todayDateInput());
  const [showNewTask, setShowNewTask] = useState(false);
  const [showTokens, setShowTokens] = useState(false);
  const [planningTick, setPlanningTick] = useState(0);
  const { current: reward, enqueue: enqueueReward, dismissCurrent: dismissReward } =
    useRewardQueue();
  const [dragging, setDragging] = useState<CalendarEntry | null>(null);
  const [dragMinutes, setDragMinutes] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useTokenRewardFromNavigation(
    (tiers) => enqueueReward(tiers.map((tier) => ({ type: "token", tier }))),
    "/calendar",
    setToast
  );

  const {
    data: tasksData,
    isLoading,
    isError,
    refetch,
  } = useQuery({
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

  const tasks = tasksData?.tasks ?? [];
  const entries = useMemo(
    () => entriesForDay(tasks, selectedDate),
    [tasks, selectedDate]
  );

  const doTaskIds = useMemo(
    () => new Set(entries.filter((e) => e.type === "do").map((e) => e.taskId)),
    [entries]
  );

  const layoutByKey = useMemo(() => {
    const items = entries.map((entry) => ({
      key: entry.key,
      startMinutes:
        dragging?.key === entry.key && dragMinutes !== null
          ? dragMinutes
          : entry.startMinutes,
      durationMinutes: entry.durationMinutes,
    }));
    return layoutCalendarEntries(items);
  }, [entries, dragging, dragMinutes]);

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
      const dayKey = entry.occurrenceDayKey ?? selectedDate;

      if (entry.isRecurringInstance) {
        return api(`/tasks/${task.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            occurrenceDayKey: dayKey,
            scheduledAt: iso,
          }),
        });
      }

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
    onError: (err: Error) => setToast(err.message),
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

  const planningMutation = useMutation({
    mutationFn: () =>
      api<{ token: BonusToken | null; definiteReward: { label: string } | null }>(
        "/daily-settings/claim-planning",
        { method: "POST" }
      ),
    onSuccess: (data) => {
      if (!user?.id) return;
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
      setPlanningDone(user.id, todayDateInput());
      setPlanningTick((t) => t + 1);
      enqueueReward(rewardsFromPlanningClaim(data));
    },
    onError: (err: Error) => setToast(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api(`/tasks/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (err: Error) => setToast(err.message),
  });

  const skipOccurrenceMutation = useMutation({
    mutationFn: ({ taskId, dayKey }: { taskId: string; dayKey: string }) =>
      api(`/tasks/${taskId}`, {
        method: "PATCH",
        body: JSON.stringify({ occurrenceDayKey: dayKey, skip: true }),
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (err: Error) => setToast(err.message),
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
      if (latestMinutes === entry.startMinutes) {
        setDragging(null);
        setDragMinutes(null);
        clearDragListeners();
        return;
      }
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

  const balances = tokenData?.balances;
  const pityByTier = tokenData?.pityByTier;
  const baseSpinWeights =
    settingsData?.spinOutcomeWeights ?? DEFAULT_DAILY_SETTINGS.spinOutcomeWeights;
  const totalTokens = balances
    ? TIERS.reduce((sum, t) => sum + (balances[t] ?? 0), 0)
    : 0;

  return (
    <>
      <PageHeader
        title="Calendar"
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

      {isError && <QueryErrorBanner onRetry={() => refetch()} />}

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
              const showAchieve =
                isToday &&
                (entry.type === "do" || !doTaskIds.has(entry.taskId));
              const achievedToday = isTaskAchievedToday(entry.task.achievedAt);
              const isDraggingThis = dragging?.key === entry.key;
              const topMinutes = isDraggingThis && dragMinutes !== null
                ? dragMinutes
                : entry.startMinutes;
              const top = (topMinutes / 60) * CALENDAR_HOUR_HEIGHT;
              const height = (entry.durationMinutes / 60) * CALENDAR_HOUR_HEIGHT;
              const sectionColor = TASK_SECTION_COLOR[normalizeSection(entry.task.section)];
              const { column, columnCount } = layoutByKey.get(entry.key) ?? {
                column: 0,
                columnCount: 1,
              };

              return (
                <div
                  key={entry.key}
                  className={`calendar-event calendar-event--${entry.type}${
                    entry.isRecurringInstance ? " calendar-event--recurring" : ""
                  }${isDraggingThis ? " calendar-event--dragging" : ""}`}
                  style={{
                    top,
                    height: Math.max(height, 28),
                    ["--col-index" as string]: column,
                    ["--col-count" as string]: columnCount,
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
                    <div className="calendar-event-title-row">
                      <TaskRewardGlyphs
                        rewards={entry.task.rewards ?? []}
                        variant="calendar"
                        pityByTier={pityByTier}
                        baseSpinWeights={baseSpinWeights}
                      />
                      <span className="calendar-event-name">{entry.task.name}</span>
                    </div>
                    <span className="calendar-event-type">
                      {entry.type === "do" ? "Do" : "Due"}
                      {entry.isRecurringInstance ? " · Repeat" : ""}
                    </span>
                  </div>
                  <div className="calendar-event-actions">
                    {showAchieve && (
                      <button
                        type="button"
                        className="calendar-action-btn"
                        onClick={() => achieveMutation.mutate(entry.taskId)}
                        disabled={achieveMutation.isPending || achievedToday}
                      >
                        {achievedToday ? "Done today" : "Achieve"}
                      </button>
                    )}
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
                        if (entry.isRecurringInstance) {
                          const dayKey = entry.occurrenceDayKey ?? selectedDate;
                          if (
                            confirm(
                              "Remove this day only? The task will still repeat on other days."
                            )
                          ) {
                            skipOccurrenceMutation.mutate({
                              taskId: entry.taskId,
                              dayKey,
                            });
                          }
                        } else if (confirm("Delete this task?")) {
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

      {!isLoading && !isError && entries.length === 0 && (
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

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}

      <RewardModalHost reward={reward} onClose={dismissReward} />
    </>
  );
}
