import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api/client";

const API_BASE = import.meta.env.VITE_API_URL ?? "/api";

function getTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

export function AccountBackupSection() {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"download" | "upload" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setBusy("download");
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/account/backup`, {
        credentials: "include",
        headers: { "X-Timezone": getTimeZone() },
      });
      const data = await res.json();
      if (!res.ok) {
        throw new ApiError(
          (data as { error?: string }).error ?? "Download failed",
          res.status
        );
      }
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `effortless-backup-${date}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Backup downloaded.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Download failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleFileSelected(file: File) {
    setError(null);
    setMessage(null);

    let payload: unknown;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      setError("Invalid JSON file");
      return;
    }

    if (
      !confirm(
        "Replace ALL data on this account with the backup? This cannot be undone. Your login stays the same."
      )
    ) {
      return;
    }

    setBusy("upload");
    try {
      await api("/account/backup", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tasks"] }),
        queryClient.invalidateQueries({ queryKey: ["tokens"] }),
        queryClient.invalidateQueries({ queryKey: ["likes"] }),
        queryClient.invalidateQueries({ queryKey: ["visions"] }),
        queryClient.invalidateQueries({ queryKey: ["daily-settings"] }),
        queryClient.invalidateQueries({ queryKey: ["wheel-config"] }),
      ]);
      setMessage("Backup restored successfully.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  return (
    <section className="daily-settings-card neon-card account-backup-section">
      <h3 className="daily-settings-label">Account backup</h3>
      <p className="daily-settings-desc">
        Download a JSON copy of your tasks, likes, tokens, visions, settings, and history.
        Upload the same file to restore or move data to another account (sign in there first).
      </p>

      <div className="account-backup-actions">
        <button
          type="button"
          className="neon-btn"
          disabled={busy !== null}
          onClick={() => void handleDownload()}
        >
          {busy === "download" ? "Downloading…" : "Download backup"}
        </button>
        <button
          type="button"
          className="neon-btn"
          disabled={busy !== null}
          onClick={() => fileInputRef.current?.click()}
        >
          {busy === "upload" ? "Uploading…" : "Upload backup"}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json,.json"
          className="account-backup-file-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFileSelected(file);
          }}
        />
      </div>

      {message && <p className="account-backup-message">{message}</p>}
      {error && <p className="form-error">{error}</p>}
    </section>
  );
}
