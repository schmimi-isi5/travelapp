const EARTH_RADIUS_KM = 6371;
/** Road distance is typically longer than the straight line; coarse, deliberately labeled as an estimate. */
const ROAD_FACTOR = 1.3;
const AVERAGE_SPEED_KMH = 65;

export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/** Rough offline estimate from straight-line distance. Never presented as navigation or traffic data. */
export function estimateRoute(
  a: { latitude: number | null; longitude: number | null },
  b: { latitude: number | null; longitude: number | null },
): { distance_km: number; duration_minutes: number } | null {
  if (a.latitude === null || a.longitude === null || b.latitude === null || b.longitude === null) return null;
  const distance = haversineKm({ latitude: a.latitude, longitude: a.longitude }, { latitude: b.latitude, longitude: b.longitude }) * ROAD_FACTOR;
  return { distance_km: Math.round(distance), duration_minutes: Math.round((distance / AVERAGE_SPEED_KMH) * 60) };
}
