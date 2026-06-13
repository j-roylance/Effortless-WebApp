import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { UserLike } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { QueryErrorBanner } from "../components/QueryErrorBanner";
import { RewardPicker } from "../components/RewardPicker";
import { Toast } from "../components/Toast";
import {
  DEFAULT_DAILY_SETTINGS,
  type DailySettings,
} from "../domain/daily";
import type { MilestoneReward } from "../domain/rewards";

const FIELDS: {
  key: keyof DailySettings;
  label: string;
  description: string;
}[] = [
  {
    key: "planningReward",
    label: "Planning the day",
    description: "Reward when you press Done planning today on the calendar.",
  },
  {
    key: "allMustsReward",
    label: "All Must tasks done",
    description: "Reward when every Must task with a do date today is achieved.",
  },
  {
    key: "allDoDatesReward",
    label: "All do-date tasks done",
    description: "Reward when every task with a do date today is achieved.",
  },
];

export function DailySettingsPage() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<DailySettings>(DEFAULT_DAILY_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["daily-settings"],
    queryFn: () => api<DailySettings>("/daily-settings"),
  });

  const { data: likesData } = useQuery({
    queryKey: ["likes"],
    queryFn: () => api<{ likes: UserLike[] }>("/likes"),
  });
  const likes = likesData?.likes ?? [];

  useEffect(() => {
    if (data) setSettings(data);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      api<DailySettings>("/daily-settings", {
        method: "PUT",
        body: JSON.stringify(settings),
      }),
    onSuccess: (result) => {
      setSettings(result);
      queryClient.setQueryData(["daily-settings"], result);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err: Error) => setToast(err.message),
  });

  function updateField(key: keyof DailySettings, value: MilestoneReward) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): string | null {
    for (const field of FIELDS) {
      const reward = settings[field.key];
      if (reward.kind === "token" && !reward.tier) {
        return `${field.label} requires a token tier`;
      }
      if (reward.kind === "like" && !reward.likeId) {
        return `${field.label} requires selecting a like`;
      }
      if (reward.kind === "custom" && !reward.label.trim()) {
        return `${field.label} requires a custom reward label`;
      }
    }
    return null;
  }

  function handleSave() {
    const err = validate();
    if (err) {
      setToast(err);
      return;
    }
    saveMutation.mutate();
  }

  return (
    <>
      <PageHeader title="Daily Settings" />

      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 0 }}>
        Choose rewards for daily milestones: no reward, a spin token, a specific like, or
        custom text.
      </p>

      {isLoading && <p className="empty-state">Loading settings…</p>}

      {isError && <QueryErrorBanner onRetry={() => refetch()} />}

      {!isLoading && !isError && (
      <>
      <div className="daily-settings-list">
        {FIELDS.map((field) => (
          <section key={field.key} className="daily-settings-card neon-card">
            <h3 className="daily-settings-label">{field.label}</h3>
            <p className="daily-settings-desc">{field.description}</p>
            <RewardPicker
              idPrefix={field.key}
              value={settings[field.key]}
              onChange={(value) => updateField(field.key, value)}
              likes={likes}
            />
          </section>
        ))}
      </div>

      <button
        type="button"
        className="neon-btn neon-btn-primary"
        style={{ width: "100%", marginTop: "0.5rem" }}
        disabled={saveMutation.isPending}
        onClick={handleSave}
      >
        {saveMutation.isPending ? "Saving…" : saved ? "Saved!" : "Save settings"}
      </button>
      </>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
