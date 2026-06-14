import { useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Goal, VisionWithGoals } from "../api/types";
import { GoalChainNode } from "../components/GoalChainNode";
import { PageHeader } from "../components/PageHeader";
import { QueryErrorBanner } from "../components/QueryErrorBanner";
import { Toast } from "../components/Toast";

export function VisionChainPage() {
  const { id, goalId } = useParams();
  const visionId = id!;
  const chainKey = goalId ?? "root";
  const queryClient = useQueryClient();
  const chainEndRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingGoalId, setPendingGoalId] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<
    "toggle" | "save" | "delete" | "addBefore" | null
  >(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["vision-goals", visionId, chainKey],
    queryFn: () =>
      api<VisionWithGoals>(
        goalId
          ? `/visions/${visionId}/goals?focus=${encodeURIComponent(goalId)}`
          : `/visions/${visionId}/goals`
      ),
    enabled: !!visionId && visionId !== "new",
  });

  function clearPending() {
    setPendingGoalId(null);
    setPendingKind(null);
  }

  function invalidateChain() {
    queryClient.invalidateQueries({ queryKey: ["vision-goals", visionId] });
  }

  const toggleMutation = useMutation({
    mutationFn: ({ goalId: targetId, completed }: { goalId: string; completed: boolean }) =>
      api<Goal>(`/visions/${visionId}/goals/${targetId}`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      }),
    onMutate: ({ goalId: targetId }) => {
      setPendingGoalId(targetId);
      setPendingKind("toggle");
    },
    onSuccess: () => invalidateChain(),
    onError: (err: Error) => setToast(err.message),
    onSettled: () => clearPending(),
  });

  const saveNameMutation = useMutation({
    mutationFn: ({ goalId: targetId, name }: { goalId: string; name: string }) =>
      api<Goal>(`/visions/${visionId}/goals/${targetId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onMutate: ({ goalId: targetId }) => {
      setPendingGoalId(targetId);
      setPendingKind("save");
    },
    onSuccess: () => invalidateChain(),
    onError: (err: Error) => setToast(err.message),
    onSettled: () => clearPending(),
  });

  const deleteMutation = useMutation({
    mutationFn: (targetId: string) =>
      api(`/visions/${visionId}/goals/${targetId}`, { method: "DELETE" }),
    onMutate: (targetId) => {
      setPendingGoalId(targetId);
      setPendingKind("delete");
    },
    onSuccess: () => invalidateChain(),
    onError: (err: Error) => setToast(err.message),
    onSettled: () => clearPending(),
  });

  const addGoalMutation = useMutation({
    mutationFn: () =>
      api<Goal>(`/visions/${visionId}/goals`, {
        method: "POST",
        body: JSON.stringify({
          name: "New goal",
          ...(goalId ? { parentGoalId: goalId } : {}),
        }),
      }),
    onSuccess: () => {
      invalidateChain();
      requestAnimationFrame(() => {
        chainEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    },
    onError: (err: Error) => setToast(err.message),
  });

  const addBeforeMutation = useMutation({
    mutationFn: (insertBeforeGoalId: string) =>
      api<Goal>(`/visions/${visionId}/goals`, {
        method: "POST",
        body: JSON.stringify({
          name: "New goal",
          insertBeforeGoalId,
        }),
      }),
    onMutate: (targetId) => {
      setPendingGoalId(targetId);
      setPendingKind("addBefore");
    },
    onSuccess: () => invalidateChain(),
    onError: (err: Error) => setToast(err.message),
    onSettled: () => clearPending(),
  });

  const vision = data?.vision;
  const focusGoal = data?.focusGoal ?? null;
  const goals = data?.goals ?? [];
  const isNested = !!goalId && !!focusGoal;
  const topLabel = isNested ? "Goal" : "Vision";
  const topName = isNested ? focusGoal.name : vision?.name ?? "";

  function backPath(): string {
    if (!goalId) return "/visions";
    if (focusGoal?.parentGoalId) {
      return `/visions/${visionId}/chain/${focusGoal.parentGoalId}`;
    }
    return `/visions/${visionId}/chain`;
  }

  if (visionId === "new") {
    return <Navigate to="/visions" replace />;
  }

  return (
    <>
      <PageHeader
        title="Vision Chain"
        action={
          <Link to={backPath()} className="neon-btn neon-btn-sm">
            Back
          </Link>
        }
      />

      {isLoading && <p className="empty-state">Loading chain…</p>}

      {isError && (
        <QueryErrorBanner
          message="Could not load this vision chain."
          onRetry={() => refetch()}
        />
      )}

      {!isLoading && !isError && vision && (!goalId || focusGoal) && (
        <div className="vision-chain">
          <div className="vision-chain-step">
            <div className="vision-chain-node vision-chain-node--vision neon-card">
              <span className="vision-chain-node-label">{topLabel}</span>
              <h3 className="vision-chain-vision-name">{topName}</h3>
            </div>
            {goals.length > 0 && <div className="vision-chain-connector" aria-hidden />}
          </div>

          {goals.map((goal, index) => (
            <GoalChainNode
              key={goal.id}
              goal={goal}
              visionId={visionId}
              isLast={index === goals.length - 1}
              toggling={pendingKind === "toggle" && pendingGoalId === goal.id}
              saving={pendingKind === "save" && pendingGoalId === goal.id}
              deleting={pendingKind === "delete" && pendingGoalId === goal.id}
              addingBefore={pendingKind === "addBefore" && pendingGoalId === goal.id}
              onToggleComplete={(targetId, completed) =>
                toggleMutation.mutate({ goalId: targetId, completed })
              }
              onSaveName={(targetId, name) =>
                saveNameMutation.mutate({ goalId: targetId, name })
              }
              onAddBefore={(targetId) => addBeforeMutation.mutate(targetId)}
              onDelete={(targetId) => deleteMutation.mutate(targetId)}
            />
          ))}

          <div ref={chainEndRef} className="vision-chain-end" />
        </div>
      )}

      {!isLoading && !isError && vision && (!goalId || focusGoal) && (
        <button
          type="button"
          className="fab vision-chain-fab"
          aria-label="Add goal"
          disabled={addGoalMutation.isPending}
          onClick={() => addGoalMutation.mutate()}
        >
          +
        </button>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
