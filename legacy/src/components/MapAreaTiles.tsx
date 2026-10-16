'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Clock3, MapPin, Star } from 'lucide-react';
import type { Experience } from '@/lib/catalog';
import { money } from '@/lib/customer';
import { Photo } from './UI';

type Tile = { experience: Experience; leaving: boolean };

export default function MapAreaTiles({ experiences, selected, live }: { experiences: Experience[]; selected?: string; live: boolean }) {
  const drag = useRef<{ id: number; y: number; top: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const [tiles, setTiles] = useState<Tile[]>(() => experiences.slice(0, 20).map(experience => ({ experience, leaving: false })));

  useEffect(() => {
    const incoming = experiences.slice(0, 20);
    const ids = new Set(incoming.map(experience => experience.id));
    setTiles(previous => {
      const next = incoming.map(experience => ({ experience, leaving: false }));
      previous.forEach((tile, index) => {
        if (!ids.has(tile.experience.id)) next.splice(Math.min(index, next.length), 0, { ...tile, leaving: true });
      });
      return next;
    });
  }, [experiences]);

  // Retain departing tiles briefly so they can fade out before unmounting.
  useEffect(() => {
    if (!tiles.some(tile => tile.leaving)) return;
    const timer = window.setTimeout(() => setTiles(previous => previous.filter(tile => !tile.leaving)), 180);
    return () => window.clearTimeout(timer);
  }, [tiles]);

  return <div className="map-area-list draggable-area-list"
    onDragStart={event => event.preventDefault()}
    onPointerDown={event => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      suppressClick.current = false;
      drag.current = { id: event.pointerId, y: event.clientY, top: event.currentTarget.scrollTop, moved: false };
    }}
    onPointerMove={event => {
      const current = drag.current;
      if (!current || current.id !== event.pointerId) return;
      const distance = event.clientY - current.y;
      if (!current.moved && Math.abs(distance) < 5) return;
      if (!current.moved) {
        current.moved = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.currentTarget.classList.add('is-dragging');
      }
      event.preventDefault();
      event.currentTarget.scrollTop = current.top - distance;
    }}
    onPointerUp={event => {
      suppressClick.current = Boolean(drag.current?.moved);
      drag.current = null;
      event.currentTarget.classList.remove('is-dragging');
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    }}
    onPointerCancel={event => { drag.current = null; event.currentTarget.classList.remove('is-dragging'); }}
    onLostPointerCapture={event => { drag.current = null; event.currentTarget.classList.remove('is-dragging'); }}
    onPointerLeave={() => { if (!drag.current?.moved) drag.current = null; }}
    onClickCapture={event => { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); suppressClick.current = false; } }}>
    {tiles.map(({ experience, leaving }) => <Link
      key={experience.id}
      className={`map-area-card${selected === experience.id ? ' selected' : ''}${leaving ? ' is-leaving' : ''}`}
      href={`/experience/${experience.id}${live ? '?live=1' : ''}`}
      aria-label={`${experience.title}, rated ${experience.rating.toFixed(1)}, from ${money(experience.price)} per person`}
      aria-hidden={leaving || undefined}
      tabIndex={leaving ? -1 : undefined}
    >
      <div className="map-area-photo">
        <Photo src={experience.image} alt=""/>
        <span className="map-area-category">{experience.category}</span>
        <span className="map-area-rating"><Star size={12} fill="currentColor" aria-hidden="true"/>{experience.rating.toFixed(1)}</span>
      </div>
      <div className="map-area-copy">
        <span className="map-area-location"><MapPin size={12} aria-hidden="true"/>{experience.destination}</span>
        <h3>{experience.title}</h3>
        <span className="map-area-duration"><Clock3 size={12} aria-hidden="true"/>{experience.duration}</span>
        <div className="map-area-footer"><p>From <strong>{money(experience.price)}</strong><span> / person</span></p><ArrowUpRight size={17} aria-hidden="true"/></div>
      </div>
    </Link>)}
    {!tiles.length && <p className="map-area-empty">No matching experiences here. Zoom out, move the map, or adjust your filters.</p>}
  </div>;
}
