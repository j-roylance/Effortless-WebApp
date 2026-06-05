import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Habit } from "../api/types";
import { TIERS, type RewardTier } from "../domain/tiers";

export function HabitFormPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [name, setName] = useState("");
  const [tier, setTier] = useState<RewardTier>("Bronze");
  const [persistAfterDone, setPersistAfterDone] = useState(true);
  const [error, setError] = useState("");

  const { data } = useQuery({
    queryKey: ["habits"],
    queryFn: () => api<{ habits: Habit[] }>("/habits"),
    enabled: !isNew,
  });

  useEffect(() => {
    if (!isNew && data?.habits) {
      const habit = data.habits.find((h) => h.id === id);
      if (habit) {
        setName(habit.name);
        setTier(habit.tier);
        setPersistAfterDone(habit.persistAfterDone);
      }
    }
  }, [isNew, id, data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { name, tier, persistAfterDone };
      if (isNew) {
        return api<{ habit: Habit; token: { tier: RewardTier } }>("/habits", {
          method: "POST",
          body: JSON.stringify(body),
        });
      }
      return api<{ habit: Habit }>(`/habits/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      queryClient.invalidateQueries({ queryKey: ["tokens"] });
      if (isNew && "token" in data) {
        navigate("/", { state: { toast: `+1 ${data.token.tier} Token` } });
      } else {
        navigate("/");
      }
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/habits/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["habits"] });
      navigate("/");
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    saveMutation.mutate();
  }

  return (
    <div>
      <div className="page-header">
        <h2 style={{ margin: 0, fontSize: "0.85rem" }}>
          {isNew ? "New habit" : "Edit habit"}
        </h2>
        <button type="button" className="neon-btn neon-btn-sm" onClick={() => navigate("/")}>
          Back
        </button>
      </div>

      <form className="neon-card" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error && <p className="form-error">{error}</p>}

        <div className="form-field">
          <label htmlFor="name">Habit name</label>
          <input
            id="name"
            className="neon-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

        <div className="form-field">
          <label htmlFor="tier">Reward tier</label>
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

        <div className="form-field">
          <span style={{ display: "block", marginBottom: "0.35rem", color: "var(--text-dim)", fontSize: "0.85rem" }}>
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
            Saving a new habit earns +1 Bronze Token.
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
              if (confirm("Delete this habit?")) deleteMutation.mutate();
            }}
          >
            Delete
          </button>
        )}
      </form>
    </div>
  );
}
