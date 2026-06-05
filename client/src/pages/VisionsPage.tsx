import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Vision } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { VisionCard } from "../components/VisionCard";
import { sortVisions } from "../domain/visions";

export function VisionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["visions"],
    queryFn: () => api<{ visions: Vision[] }>("/visions"),
  });

  const visions = sortVisions(data?.visions ?? []);

  return (
    <>
      <PageHeader title="Vision" />

      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 0 }}>
        Life visions and the goal chains that lead to them.
      </p>

      {isLoading && <p className="empty-state">Loading visions…</p>}

      {!isLoading && visions.length === 0 && (
        <div className="empty-state neon-card">
          <p>No visions yet.</p>
          <p>Tap + to add your first life vision.</p>
        </div>
      )}

      {!isLoading && visions.length > 0 && (
        <div className="vision-list">
          {visions.map((vision) => (
            <VisionCard key={vision.id} vision={vision} />
          ))}
        </div>
      )}
    </>
  );
}
