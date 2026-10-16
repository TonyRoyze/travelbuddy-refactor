import Link from 'next/link';
import { LiveBookingPanel } from './LiveBookingPanel';
import { Check, Clock, MapPin, MessageCircle, Users } from 'lucide-react';
import type { Experience } from '@/lib/catalog';
import { mediaUrl } from '@/lib/package-editor';
import { money } from '@/lib/customer';
import { Back } from './UI';

export function VideoClips({ ids, title = 'A glimpse of the experience' }: { ids: string[]; title?: string }) {
  if (!ids.length) return null;
  return <section className="buddy-public-clips"><h2>{title}</h2><div className="public-video-grid">{ids.map((id, index) => <video key={id} src={mediaUrl(id)} controls playsInline preload="metadata" aria-label={`Video clip ${index + 1}`} />)}</div></section>;
}
export function BuddyListing({ experience, ownerId, videoIds }: { experience: Experience; ownerId: string; videoIds: string[] }) {
  return <div className="page-width standard-page buddy-listing-page"><Back href="/nearby" label="All experiences" />
    <div className="detail-heading"><p className="eyebrow">{experience.destination} · {experience.category}</p><h1>{experience.title}</h1><p>Hosted by <Link className="text-link" href={`/buddy/${ownerId}`}>{experience.supplier}</Link></p></div>
    <div className="buddy-listing-gallery">{experience.gallery.map((url, index) => <img key={url} src={url} alt={`${experience.title}, photo ${index + 1}`} />)}</div>
    <VideoClips ids={videoIds} />
    <div className="detail-layout"><div className="detail-content"><div className="experience-facts"><span><Clock size={20} />{experience.duration}</span><span><Users size={20} />Up to {Math.max(...experience.options.map(option => option.capacity ?? 12))} travellers</span><span><MessageCircle size={20} />{experience.languages.join(', ')}</span></div>
      <section className="detail-section"><h2>A little more about the experience.</h2><p className="preserve-lines">{experience.description}</p><ul className="highlight-list">{experience.highlights.filter(Boolean).map((value, index) => <li key={index}><Check size={18} />{value}</li>)}</ul></section>
      <section className="detail-section inclusions"><div><h2>What’s included</h2><ul>{experience.included.filter(Boolean).map((value, index) => <li key={index}><Check size={16} />{value}</li>)}</ul></div><div><h2>Not included</h2><ul>{experience.notIncluded.filter(Boolean).map((value, index) => <li key={index}>{value}</li>)}</ul></div></section>
      <section className="detail-section"><h2>Know before you go.</h2><h3>Meeting point</h3><p className="meeting-point"><MapPin size={18} />{experience.meetingPoint}</p><h3>Cancellation</h3><p>{experience.freeCancellation ? 'Free cancellation until 24 hours before the start.' : 'This experience is non-refundable after confirmation.'}</p><p>{experience.pickup ? 'Pickup is included. Confirm the details with your buddy.' : 'Meet your buddy at the meeting point.'}</p></section>
      {experience.itinerary.length > 0 && <section className="detail-section"><h2>Your itinerary</h2><ol className="experience-itinerary">{experience.itinerary.map((stop, index) => <li key={index}><span>{stop.time}</span><div><h3>{stop.title}</h3><p>{stop.detail}</p></div></li>)}</ol></section>}
    </div><aside className="booking-panel buddy-listing-enquiry"><LiveBookingPanel experience={experience} /><Link className="text-link" href={`/buddy/${ownerId}`}>Meet {experience.supplier}</Link></aside></div>
  </div>;
}
