export type GeoPoint = { lat: number; lon: number };

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance between two points in kilometres (haversine). */
export function distanceKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Treats missing and (0, 0) coordinates — which some devices report for "no GPS" — as unknown. */
export function validPoint(p: GeoPoint | null | undefined): GeoPoint | null {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
  if (p.lat === 0 && p.lon === 0) return null;
  return p;
}
