import type { SQLiteDatabase } from 'expo-sqlite';

import { getDb } from '@/features/db/database';
import type { EventStatus, LocationCache, PhotoEvent, PhotoMeta, PhotoSource } from '@/features/types';
import type { GeoPoint } from '@/lib/geo';

type PhotoRow = {
  id: string;
  source: PhotoSource;
  filename: string | null;
  taken_at: number;
  width: number | null;
  height: number | null;
  lat: number | null;
  lon: number | null;
  location_checked: number;
  event_id: string | null;
};

type EventRow = {
  id: string;
  start_at: number;
  end_at: number;
  title: string;
  cover_id: string;
  status: EventStatus;
  away: number;
};

export type StoredLibrary = {
  photos: PhotoMeta[];
  locations: LocationCache;
  events: PhotoEvent[];
  looseCount: number;
  lastScanAt: number | null;
};

export async function loadLibrary(): Promise<StoredLibrary> {
  const db = await getDb();
  const photoRows = await db.getAllAsync<PhotoRow>('SELECT * FROM photos ORDER BY taken_at');
  const eventRows = await db.getAllAsync<EventRow>('SELECT * FROM events ORDER BY start_at DESC');
  const lastScan = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = 'last_scan_at'");

  const photos: PhotoMeta[] = [];
  const locations: LocationCache = new Map();
  const photoIdsByEvent = new Map<string, string[]>();
  let looseCount = 0;
  for (const r of photoRows) {
    photos.push({
      id: r.id,
      source: r.source,
      filename: r.filename,
      takenAt: r.taken_at,
      width: r.width,
      height: r.height,
    });
    if (r.location_checked) {
      locations.set(r.id, r.lat != null && r.lon != null ? { lat: r.lat, lon: r.lon } : null);
    }
    if (r.event_id) {
      const ids = photoIdsByEvent.get(r.event_id) ?? [];
      ids.push(r.id);
      photoIdsByEvent.set(r.event_id, ids);
    } else {
      looseCount++;
    }
  }

  const events: PhotoEvent[] = eventRows.map((r) => ({
    id: r.id,
    start: r.start_at,
    end: r.end_at,
    title: r.title,
    coverId: r.cover_id,
    status: r.status,
    away: r.away === 1,
    photoIds: photoIdsByEvent.get(r.id) ?? [],
  }));

  return { photos, locations, events, looseCount, lastScanAt: lastScan ? Number(lastScan.value) : null };
}

/**
 * Replaces the stored library with the result of a scan: the current photo list (rows for deleted
 * photos are dropped, cached locations kept), the regrouped events, and the scan time.
 */
export async function saveLibrary(
  photos: PhotoMeta[],
  locations: LocationCache,
  events: PhotoEvent[],
  home: GeoPoint | null,
  scannedAt: number
) {
  const db = await getDb();
  const eventByPhoto = new Map<string, string>();
  for (const e of events) for (const id of e.photoIds) eventByPhoto.set(id, e.id);

  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.execAsync('DELETE FROM photos; DELETE FROM events;');
    await insertPhotos(txn, photos, locations, eventByPhoto);

    const insertEvent = await txn.prepareAsync(
      'INSERT INTO events (id, start_at, end_at, title, cover_id, status, away) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    try {
      for (const e of events) {
        await insertEvent.executeAsync([e.id, e.start, e.end, e.title, e.coverId, e.status, e.away ? 1 : 0]);
      }
    } finally {
      await insertEvent.finalizeAsync();
    }

    await setMeta(txn, 'last_scan_at', String(scannedAt));
    if (home) await setMeta(txn, 'home', JSON.stringify(home));
  });
}

async function insertPhotos(
  db: SQLiteDatabase,
  photos: PhotoMeta[],
  locations: LocationCache,
  eventByPhoto: Map<string, string>
) {
  const stmt = await db.prepareAsync(
    `INSERT INTO photos (id, source, filename, taken_at, width, height, lat, lon, location_checked, event_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  try {
    for (const p of photos) {
      const checked = locations.has(p.id);
      const loc = locations.get(p.id) ?? null;
      await stmt.executeAsync([
        p.id,
        p.source,
        p.filename,
        p.takenAt,
        p.width,
        p.height,
        loc?.lat ?? null,
        loc?.lon ?? null,
        checked ? 1 : 0,
        eventByPhoto.get(p.id) ?? null,
      ]);
    }
  } finally {
    await stmt.finalizeAsync();
  }
}

async function setMeta(db: SQLiteDatabase, key: string, value: string) {
  await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', [key, value]);
}

