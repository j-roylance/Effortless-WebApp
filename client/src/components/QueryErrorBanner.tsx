export function QueryErrorBanner({
  message = "Could not load data. Check your connection and try again.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="empty-state neon-card" style={{ borderColor: "var(--danger)" }}>
      <p style={{ margin: 0, color: "var(--danger)" }}>{message}</p>
      {onRetry && (
        <button
          type="button"
          className="neon-btn neon-btn-sm"
          style={{ marginTop: "0.75rem" }}
          onClick={onRetry}
        >
          Retry
        </button>
      )}
    </div>
  );
}
