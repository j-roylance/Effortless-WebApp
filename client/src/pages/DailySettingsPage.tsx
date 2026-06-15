import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import type { UserLike } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { QueryErrorBanner } from "../components/QueryErrorBanner";
import { RewardPicker } from "../components/RewardPicker";
import { SpinOddsEditor } from "../components/SpinOddsEditor";
import { AccountBackupSection } from "../components/AccountBackupSection";
import { Toast } from "../components/Toast";
import {
  DEFAULT_DAILY_SETTINGS,
  type DailySettings,
} from "../domain/daily";
import type { MilestoneReward } from "../domain/rewards";
import {
  validateSpinOutcomeWeights,
  type SpinOutcomeWeights,
} from "../domain/spin-odds";

const MILESTONE_FIELDS: {
  key: "planningReward" | "allMustsReward" | "allDoDatesReward";
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

  function updateMilestone(
    key: "planningReward" | "allMustsReward" | "allDoDatesReward",
    value: MilestoneReward
  ) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function updateSpinOdds(value: SpinOutcomeWeights) {
    setSettings((prev) => ({ ...prev, spinOutcomeWeights: value }));
  }

  function validate(): string | null {
    const oddsErr = validateSpinOutcomeWeights(settings.spinOutcomeWeights);
    if (oddsErr) return oddsErr;

    for (const field of MILESTONE_FIELDS) {
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
      <PageHeader title="Settings" />

      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 0 }}>
        Configure spin odds and daily milestone rewards.
      </p>

      {isLoading && <p className="empty-state">Loading settings…</p>}

      {isError && <QueryErrorBanner onRetry={() => refetch()} />}

      {!isLoading && !isError && (
      <>
      <section className="daily-settings-card neon-card" style={{ marginBottom: "1rem" }}>
        <h3 className="daily-settings-label">Spin odds</h3>
        <p className="daily-settings-desc">
          Chance for each result when you spend a token on the randomizer.
        </p>
        <SpinOddsEditor
          value={settings.spinOutcomeWeights}
          onChange={updateSpinOdds}
        />
      </section>

      <h3 className="settings-section-title">Daily milestones</h3>
      <p className="daily-settings-desc" style={{ marginTop: 0 }}>
        Rewards for planning and completing today&apos;s tasks.
      </p>

      <div className="daily-settings-list">
        {MILESTONE_FIELDS.map((field) => (
          <section key={field.key} className="daily-settings-card neon-card">
            <h3 className="daily-settings-label">{field.label}</h3>
            <p className="daily-settings-desc">{field.description}</p>
            <RewardPicker
              idPrefix={field.key}
              value={settings[field.key]}
              onChange={(value) => updateMilestone(field.key, value)}
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

      <AccountBackupSection />
      </>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
