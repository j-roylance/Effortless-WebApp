import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";
import { PageHeader } from "../components/PageHeader";
import { QueryErrorBanner } from "../components/QueryErrorBanner";
import { Toast } from "../components/Toast";
import {
  OPTIONAL_TIER_OPTIONS,
  type DailySettings,
  type OptionalRewardTier,
} from "../domain/daily";
import { TIER_COLORS } from "../domain/tiers";

const FIELDS: {
  key: keyof DailySettings;
  label: string;
  description: string;
}[] = [
  {
    key: "planningRewardTier",
    label: "Planning the day",
    description: "Reward when you press Done planning today on the calendar.",
  },
  {
    key: "allMustsRewardTier",
    label: "All Must tasks done",
    description: "Reward when every Must task with a do date today is achieved.",
  },
  {
    key: "allDoDatesRewardTier",
    label: "All do-date tasks done",
    description: "Reward when every task with a do date today is achieved.",
  },
];

export function DailySettingsPage() {
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState<DailySettings>({
    planningRewardTier: "None",
    allMustsRewardTier: "None",
    allDoDatesRewardTier: "None",
  });
  const [saved, setSaved] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["daily-settings"],
    queryFn: () => api<DailySettings>("/daily-settings"),
  });

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

  function updateField(key: keyof DailySettings, value: OptionalRewardTier) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <>
      <PageHeader title="Daily Settings" />

      <p style={{ color: "var(--text-dim)", fontSize: "0.9rem", marginTop: 0 }}>
        Choose bonus reward tokens for daily milestones. Select None to disable a reward.
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
            <select
              className="neon-select"
              value={settings[field.key]}
              onChange={(e) =>
                updateField(field.key, e.target.value as OptionalRewardTier)
              }
              style={{
                borderColor:
                  settings[field.key] === "None"
                    ? undefined
                    : TIER_COLORS[settings[field.key] as keyof typeof TIER_COLORS],
              }}
            >
              {OPTIONAL_TIER_OPTIONS.map((tier) => (
                <option key={tier} value={tier}>
                  {tier === "None" ? "None" : tier}
                </option>
              ))}
            </select>
          </section>
        ))}
      </div>

      <button
        type="button"
        className="neon-btn neon-btn-primary"
        style={{ width: "100%", marginTop: "0.5rem" }}
        disabled={saveMutation.isPending}
        onClick={() => saveMutation.mutate()}
      >
        {saveMutation.isPending ? "Saving…" : saved ? "Saved!" : "Save settings"}
      </button>
      </>
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </>
  );
}
