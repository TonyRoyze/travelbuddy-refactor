'use client';
import { DatePicker } from './DatePicker';
import { HomeSearch } from './HomeSearch';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight, Compass, Heart, MapPin, SlidersHorizontal, Sparkles, Star, Search, Utensils, Trees, Landmark, List, Map as MapIcon, Share2 } from 'lucide-react';
import { categories, destinations, experiences, getExperience, type Experience } from '@/lib/catalog';
import { communityItems, communityMatches, type DiscoveryType } from '@/lib/discovery-community';
import { addDays, filteredExperiences, formatDate, liveIds, locationFor, money, nextAvailable, today } from '@/lib/customer';
import { useCustomer } from './CustomerProvider';
import { Back, Empty, ExperienceCard, Gate, PageHeading, Photo, Sheet } from './UI';
import CommunityTiles, { DiscoveryTypeSelect } from './CommunityTiles';
const ProviderMap = dynamic(() => import('./ProviderMap'), { ssr: false, loading: () => <div className="map-loading" role="status">Opening the service map…</div> });
const categoryIcons = [Landmark, Utensils, Compass, Sparkles, Trees, Landmark];
const heroExperiences = [
  { id: 'water', title: 'Water experiences', detail: 'Discover adventures by the water', href: '/search?q=water', x: .28, y: .84 },
  { id: 'hiking', title: 'Mountain hiking', detail: 'Find trails with unforgettable views', href: '/search?q=hiking', x: .56, y: .41 },
  { id: 'culture', title: 'Cultural experiences', detail: 'Explore sacred places and local traditions', href: '/search?category=Cultural%20experiences', x: .55, y: .61 },
  { id: 'sigiriya', title: 'Sigiriya Rock Fortress', detail: 'Discover an iconic Sri Lankan landmark', href: '/search?q=Sigiriya', x: .82, y: .40 },
  { id: 'tea', title: 'Tea experiences', detail: 'Explore the island’s tea country', href: '/search?q=tea', x: .88, y: .59 },
  { id: 'tuktuk', title: 'Tuk-tuk rides', detail: 'See the island on three wheels', href: '/search?q=tuk-tuk', x: .79, y: .75 },
];
export function HomePage() {
  const { user } = useCustomer();
  const [openExperience, setOpenExperience] = useState<string | null>(null);
  return <><section className="home-hero"><div className="illustrated-hero-art" aria-hidden="true"><div className="illustrated-hero-night"/></div><div className="hero-shade"/>{heroExperiences.map(item => <div key={item.id} className={`hero-landmark hero-landmark-${item.id}`} style={{ left: `calc(50% + ${item.x - .5} * max(100cqw, 200cqh))`, top: `calc(50% + ${item.y - .5} * max(50cqw, 100cqh))` }}><button type="button" className="hero-landmark-dot" aria-label={`Discover ${item.title}`} aria-expanded={openExperience === item.id} onClick={() => setOpenExperience(current => current === item.id ? null : item.id)}><span/></button>{openExperience === item.id && <div className="hero-landmark-card"><strong>{item.title}</strong><span>{item.detail}</span><Link href={item.href}>Explore experiences <ArrowRight size={14}/></Link></div>}</div>)}<div className="hero-inner"><h1>Find your next<br/><span>great story.</span></h1><p className="hero-description">Discover unforgettable experiences, wherever you go.</p><div className="home-search"><HomeSearch dateModal/></div><nav className="hero-experience-links" aria-label="Explore the illustration">{heroExperiences.map(item => <Link key={item.id} href={item.href}>{item.title}</Link>)}</nav></div></section><div className="page-width"><nav className="category-rail" aria-label="Experience categories">{categories.slice(0, 6).map((category, index) => { const Icon = categoryIcons[index]; return <Link key={category} prefetch={false} href={`/search?category=${encodeURIComponent(category)}`}><Icon size={22}/><span>{category === 'Tours & sightseeing' ? 'Tours' : category === 'Tickets & passes' ? 'Attractions' : category}</span></Link>; })}</nav><section className="home-section home-stories"><div className="section-heading"><div><p className="eyebrow">A little curiosity goes a long way</p><h2>{user ? `Your next discovery, ${user.name.split(' ')[0]}.` : 'Find your next story.'}</h2></div><Link href="/nearby" className="text-link">See all <ArrowRight size={17}/></Link></div><div className="experience-grid">{experiences.slice(0, 12).map(experience => <ExperienceCard key={experience.id} experience={experience}/>)}</div></section><section className="home-section"><div className="section-heading"><div><p className="eyebrow">Start with a place</p><h2>Where will curiosity take you?</h2></div><Link href="/destinations" className="text-link">All destinations <ArrowRight size={17}/></Link></div><DestinationRail/></section></div></>;
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
  return <div className="destination-rail-wrap"><div ref={rail} className="destination-rail" role="region" aria-label="Browse destinations" tabIndex={0} onPointerDown={startDrag} onPointerMove={dragRail} onPointerUp={endDrag} onPointerCancel={endDrag} onClickCapture={stopDraggedClick} onDragStart={event => event.preventDefault()}>{destinations.map(destination => <Link key={destination.name} className="destination-card" prefetch={false} href={`/search?q=${encodeURIComponent(destination.name === 'Amalfi Coast' ? 'Amalfi' : destination.name)}`}><Photo src={destination.image} alt={destination.name}/><div><h3>{destination.name}</h3><span>{destination.country}<ArrowRight size={18}/></span></div></Link>)}</div><div className="destination-rail-controls"><button className="icon-button" onClick={() => move(-1)} disabled={edges.start} aria-label="Previous destinations"><ArrowLeft size={20}/></button><button className="icon-button" onClick={() => move(1)} disabled={edges.end} aria-label="Next destinations"><ArrowRight size={20}/></button></div></div>;
}

