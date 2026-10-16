'use client';
import { DatePicker } from './DatePicker';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, Compass, Heart, MapPin, SlidersHorizontal, Sparkles, Star, Utensils, Waves, Trees, Landmark, List, Map as MapIcon, Share2 } from 'lucide-react';
import { categories, destinations, experiences, getExperience, type Experience } from '@/lib/catalog';
import { communityItems, communityMatches, type DiscoveryType } from '@/lib/discovery-community';
import { addDays, filteredExperiences, formatDate, liveIds, money, nextAvailable, today } from '@/lib/customer';
import { useCustomer } from './CustomerProvider';
import { Back, Empty, ExperienceCard, Gate, PageHeading, Photo, SearchBar, Sheet } from './UI';
import CommunityTiles, { DiscoveryTypeSelect } from './CommunityTiles';
const ProviderMap = dynamic(() => import('./ProviderMap'), { ssr: false, loading: () => <div className="map-loading" role="status">Opening the service map…</div> });
const categoryIcons = [Landmark, Utensils, Compass, Sparkles, Trees, Waves];
export function HomePage() {
  const { user } = useCustomer();
  return <><section className="home-hero"><Photo className="hero-image" src={experiences[1].image} alt="Sigiriya and the green landscape of Sri Lanka" sizes="100vw" priority/><div className="hero-shade"/><div className="hero-inner"><p className="hero-location"><MapPin size={14}/>Sri Lanka, and a world beyond</p><h1>Go somewhere<br/><span>good.</span></h1><p>Local experiences. Stories worth bringing home.</p><SearchBar/></div></section><div className="page-width"><nav className="category-rail" aria-label="Experience categories">{categories.slice(0, 6).map((category, index) => { const Icon = categoryIcons[index]; return <Link key={category} href={`/search?category=${encodeURIComponent(category)}`}><Icon size={22}/><span>{category === 'Tours & sightseeing' ? 'Tours' : category === 'Tickets & passes' ? 'Attractions' : category}</span></Link>; })}</nav><section className="home-section"><div className="section-heading"><div><p className="eyebrow">A little curiosity goes a long way</p><h2>{user ? `Your next discovery, ${user.name.split(' ')[0]}.` : 'Find your next story.'}</h2></div><Link href="/nearby" className="text-link">See all <ArrowRight size={17}/></Link></div><div className="experience-grid">{experiences.slice(0, 4).map(experience => <ExperienceCard key={experience.id} experience={experience}/>)}</div></section><section className="live-feature"><div><h2>A little time.<br/>A great discovery.</h2><p>Book a local experience today or plan for the next available time.</p><Link href="/nearby?live=1" className="button button-primary">Explore nearby <ArrowRight size={18}/></Link></div><div className="live-mini-card"><Photo src={experiences[0].image} alt="Street food experience"/><div><p className="eyebrow">Colombo · Food & drink</p><h3>Street food with a local host</h3><p>{experiences[0].duration} · From {money(experiences[0].price)} / person</p><Link href="/experience/colombo-food?live=1" className="text-link">Find a time <ChevronRight size={17}/></Link></div></div></section><section className="home-section"><div className="section-heading"><div><p className="eyebrow">Start with a place</p><h2>Where will curiosity take you?</h2></div><Link href="/destinations" className="text-link">All destinations <ArrowRight size={17}/></Link></div><DestinationRail/></section></div></>;
}
function DestinationRail() {
  const rail = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const drag = useRef<{ pointerId: number; startX: number; startScrollLeft: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const dragFrame = useRef<number | null>(null);
  const dragPosition = useRef(0);
  useEffect(() => {
    const element = rail.current;
    if (!element) return;
    const update = () => {
      const start = element.scrollLeft <= 1;
      const end = element.scrollLeft + element.clientWidth >= element.scrollWidth - 12;
      setEdges(previous => previous.start === start && previous.end === end ? previous : { start, end });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    element.addEventListener('scroll', update, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', update);
      if (dragFrame.current !== null) cancelAnimationFrame(dragFrame.current);
    };
  }, []);
  const move = (direction: number) => rail.current?.scrollBy({ left: direction * rail.current.clientWidth * .8, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  const startDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    suppressClick.current = false;
    // Touch uses the browser's native swipe and momentum scrolling.
    if (event.pointerType === 'touch' || event.button !== 0 || !event.isPrimary) return;
    drag.current = { pointerId: event.pointerId, startX: event.clientX, startScrollLeft: event.currentTarget.scrollLeft, moved: false };
  };
  const dragRail = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== event.pointerId) return;
    if (event.buttons === 0) { endDrag(event); return; }
    const delta = event.clientX - state.startX;
    if (!state.moved && Math.abs(delta) > 5) {
      state.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.classList.add('is-dragging');
    }
    if (!state.moved) return;
    event.preventDefault();
    dragPosition.current = state.startScrollLeft - delta;
    if (dragFrame.current === null) {
      dragFrame.current = requestAnimationFrame(() => {
        if (rail.current) rail.current.scrollLeft = dragPosition.current;
        dragFrame.current = null;
      });
    }
  };
  const endDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    suppressClick.current = drag.current.moved;
    if (dragFrame.current !== null) {
      cancelAnimationFrame(dragFrame.current);
      dragFrame.current = null;
      event.currentTarget.scrollLeft = dragPosition.current;
    }
    event.currentTarget.classList.remove('is-dragging');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    drag.current = null;
  };
  const stopDraggedClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!suppressClick.current) return;
    event.preventDefault();
    event.stopPropagation();
    suppressClick.current = false;
  };
  return <div className="destination-rail-wrap"><div ref={rail} className="destination-rail" role="region" aria-label="Browse destinations" tabIndex={0} onPointerDown={startDrag} onPointerMove={dragRail} onPointerUp={endDrag} onPointerCancel={endDrag} onClickCapture={stopDraggedClick} onDragStart={event => event.preventDefault()}>{destinations.map(destination => <Link key={destination.name} className="destination-card" href={`/search?q=${encodeURIComponent(destination.name === 'Amalfi Coast' ? 'Amalfi' : destination.name)}`}><Photo src={destination.image} alt={destination.name}/><div><h3>{destination.name}</h3><span>{destination.country}<ArrowRight size={18}/></span></div></Link>)}</div><div className="destination-rail-controls"><button className="icon-button" onClick={() => move(-1)} disabled={edges.start} aria-label="Previous destinations"><ArrowLeft size={20}/></button><button className="icon-button" onClick={() => move(1)} disabled={edges.end} aria-label="Next destinations"><ArrowRight size={20}/></button></div></div>;
}

