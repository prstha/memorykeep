import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

const SCHEMA_VERSION = 2;

let dbPromise: Promise<SQLiteDatabase> | null = null;

/** The app's single database connection, opened and migrated on first use. */
export function getDb(): Promise<SQLiteDatabase> {
  dbPromise ??= openDatabaseAsync('memorykeep.db').then(async (db) => {
    await migrate(db);
    return db;
  });
  return dbPromise;
}

async function migrate(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  if (version >= SCHEMA_VERSION) return;

  if (version === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE photos (
        id TEXT PRIMARY KEY NOT NULL,
        source TEXT NOT NULL,
        filename TEXT,
        taken_at INTEGER NOT NULL,
        width INTEGER,
        height INTEGER,
        lat REAL,
        lon REAL,
        location_checked INTEGER NOT NULL DEFAULT 0,
        event_id TEXT
      );
      CREATE INDEX photos_taken_at ON photos (taken_at);
      CREATE INDEX photos_event_id ON photos (event_id);
      CREATE TABLE events (
        id TEXT PRIMARY KEY NOT NULL,
        start_at INTEGER NOT NULL,
        end_at INTEGER NOT NULL,
        title TEXT NOT NULL,
        cover_id TEXT NOT NULL,
        status TEXT NOT NULL,
        away INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE meta (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );
    `);
    version = 1;
  }

  if (version === 1) {
    await db.execAsync(`
      ALTER TABLE photos ADD COLUMN kind TEXT NOT NULL DEFAULT 'camera';
      CREATE TABLE photo_analysis (
        photo_id TEXT PRIMARY KEY NOT NULL,
        dhash TEXT NOT NULL,
        sharpness REAL NOT NULL,
        brightness REAL NOT NULL,
        faces INTEGER,
        smile REAL
      );
    `);
    version = 2;
  }

  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION}`);
}
