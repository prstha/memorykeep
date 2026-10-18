/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assessEvent, type PhotoAnalysis, shortlist } from '@/features/analysis/assess';
import {
  dHash,
  type GrayImage,
  hammingDistance,
  laplacianVariance,
  meanBrightness,
  toGray,
} from '@/features/analysis/image-metrics';
import { photoKind } from '@/features/analysis/photo-kind';

/** A synthetic 64×64 image: a checkerboard of `cell`-pixel squares, optionally shifted in brightness. */
function checkerboard(cell: number, offset = 0): GrayImage {
  const size = 64;
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const on = (Math.floor(x / cell) + Math.floor(y / cell)) % 2 === 0;
      data[y * size + x] = Math.min(1, Math.max(0, (on ? 0.8 : 0.2) + offset));
    }
  }
  return { width: size, height: size, data };
}

/** Horizontal gradient: smooth, so it has almost no edges. */
function gradient(): GrayImage {
  const size = 64;
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) data[y * size + x] = x / (size - 1);
  return { width: size, height: size, data };
}

describe('image metrics', () => {
  it('converts RGBA to luminance', () => {
    const img = toGray(new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255]), 2, 1);
    assert.ok(Math.abs(img.data[0] - 1) < 1e-6);
    assert.equal(img.data[1], 0);
  });

  it('gives near-identical images close hashes and different images distant ones', () => {
    const a = dHash(checkerboard(8));
    const brighter = dHash(checkerboard(8, 0.05));
    const other = dHash(gradient());
    assert.equal(a.length, 16);
    assert.ok(hammingDistance(a, brighter) <= 3);
    assert.ok(hammingDistance(a, other) > 10);
  });

  it('scores crisp edges as sharper than a smooth gradient', () => {
    assert.ok(laplacianVariance(checkerboard(4)) > laplacianVariance(gradient()) * 100);
  });

  it('measures mean brightness', () => {
    assert.ok(Math.abs(meanBrightness(checkerboard(8)) - 0.5) < 0.01);
  });
});

describe('photoKind', () => {
  it('recognises screenshots and chat-app images by filename', () => {
    assert.equal(photoKind('Screenshot_20261012-101500_Chrome.jpg'), 'screenshot');
    assert.equal(photoKind('IMG-20261012-WA0003.jpg'), 'messaging');
    assert.equal(photoKind('photo_2026-10-12_10-00-00.jpg'), 'messaging');
    assert.equal(photoKind('PXL_20261012_101500123.jpg'), 'camera');
    assert.equal(photoKind(null), 'camera');
    assert.equal(photoKind('IMG_0001.HEIC', true), 'screenshot');
  });
});

describe('assessEvent', () => {
  const MIN = 60 * 1000;

  function analysis(
    photoId: string,
    dhash: string,
    sharpness: number,
    extra: Partial<PhotoAnalysis> = {}
  ): PhotoAnalysis {
    return { photoId, dhash, sharpness, brightness: 0.5, faces: 0, smile: null, ...extra };
  }

  it('groups a burst, keeps its sharpest shot and flags blur and exposure', () => {
    const burst = 'f0f0f0f0f0f0f0f0';
    const photos = [
      { id: 'burst1', takenAt: 0 },
      { id: 'burst2', takenAt: 1 * MIN },
      { id: 'burst3', takenAt: 2 * MIN },
      { id: 'blurry', takenAt: 60 * MIN },
      { id: 'dark', takenAt: 90 * MIN },
      { id: 'good', takenAt: 120 * MIN },
    ];
    const analyses = new Map(
      [
        analysis('burst1', burst, 0.02),
        analysis('burst2', 'f0f0f0f0f0f0f0f1', 0.05),
        analysis('burst3', 'f0f0f0f0f0f0f0f3', 0.03),
        analysis('blurry', '0f0f0f0f0f0f0f0f', 0.001),
        analysis('dark', '00ff00ff00ff00ff', 0.04, { brightness: 0.05 }),
        analysis('good', 'ff00ff00ff00ff00', 0.04, { faces: 2, smile: 0.9 }),
      ].map((a) => [a.photoId, a])
    );

    const verdicts = assessEvent(photos, analyses);

    const group = verdicts.get('burst1')!.duplicateGroup;
    assert.ok(group);
    assert.equal(verdicts.get('burst2')!.duplicateGroup, group);
    assert.equal(verdicts.get('burst3')!.duplicateGroup, group);
    assert.equal(verdicts.get('burst2')!.bestInGroup, true);
    assert.equal(verdicts.get('burst1')!.bestInGroup, false);
    assert.equal(verdicts.get('good')!.duplicateGroup, null);
    assert.equal(verdicts.get('blurry')!.blurry, true);
    assert.equal(verdicts.get('dark')!.tooDark, true);

    assert.deepEqual(shortlist(verdicts), ['good', 'burst2']);
  });

  it('does not treat similar photos hours apart as duplicates unless nearly identical', () => {
    const photos = [
      { id: 'a', takenAt: 0 },
      { id: 'b', takenAt: 5 * 60 * MIN },
    ];
    const analyses = new Map([
      ['a', analysis('a', 'f0f0f0f0f0f0f0f0', 0.03)],
      ['b', analysis('b', 'f0f0f0f0f0f0f0ff', 0.03)],
    ]);
    const verdicts = assessEvent(photos, analyses);
    assert.equal(verdicts.get('a')!.duplicateGroup, null);
    assert.equal(verdicts.get('b')!.duplicateGroup, null);
  });

  it('skips photos that have not been analysed yet', () => {
    const verdicts = assessEvent([{ id: 'x', takenAt: 0 }], new Map());
    assert.equal(verdicts.size, 0);
  });
});
