'use client';
import { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin } from 'lucide-react';
import type { Coordinates } from '@/lib/inbox';

export function PickupLocation({ label, value, position, onChange, disabled = false, requirePin = false }: { label: string; value: string; position: Coordinates | null; onChange: (label: string, position: Coordinates | null) => void; disabled?: boolean; requirePin?: boolean }) {
  const [mapOpen, setMapOpen] = useState(false); const [locating, setLocating] = useState(false); const [error, setError] = useState('');
  const current = useRef({ value, position, onChange }); current.current = { value, position, onChange };
  function locate() {
    if (!navigator.geolocation) { setError('Location is unavailable. Choose a point on the map instead.'); return; }
    setLocating(true); setError('');
    navigator.geolocation.getCurrentPosition(result => {
      setLocating(false);
      current.current.onChange(current.current.value || 'My current location', { latitude: result.coords.latitude, longitude: result.coords.longitude });
      setMapOpen(true);
    }, () => { setLocating(false); setError('Your location could not be shared. Allow location access or choose a point on the map.'); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }
  return <div className="pickup-field">
    <label className="field">{label}<input value={value} disabled={disabled} maxLength={200} placeholder="Hotel, station, landmark or current area" onChange={event => onChange(event.target.value, position)}/></label>
    <div className="pickup-actions"><button className="button button-secondary" disabled={disabled || locating} type="button" onClick={locate}><LocateFixed size={16}/>{locating ? 'Finding your location…' : 'Use current location'}</button><button className="text-link" disabled={disabled} type="button" onClick={() => setMapOpen(value => !value)} aria-expanded={mapOpen}><MapPin size={16}/>{mapOpen ? 'Hide map' : 'Choose on map'}</button></div>
    {error && <p className="error-message" role="alert">{error}</p>}
    {mapOpen && <LocationMap position={position} disabled={disabled} onSelect={point => onChange(value || 'Selected pickup point', point)}/>}
    {position ? <p className="field-help">Map pin added.{!requirePin && ' Buddies nearby can find your request.'} <button className="text-link" type="button" disabled={disabled} onClick={() => onChange(value, null)}>Remove pin</button></p> : <p className="field-help">{requirePin ? 'Share your current location or choose a point on the map.' : 'Add a map pin or share your current location to appear in nearby requests. Your pickup location will be visible on the post.'}</p>}
  </div>;
}

function LocationMap({ position, onSelect, disabled }: { position: Coordinates | null; onSelect: (value: Coordinates) => void; disabled: boolean }) {
  const container = useRef<HTMLDivElement>(null); const map = useRef<import('leaflet').Map>(); const marker = useRef<import('leaflet').CircleMarker>();
  const current = useRef({ position, onSelect, disabled }); current.current = { position, onSelect, disabled };
  const [error, setError] = useState(''); const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false; let resize: ResizeObserver | undefined;
    import('leaflet').then(L => {
      if (disposed || !container.current) return;
      const point = current.current.position;
      const value = L.map(container.current, { scrollWheelZoom: false }).setView(point ? [point.latitude, point.longitude] : [7.1, 80.6], point ? 14 : 7);
      map.current = value; value.attributionControl.setPrefix(false);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).on('tileerror', () => setError('Some map tiles could not load. You can still use your current location.')).addTo(value);
      marker.current = L.circleMarker(point ? [point.latitude, point.longitude] : [0, 0], { radius: 10, color: '#0B6258', fillColor: '#0B6258', fillOpacity: 0.8 });
      if (point) marker.current.addTo(value);
      value.on('click', event => { if (!current.current.disabled) current.current.onSelect({ latitude: event.latlng.wrap().lat, longitude: event.latlng.wrap().lng }); });
      resize = new ResizeObserver(() => value.invalidateSize({ pan: false })); resize.observe(container.current);
      setReady(true);
    }).catch(() => { if (!disposed) setError('Map unavailable. Use your current location or enter a pickup point.'); });
    return () => { disposed = true; resize?.disconnect(); map.current?.remove(); map.current = undefined; marker.current = undefined; };
  }, []);
  useEffect(() => {
    if (!ready || !map.current || !marker.current) return;
    if (position) { marker.current.setLatLng([position.latitude, position.longitude]).addTo(map.current); map.current.panTo([position.latitude, position.longitude]); }
    else marker.current.remove();
  }, [position, ready]);
  return <><p className="field-help">Click or tap the map to place your pin. You can also zoom in first.</p><div className="pickup-map" ref={container} aria-label="Choose a pickup point on the map"/><button type="button" className="button button-secondary" disabled={!ready || disabled} onClick={() => { const center = map.current?.getCenter().wrap(); if (center) onSelect({ latitude: center.lat, longitude: center.lng }); }}>Use map centre</button>{error && <p className="field-help" role="status">{error}</p>}</>;
}
