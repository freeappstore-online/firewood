import type { GeoBBox } from '@freeappstore/sdk';

export interface Point { lat: number; lon: number }
export interface CaptureLocation extends Point { accuracy: number; measuredAt: number }
export interface Listing extends Point {
  id: string;
  title: string;
  notes: string;
  photoId: string;
  photoUrl?: string;
  expiresAt: number;
  collected: boolean;
  /** Set only for an in-app camera capture, never inferred from upload time. */
  capturedAt?: number;
  locationRecordedAt?: number;
  accuracy?: number;
  kind?: 'sighting';
  locality?: string;
  quantity?: string;
  woodType?: string;
  _owner?: string;
  _createdAt?: number;
}
export const DAY = 86_400_000;
export const SIGHTING_LIFETIME = 2 * DAY;
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
  if (Math.abs(point.lon) + lonDelta >= 180 || Math.abs(point.lat) + latDelta >= 90) return undefined;
  return { latMin: point.lat - latDelta, latMax: point.lat + latDelta, lonMin: point.lon - lonDelta, lonMax: point.lon + lonDelta };
}
export function available(listing: Listing, now = Date.now()): boolean {
  return !listing.collected && Number.isFinite(listing.expiresAt) && listing.expiresAt > now && validPoint(listing);
}
export function directions(point: Point): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${point.lat},${point.lon}`;
}
export function locate(): Promise<CaptureLocation> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This browser cannot record a pickup location.'));
    navigator.geolocation.getCurrentPosition(({ coords, timestamp }) => resolve({ lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy, measuredAt: timestamp }),
      () => reject(new Error('Allow location access to record where the photo is taken, then try again.')),
      { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
  });
}
/** Shared collections accept arbitrary JSON: validate before rendering user data. */
export function isListing(value: unknown): value is Listing {
  if (!value || typeof value !== 'object') return false;
  const x = value as Listing;
  return typeof x.id === 'string' && validPoint(x) && typeof x.collected === 'boolean'
    && Number.isFinite(x.expiresAt) && typeof x.photoId === 'string' && /^[a-f0-9-]{36}$/i.test(x.photoId)
    && typeof x.title === 'string' && x.title.length <= 120
    && typeof x.notes === 'string' && x.notes.length <= 1000
    && (x.capturedAt === undefined || (Number.isFinite(x.capturedAt) && x.capturedAt > 0 && x.capturedAt <= 8_640_000_000_000_000))
    && (x.accuracy === undefined || (Number.isFinite(x.accuracy) && x.accuracy >= 0));
}
export function photoSource(photoId: string): string {
  return `https://api.freeappstore.online/v1/apps/firewood/photos/${encodeURIComponent(photoId)}`;
}
export function captureLabel(listing: Listing): string {
  const timestamp = listing.capturedAt ?? listing._createdAt;
  if (!timestamp) return 'Capture time not recorded';
  return `${listing.capturedAt ? 'Photo taken' : 'Posted'} ${new Date(timestamp).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' })}`;
}
