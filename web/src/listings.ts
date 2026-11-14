import type { GeoBBox } from '@freeappstore/sdk';

export interface Point { lat: number; lon: number }
export interface Listing extends Point {
  id: string;
  title: string;
  locality: string;
  notes: string;
  quantity: string;
  woodType: string;
  photoId: string;
  photoUrl: string;
  expiresAt: number;
  collected: boolean;
  _owner?: string;
  _createdAt?: number;
}
export const DAY = 86_400_000;
export function validPoint(point: Point): boolean {
  return Number.isFinite(point.lat) && Number.isFinite(point.lon) && Math.abs(point.lat) <= 90 && Math.abs(point.lon) <= 180;
}
export function distance(a: Point, b: Point): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.lat - a.lat) * rad / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function boundingBox(point: Point, radius: number): GeoBBox | undefined {
  const angular = radius / 6371;
  const latDelta = angular * 180 / Math.PI;
  const lonDelta = Math.asin(Math.min(1, Math.sin(angular) / Math.max(0.001, Math.cos(point.lat * Math.PI / 180)))) * 180 / Math.PI;
  // The collection API supports a single box: crossing the antimeridian needs
  // an unbounded query followed by exact client-side distance filtering.
  if (Math.abs(point.lon) + lonDelta >= 180 || Math.abs(point.lat) + latDelta >= 90) return undefined;
  return { latMin: point.lat - latDelta, latMax: point.lat + latDelta, lonMin: point.lon - lonDelta, lonMax: point.lon + lonDelta };
}
export function available(listing: Listing, now = Date.now()): boolean {
  return !listing.collected && Number.isFinite(listing.expiresAt) && listing.expiresAt > now && validPoint(listing);
}
export function directions(point: Point): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lon}`;
}
export function locate(): Promise<Point> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is unavailable. You can choose a pickup pin on the map.'));
    navigator.geolocation.getCurrentPosition(({ coords }) => resolve({ lat: coords.latitude, lon: coords.longitude }),
      () => reject(new Error('Could not get your location. Allow location access, or choose a pickup pin on the map.')),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 60_000 });
  });
}

/** Shared collections accept arbitrary JSON: validate before rendering user data. */
export function isListing(value: unknown): value is Listing {
  if (!value || typeof value !== 'object') return false;
  const x = value as Listing;
  return typeof x.id === 'string' && validPoint(x) && typeof x.collected === 'boolean'
    && Number.isFinite(x.expiresAt) && typeof x.photoId === 'string' && /^[a-f0-9-]{36}$/i.test(x.photoId)
    && ['title', 'locality', 'notes', 'quantity', 'woodType'].every((key) => {
      const text = (value as Record<string, unknown>)[key];
      return typeof text === 'string' && text.length <= 1000;
    });
}
export function photoSource(photoId: string): string {
  return `https://api.freeappstore.online/v1/apps/firewood/photos/${encodeURIComponent(photoId)}`;
}