export function SearchPage() {
  const params = useSearchParams();
  const hasSearch = Array.from(params.entries()).some(([key, value]) => Boolean(value) && !(key === 'adults' && value === '1'));
  return hasSearch ? <SearchResultsPage/> : <ExploreLanding/>;
}

function ExploreLanding() {
  const [compactSearch, setCompactSearch] = useState(false);
  const [expandedSearch, setExpandedSearch] = useState(false);
  const [header, setHeader] = useState<Element | null>(null);
  const [navigation, setNavigation] = useState<Element | null>(null);
  const searchBand = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setHeader(document.querySelector('.site-header .header-inner'));
    setNavigation(document.querySelector('.site-header .desktop-nav'));
    const update = () => { const compact = window.scrollY > 140; setCompactSearch(compact); if (!compact) setExpandedSearch(false); };
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  useEffect(() => {
    if (!expandedSearch) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!searchBand.current?.contains(target) && !(target instanceof Element && target.closest('.trip-floating-panel, .home-destination-popup, .explore-compact-search'))) setExpandedSearch(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpandedSearch(false); };
    document.addEventListener('pointerdown', close); document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape); };
  }, [expandedSearch]);
  const openSearch = (field: 'where' | 'dates' | 'guests') => {
    setExpandedSearch(true);
    requestAnimationFrame(() => {
      const target = field === 'where' ? searchBand.current?.querySelector<HTMLInputElement>('.trip-where input') : searchBand.current?.querySelectorAll<HTMLButtonElement>('button.trip-search-field')[field === 'dates' ? 0 : 1];
      if (field === 'where') target?.focus(); else target?.click();
    });
  };
  const categoryCards = [
    { label: 'Cultural experiences', category: 'Cultural experiences', image: experiences[4].image },
    { label: 'Outdoor activities', category: 'Outdoor activities', image: experiences[1].image },
    { label: 'Food & drink', category: 'Food & drink', image: experiences[0].image },
    { label: 'Tours & sightseeing', category: 'Tours & sightseeing', image: experiences[3].image },
    { label: 'Wildlife', category: 'Wildlife', image: experiences[2].image },
    { label: 'Day trips', category: 'Day trips', image: experiences[1].image },
    { label: 'Cruises & sailing', category: 'Cruises & sailing', image: experiences[5].image },
    { label: 'Air tours', category: 'Air tours', image: experiences[6].image },
  ];
  return <div className="explore-landing">
    <div ref={searchBand} className={`explore-search-band ${expandedSearch && compactSearch ? 'is-floating' : ''}`}><div className="explore-search-inner"><HomeSearch/></div></div>
    {[navigation, header].map((target, index) => target && createPortal(<div className={`explore-compact-search ${index === 0 ? 'explore-compact-desktop' : 'explore-compact-mobile'} ${compactSearch && !expandedSearch ? 'is-expanded' : ''} ${compactSearch && expandedSearch ? 'search-open' : ''}`} role="group" aria-label="Explore search" aria-hidden={!compactSearch || expandedSearch}><button type="button" tabIndex={compactSearch && !expandedSearch ? 0 : -1} onClick={() => openSearch('where')}>Anywhere</button><button type="button" tabIndex={compactSearch && !expandedSearch ? 0 : -1} onClick={() => openSearch('dates')}>Anytime</button><button type="button" tabIndex={compactSearch && !expandedSearch ? 0 : -1} onClick={() => openSearch('guests')}>Add guests</button><button type="button" tabIndex={compactSearch && !expandedSearch ? 0 : -1} className="explore-compact-icon" aria-label="Open search" onClick={() => openSearch('where')}><Search size={17}/></button></div>, target, String(index)))}
    <div className="page-width">
      <section className="home-section home-stories explore-categories" aria-labelledby="explore-categories-heading">
        <div className="section-heading"><h1 id="explore-categories-heading">Explore experiences nearby</h1><Link href="/search?browse=all" className="text-link">See all <ArrowRight size={17}/></Link></div>
        <div className="experience-grid">{categoryCards.map(item => <Link className="experience-card explore-category-card" href={`/search?category=${encodeURIComponent(item.category)}`} key={item.label}><div className="card-photo"><Photo src={item.image} alt=""/></div><div className="card-copy"><h3>{item.label}</h3></div></Link>)}</div>
      </section>
    </div>
    <div className="page-width"><section className="home-section home-stories" aria-labelledby="explore-popular-heading">
      <div className="section-heading"><h2 id="explore-popular-heading">Discover experiences</h2><Link href="/search?browse=all" className="text-link">See all <ArrowRight size={17}/></Link></div>
      <div className="experience-grid">{experiences.slice(0, 12).map(experience => <ExperienceCard key={experience.id} experience={experience}/>)}</div>
    </section></div>
  </div>;
}

