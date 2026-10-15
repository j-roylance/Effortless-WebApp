import { useEffect, useState } from "react";

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** AI-suggested single name the user can edit before saving (Add Vision / Add Goal). */
export function NameConfirmBox({
  label,
  loadSuggestion,
  onSave,
  onCancel,
}: {
  label: string;
  loadSuggestion: () => Promise<string>;
  onSave: (name: string) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadSuggestion()
      .then((suggestion) => {
        if (!cancelled) setName((current) => current || suggestion);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(`Couldn't suggest a name (${err.message}). Type one instead.`);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Suggest once when the box opens.
  }, []);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(trimmed);
    } catch (err) {
      setError((err as Error).message || "Could not save");
      setSaving(false);
    }
  }

  return (
    <form
      className="ai-confirm-box"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <label className="ai-confirm-label">{label}</label>
      <input
        className="neon-input"
        value={name}
        maxLength={200}
        placeholder={loading ? "AI is suggesting a name…" : "Name"}
        autoFocus
        disabled={saving}
        onChange={(e) => setName(e.target.value)}
      />
      {error && <div className="ai-chat-error">{error}</div>}
      <div className="ai-confirm-actions">
        <button type="button" className="neon-btn neon-btn-sm" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="submit"
          className="neon-btn neon-btn-primary neon-btn-sm"
          disabled={saving || !name.trim()}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}

interface ChecklistRow {
  key: number;
  text: string;
  checked: boolean;
  existing: boolean;
}

/**
 * Review list for "Save whole chain" and "Quick draft". Goals are ordered closest to the
 * vision first; names already in the chain start unticked.
 */
export function ChainChecklist({
  title,
  load,
  existingNames,
  nameLabel,
  onSave,
  onCancel,
}: {
  title: string;
  load: () => Promise<{ name?: string | null; goals: string[] }>;
  existingNames: string[];
  /** When set, shows an editable name field (e.g. the new vision's name) above the goals. */
  nameLabel?: string;
  onSave: (name: string | null, goals: string[]) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [rows, setRows] = useState<ChecklistRow[]>([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const existing = new Set(existingNames.map(normalizeName));
    load()
      .then((result) => {
        if (cancelled) return;
        setName(result.name ?? "");
        setRows(
          result.goals.map((text, i) => {
            const isExisting = existing.has(normalizeName(text));
            return { key: i, text, checked: !isExisting, existing: isExisting };
          })
        );
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || "AI request failed");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Load once when the checklist opens.
  }, []);

  function updateRow(key: number, patch: Partial<ChecklistRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      { key: Math.max(-1, ...prev.map((r) => r.key)) + 1, text: "", checked: true, existing: false },
    ]);
  }

  const selected = rows.filter((row) => row.checked && row.text.trim());
  const needsName = nameLabel !== undefined;
  const canSave = !saving && selected.length > 0 && (!needsName || name.trim().length > 0);

  async function save() {
    if (!canSave) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(
        needsName ? name.trim() : null,
        selected.map((row) => row.text.trim())
      );
    } catch (err) {
      setError((err as Error).message || "Could not save");
      setSaving(false);
    }
  }

  return (
    <div className="ai-checklist">
      <h4 className="ai-checklist-title">{title}</h4>

      {loading && <p className="ai-chat-typing">AI is drafting the list…</p>}

      {!loading && (
        <>
          {needsName && (
            <div className="form-field">
              <label>{nameLabel}</label>
              <input
                className="neon-input"
                value={name}
                maxLength={200}
                disabled={saving}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          )}

          {rows.length > 0 && (
            <p className="ai-checklist-hint">
              Top is the step right before the {needsName ? "vision" : "goal above"}; bottom is the
              first step.
            </p>
          )}

          <ol className="ai-checklist-list">
            {rows.map((row) => (
              <li key={row.key} className="ai-checklist-row">
                <input
                  type="checkbox"
                  checked={row.checked}
                  disabled={saving}
                  aria-label="Include this goal"
                  onChange={(e) => updateRow(row.key, { checked: e.target.checked })}
                />
                <input
                  className="neon-input"
                  value={row.text}
                  maxLength={200}
                  disabled={saving}
                  onChange={(e) => updateRow(row.key, { text: e.target.value })}
                />
                {row.existing && <span className="ai-checklist-existing">already in chain</span>}
              </li>
            ))}
          </ol>

          <button type="button" className="ai-chat-link-btn" onClick={addRow} disabled={saving}>
            + Add a goal
          </button>
        </>
      )}

      {error && <div className="ai-chat-error">{error}</div>}

      <div className="ai-confirm-actions">
        <button type="button" className="neon-btn neon-btn-sm" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button
          type="button"
          className="neon-btn neon-btn-primary neon-btn-sm"
          disabled={!canSave}
          onClick={() => void save()}
        >
          {saving ? "Saving…" : `Save ${selected.length} goal${selected.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
