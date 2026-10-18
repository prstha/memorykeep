import { useSyncExternalStore } from 'react';

import { type KindCounts, loadLibrary, saveLibrary } from '@/features/db/library-repo';
import {
  DEFAULT_GROUP_OPTIONS,
  groupIntoEvents,
  locationSamples,
  splitByGap,
} from '@/features/events/group-events';
import { reconcileEvents } from '@/features/events/reconcile';
import { fetchLocations, scanDevicePhotos } from '@/features/gallery/scan-device';
import type { LocationCache, PhotoEvent } from '@/features/types';

export type ScanPhase = 'idle' | 'reading' | 'locating' | 'saving';

type LibraryState = {
  /** False until the saved library has been read from the database. */
  loaded: boolean;
  phase: ScanPhase;
  /** Progress within the current phase: photos read, or locations looked up out of `progressTotal`. */
  progress: number;
  progressTotal: number;
  events: PhotoEvent[];
  looseCount: number;
  /** Screenshots and chat-app images, which are kept out of events. */
  kindCounts: KindCounts;
  lastScanAt: number | null;
  error: string | null;
};

let state: LibraryState = {
  loaded: false,
  phase: 'idle',
  progress: 0,
  progressTotal: 0,
  events: [],
  looseCount: 0,
  kindCounts: { screenshot: 0, messaging: 0 },
  lastScanAt: null,
  error: null,
};

/** GPS lookups survive between scans so each photo is only read once. */
let locations: LocationCache = new Map();

const listeners = new Set<() => void>();

function setState(patch: Partial<LibraryState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLibrary(): LibraryState {
  return useSyncExternalStore(subscribe, () => state);
}

let loading: Promise<void> | null = null;

/** Shows the library saved by the last scan, without touching the photo library. */
export function loadSavedLibrary(): Promise<void> {
  loading ??= loadLibrary()
    .then((saved) => {
      locations = saved.locations;
      setState({
        loaded: true,
        events: saved.events,
        looseCount: saved.looseCount,
        kindCounts: saved.kindCounts,
        lastScanAt: saved.lastScanAt,
      });
    })
    .catch((e) => setState({ loaded: true, error: errorMessage(e) }));
  return loading;
}

/**
 * Re-reads the device library, looks up GPS for photos not seen before, regroups everything and saves it.
 * Events that survive the regroup keep their id and status.
 */
export async function scanLibrary() {
  if (state.phase !== 'idle') return;
  await loadSavedLibrary();
  setState({ phase: 'reading', progress: 0, progressTotal: 0, error: null });
  try {
    const photos = await scanDevicePhotos((count) => setState({ progress: count }));

    const camera = photos.filter((p) => p.kind === 'camera');
    const kindCounts: KindCounts = {
      screenshot: photos.filter((p) => p.kind === 'screenshot').length,
      messaging: photos.filter((p) => p.kind === 'messaging').length,
    };

    const clusters = splitByGap(camera, DEFAULT_GROUP_OPTIONS.gapMs);
    const missing = clusters.flatMap(locationSamples).filter((p) => !locations.has(p.id)).map((p) => p.id);
    setState({ phase: 'locating', progress: 0, progressTotal: missing.length });
    await fetchLocations(missing, locations, (done) => setState({ progress: done }));

    const grouped = groupIntoEvents(camera, locations);
    const events = reconcileEvents(grouped.events, state.events);

    setState({ phase: 'saving' });
    const scannedAt = Date.now();
    await saveLibrary(photos, locations, events, grouped.home, scannedAt);
    setState({ events, looseCount: grouped.loose.length, kindCounts, lastScanAt: scannedAt });
  } catch (e) {
    setState({ error: errorMessage(e) });
  } finally {
    setState({ phase: 'idle' });
  }
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
