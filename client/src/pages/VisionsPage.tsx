import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { Vision } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { QueryErrorBanner } from "../components/QueryErrorBanner";
import { Toast } from "../components/Toast";
import { VisionCard } from "../components/VisionCard";
import { sortVisions } from "../domain/visions";

function sameVisionOrder(a: Vision[], b: Vision[]): boolean {
  return a.length === b.length && a.every((v, i) => v.id === b[i]?.id);
}

function reorderVisions(list: Vision[], fromId: string, toId: string): Vision[] {
  if (fromId === toId) return list;
  const fromIndex = list.findIndex((v) => v.id === fromId);
  const toIndex = list.findIndex((v) => v.id === toId);
  if (fromIndex < 0 || toIndex < 0) return list;

  const next = [...list];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export function VisionsPage() {
  const queryClient = useQueryClient();
  const [orderedVisions, setOrderedVisions] = useState<Vision[]>([]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dragStateRef = useRef<{
    onMove: (e: PointerEvent) => void;
    onUp: (e: PointerEvent) => void;
  } | null>(null);
  const suppressNavigationRef = useRef(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["visions"],
    queryFn: () => api<{ visions: Vision[] }>("/visions"),
  });

  useEffect(() => {
    if (!draggingId) {
      setOrderedVisions(sortVisions(data?.visions ?? []));
    }
  }, [data, draggingId]);

  const reorderMutation = useMutation({
    mutationFn: (visionIds: string[]) =>
      api("/visions/reorder", {
        method: "PUT",
        body: JSON.stringify({ visionIds }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visions"] });
    },
    onError: (err: Error) => setToast(err.message),
  });

  const clearDragListeners = useCallback(() => {
    const state = dragStateRef.current;
    if (!state) return;
    window.removeEventListener("pointermove", state.onMove);
    window.removeEventListener("pointerup", state.onUp);
    window.removeEventListener("pointercancel", state.onUp);
    dragStateRef.current = null;
  }, []);

  useEffect(() => () => clearDragListeners(), [clearDragListeners]);

  const beginDrag = useCallback(
    (visionId: string, e: PointerEvent<HTMLButtonElement>) => {
      if (reorderMutation.isPending) return;

      clearDragListeners();
      e.currentTarget.setPointerCapture(e.pointerId);

      const startOrder = orderedVisions;
      let currentOrder = startOrder;
      let moved = false;

      const onMove = (ev: PointerEvent) => {
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        const card = target?.closest<HTMLElement>("[data-vision-id]");
        const overId = card?.dataset.visionId;
        if (!overId || overId === visionId) return;

        const next = reorderVisions(currentOrder, visionId, overId);
        if (!sameVisionOrder(next, currentOrder)) {
          moved = true;
          currentOrder = next;
          setOrderedVisions(next);
        }
      };

      const onUp = () => {
        clearDragListeners();
        setDraggingId(null);

        if (moved) {
          suppressNavigationRef.current = true;
          reorderMutation.mutate(currentOrder.map((v) => v.id));
        } else {
          setOrderedVisions(startOrder);
        }
      };

      dragStateRef.current = { onMove, onUp };
      setDraggingId(visionId);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [clearDragListeners, orderedVisions, reorderMutation]
  );

  return (
    <>
      <PageHeader title="Vision" />

      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 0 }}>
        Life visions and the goal chains that lead to them.
      </p>

      {isLoading && <p className="empty-state">Loading visions…</p>}

      {isError && <QueryErrorBanner onRetry={() => refetch()} />}

      {!isLoading && !isError && orderedVisions.length === 0 && (
        <div className="empty-state neon-card">
          <p>No visions yet.</p>
          <p>Tap + to add your first life vision.</p>
        </div>
      )}

      {!isLoading && !isError && orderedVisions.length > 0 && (
        <div className={`vision-list${draggingId ? " vision-list--dragging" : ""}`}>
          {orderedVisions.map((vision) => (
            <VisionCard
              key={vision.id}
              vision={vision}
              dragging={draggingId === vision.id}
              onDragHandlePointerDown={(e) => beginDrag(vision.id, e)}
              shouldSuppressClick={() => {
                if (!suppressNavigationRef.current) return false;
                suppressNavigationRef.current = false;
                return true;
              }}
            />
          ))}
        </div>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
