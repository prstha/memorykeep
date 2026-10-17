import type { PhotoEvent } from '@/features/types';

/**
 * Carries ids and review status over from the previous scan, so regrouping after new photos arrive
 * doesn't reset events the user already reviewed, made a collage for, or cleaned up.
 *
 * Each new event inherits from the old event it shares the most photos with, provided that old event
 * holds more than half of the new event's photos. Each old event is inherited at most once.
 */
export function reconcileEvents(next: PhotoEvent[], previous: PhotoEvent[]): PhotoEvent[] {
  const oldByPhoto = new Map<string, PhotoEvent>();
  for (const e of previous) for (const id of e.photoIds) oldByPhoto.set(id, e);

  type Candidate = { next: PhotoEvent; old: PhotoEvent; overlap: number };
  const candidates: Candidate[] = [];
  for (const e of next) {
    const counts = new Map<PhotoEvent, number>();
    for (const id of e.photoIds) {
      const old = oldByPhoto.get(id);
      if (old) counts.set(old, (counts.get(old) ?? 0) + 1);
    }
    for (const [old, overlap] of counts) {
      if (overlap * 2 > e.photoIds.length) candidates.push({ next: e, old, overlap });
    }
  }

  // Largest overlaps claim their old event first.
  candidates.sort((a, b) => b.overlap - a.overlap);
  const inherited = new Map<PhotoEvent, PhotoEvent>();
  const claimed = new Set<PhotoEvent>();
  for (const c of candidates) {
    if (inherited.has(c.next) || claimed.has(c.old)) continue;
    inherited.set(c.next, c.old);
    claimed.add(c.old);
  }

  const used = new Set<string>();
  for (const old of inherited.values()) used.add(old.id);

  return next.map((e) => {
    const old = inherited.get(e);
    if (old) return { ...e, id: old.id, status: old.status };
    let id = e.id;
    for (let n = 2; used.has(id); n++) id = `${e.id}-${n}`;
    used.add(id);
    return { ...e, id };
  });
}
