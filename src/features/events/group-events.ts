import type { LocationCache, PhotoEvent, PhotoMeta } from '@/features/types';
import { distanceKm, type GeoPoint, validPoint } from '@/lib/geo';

export type GroupOptions = {
  /** A gap longer than this between consecutive photos starts a new cluster. */
  gapMs: number;
  /** Away-from-home clusters closer together than this are joined into one trip (covers nights). */
  tripGapMs: number;
  /** A cluster counts as away from home when its photos are at least this far from home. */
  awayKm: number;
  /** Events with fewer photos than this are folded into "loose photos" rather than shown as events. */
  minPhotos: number;
  /** A place needs photos on at least this many different days to be considered home. */
  minHomeDays: number;
};

export const DEFAULT_GROUP_OPTIONS: GroupOptions = {
  gapMs: 6 * 60 * 60 * 1000,
  tripGapMs: 36 * 60 * 60 * 1000,
  awayKm: 25,
  minPhotos: 5,
  minHomeDays: 3,
};

/** Photos sorted by time, split wherever consecutive shots are more than `gapMs` apart. */
export function splitByGap(photos: PhotoMeta[], gapMs: number): PhotoMeta[][] {
  const sorted = [...photos].sort((a, b) => a.takenAt - b.takenAt);
  const clusters: PhotoMeta[][] = [];
  for (const photo of sorted) {
    const current = clusters[clusters.length - 1];
    const last = current?.[current.length - 1];
    if (last && photo.takenAt - last.takenAt <= gapMs) current.push(photo);
    else clusters.push([photo]);
  }
  return clusters;
}

/** The few photos per cluster whose GPS is enough to place it: first, middle and last. */
export function locationSamples(cluster: PhotoMeta[]): PhotoMeta[] {
  const idx = new Set([0, Math.floor(cluster.length / 2), cluster.length - 1]);
  return [...idx].map((i) => cluster[i]);
}

function sampledPoints(cluster: PhotoMeta[], locations: LocationCache): GeoPoint[] {
  return locationSamples(cluster)
    .map((p) => validPoint(locations.get(p.id)))
    .filter((p): p is GeoPoint => p !== null);
}

/**
 * Home is the ~11 km grid square where photos were taken on the most different days.
 * Returns null when no place appears on enough days to be sure.
 */
export function detectHome(
  clusters: PhotoMeta[][],
  locations: LocationCache,
  minDays: number
): GeoPoint | null {
  const buckets = new Map<string, { days: Set<string>; lat: number; lon: number; n: number }>();
  for (const cluster of clusters) {
    for (const photo of locationSamples(cluster)) {
      const p = validPoint(locations.get(photo.id));
      if (!p) continue;
      const key = `${Math.round(p.lat * 10)},${Math.round(p.lon * 10)}`;
      const b = buckets.get(key) ?? { days: new Set(), lat: 0, lon: 0, n: 0 };
      b.days.add(new Date(photo.takenAt).toDateString());
      b.lat += p.lat;
      b.lon += p.lon;
      b.n += 1;
      buckets.set(key, b);
    }
  }
  let best: { days: Set<string>; lat: number; lon: number; n: number } | null = null;
  for (const b of buckets.values()) if (!best || b.days.size > best.days.size) best = b;
  if (!best || best.days.size < minDays) return null;
  return { lat: best.lat / best.n, lon: best.lon / best.n };
}

/** Away when most of the cluster's located samples are far from home; unknown location counts as not away. */
function isAway(points: GeoPoint[], home: GeoPoint | null, awayKm: number): boolean {
  if (!home || points.length === 0) return false;
  const far = points.filter((p) => distanceKm(p, home) >= awayKm).length;
  return far * 2 > points.length;
}

type Cluster = { photos: PhotoMeta[]; away: boolean };

/** Joins consecutive away-from-home clusters separated by less than `tripGapMs`, so a trip is one event. */
export function mergeTrips(
  clusters: PhotoMeta[][],
  locations: LocationCache,
  home: GeoPoint | null,
  options: Pick<GroupOptions, 'tripGapMs' | 'awayKm'>
): Cluster[] {
  const merged: Cluster[] = [];
  for (const photos of clusters) {
    const away = isAway(sampledPoints(photos, locations), home, options.awayKm);
    const prev = merged[merged.length - 1];
    const gap = prev ? photos[0].takenAt - prev.photos[prev.photos.length - 1].takenAt : Infinity;
    if (prev && prev.away && away && gap <= options.tripGapMs) prev.photos.push(...photos);
    else merged.push({ photos: [...photos], away });
  }
  return merged;
}

/**
 * Full grouping pipeline: split by time gaps, detect home, merge multi-day trips, drop tiny clusters.
 * `locations` should hold lookups for `locationSamples` of every cluster from `splitByGap`;
 * missing entries simply count as "no location".
 * Returns events newest first with fresh ids and status `new` — see `reconcileEvents` to keep earlier ones.
 */
export function groupIntoEvents(
  photos: PhotoMeta[],
  locations: LocationCache = new Map(),
  options: GroupOptions = DEFAULT_GROUP_OPTIONS
): { events: PhotoEvent[]; loose: PhotoMeta[]; home: GeoPoint | null } {
  const clusters = splitByGap(photos, options.gapMs);
  const home = detectHome(clusters, locations, options.minHomeDays);
  const merged = mergeTrips(clusters, locations, home, options);

  const events: PhotoEvent[] = [];
  const loose: PhotoMeta[] = [];
  for (const { photos: cluster, away } of merged) {
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
      title: defaultTitle(start, end, away),
      photoIds: cluster.map((p) => p.id),
      coverId: cluster[Math.floor(cluster.length / 2)].id,
      status: 'new',
      away,
    });
  }

  events.sort((a, b) => b.start - a.start);
  return { events, loose, home };
}

const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const yearFmt = new Intl.DateTimeFormat(undefined, { year: 'numeric' });

/** Placeholder title until the AI step names the event, e.g. "Trip · 12 Oct – 15 Oct 2026". */
export function defaultTitle(start: number, end: number, away = false): string {
  const s = new Date(start);
  const e = new Date(end);
  const year = yearFmt.format(e);
  const range =
    s.toDateString() === e.toDateString()
      ? `${dayFmt.format(s)} ${year}`
      : `${dayFmt.format(s)} – ${dayFmt.format(e)} ${year}`;
  return away ? `Trip · ${range}` : range;
}
