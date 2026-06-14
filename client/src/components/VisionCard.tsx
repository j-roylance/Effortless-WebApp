import { Link, useNavigate } from "react-router-dom";
import type { PointerEvent } from "react";
import type { Vision } from "../api/types";

export function VisionCard({
  vision,
  dragging,
  onDragHandlePointerDown,
  shouldSuppressClick,
}: {
  vision: Vision;
  dragging?: boolean;
  onDragHandlePointerDown?: (e: PointerEvent<HTMLButtonElement>) => void;
  shouldSuppressClick?: () => boolean;
}) {
  const navigate = useNavigate();

  function openChain() {
    if (shouldSuppressClick?.()) return;
    navigate(`/visions/${vision.id}/chain`);
  }

  return (
    <article
      className={`vision-card neon-card vision-card--clickable${
        dragging ? " vision-card--dragging" : ""
      }`}
      data-vision-id={vision.id}
      onClick={openChain}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openChain();
        }
      }}
      role="button"
      tabIndex={0}
    >
      <button
        type="button"
        className="vision-drag-handle"
        aria-label={`Reorder ${vision.name}`}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          e.stopPropagation();
          onDragHandlePointerDown?.(e);
        }}
      >
        <span className="vision-drag-grip" aria-hidden>
          <span />
          <span />
          <span />
        </span>
      </button>

      <div className="vision-card-content">
        <div className="vision-card-header">
          <h4 style={{ margin: 0, fontSize: "1.1rem" }}>{vision.name}</h4>
          <Link
            to={`/visions/${vision.id}/edit`}
            className="icon-btn"
            aria-label="Edit vision"
            onClick={(e) => e.stopPropagation()}
          >
            ✎
          </Link>
        </div>
        <p className="vision-card-hint">Tap to open vision chain</p>
      </div>
    </article>
  );
}
