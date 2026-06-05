import { FormEvent, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Vision } from "../api/types";

export function VisionFormPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  const { data } = useQuery({
    queryKey: ["visions"],
    queryFn: () => api<{ visions: Vision[] }>("/visions"),
    enabled: !isNew,
  });

  useEffect(() => {
    if (!isNew && data?.visions) {
      const vision = data.visions.find((v) => v.id === id);
      if (vision) setName(vision.name);
    }
  }, [isNew, id, data]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Name is required");
      const body = JSON.stringify({ name: name.trim() });
      if (isNew) {
        return api<Vision>("/visions", { method: "POST", body });
      }
      return api<Vision>(`/visions/${id}`, { method: "PATCH", body });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visions"] });
      navigate("/visions");
    },
    onError: (err: Error) => setError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api(`/visions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visions"] });
      navigate("/visions");
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setError("");
    saveMutation.mutate();
  }

  return (
    <>
      <div className="page-header">
        <h2 style={{ margin: 0, fontSize: "0.85rem" }}>
          {isNew ? "New vision" : "Edit vision"}
        </h2>
        <button
          type="button"
          className="neon-btn neon-btn-sm"
          onClick={() => navigate("/visions")}
        >
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
          <label htmlFor="vision-name">Vision name</label>
          <input
            id="vision-name"
            className="neon-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>

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
            disabled={deleteMutation.isPending}
            onClick={() => {
              if (confirm("Delete this vision and all its goals?")) {
                deleteMutation.mutate();
              }
            }}
          >
            Delete vision
          </button>
        )}
      </form>
    </>
  );
}
