import { Link, useNavigate } from "react-router-dom";
import type { Vision } from "../api/types";

export function VisionCard({ vision }: { vision: Vision }) {
  const navigate = useNavigate();

  return (
    <article
      className="vision-card neon-card vision-card--clickable"
      onClick={() => navigate(`/visions/${vision.id}/chain`)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          navigate(`/visions/${vision.id}/chain`);
        }
      }}
      role="button"
      tabIndex={0}
    >
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
    </article>
  );
}
