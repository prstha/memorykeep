import { hammingDistance } from '@/features/analysis/image-metrics';

/** What the on-device analysis measured for one photo. */
export type PhotoAnalysis = {
  photoId: string;
  dhash: string;
  /** Laplacian variance of a fixed-size thumbnail; higher is sharper. */
  sharpness: number;
  /** Mean luminance 0–1. */
  brightness: number;
  /** Faces found, or null when face detection was unavailable. */
  faces: number | null;
  /** Highest smiling probability among the faces, or null. */
  smile: number | null;
};

export type PhotoVerdict = {
  photoId: string;
  /** Photos in the same burst or near-identical set share a group id. */
  duplicateGroup: string | null;
  /** True for the photo kept from its duplicate group (or any photo not in a group). */
  bestInGroup: boolean;
  blurry: boolean;
  tooDark: boolean;
  tooBright: boolean;
  /** Higher is better; only meaningful for comparing photos within one event. */
  score: number;
};

export const ASSESS_OPTIONS = {
  /** Photos this close in time are compared for being the same shot. */
  burstWindowMs: 10 * 60 * 1000,
  /** Max differing hash bits for photos within the burst window to count as duplicates. */
  burstMaxDistance: 10,
  /** Max differing hash bits for photos at any time to count as duplicates. */
  anyTimeMaxDistance: 3,
  /** Blurry when sharpness is below this fraction of the event's median sharpness. */
  blurRelative: 0.35,
  darkBelow: 0.12,
  brightAbove: 0.93,
};

type Timed = { id: string; takenAt: number };

/**
 * Judges every analysed photo of one event: groups duplicates, flags blur and bad exposure,
 * and scores photos so the best of each duplicate group (and of the event) can be suggested.
 */
export function assessEvent(
  photos: Timed[],
  analyses: Map<string, PhotoAnalysis>,
  options = ASSESS_OPTIONS
): Map<string, PhotoVerdict> {
  const items = photos
    .filter((p) => analyses.has(p.id))
    .sort((a, b) => a.takenAt - b.takenAt)
    .map((p) => ({ ...p, a: analyses.get(p.id)! }));

  // Union-find over duplicate pairs.
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < i; j++) {
      const close = items[i].takenAt - items[j].takenAt <= options.burstWindowMs;
      const limit = close ? options.burstMaxDistance : options.anyTimeMaxDistance;
      if (hammingDistance(items[i].a.dhash, items[j].a.dhash) <= limit) parent[find(i)] = find(j);
    }
  }

  const sharpnessValues = items.map((it) => it.a.sharpness).sort((x, y) => x - y);
  const median = sharpnessValues[Math.floor(sharpnessValues.length / 2)] ?? 0;
  const rank = (s: number) =>
    sharpnessValues.length > 1 ? sharpnessValues.indexOf(s) / (sharpnessValues.length - 1) : 1;

  const verdicts = items.map((it) => {
    const { sharpness, brightness, faces, smile } = it.a;
    const blurry = median > 0 && sharpness < median * options.blurRelative;
    const tooDark = brightness < options.darkBelow;
    const tooBright = brightness > options.brightAbove;
    const score =
      rank(sharpness) +
      (faces ? 0.3 : 0) +
      (smile ?? 0) * 0.3 -
      (blurry ? 1 : 0) -
      (tooDark || tooBright ? 0.5 : 0);
    return { it, blurry, tooDark, tooBright, score };
  });

  const groups = new Map<number, number[]>();
  verdicts.forEach((_, i) => {
    const root = find(i);
    groups.set(root, [...(groups.get(root) ?? []), i]);
  });

  const result = new Map<string, PhotoVerdict>();
  for (const members of groups.values()) {
    const best = members.reduce((b, i) => (verdicts[i].score > verdicts[b].score ? i : b), members[0]);
    const groupId = members.length > 1 ? items[members[0]].id : null;
    for (const i of members) {
      const v = verdicts[i];
      result.set(v.it.id, {
        photoId: v.it.id,
        duplicateGroup: groupId,
        bestInGroup: i === best,
        blurry: v.blurry,
        tooDark: v.tooDark,
        tooBright: v.tooBright,
        score: v.score,
      });
    }
  }
  return result;
}

/** Photos worth showing first: best of each duplicate group, not blurry or badly exposed, best first. */
export function shortlist(verdicts: Map<string, PhotoVerdict>): string[] {
  return [...verdicts.values()]
    .filter((v) => v.bestInGroup && !v.blurry && !v.tooDark && !v.tooBright)
    .sort((a, b) => b.score - a.score)
    .map((v) => v.photoId);
}
