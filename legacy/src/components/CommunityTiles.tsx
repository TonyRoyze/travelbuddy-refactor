'use client';

import { ArrowUpRight, MapPin, Sparkles } from 'lucide-react';
import type { CommunityItem, DiscoveryType } from '@/lib/discovery-community';
import { Photo } from './UI';

export function DiscoveryTypeSelect({ value, onChange, className = '' }: { value: DiscoveryType; onChange: (value: DiscoveryType) => void; className?: string }) {
  return <label className={`discovery-type-select ${className}`}><span>Show</span><select aria-label="Show on map and in list" value={value} onChange={event => onChange(event.target.value as DiscoveryType)}>
    <option value="experiences">Experiences</option><option value="guides">Guides</option><option value="buddies">Buddies</option>
  </select></label>;
}

function ProfilePhoto({ item, full = false }: { item: CommunityItem; full?: boolean }) {
  return <div className={full ? 'card-photo community-card-photo' : 'map-area-photo community-photo'}>
    <Photo src={item.image} alt={`${item.title}, ${item.type === 'guides' ? 'local guide' : 'travel buddy'}`}/>
    <span className="community-photo-label">{item.type === 'guides' ? 'Local guide' : 'Travel buddy'}</span>
  </div>;
}

export default function CommunityTiles({ items, selected, onSelect, list = false }: { items: CommunityItem[]; selected?: string; onSelect: (id: string) => void; list?: boolean }) {
  return <div className={list ? 'search-grid community-search-grid' : 'map-area-list'}>
    {items.map(item => list ? <article key={item.id} className={`experience-card community-experience-card${selected === item.id ? ' selected' : ''}`}>
      <ProfilePhoto item={item} full/>
      <div className="card-copy">
        <p className="card-location"><MapPin size={15} aria-hidden="true"/>{item.destination}<span>· {item.type === 'guides' ? 'Local guide' : 'Travel buddy'}</span></p>
        <h3>{item.title}</h3>
        <p className="community-card-specialty">{item.subtitle}</p>
        {item.type === 'buddies' && <><p className="community-card-demographics">{item.age} years · {item.gender} · {item.pace} pace</p><p className="community-card-interests"><Sparkles size={15} aria-hidden="true"/>{item.interests?.join(' · ')}</p></>}
        {item.type === 'guides' && <><p className="community-card-demographics">{item.guideFocus} · {item.guideStyle} style</p><p className="community-card-interests"><Sparkles size={15} aria-hidden="true"/>{item.languages?.join(' · ')}</p></>}
        <button type="button" className="community-profile-action" onClick={() => onSelect(selected === item.id ? '' : item.id)} aria-expanded={selected === item.id}>{selected === item.id ? 'Hide profile' : 'View profile'} <ArrowUpRight size={16} aria-hidden="true"/></button>
        {selected === item.id && <p className="community-expanded-note">{item.description}</p>}
      </div>
    </article> : <button key={item.id} type="button" className={`map-area-card community-card${selected === item.id ? ' selected' : ''}`} onClick={() => onSelect(item.id)} aria-pressed={selected === item.id}>
      <ProfilePhoto item={item}/>
      <div className="map-area-copy">
        <span className="map-area-location"><MapPin size={12} aria-hidden="true"/>{item.destination}</span>
        <h3>{item.title}</h3>
        <span className="community-subtitle">{item.subtitle}</span>
        {item.type === 'buddies' && <span className="community-map-demographics">{item.age} · {item.gender} · {item.pace}</span>}
        {item.type === 'guides' && <span className="community-map-demographics">{item.guideFocus} · {item.languages?.join(', ')}</span>}
        <div className="map-area-footer"><span>View profile</span><ArrowUpRight size={17} aria-hidden="true"/></div>
      </div>
    </button>)}
    {!items.length && <p className="map-area-empty">No matches here. Adjust the filters or try another place.</p>}
  </div>;
}
