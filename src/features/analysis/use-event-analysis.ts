import { useEffect, useState } from 'react';

import { analyzePhoto } from '@/features/analysis/analyze-photo';
import { assessEvent, type PhotoAnalysis, type PhotoVerdict, shortlist } from '@/features/analysis/assess';
import { loadAnalyses, loadEventPhotos, saveAnalysis } from '@/features/db/library-repo';

export type EventAnalysis = {
  /** Photos analysed so far, out of `total`. */
  done: number;
  total: number;
  running: boolean;
  verdicts: Map<string, PhotoVerdict>;
  /** Suggested photos, best first. */
  shortlist: string[];
  error: string | null;
};

const EMPTY: EventAnalysis = { done: 0, total: 0, running: false, verdicts: new Map(), shortlist: [], error: null };

/** Re-assess after this many newly analysed photos, so results fill in while the run continues. */
const REFRESH_EVERY = 10;

/**
 * Analyses the photos of an event that haven't been analysed before (results are saved, so this
 * only happens once per photo) and keeps the duplicate/blur verdicts and shortlist up to date.
 */
export function useEventAnalysis(eventId: string | undefined): EventAnalysis {
  const [state, setState] = useState<EventAnalysis>(EMPTY);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;

    (async () => {
      const photos = await loadEventPhotos(eventId);
      const analyses: Map<string, PhotoAnalysis> = await loadAnalyses(eventId);
      const todo = photos.filter((p) => !analyses.has(p.id));

      const publish = (running: boolean, error: string | null = null) => {
        if (cancelled) return;
        const verdicts = assessEvent(photos, analyses);
        setState({ done: analyses.size, total: photos.length, running, verdicts, shortlist: shortlist(verdicts), error });
      };

      publish(todo.length > 0);
      let failures = 0;
      for (let i = 0; i < todo.length && !cancelled; i++) {
        try {
          const a = await analyzePhoto(todo[i].id);
          analyses.set(a.photoId, a);
          await saveAnalysis(a);
        } catch (e) {
          failures++;
          console.warn(`Could not analyse photo ${todo[i].id}`, e);
        }
        if ((i + 1) % REFRESH_EVERY === 0) publish(true);
      }
      publish(false, failures ? `${failures} photos could not be analysed` : null);
    })().catch((e) => {
      if (!cancelled) setState((s) => ({ ...s, running: false, error: e instanceof Error ? e.message : String(e) }));
    });

    return () => {
      cancelled = true;
    };
  }, [eventId]);

  return state;
}
