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

export type EventStatus = 'new' | 'reviewed' | 'created' | 'cleaned';

export type PhotoEvent = {
  id: string;
  start: number;
  end: number;
  title: string;
  photoIds: string[];
  coverId: string;
  status: EventStatus;
};
