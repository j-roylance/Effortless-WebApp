import type { Vision } from "../api/types";

/** Client-side sort mirror of GET /visions order (sortOrder, then createdAt). */
export function sortVisions(visions: Vision[]): Vision[] {
  return [...visions].sort((a, b) => {
    if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
    return a.createdAt.localeCompare(b.createdAt);
  });
}
