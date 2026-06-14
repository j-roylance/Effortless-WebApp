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
  const [dragOrder, setDragOrder] = useState<Vision[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dragStateRef = useRef<{
    handle: HTMLButtonElement;
    pointerId: number;
    onMove: (e: globalThis.PointerEvent) => void;
    onUp: (e: globalThis.PointerEvent) => void;
  } | null>(null);
  const suppressNavigationRef = useRef(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["visions"],
    queryFn: () => api<{ visions: Vision[] }>("/visions"),
  });

  const serverVisions = sortVisions(data?.visions ?? []);
  const displayVisions = dragOrder ?? serverVisions;

  const reorderMutation = useMutation({
    mutationFn: (visionIds: string[]) =>
      api("/visions/reorder", {
        method: "PUT",
        body: JSON.stringify({ visionIds }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["visions"] });
    },
    onError: (err: Error) => {
      setToast(err.message);
      setDragOrder(null);
    },
  });

  const clearDragListeners = useCallback(() => {
    const state = dragStateRef.current;
    if (!state) return;
    if (state.handle.hasPointerCapture(state.pointerId)) {
      state.handle.releasePointerCapture(state.pointerId);
    }
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
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);

      const startOrder = serverVisions;
      let currentOrder = startOrder;
      let moved = false;

      const onMove = (ev: globalThis.PointerEvent) => {
        const target = document.elementFromPoint(ev.clientX, ev.clientY);
        const card = target?.closest<HTMLElement>("[data-vision-id]");
        const overId = card?.dataset.visionId;
        if (!overId || overId === visionId) return;

        const next = reorderVisions(currentOrder, visionId, overId);
        if (!sameVisionOrder(next, currentOrder)) {
          moved = true;
          currentOrder = next;
          setDragOrder(next);
        }
      };

      const onUp = () => {
        clearDragListeners();
        setDraggingId(null);

        if (moved) {
          suppressNavigationRef.current = true;
          reorderMutation.mutate(currentOrder.map((v) => v.id), {
            onSettled: () => setDragOrder(null),
          });
        } else {
          setDragOrder(null);
        }
      };

      dragStateRef.current = { handle, pointerId: e.pointerId, onMove, onUp };
      setDragOrder(startOrder);
      setDraggingId(visionId);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [clearDragListeners, reorderMutation, serverVisions]
  );

  return (
    <>
      <PageHeader title="Vision" />

      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 0 }}>
        Life visions and the goal chains that lead to them.
      </p>

      {isLoading && <p className="empty-state">Loading visions…</p>}

      {isError && <QueryErrorBanner onRetry={() => refetch()} />}

      {!isLoading && !isError && serverVisions.length === 0 && (
        <div className="empty-state neon-card">
          <p>No visions yet.</p>
          <p>Tap + to add your first life vision.</p>
        </div>
      )}

      {!isLoading && !isError && displayVisions.length > 0 && (
        <div className={`vision-list${draggingId ? " vision-list--dragging" : ""}`}>
          {displayVisions.map((vision) => (
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
