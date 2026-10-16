import type { PhotoMeta, PhotoEvent } from '@/features/types';

export type GroupOptions = {
  /** A gap longer than this between consecutive photos starts a new event. */
  gapMs: number;
  /** Events with fewer photos than this are folded into "loose photos" rather than shown as events. */
  minPhotos: number;
};

export const DEFAULT_GROUP_OPTIONS: GroupOptions = {
  gapMs: 6 * 60 * 60 * 1000,
  minPhotos: 5,
};

/**
 * Splits photos into events wherever there is a long time gap between consecutive shots.
 * Returns events newest first, plus the photos that did not belong to any event big enough to show.
 */
export function groupIntoEvents(
  photos: PhotoMeta[],
  options: GroupOptions = DEFAULT_GROUP_OPTIONS
): { events: PhotoEvent[]; loose: PhotoMeta[] } {
  const sorted = [...photos].sort((a, b) => a.takenAt - b.takenAt);
  const clusters: PhotoMeta[][] = [];

  for (const photo of sorted) {
    const current = clusters[clusters.length - 1];
    const last = current?.[current.length - 1];
    if (last && photo.takenAt - last.takenAt <= options.gapMs) {
      current.push(photo);
    } else {
      clusters.push([photo]);
    }
  }

  const events: PhotoEvent[] = [];
  const loose: PhotoMeta[] = [];
  for (const cluster of clusters) {
    if (cluster.length < options.minPhotos) {
      loose.push(...cluster);
      continue;
    }
    const start = cluster[0].takenAt;
    const end = cluster[cluster.length - 1].takenAt;
    events.push({
      id: `evt-${start}`,
      start,
      end,
      title: defaultTitle(start, end),
      photoIds: cluster.map((p) => p.id),
      coverId: cluster[Math.floor(cluster.length / 2)].id,
      status: 'new',
    });
  }

  events.sort((a, b) => b.start - a.start);
  return { events, loose };
}

const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const yearFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric' });

/** Placeholder title until the AI step names the event, e.g. "12 Oct – 15 Oct 2026". */
export function defaultTitle(start: number, end: number): string {
  const s = new Date(start);
  const e = new Date(end);
  const year = yearFmt.format(e);
  if (s.toDateString() === e.toDateString()) return `${dayFmt.format(s)} ${year}`;
  return `${dayFmt.format(s)} – ${dayFmt.format(e)} ${year}`;
}
