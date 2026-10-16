import { useSyncExternalStore } from 'react';

import { groupIntoEvents } from '@/features/events/group-events';
import { scanDevicePhotos } from '@/features/gallery/scan-device';
import type { PhotoEvent, PhotoMeta } from '@/features/types';

/**
 * In-memory library state. Persisting to SQLite (so scans and review progress survive restarts) comes in M1.
 */
type LibraryState = {
  scanning: boolean;
  scannedCount: number;
  photos: Map<string, PhotoMeta>;
  events: PhotoEvent[];
  loose: PhotoMeta[];
  error: string | null;
};

let state: LibraryState = {
  scanning: false,
  scannedCount: 0,
  photos: new Map(),
  events: [],
  loose: [],
  error: null,
};

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

export function getEvent(id: string): PhotoEvent | undefined {
  return state.events.find((e) => e.id === id);
}

export async function scanLibrary() {
  if (state.scanning) return;
  setState({ scanning: true, scannedCount: 0, error: null });
  try {
    const photos = await scanDevicePhotos((count) => setState({ scannedCount: count }));
    const { events, loose } = groupIntoEvents(photos);
    setState({ photos: new Map(photos.map((p) => [p.id, p])), events, loose });
  } catch (e) {
    setState({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    setState({ scanning: false });
  }
}
