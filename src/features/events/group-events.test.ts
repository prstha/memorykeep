/// <reference types="node" />
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { detectHome, groupIntoEvents, splitByGap } from '@/features/events/group-events';
import { reconcileEvents } from '@/features/events/reconcile';
import type { LocationCache, PhotoMeta } from '@/features/types';
import type { GeoPoint } from '@/lib/geo';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const T0 = new Date(2026, 8, 1, 9).getTime(); // 1 Sep 2026, 09:00 local

const KATHMANDU: GeoPoint = { lat: 27.7172, lon: 85.324 };
const POKHARA: GeoPoint = { lat: 28.2096, lon: 83.9856 };

let nextId = 0;

/** A day's worth of photos: `count` shots one hour apart starting at 09:00 on day `day`. */
function day(day: number, count: number, where: GeoPoint | null, locations: LocationCache): PhotoMeta[] {
  return Array.from({ length: count }, (_, k) => {
    const id = `p${nextId++}`;
    locations.set(id, where);
    return { id, source: 'device', filename: null, takenAt: T0 + day * DAY + k * HOUR, width: 1, height: 1 };
  });
}

describe('splitByGap', () => {
  it('starts a new cluster after a long gap', () => {
    const locs: LocationCache = new Map();
    const photos = [...day(0, 3, null, locs), ...day(1, 2, null, locs)];
    assert.deepEqual(
      splitByGap(photos, 6 * HOUR).map((c) => c.length),
      [3, 2]
    );
  });
});

describe('groupIntoEvents', () => {
  it('joins a multi-day trip away from home into one event', () => {
    const locs: LocationCache = new Map();
    const photos = [
      // Ordinary days at home establish where home is.
      ...day(0, 6, KATHMANDU, locs),
      ...day(1, 6, KATHMANDU, locs),
      ...day(2, 6, KATHMANDU, locs),
      // Three-day trip.
      ...day(5, 8, POKHARA, locs),
      ...day(6, 8, POKHARA, locs),
      ...day(7, 8, POKHARA, locs),
    ];
    const { events, home } = groupIntoEvents(photos, locs);

    assert.ok(home && Math.abs(home.lat - KATHMANDU.lat) < 0.01);
    const trips = events.filter((e) => e.away);
    assert.equal(trips.length, 1);
    assert.equal(trips[0].photoIds.length, 24);
    assert.match(trips[0].title, /^Trip · /);
  });

  it('keeps consecutive days at home as separate events', () => {
    const locs: LocationCache = new Map();
    const photos = [0, 1, 2, 3].flatMap((d) => day(d, 6, KATHMANDU, locs));
    const { events } = groupIntoEvents(photos, locs);
    assert.equal(events.length, 4);
    assert.ok(events.every((e) => !e.away));
  });

  it('does not merge days without GPS, and treats (0, 0) as no GPS', () => {
    const locs: LocationCache = new Map();
    const photos = [
      ...[0, 1, 2].flatMap((d) => day(d, 6, KATHMANDU, locs)),
      ...day(5, 6, null, locs),
      ...day(6, 6, { lat: 0, lon: 0 }, locs),
    ];
    const { events } = groupIntoEvents(photos, locs);
    assert.equal(events.length, 5);
    assert.ok(events.every((e) => !e.away));
  });

  it('folds clusters smaller than the minimum into loose photos', () => {
    const locs: LocationCache = new Map();
    const photos = [...day(0, 6, null, locs), ...day(3, 2, null, locs)];
    const { events, loose } = groupIntoEvents(photos, locs);
    assert.equal(events.length, 1);
    assert.equal(loose.length, 2);
  });
});

describe('detectHome', () => {
  it('needs photos on enough different days', () => {
    const locs: LocationCache = new Map();
    const clusters = [day(0, 6, KATHMANDU, locs), day(1, 6, KATHMANDU, locs)];
    assert.equal(detectHome(clusters, locs, 3), null);
  });
});

describe('reconcileEvents', () => {
  it('keeps id and status when an event gains photos', () => {
    const locs: LocationCache = new Map();
    const photos = day(0, 6, null, locs);
    const before = groupIntoEvents(photos, locs).events;
    before[0] = { ...before[0], id: 'kept', status: 'reviewed' };

    const extra = day(0, 1, null, locs).map((p) => ({ ...p, takenAt: p.takenAt + 6 * HOUR }));
    const after = groupIntoEvents([...photos, ...extra], locs).events;
    const result = reconcileEvents(after, before);

    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'kept');
    assert.equal(result[0].status, 'reviewed');
    assert.equal(result[0].photoIds.length, 7);
  });

  it('gives unmatched events a fresh id that does not collide with inherited ones', () => {
    const base = { start: 0, end: 0, title: '', coverId: 'a', status: 'new' as const, away: false };
    const previous = [{ ...base, id: 'evt-1', photoIds: ['a', 'b', 'c'], status: 'created' as const }];
    const next = [
      { ...base, id: 'evt-2', photoIds: ['a', 'b', 'c'] },
      { ...base, id: 'evt-1', photoIds: ['x', 'y'] },
    ];
    const result = reconcileEvents(next, previous);
    assert.deepEqual(
      result.map((e) => [e.id, e.status]),
      [
        ['evt-1', 'created'],
        ['evt-1-2', 'new'],
      ]
    );
  });
});

