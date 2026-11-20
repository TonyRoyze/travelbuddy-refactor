'use client';
import { useState } from 'react';
import { ExternalLink, MapPin, Share2 } from 'lucide-react';
import type { Experience } from '@/lib/catalog';
import { meetingPointLinks } from '@/lib/meeting-point';

type Props = { experience: Pick<Experience, 'title' | 'meetingPoint' | 'destination' | 'country'>; compact?: boolean };

export function MeetingPoint({ experience, compact = false }: Props) {
  const links = meetingPointLinks(experience);
  const [notice, setNotice] = useState('');
  const [manualCopy, setManualCopy] = useState(false);
  const share = async () => {
    setNotice(''); setManualCopy(false);
    const title = `${experience.title} · ${links.pickup ? 'Pickup area' : 'Meeting point'}`;
    if (navigator.share) {
      try { await navigator.share({ title, text: links.address || links.query, url: links.google }); return; }
      catch (error) { if (error instanceof Error && error.name === 'AbortError') return; }
    }
    try { await navigator.clipboard.writeText(links.google); setNotice('Map link copied.'); }
    catch { setManualCopy(true); setNotice('Copy the map link below to share it.'); }
  };
  return <div className={`meeting-map-section${compact ? ' meeting-map-compact' : ''}`}>
    <div className="meeting-map-heading"><MapPin size={20} aria-hidden="true"/><h3>{links.pickup ? 'Pickup location' : 'Meeting point'}</h3></div>
    <p className="meeting-map-address">{links.address || 'Meeting location will be confirmed by the provider.'}</p>
    {links.pickup && <p className="meeting-map-note">The map shows the pickup area. Confirm your accommodation and exact pickup point with the provider before travelling.</p>}
    {!links.address && <p className="meeting-map-note">The map shows the destination area.</p>}
    {!compact && <div className="meeting-map-preview"><iframe key={links.embed} src={links.embed} title={`${links.pickup || !links.address ? 'Area map' : 'Meeting point map'}: ${links.query}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen/><span className="meeting-map-caption">{links.pickup || !links.address ? 'Pickup / destination area' : 'Map search · check the meeting instructions above'}</span></div>}
    <div className="meeting-map-actions" role="group" aria-label="Open or share meeting location">
      <a href={links.google} target="_blank" rel="noopener noreferrer">Google Maps <ExternalLink size={14} aria-hidden="true"/></a>
      <a href={links.apple} target="_blank" rel="noopener noreferrer">Apple Maps <ExternalLink size={14} aria-hidden="true"/></a>
      <button type="button" onClick={share}><Share2 size={15} aria-hidden="true"/>Share location</button>
    </div>
    <p className="meeting-map-note">{compact ? 'Open a map for location details.' : 'If the map doesn’t load, use the map buttons above.'}</p>
    {notice && <p className="meeting-map-note" role="status">{notice}</p>}
    {manualCopy && <label className="meeting-map-copy">Map link<input readOnly value={links.google} onFocus={event => event.currentTarget.select()}/></label>}
  </div>;
}
