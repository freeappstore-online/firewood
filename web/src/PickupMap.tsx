import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Listing, Point } from './listings';

export default function PickupMap({ listings = [], center, pin, onPick, onSelect }: {
  listings?: Listing[]; center?: Point | null; pin?: Point | null;
  onPick?: (point: Point) => void; onSelect?: (id: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const markers = useRef<L.LayerGroup | null>(null);
  const pick = useRef(onPick), select = useRef(onSelect);
  pick.current = onPick; select.current = onSelect;
  useEffect(() => {
    if (!host.current) return;
    const instance = L.map(host.current, { scrollWheelZoom: false }).setView([-25.5, 134], 4);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19 }).addTo(instance);
    const group = L.layerGroup().addTo(instance);
    instance.on('click', (event: L.LeafletMouseEvent) => pick.current?.({ lat: event.latlng.lat, lon: event.latlng.lng }));
    map.current = instance; markers.current = group;
    const observer = new ResizeObserver(() => instance.invalidateSize());
    observer.observe(host.current);
    return () => { observer.disconnect(); instance.remove(); map.current = null; markers.current = null; };
  }, []);
  useEffect(() => {
    if (!map.current || !markers.current) return;
    markers.current.clearLayers();
    for (const item of listings) {
      // Never interpolate user text as marker HTML.
      const label = document.createElement('span'); label.textContent = item.title;
      L.circleMarker([item.lat, item.lon], { radius: 9, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 })
        .bindTooltip(label).on('click', () => select.current?.(item.id)).addTo(markers.current);
    }
    if (pin) L.circleMarker([pin.lat, pin.lon], { radius: 11, color: '#fff', weight: 3, fillColor: '#d97706', fillOpacity: 1 }).addTo(markers.current);
    if (!center && !pin && listings.length) map.current.fitBounds(L.latLngBounds(listings.map((x) => [x.lat, x.lon] as [number, number])), { padding: [32, 32], maxZoom: 14 });
  }, [listings, pin, center]);
  useEffect(() => {
    const target = pin ?? center;
    if (target && map.current) map.current.setView([target.lat, target.lon], 14);
  }, [center, pin]);
  return <div ref={host} className="pickup-map" role="region" aria-label={onPick ? 'Choose a public pickup location on the map' : 'Available firewood locations'} />;
}
