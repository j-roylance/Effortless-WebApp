import type { RewardTier } from "@prisma/client";

export interface WheelLike {
  id: string;
  label: string;
}

export interface WheelSlice {
  id: string;
  label: string;
  likeId: string | null;
  empty: boolean;
}

export interface WheelConfigInput {
  multiplier: number;
  sliceCounts: Record<string, number>;
}

export function parseSliceCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (typeof raw === "number" && Number.isInteger(raw) && raw >= 0) {
      out[key] = raw;
    }
  }
  return out;
}

export function totalSlices(likeCount: number, multiplier: number): number {
  return Math.max(0, likeCount) * Math.max(1, multiplier);
}

export function defaultSliceCounts(likes: WheelLike[]): Record<string, number> {
  return Object.fromEntries(likes.map((l) => [l.id, 1]));
}

export function validateWheelConfig(
  likes: WheelLike[],
  config: WheelConfigInput
): string | null {
  if (!Number.isInteger(config.multiplier) || config.multiplier < 1) {
    return "Multiplier must be at least 1";
  }
  if (likes.length === 0) {
    return "Add at least one like before configuring the wheel";
  }

  const likeIds = new Set(likes.map((l) => l.id));
  let assigned = 0;

  for (const [likeId, count] of Object.entries(config.sliceCounts)) {
    if (!likeIds.has(likeId)) {
      return "Slice assignment includes an unknown like";
    }
    if (!Number.isInteger(count) || count < 0) {
      return "Slice counts must be non-negative integers";
    }
    assigned += count;
  }

  const max = totalSlices(likes.length, config.multiplier);
  if (assigned > max) {
    return `Too many slices assigned (${assigned} / ${max} max)`;
  }

  return null;
}

export function normalizeWheelConfig(
  likes: WheelLike[],
  stored: WheelConfigInput | null
): WheelConfigInput {
  if (!stored || likes.length === 0) {
    return { multiplier: 1, sliceCounts: defaultSliceCounts(likes) };
  }

  const counts: Record<string, number> = {};
  for (const like of likes) {
    counts[like.id] = Math.max(0, stored.sliceCounts[like.id] ?? 0);
  }

  const multiplier = Math.max(1, stored.multiplier);
  const max = totalSlices(likes.length, multiplier);
  let assigned = Object.values(counts).reduce((sum, n) => sum + n, 0);

  if (assigned > max) {
    let remaining = max;
    for (const like of likes) {
      const want = counts[like.id] ?? 0;
      const take = Math.min(want, remaining);
      counts[like.id] = take;
      remaining -= take;
    }
  }

  return { multiplier, sliceCounts: counts };
}

/** Build expanded wheel slices (likes + empty slots). */
export function buildWheelSlices(
  likes: WheelLike[],
  config: WheelConfigInput | null
): WheelSlice[] {
  if (likes.length === 0) return [];

  const normalized = normalizeWheelConfig(likes, config);
  const max = totalSlices(likes.length, normalized.multiplier);
  const slices: WheelSlice[] = [];

  for (const like of likes) {
    const count = normalized.sliceCounts[like.id] ?? 0;
    for (let i = 0; i < count; i++) {
      slices.push({
        id: `${like.id}-${i}`,
        label: like.label,
        likeId: like.id,
        empty: false,
      });
    }
  }

  let emptyIndex = 0;
  while (slices.length < max) {
    slices.push({
      id: `empty-${emptyIndex++}`,
      label: "—",
      likeId: null,
      empty: true,
    });
  }

  return slices;
}

export function pickWheelWinner(slices: WheelSlice[]): {
  winningIndex: number;
  like?: { id: string; label: string };
} {
  if (slices.length === 0) {
    return { winningIndex: 0 };
  }

  const winningIndex = Math.floor(Math.random() * slices.length);
  const slice = slices[winningIndex]!;

  if (slice.likeId && !slice.empty) {
    return {
      winningIndex,
      like: { id: slice.likeId, label: slice.label },
    };
  }

  return { winningIndex };
}

export type TierWheelConfigResponse = {
  tier: RewardTier;
  multiplier: number;
  sliceCounts: Record<string, number>;
  totalSlices: number;
  assignedSlices: number;
  emptySlices: number;
};

export function toWheelConfigResponse(
  tier: RewardTier,
  likes: WheelLike[],
  config: WheelConfigInput
): TierWheelConfigResponse {
  const assigned = Object.values(config.sliceCounts).reduce((sum, n) => sum + n, 0);
  const total = totalSlices(likes.length, config.multiplier);
  return {
    tier,
    multiplier: config.multiplier,
    sliceCounts: config.sliceCounts,
    totalSlices: total,
    assignedSlices: assigned,
    emptySlices: total - assigned,
  };
}
