import { useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Goal, VisionWithGoals } from "../api/types";
import { GoalChainNode } from "../components/GoalChainNode";

export function VisionChainPage() {
  const { id } = useParams();
  const visionId = id!;
  const queryClient = useQueryClient();
  const chainEndRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["vision-goals", visionId],
    queryFn: () => api<VisionWithGoals>(`/visions/${visionId}/goals`),
    enabled: !!visionId,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ goalId, completed }: { goalId: string; completed: boolean }) =>
      api<Goal>(`/visions/${visionId}/goals/${goalId}`, {
        method: "PATCH",
        body: JSON.stringify({ completed }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vision-goals", visionId] });
    },
  });

  const saveNameMutation = useMutation({
    mutationFn: ({ goalId, name }: { goalId: string; name: string }) =>
      api<Goal>(`/visions/${visionId}/goals/${goalId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vision-goals", visionId] });
    },
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
  });

  const vision = data?.vision;
  const goals = data?.goals ?? [];

  return (
    <>
      <div className="page-header">
        <h2 style={{ margin: 0, fontSize: "0.85rem" }}>Vision Chain</h2>
        <Link to="/visions" className="neon-btn neon-btn-sm">
          Back
        </Link>
      </div>

      {isLoading && <p className="empty-state">Loading chain…</p>}

      {!isLoading && vision && (
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
              toggling={toggleMutation.isPending}
              saving={saveNameMutation.isPending}
              onToggleComplete={(goalId, completed) =>
                toggleMutation.mutate({ goalId, completed })
              }
              onSaveName={(goalId, name) => saveNameMutation.mutate({ goalId, name })}
            />
          ))}

          <div ref={chainEndRef} className="vision-chain-end" />
        </div>
      )}

      {!isLoading && vision && (
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
    </>
  );
}
