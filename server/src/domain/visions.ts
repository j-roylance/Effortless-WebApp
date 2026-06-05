import type { Vision } from "@prisma/client";

/** JSON shape returned by GET/POST/PATCH /api/visions */
export function serializeVision(vision: Vision) {
  return {
    id: vision.id,
    name: vision.name,
    sortOrder: vision.sortOrder,
    archivedAt: vision.archivedAt?.toISOString() ?? null,
    createdAt: vision.createdAt.toISOString(),
  };
}