function SearchResultsPage() {
  const params = useSearchParams(); const query = params.get('q') ?? '';
  const { data } = useCustomer();
  const [view, setView] = useState<'list' | 'map'>('list');
  const [selected, setSelected] = useState('');
  const resultsList = useRef<HTMLElement>(null);
  const selectFromMap = (id: string) => {
    setSelected(id);
    const card = Array.from(resultsList.current?.querySelectorAll<HTMLElement>('[data-result-id]') ?? []).find(element => element.dataset.resultId === id);
    if (!card || card.getClientRects().length === 0) return;
    const rect = card.getBoundingClientRect();
    if (rect.top < 88 || rect.bottom > window.innerHeight) card.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest' });
  };
  const [discoveryType, setDiscoveryType] = useState<DiscoveryType>('experiences');
  const [buddyMinAge, setBuddyMinAge] = useState(18); const [buddyMaxAge, setBuddyMaxAge] = useState(65);
  const [buddyGender, setBuddyGender] = useState(''); const [buddyInterest, setBuddyInterest] = useState(''); const [buddyPace, setBuddyPace] = useState('');
  const [guideArea, setGuideArea] = useState(''); const [guideFocus, setGuideFocus] = useState(''); const [guideLanguage, setGuideLanguage] = useState(''); const [guideStyle, setGuideStyle] = useState('');
  const [category, setCategory] = useState(params.get('category') ?? '');
  const [date, setDate] = useState(params.get('date') ?? '');
  const [minPrice, setMinPrice] = useState(0); const [price, setPrice] = useState(500); const [duration, setDuration] = useState(''); const [cancellation, setCancellation] = useState(false); const [live, setLive] = useState(params.get('live') === '1'); const [sort, setSort] = useState('recommended'); const [filtersOpen, setFiltersOpen] = useState(false);
  const [serverPackages, setServerPackages] = useState<Experience[] | null>(null);
  useEffect(() => { setCategory(params.get('category') ?? ''); setDate(params.get('date') ?? ''); setLive(params.get('live') === '1'); }, [params]);
  useEffect(() => {
    const search = new URLSearchParams({ page: '1', pageSize: '50', sort });
    if (query) search.set('q', query);
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
    }).catch(error => {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setServerPackages(null);
    });
    return () => controller.abort();
  }, [query, category, minPrice, price, duration, cancellation, sort]);
  const results = useMemo(() => {
    if (!serverPackages) return filteredExperiences({ query, category, minPrice, maxPrice: price, duration, cancellation, live, date, sort }, data.bookings);
    if (!live && !date) return serverPackages;
    const availableIds = new Set(filteredExperiences({ live, date }, data.bookings).map(item => item.id));
    return serverPackages.filter(item => availableIds.has(item.id));
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
  return <div className="search-results-page">
    <div className="results-search"><HomeSearch fromUrl key={params.toString()}/></div>
    <div className="results-filter-bar" aria-label="Search filters">
      <button type="button" className="results-chip" onClick={() => setFiltersOpen(true)}><SlidersHorizontal size={16}/> Filters{activeFilterCount > 0 && ` (${activeFilterCount})`}</button>
      <DiscoveryTypeSelect className="results-type-select" value={discoveryType} onChange={value => { setDiscoveryType(value); setSelected(''); }}/>
      <label className="results-chip">Category <select aria-label="Category" value={category} onChange={event => setCategory(event.target.value)}><option value="">All</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="results-chip">Duration <select aria-label="Duration" value={duration} onChange={event => setDuration(event.target.value)}><option value="">Any</option><option value="short">Up to 4 hours</option><option value="long">More than 4 hours</option></select></label>
      <button type="button" className="results-chip" aria-pressed={cancellation} onClick={() => setCancellation(value => !value)}>Free cancellation</button>
      <button type="button" className="results-chip" aria-pressed={live} onClick={() => setLive(value => !value)}>Live availability</button>
      <label className="results-chip">Sort <select aria-label="Sort by" value={sort} onChange={event => setSort(event.target.value)}><option value="recommended">Recommended</option><option value="price-low">Price: low to high</option><option value="rating">Highest rated</option></select></label>
    </div>
    {(params.get('from') || params.get('to') || params.get('flexible')) && <p className="results-note">Dates and guest details are for planning; availability and guest suitability are confirmed when booking.</p>}
    {discoveryType === 'experiences' && results.some(item => !locationFor[item.id]) && <p className="results-note">Some experiences do not have map coordinates yet and appear only in the list.</p>}
    <div className="results-mobile-switch" role="group" aria-label="Results view"><button type="button" aria-pressed={view === 'list'} onClick={() => setView('list')}>List</button><button type="button" aria-pressed={view === 'map'} onClick={() => setView('map')}>Map</button></div>
    <div className={`results-split results-show-${view}`}>
      <section ref={resultsList} className="results-list" aria-label="Search results"><div className="results-list-heading"><h1>{discoveryCount} {discoveryCount === 1 ? { experiences: 'experience', guides: 'guide', buddies: 'buddy' }[discoveryType] : discoveryType}</h1></div>
        {discoveryCount ? discoveryType === 'experiences' ? <div className="search-grid">{results.map(experience => <div key={experience.id} data-result-id={experience.id} className={selected === experience.id ? 'result-highlighted' : ''} onMouseEnter={() => setSelected(experience.id)} onMouseLeave={() => setSelected('')} onFocus={() => setSelected(experience.id)}><ExperienceCard experience={experience} live={live}/></div>)}</div> : <CommunityTiles items={communityResults} selected={selected} onSelect={setSelected} list/> : <Empty title="No matches yet." text="Try another place or clear a filter to see more results."/>}
      </section>
      <aside className="results-map" aria-label="Map of search results"><ProviderMap experiences={results} community={communityResults} type={discoveryType} selected={selected} onSelect={selectFromMap} onMarkerHover={selectFromMap} live={live}/></aside>
    </div>
    <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filters">{visibleFilters}<button className="button button-primary button-wide" onClick={() => setFiltersOpen(false)}>Show {discoveryCount} results <ArrowRight size={18}/></button></Sheet>
  </div>;
}
export function DestinationsPage() { return <div className="page-width standard-page"><Back/><PageHeading eyebrow="Start somewhere wonderful" title="A world worth exploring." text="Choose a place and discover what makes it special."/><div className="destination-grid destination-page-grid">{destinations.map(destination => <Link key={destination.name} className="destination-card" prefetch={false} href={`/search?q=${encodeURIComponent(destination.name === 'Amalfi Coast' ? 'Amalfi' : destination.name)}`}><Photo src={destination.image} alt={destination.name}/><div><h3>{destination.name}</h3><span>{destination.country}<ArrowRight size={20}/></span></div></Link>)}</div></div>; }
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
