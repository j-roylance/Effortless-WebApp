export function DefiniteRewardModal({
  label,
  onClose,
}: {
  label: string;
  onClose: () => void;
}) {
  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal neon-card token-reward-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="definite-reward-title"
      >
        <h2 id="definite-reward-title" style={{ marginTop: 0, color: "var(--success)" }}>
          Reward earned
        </h2>
        <p style={{ color: "var(--text-dim)", marginTop: 0 }}>You get:</p>
        <p style={{ fontSize: "1.25rem", margin: "0 0 1.25rem" }}>{label}</p>
        <button type="button" className="neon-btn neon-btn-primary" onClick={onClose}>
          Nice!
        </button>
      </div>
    </div>
  );
}
