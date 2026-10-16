import { AssetField, MediaType, Query } from 'expo-media-library';

import type { PhotoMeta } from '@/features/types';

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
      });
    }
    onProgress?.(photos.length);
    if (page.length < PAGE_SIZE) break;
  }
  return photos;
}