export function SearchPage() {
  const params = useSearchParams(); const query = params.get('q') ?? '';
  const { data } = useCustomer(); const [shareStatus, setShareStatus] = useState('');
  const [view, setView] = useState<'list' | 'map'>('list');
  const [selected, setSelected] = useState('');
  const [discoveryType, setDiscoveryType] = useState<DiscoveryType>('experiences');
  const [buddyMinAge, setBuddyMinAge] = useState(18); const [buddyMaxAge, setBuddyMaxAge] = useState(65);
  const [buddyGender, setBuddyGender] = useState(''); const [buddyInterest, setBuddyInterest] = useState(''); const [buddyPace, setBuddyPace] = useState('');
  const [guideArea, setGuideArea] = useState(''); const [guideFocus, setGuideFocus] = useState(''); const [guideLanguage, setGuideLanguage] = useState(''); const [guideStyle, setGuideStyle] = useState('');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [date, setDate] = useState(params.get('date') ?? '');
  const [minPrice, setMinPrice] = useState(0); const [price, setPrice] = useState(500); const [duration, setDuration] = useState(''); const [cancellation, setCancellation] = useState(false); const [live, setLive] = useState(params.get('live') === '1'); const [sort, setSort] = useState('recommended'); const [filtersOpen, setFiltersOpen] = useState(false);
  const [serverPackages, setServerPackages] = useState<Experience[] | null>(null);
  const [packageSearchUnavailable, setPackageSearchUnavailable] = useState(false);
  useEffect(() => { setCategory(params.get('category') ?? ''); setDate(params.get('date') ?? ''); setLive(params.get('live') === '1'); }, [params]);
  useEffect(() => {
    const search = new URLSearchParams({ page: '1', pageSize: '50', sort });
    if (query) search.set('q', query);
    if (date) search.set('date', date);
    if (live) search.set('live', 'true');
    if (category) search.set('category', category);
    if (minPrice > 0) search.set('minPrice', String(minPrice));
    if (price < 500) search.set('maxPrice', String(price));
    if (duration) search.set('duration', duration);
    if (cancellation) search.set('freeCancellation', 'true');
    const controller = new AbortController();
    void fetch(`/api/packages?${search}`, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Package search unavailable.');
      const payload = await response.json() as { packages?: Experience[] };
      if (!Array.isArray(payload.packages)) throw new Error('Invalid package search response.');
      setServerPackages(payload.packages);
      setPackageSearchUnavailable(false);
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setServerPackages(null);
      setPackageSearchUnavailable(true);
    });
    return () => controller.abort();
  }, [query, category, minPrice, price, duration, cancellation, sort, date, live]);
  const results = useMemo(() => {
    if (!serverPackages) return filteredExperiences({ query, category, minPrice, maxPrice: price, duration, cancellation, live, date, sort }, data.bookings);
    return serverPackages;
  }, [serverPackages, query, category, minPrice, price, duration, cancellation, live, date, sort, data.bookings]);
  const communityResults = useMemo(() => communityItems.filter(item => item.type === discoveryType && communityMatches(item, query) && (item.type !== 'buddies' || ((item.age ?? 0) >= buddyMinAge && (item.age ?? 0) <= buddyMaxAge && (!buddyGender || item.gender === buddyGender) && (!buddyInterest || item.interests?.includes(buddyInterest)) && (!buddyPace || item.pace === buddyPace))) && (item.type !== 'guides' || ((!guideArea || item.destination === guideArea) && (!guideFocus || item.guideFocus === guideFocus) && (!guideLanguage || item.languages?.includes(guideLanguage)) && (!guideStyle || item.guideStyle === guideStyle)))), [discoveryType, query, buddyMinAge, buddyMaxAge, buddyGender, buddyInterest, buddyPace, guideArea, guideFocus, guideLanguage, guideStyle]);
  const discoveryCount = discoveryType === 'experiences' ? results.length : communityResults.length;

  const filterCount = [Boolean(category), Boolean(date), minPrice > 0 || price < 500, Boolean(duration), cancellation, live].filter(Boolean).length;
  const buddyFilterCount = [buddyMinAge > 18 || buddyMaxAge < 65, Boolean(buddyGender), Boolean(buddyInterest), Boolean(buddyPace)].filter(Boolean).length;
  const guideFilterCount = [Boolean(guideArea), Boolean(guideFocus), Boolean(guideLanguage), Boolean(guideStyle)].filter(Boolean).length;
  const activeFilterCount = discoveryType === 'guides' ? guideFilterCount : discoveryType === 'buddies' ? buddyFilterCount : filterCount;
  const reset = () => { setCategory(''); setDate(''); setMinPrice(0); setPrice(500); setDuration(''); setCancellation(false); setLive(false); };
  const resetBuddyFilters = () => { setBuddyMinAge(18); setBuddyMaxAge(65); setBuddyGender(''); setBuddyInterest(''); setBuddyPace(''); };
  const resetGuideFilters = () => { setGuideArea(''); setGuideFocus(''); setGuideLanguage(''); setGuideStyle(''); };
  const resetActiveFilters = discoveryType === 'guides' ? resetGuideFilters : discoveryType === 'buddies' ? resetBuddyFilters : reset;
  const filters = <div className="explore-filters"><div className="filter-title"><h2>Filters</h2><button className="text-link" onClick={reset} type="button">Reset</button></div><label className="field">Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label><label className="field">Date<DatePicker min={today()} max={addDays(today(), 180)} value={date} onChange={setDate}/></label><fieldset className="price-range-field"><legend>Price per person</legend><div className="price-range-slider"><div className="price-range-track"><span style={{ left: `${minPrice / 5}%`, right: `${100 - price / 5}%` }}/></div><input type="range" aria-label="Minimum price per person" aria-valuetext={money(minPrice)} min="0" max="500" step="5" value={minPrice} style={{ zIndex: minPrice > 250 ? 3 : 2 }} onChange={event => setMinPrice(Math.min(Number(event.target.value), price))}/><input type="range" aria-label="Maximum price per person" aria-valuetext={money(price)} min="0" max="500" step="5" value={price} onChange={event => setPrice(Math.max(Number(event.target.value), minPrice))}/></div><div className="price-range-values"><label>Minimum ($)<input type="number" min="0" max={price} step="5" value={minPrice} onChange={event => setMinPrice(Math.max(0, Math.min(Number(event.target.value), price)))}/></label><label>Maximum ($)<input type="number" min={minPrice} max="500" step="5" value={price} onChange={event => setPrice(Math.min(500, Math.max(Number(event.target.value), minPrice)))}/></label></div></fieldset><label className="field">Duration<select value={duration} onChange={event => setDuration(event.target.value)}><option value="">Any duration</option><option value="short">Up to 4 hours</option><option value="long">More than 4 hours</option></select></label><label className="check-field"><input type="checkbox" checked={cancellation} onChange={event => setCancellation(event.target.checked)}/><span>Free cancellation</span></label></div>;
  const buddyFilters = <div className="explore-filters buddy-filters"><div className="filter-title"><h2>Find a travel buddy</h2><button className="text-link" onClick={resetBuddyFilters} type="button">Reset</button></div><fieldset className="buddy-age-field"><legend>Age range</legend><div className="buddy-age-inputs"><label>From<select value={buddyMinAge} onChange={event => setBuddyMinAge(Math.min(Number(event.target.value), buddyMaxAge))}>{Array.from({ length: 48 }, (_, index) => index + 18).map(age => <option key={age} value={age}>{age}</option>)}</select></label><label>To<select value={buddyMaxAge} onChange={event => setBuddyMaxAge(Math.max(Number(event.target.value), buddyMinAge))}>{Array.from({ length: 48 }, (_, index) => index + 18).map(age => <option key={age} value={age}>{age}</option>)}</select></label></div></fieldset><label className="field">Gender<select value={buddyGender} onChange={event => setBuddyGender(event.target.value)}><option value="">Any gender</option><option>Woman</option><option>Man</option><option>Non-binary</option></select></label><label className="field">Interests<select value={buddyInterest} onChange={event => setBuddyInterest(event.target.value)}><option value="">Any interest</option>{['Culture', 'Food', 'Hiking', 'Photography', 'Walking', 'Wildlife'].map(interest => <option key={interest}>{interest}</option>)}</select></label><label className="field">Travel pace<select value={buddyPace} onChange={event => setBuddyPace(event.target.value)}><option value="">Any pace</option><option>Relaxed</option><option>Active</option></select></label></div>;
  const guideFilters = <div className="explore-filters guide-filters"><div className="filter-title"><h2>Find a local guide</h2><button className="text-link" onClick={resetGuideFilters} type="button">Reset</button></div><label className="field">Area<select value={guideArea} onChange={event => setGuideArea(event.target.value)}><option value="">Any area</option>{['Colombo', 'Sigiriya', 'Yala'].map(area => <option key={area}>{area}</option>)}</select></label><label className="field">Specialty<select value={guideFocus} onChange={event => setGuideFocus(event.target.value)}><option value="">Any specialty</option>{['Food & culture', 'History & heritage', 'Wildlife & nature'].map(focus => <option key={focus}>{focus}</option>)}</select></label><label className="field">Language<select value={guideLanguage} onChange={event => setGuideLanguage(event.target.value)}><option value="">Any language</option>{['English', 'Sinhala', 'Tamil'].map(language => <option key={language}>{language}</option>)}</select></label><label className="field">Tour style<select value={guideStyle} onChange={event => setGuideStyle(event.target.value)}><option value="">Any style</option><option>Easygoing</option><option>Active</option></select></label></div>;
  const visibleFilters = discoveryType === 'experiences' ? filters : discoveryType === 'buddies' ? buddyFilters : guideFilters;
  return <div className="page-width discovery-page"><Back/><PageHeading eyebrow="Follow your curiosity" title={query ? `Discover ${query}` : 'Find your next story.'} text="A good experience starts with a clear choice."/><SearchBar initial={query} compact/>{packageSearchUnavailable && <p className="inline-note" role="status">Showing sample experiences because package search is not connected to a database yet.</p>}{query && <button className="text-link discovery-share" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/nearby?q=${encodeURIComponent(query)}`); setShareStatus("Destination discovery link copied."); } catch { setShareStatus("Link could not be copied. You can share the page address."); } }}><Share2 size={17}/>Share this destination</button>}{shareStatus && <p role="status" className="inline-note">{shareStatus}</p>}<div className="results-toolbar"><div className="explore-view-controls"><button type="button" className="explore-live-toggle" role="switch" aria-checked={live} disabled={discoveryType !== 'experiences'} onClick={() => setLive(value => !value)}><span className="live-switch-track" aria-hidden="true"><span/></span>Live availability</button><div className="segmented explore-view-switch" role="group" aria-label="Discovery view"><button type="button" className={view === 'list' ? 'active' : ''} aria-pressed={view === 'list'} onClick={() => setView('list')}><List size={17} aria-hidden="true"/>List</button><button type="button" className={view === 'map' ? 'active' : ''} aria-pressed={view === 'map'} onClick={() => setView('map')}><MapIcon size={17} aria-hidden="true"/>Map</button></div></div><span className="results-count" role="status" aria-live="polite"><strong>{discoveryCount}</strong> {discoveryCount === 1 ? { experiences: 'experience', guides: 'guide', buddies: 'buddy' }[discoveryType] : discoveryType}</span><button className="button button-secondary mobile-filter" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={17}/>Filters{activeFilterCount > 0 && <span className="count-badge">{activeFilterCount}</span>}</button><label className="sort-field"><span>Sort by</span><select value={sort} disabled={discoveryType !== 'experiences'} onChange={event => setSort(event.target.value)}><option value="recommended">Recommended</option><option value="price-low">Price: low to high</option><option value="rating">Highest rated</option></select></label></div><div className={`discovery-layout ${view === 'map' ? 'map-discovery' : ''}`}><aside className="filter-panel">{visibleFilters}</aside><div>{activeFilterCount > 0 && view !== 'map' && <div className="active-filters"><span>{activeFilterCount} {activeFilterCount === 1 ? 'filter' : 'filters'} applied</span><button className="text-link" onClick={resetActiveFilters}>Clear filters</button></div>}{view === 'map' ? <div className="explore-map-layout"><ProviderMap experiences={results} community={communityResults} type={discoveryType} onTypeChange={value => { setDiscoveryType(value); setSelected(''); }} selected={selected} onSelect={setSelected} showResults live={live} sort={sort}/></div> : discoveryCount ? <><DiscoveryTypeSelect value={discoveryType} onChange={value => { setDiscoveryType(value); setSelected(''); }} className="discovery-list-selector"/>{discoveryType === 'experiences' ? <div className="search-grid">{results.map(experience => <ExperienceCard key={experience.id} experience={experience} live={live}/>)}</div> : <CommunityTiles items={communityResults} selected={selected} onSelect={setSelected} list/>}</> : <><DiscoveryTypeSelect value={discoveryType} onChange={value => { setDiscoveryType(value); setSelected(''); }} className="discovery-list-selector"/><Empty title="No matches yet." text={discoveryType === 'experiences' ? "Try another place or clear a filter to see more experiences." : "Try another place or clear a filter to see more profiles."}/></>}</div></div><Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">{visibleFilters}<button className="button button-primary button-wide" onClick={() => setFiltersOpen(false)}>Show {discoveryCount} {discoveryCount === 1 ? { experiences: "experience", guides: "guide", buddies: "buddy" }[discoveryType] : discoveryType} <ArrowRight size={18}/></button></Sheet></div>;
}
export function DestinationsPage() { return <div className="page-width standard-page"><Back/><PageHeading eyebrow="Start somewhere wonderful" title="A world worth exploring." text="Choose a place and discover what makes it special."/><div className="destination-grid destination-page-grid">{destinations.map(destination => <Link key={destination.name} className="destination-card" href={`/search?q=${encodeURIComponent(destination.name === 'Amalfi Coast' ? 'Amalfi' : destination.name)}`}><Photo src={destination.image} alt={destination.name}/><div><h3>{destination.name}</h3><span>{destination.country}<ArrowRight size={20}/></span></div></Link>)}</div></div>; }
export function SavedPage() { return <Gate><SavedContent/></Gate>; }
function SavedContent() { const { data, user } = useCustomer(); const saved = experiences.filter(e => (data.saved[user!.id] ?? []).includes(e.id)); return <div className="page-width standard-page"><PageHeading eyebrow="Keep a little curiosity" title="Saved for a someday." text="All the experiences that caught your eye, together."/>{saved.length ? <div className="experience-grid">{saved.map(experience => <ExperienceCard key={experience.id} experience={experience}/>)}</div> : <Empty icon={<Heart size={34}/>} title="Something will catch your eye." text="Tap the heart on an experience to keep it here." href="/search"/>}</div>; }
export function LiveNowPage() {
  const { data } = useCustomer(); const [view, setView] = useState<'list' | 'map'>('list'); const [category, setCategory] = useState(''); const [selected, setSelected] = useState(liveIds[0]); const [shareNotice, setShareNotice] = useState('');
  const liveExperiences = useMemo(() => experiences.filter(e => liveIds.includes(e.id) && (!category || e.category === category)), [category]);
  const selectedExperience = liveExperiences.find(e => e.id === selected) ?? liveExperiences[0];
  const share = async () => { try { await navigator.clipboard.writeText(window.location.href); setShareNotice('Discovery link copied.'); } catch { setShareNotice(`Share this link: ${window.location.href}`); } };
  return <div className="page-width standard-page"><PageHeading eyebrow="Leave room for the unexpected" title="What’s happening around you?" text="Local experiences in Sri Lanka. Find the next available time." action={<button className="icon-button" aria-label="Copy Explore page link" onClick={share}><Share2 size={20}/></button>}/>{shareNotice && <p className="inline-note" role="status">{shareNotice}</p>}<div className="live-toolbar"><label className="field"><span className="sr-only">Service category</span><select value={category} onChange={event => setCategory(event.target.value)}><option value="">All services</option>{Array.from(new Set(experiences.filter(e => liveIds.includes(e.id)).map(e => e.category))).map(value => <option key={value}>{value}</option>)}</select></label><div className="segmented" aria-label="Discovery view"><button onClick={() => setView('list')} className={view === 'list' ? 'active' : ''} aria-pressed={view === 'list'}><List size={17}/>List</button><button onClick={() => setView('map')} className={view === 'map' ? 'active' : ''} aria-pressed={view === 'map'}><MapIcon size={17}/>Map</button></div></div>{view === 'map' && <div className="live-map-layout"><ProviderMap experiences={liveExperiences} selected={selectedExperience?.id} onSelect={setSelected}/>{selectedExperience && <LiveCard id={selectedExperience.id} bookings={data.bookings}/>}</div>}{view === 'list' && <div className="live-list">{liveExperiences.map(experience => <LiveCard key={experience.id} id={experience.id} bookings={data.bookings}/>)}</div>}</div>;
}
function LiveCard({ id, bookings }: { id: string; bookings: import('@/lib/customer').Booking[] }) { const experience = getExperience(id)!; const slot = nextAvailable(id, 0, 1, bookings); return <article className="live-service-card"><Link className="live-service-photo" href={`/experience/${id}?live=1`}><Photo src={experience.image} alt={experience.title}/></Link><div className="live-service-content"><p className="card-location"><MapPin size={13}/>{experience.destination}</p><h2><Link href={`/experience/${id}?live=1`}>{experience.title}</Link></h2><p className="service-provider">By {experience.supplier}</p><div className="live-slot"><CalendarDays size={17}/><span>{slot ? `Next slot: ${slot.date === today() ? 'Today' : formatDate(slot.date, true)}, ${slot.time}` : 'No upcoming times'}</span></div><div className="live-service-bottom"><span>From <strong>{money(experience.price)}</strong></span>{slot ? <Link href={`/experience/${id}?live=1`} className="button button-primary">Choose this time <ArrowRight size={17}/></Link> : <Link href={`/experience/${id}`} className="text-link">View experience</Link>}</div></div></article>; }
