'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { LocateFixed, Minus, Plus } from 'lucide-react';
import type { Experience } from '@/lib/catalog';
import type { CommunityItem, DiscoveryType } from '@/lib/discovery-community';
import { locationFor, money } from '@/lib/customer';
import CommunityTiles, { DiscoveryTypeSelect } from './CommunityTiles';
import MapAreaTiles from './MapAreaTiles';

type Props = { experiences: Experience[]; community?: CommunityItem[]; type?: DiscoveryType; onTypeChange?: (type: DiscoveryType) => void; selected?: string; onSelect: (id: string) => void; showResults?: boolean; live?: boolean; sort?: string };
export default function ProviderMap({ experiences, community = [], type = 'experiences', onTypeChange, selected, onSelect, showResults = false, live = false, sort = 'rating' }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<import('leaflet').Map>();
  const leaflet = useRef<typeof import('leaflet')>();
  const markers = useRef<import('leaflet').LayerGroup>();
  const markerButtons = useRef<Record<string, HTMLButtonElement>>({});
  const markerInstances = useRef<Record<string, import('leaflet').Marker>>({});
  const current = useRef({ experiences, community, type, onSelect, live });
  current.current = { experiences, community, type, onSelect, live };
  const firstFit = useRef(false);
  const lastType = useRef(type);
  const frame = useRef<number | null>(null);
  const [ready, setReady] = useState(false);
  const [tileFailed, setTileFailed] = useState(false);
  const [visibleIds, setVisibleIds] = useState<string[]>([]);
  const visible = useMemo(() => experiences.filter(experience => visibleIds.includes(experience.id)).sort((a, b) => sort === 'price-low' ? a.price - b.price : b.rating - a.rating || b.reviews - a.reviews), [experiences, visibleIds, sort]);
  const visibleCommunity = useMemo(() => community.filter(item => visibleIds.includes(item.id)), [community, visibleIds]);
  const visibleCount = type === 'experiences' ? visible.length : visibleCommunity.length;
  const resultLabel = visibleCount === 1 ? { experiences: 'experience', guides: 'guide', buddies: 'buddy' }[type] : type;
  const publishBounds = useRef(() => {});
  publishBounds.current = () => {
    const value = map.current;
    if (!value) return;
    const bounds = value.getBounds();
    const ids = current.current.type === 'experiences'
      ? current.current.experiences.filter(experience => locationFor[experience.id] && bounds.contains(locationFor[experience.id])).map(experience => experience.id)
      : current.current.community.filter(item => bounds.contains(item.position)).map(item => item.id);
    setVisibleIds(previous => previous.length === ids.length && previous.every((id, index) => id === ids[index]) ? previous : ids);
  };
  useEffect(() => {
    let disposed = false;
    let resize: ResizeObserver | undefined;
    import('leaflet').then(L => {
      if (disposed || !container.current) return;
      leaflet.current = L;
      L.DomEvent.disableScrollPropagation(container.current);
      const value = L.map(container.current, { scrollWheelZoom: true, zoomControl: false, wheelDebounceTime: 30, wheelPxPerZoomLevel: 90 }).setView([7.1, 80.6], 7);
      map.current = value;
      value.attributionControl.setPrefix(false);
      value.attributionControl.setPosition('bottomright');
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 18 }).on('tileerror', () => setTileFailed(true)).addTo(value);
      markers.current = L.layerGroup().addTo(value);
      const update = () => {
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          publishBounds.current();
          Object.values(markerButtons.current).forEach(button => button.classList.toggle('map-marker-detailed', !button.classList.contains('map-community-marker') && value.getZoom() >= 9));
        });
      };
      value.on('move zoom moveend zoomend', update);
      resize = new ResizeObserver(() => { value.invalidateSize({ pan: false }); update(); });
      resize.observe(container.current);
      setReady(true);
    });
    return () => {
      disposed = true;
      resize?.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
      map.current?.remove();
      map.current = undefined;
    };
  }, []);
  useEffect(() => {
    const L = leaflet.current;
    const value = map.current;
    const group = markers.current;
    if (!ready || !L || !value || !group) return;
    value.invalidateSize({ pan: false });
    const openMarkerId = Object.entries(markerInstances.current).find(([, marker]) => marker.isPopupOpen())?.[0];
    group.clearLayers();
    markerButtons.current = {};
    markerInstances.current = {};
    if (type === 'experiences') experiences.forEach(experience => {
      const location = locationFor[experience.id];
      if (!location) return;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `map-offer-marker ${value.getZoom() >= 9 ? 'map-marker-detailed' : ''}`;
      button.setAttribute('aria-label', `${experience.title}, rated ${experience.rating}, from ${money(experience.price)}`);
      button.title = experience.title;
      const thumbnail = document.createElement('span'); thumbnail.className = 'map-marker-thumbnail'; thumbnail.setAttribute('aria-hidden', 'true'); thumbnail.textContent = experience.destination.slice(0, 1);
      const image = document.createElement('img'); image.className = 'map-marker-image'; image.src = experience.image; image.alt = ''; image.decoding = 'async';
      image.addEventListener('error', () => image.remove(), { once: true });
      thumbnail.append(image);
      const title = document.createElement('span'); title.className = 'map-marker-title'; title.textContent = experience.title;
      const price = document.createElement('span'); price.className = 'map-marker-price'; price.textContent = money(experience.price);
      const details = document.createElement('span'); details.className = 'map-marker-details';
      const star = document.createElement('span'); star.className = 'map-marker-star'; star.textContent = '★';
      const rating = document.createElement('span'); rating.textContent = experience.rating.toFixed(1);
      details.append(star, rating);
      const markerMeta = document.createElement('span'); markerMeta.className = 'map-marker-meta'; markerMeta.append(price, details);
      const content = document.createElement('span'); content.className = 'map-marker-content'; content.append(title, markerMeta);
      button.append(thumbnail, content);
      markerButtons.current[experience.id] = button;
      const marker = L.marker(location, { icon: L.divIcon({ className: 'map-marker-wrapper', html: button, iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -76] }), keyboard: false, riseOnHover: true }).addTo(group);
      markerInstances.current[experience.id] = marker;
      button.addEventListener('focus', () => marker.setZIndexOffset(2000));
      button.addEventListener('blur', () => marker.setZIndexOffset(button.classList.contains('selected') ? 1000 : 0));
      const preview = document.createElement('div'); preview.className = 'map-offer-preview';
      const photo = document.createElement('img'); photo.src = experience.image; photo.alt = experience.title;
      const heading = document.createElement('strong'); heading.textContent = experience.title;
      const meta = document.createElement('span'); meta.textContent = `${experience.destination} · ★ ${experience.rating.toFixed(1)} · ${experience.duration}`;
      const link = document.createElement('a'); link.href = `/experience/${experience.id}${live ? '?live=1' : ''}`; link.textContent = `View experience · From ${money(experience.price)}`;
      preview.append(photo, heading, meta, link);
      marker.bindPopup(preview, { maxWidth: 260, minWidth: 220 });
      if (experience.id === openMarkerId) marker.openPopup();
      button.addEventListener('click', () => { current.current.onSelect(experience.id); marker.openPopup(); });
    });
    if (type !== 'experiences') community.forEach(item => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `map-offer-marker map-community-marker map-community-${item.type}`;
      button.setAttribute('aria-label', `${item.title}, ${item.type === 'guides' ? 'local guide' : 'travel buddy'} in ${item.destination}`);
      const symbol = document.createElement('span'); symbol.className = 'map-community-symbol';
      const portrait = document.createElement('img'); portrait.src = item.image; portrait.alt = ''; portrait.width = 29; portrait.height = 29;
      symbol.append(portrait);
      const label = document.createElement('span'); label.className = 'map-community-label'; label.textContent = item.title;
      button.append(symbol, label);
      markerButtons.current[item.id] = button;
      const marker = L.marker(item.position, { icon: L.divIcon({ className: 'map-marker-wrapper', html: button, iconSize: [0, 0], iconAnchor: [0, 0], popupAnchor: [0, -68] }), keyboard: false, riseOnHover: true }).addTo(group);
      markerInstances.current[item.id] = marker;
      const preview = document.createElement('div'); preview.className = 'map-offer-preview map-community-preview';
      const previewPhoto = document.createElement('img'); previewPhoto.src = item.image; previewPhoto.alt = ''; previewPhoto.className = 'map-community-preview-photo';
      const heading = document.createElement('strong'); heading.textContent = item.title;
      const meta = document.createElement('span'); meta.textContent = `${item.destination} · ${item.type === 'guides' ? 'Local guide' : 'Travel buddy'}`;
      const description = document.createElement('p'); description.textContent = item.description;
      preview.append(previewPhoto, heading, meta, description);
      marker.bindPopup(preview, { maxWidth: 240, minWidth: 190 });
      if (item.id === openMarkerId) marker.openPopup();
      button.addEventListener('click', () => { current.current.onSelect(item.id); marker.openPopup(); });
      button.addEventListener('focus', () => marker.setZIndexOffset(2000));
      button.addEventListener('blur', () => marker.setZIndexOffset(button.classList.contains('selected') ? 1000 : 0));
    });
    const points = type === 'experiences' ? experiences.filter(experience => locationFor[experience.id]).map(experience => locationFor[experience.id]) : community.map(item => item.position);
    if (points.length && (!firstFit.current || lastType.current !== type)) {
      value.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: type === 'experiences' ? 12 : 11 });
      firstFit.current = true;
    }
    lastType.current = type;
    publishBounds.current();
  }, [ready, experiences, community, type, live]);
  useEffect(() => {
    Object.entries(markerButtons.current).forEach(([id, button]) => {
      button.classList.toggle('selected', id === selected);
      button.setAttribute('aria-pressed', String(id === selected));
      markerInstances.current[id]?.setZIndexOffset(id === selected ? 1000 : 0);
      if (type !== 'experiences' && id === selected && !markerInstances.current[id]?.isPopupOpen()) markerInstances.current[id]?.openPopup();
    });
  }, [selected, experiences, community, type, ready, live]);
  const recenter = () => {
    const L = leaflet.current;
    const points = type === 'experiences' ? experiences.filter(experience => locationFor[experience.id]).map(experience => locationFor[experience.id]) : community.map(item => item.position);
    if (L && map.current && points.length) map.current.fitBounds(L.latLngBounds(points), { padding: [60, 60], maxZoom: 12 });
  };
  return <div className={showResults ? 'map-browser' : 'map-only'}>
    <div className="provider-map">
      <div ref={container} className="map-canvas" role="region" aria-label="Discovery map. Scroll to zoom toward your cursor; drag to move."/>
      <div className="map-controls" role="group" aria-label="Map controls">
        <button type="button" aria-label="Zoom in" onClick={() => map.current?.zoomIn()}><Plus size={19}/></button>
        <button type="button" aria-label="Zoom out" onClick={() => map.current?.zoomOut()}><Minus size={19}/></button>
        <button type="button" aria-label="Show all matching experiences" onClick={recenter}><LocateFixed size={19}/></button>
      </div>
      {tileFailed && <div className="map-error" role="status">Map tiles unavailable. You can still browse the experiences in this area.</div>}
    </div>
    {showResults && <aside className="map-area-results" aria-label="Listings in the visible map area">
      <div className="map-area-heading"><h2>In this area</h2>{onTypeChange && <DiscoveryTypeSelect value={type} onChange={onTypeChange}/>}<p role="status" aria-live="polite">{visibleCount} {resultLabel}{type === 'experiences' && visibleCount > 20 ? ' · Showing the top 20' : ''}{type === 'experiences' ? ` · ${sort === 'price-low' ? 'Lowest price first' : 'Highest rated first'}` : ''}</p></div>
      {type === 'experiences' ? <MapAreaTiles experiences={visible} selected={selected} live={live}/> : <CommunityTiles items={visibleCommunity} selected={selected} onSelect={onSelect}/>}
    </aside>}
  </div>;
}
