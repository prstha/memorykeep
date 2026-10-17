import type { GeoPoint } from '@/lib/geo';

/** Where a photo came from. Google Photos (Picker API) arrives in M6. */
export type PhotoSource = 'device' | 'google';

/** Lightweight metadata used for grouping; heavier fields (URI, EXIF, scores) are loaded per event. */
export type PhotoMeta = {
  id: string;
  source: PhotoSource;
  filename: string | null;
  /** Capture time in epoch milliseconds. */
  takenAt: number;
  width: number | null;
  height: number | null;
};

/**
 * Cached GPS lookups by photo id: a point, `null` when the photo has no location,
 * or absent when it has not been looked up yet.
 */
export type LocationCache = Map<string, GeoPoint | null>;

export type EventStatus = 'new' | 'reviewed' | 'created' | 'cleaned';

export type PhotoEvent = {
  id: string;
  start: number;
  end: number;
  title: string;
  photoIds: string[];
  coverId: string;
  status: EventStatus;
  /** True when the event's photos were taken away from home, e.g. a trip. */
  away: boolean;
};
