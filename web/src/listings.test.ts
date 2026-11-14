import { describe, expect, it } from 'vitest';
import { available, boundingBox, DAY, directions, distance, isListing, photoSource, type Listing } from './listings';
const point = { lat: -37.81, lon: 144.96 };
const listing = { ...point, id: 'post-1', title: 'Free gum', locality: 'Brunswick', notes: 'Beside the gate', quantity: 'A trailer load', woodType: 'Hardwood', photoId: '12345678-1234-1234-1234-123456789abc', photoUrl: 'https://untrusted.example/tracker', expiresAt: Date.now() + DAY, collected: false } as Listing;

describe('discovery and public listing validation', () => {
  it('hides collected, expired and invalid-location listings', () => {
    expect(available(listing)).toBe(true);
    expect(available({ ...listing, collected: true })).toBe(false);
    expect(available({ ...listing, expiresAt: 0 })).toBe(false);
    expect(available({ ...listing, lat: 91 })).toBe(false);
  });
  it('filters arbitrary shared collection JSON and pins image URLs to the platform', () => {
    expect(isListing(listing)).toBe(true);
    expect(isListing({ ...listing, notes: { malicious: true } })).toBe(false);
    expect(isListing({ ...listing, photoId: '../other-app/file' })).toBe(false);
    expect(isListing(null)).toBe(false);
    expect(photoSource(listing.photoId)).toContain('https://api.freeappstore.online/v1/apps/firewood/photos/');
    expect(photoSource(listing.photoId)).not.toContain('untrusted');
  });
  it('measures distances and makes a bounding box containing the search center', () => {
    expect(distance(point, point)).toBe(0);
    expect(distance(point, { lat: -33.87, lon: 151.21 })).toBeGreaterThan(700);
    const box = boundingBox(point, 25)!;
    expect(box.latMin).toBeLessThan(point.lat); expect(box.latMax).toBeGreaterThan(point.lat);
    expect(box.lonMin).toBeLessThan(point.lon); expect(box.lonMax).toBeGreaterThan(point.lon);
    expect(boundingBox({ lat: 0, lon: 179.99 }, 25)).toBeUndefined();
    expect(boundingBox({ lat: 89.99, lon: 0 }, 25)).toBeUndefined();
    expect(directions(point)).toBe('https://www.google.com/maps/dir/?api=1&destination=-37.81,144.96');
  });
});
