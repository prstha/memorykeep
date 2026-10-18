import { Asset, AssetField, MediaSubtype, MediaType, Query } from 'expo-media-library';

import { photoKind } from '@/features/analysis/photo-kind';
import type { LocationCache, PhotoMeta } from '@/features/types';
import { validPoint } from '@/lib/geo';

const PAGE_SIZE = 500;

/**
 * Media-library timestamps are documented as seconds, but some Android versions report milliseconds.
 * Normalise to milliseconds either way.
 */
export function toMillis(t: number): number {
  return t < 1e12 ? t * 1000 : t;
}

/** Reads metadata (no files) for every photo on the device, oldest first. */
export async function scanDevicePhotos(onProgress?: (count: number) => void): Promise<PhotoMeta[]> {
  const photos: PhotoMeta[] = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const page = await new Query()
      .eq(AssetField.MEDIA_TYPE, MediaType.IMAGE)
      .orderBy({ key: AssetField.CREATION_TIME, ascending: true })
      .offset(offset)
      .limit(PAGE_SIZE)
      .exeForMetadata();

    for (const a of page) {
      const time = a.creationTime ?? a.modificationTime;
      if (time == null) continue;
      photos.push({
        id: a.id,
        source: 'device',
        filename: a.filename,
        takenAt: toMillis(time),
        width: a.width,
        height: a.height,
        kind: photoKind(a.filename, a.mediaSubtypes?.includes(MediaSubtype.SCREENSHOT)),
      });
    }
    onProgress?.(photos.length);
    if (page.length < PAGE_SIZE) break;
  }
  return photos;
}

const LOCATION_CONCURRENCY = 16;

/**
 * Reads GPS for the given photos into `cache` (null when a photo has none or it can't be read).
 * Each lookup opens the file's metadata, so callers should only ask for the photos they need.
 */
export async function fetchLocations(
  ids: string[],
  cache: LocationCache,
  onProgress?: (done: number) => void
): Promise<void> {
  let done = 0;
  for (let i = 0; i < ids.length; i += LOCATION_CONCURRENCY) {
    const batch = ids.slice(i, i + LOCATION_CONCURRENCY);
    await Promise.all(
      batch.map(async (id) => {
        try {
          const loc = await new Asset(id).getLocation();
          cache.set(id, validPoint(loc && { lat: loc.latitude, lon: loc.longitude }));
        } catch {
          cache.set(id, null);
        }
      })
    );
    done += batch.length;
    onProgress?.(done);
  }
}
