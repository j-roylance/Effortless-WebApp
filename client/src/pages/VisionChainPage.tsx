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
  const { id } = useParams();
  const visionId = id!;
  const queryClient = useQueryClient();
  const chainEndRef = useRef<HTMLDivElement>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingGoalId, setPendingGoalId] = useState<string | null>(null);
  const [pendingKind, setPendingKind] = useState<"toggle" | "save" | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["vision-goals", visionId],
    queryFn: () => api<VisionWithGoals>(`/visions/${visionId}/goals`),
    enabled: !!visionId && visionId !== "new",
  });

  function clearPending() {
    setPendingGoalId(null);
    setPendingKind(null);
  }

  const toggleMutation = useMutation({
    mutationFn: ({ goalId, completed }: { goalId: string; completed: boolean }) =>
      api<Goal>(`/visions/${visionId}/goals/${goalId}`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      }),
    onMutate: ({ goalId }) => {
      setPendingGoalId(goalId);
      setPendingKind("toggle");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vision-goals", visionId] });
    },
    onError: (err: Error) => setToast(err.message),
    onSettled: () => clearPending(),
  });

  const saveNameMutation = useMutation({
    mutationFn: ({ goalId, name }: { goalId: string; name: string }) =>
      api<Goal>(`/visions/${visionId}/goals/${goalId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onMutate: ({ goalId }) => {
      setPendingGoalId(goalId);
      setPendingKind("save");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vision-goals", visionId] });
    },
    onError: (err: Error) => setToast(err.message),
    onSettled: () => clearPending(),
  });

  const addGoalMutation = useMutation({
    mutationFn: () =>
      api<Goal>(`/visions/${visionId}/goals`, {
        method: "POST",
        body: JSON.stringify({ name: "New goal" }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vision-goals", visionId] });
      requestAnimationFrame(() => {
        chainEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      });
    },
    onError: (err: Error) => setToast(err.message),
  });

  const vision = data?.vision;
  const goals = data?.goals ?? [];

  if (visionId === "new") {
    return <Navigate to="/visions" replace />;
  }

  return (
    <>
      <PageHeader
        title="Vision Chain"
        action={
          <Link to="/visions" className="neon-btn neon-btn-sm">
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

      {!isLoading && !isError && vision && (
        <div className="vision-chain">
          <div className="vision-chain-step">
            <div className="vision-chain-node vision-chain-node--vision neon-card">
              <span className="vision-chain-node-label">Vision</span>
              <h3 className="vision-chain-vision-name">{vision.name}</h3>
            </div>
            {goals.length > 0 && <div className="vision-chain-connector" aria-hidden />}
          </div>

          {goals.map((goal, index) => (
            <GoalChainNode
              key={goal.id}
              goal={goal}
              isLast={index === goals.length - 1}
              toggling={pendingKind === "toggle" && pendingGoalId === goal.id}
              saving={pendingKind === "save" && pendingGoalId === goal.id}
              onToggleComplete={(goalId, completed) =>
                toggleMutation.mutate({ goalId, completed })
              }
              onSaveName={(goalId, name) => saveNameMutation.mutate({ goalId, name })}
            />
          ))}

          <div ref={chainEndRef} className="vision-chain-end" />
        </div>
      )}

      {!isLoading && !isError && vision && (
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
