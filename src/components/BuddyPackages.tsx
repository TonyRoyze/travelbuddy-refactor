'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowRight, Check, Clock, Eye, Film, MapPin, Plus, Save, X } from 'lucide-react';
import { categories } from '@/lib/catalog';
import { emptyPackage, mediaUrl, packageEditorSchema, type EditorPackage, type PackageEditorData } from '@/lib/package-editor';
import { money } from '@/lib/customer';
import { Back, Gate, PageHeading } from './UI';
import { useServerAuth } from './ServerAuthProvider';
import { defaultSchedule } from '@/lib/availability';
import { ScheduleEditor } from './ScheduleEditor';
import { MediaPicker } from './MediaPicker';

function BuddyGate({ children }: { children: ReactNode }) {
  const { account } = useServerAuth();
  return <Gate>{account?.roles.includes('provider') ? children : <div className="page-width standard-page"><Back href="/account" label="Your account" /><h1>Packages are for buddy accounts.</h1><p>Sign in with your buddy account to manage experiences.</p></div>}</Gate>;
}
export function BuddyPackagesPage() { return <BuddyGate><PackageList /></BuddyGate>; }
function PackageList() {
  const [packages, setPackages] = useState<EditorPackage[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void fetch('/api/buddy/packages', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error); setPackages(body.packages);
    }).catch(error => { if (error.name !== 'AbortError') setError(error.message || 'Your packages could not be loaded.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]);
  return <div className="page-width standard-page buddy-packages-page"><Back href="/account" label="Your account" />
    <div className="buddy-page-heading"><PageHeading title="Your local knowledge. Their next story." text="Build an experience, show a little of what makes it special, and invite travellers along." /><Link href="/account/packages/new" className="button button-primary"><Plus size={18} />Create a package</Link></div>
    {loading ? <p role="status">Loading your packages…</p> : error ? <div role="alert"><p>{error}</p><button className="button button-secondary" onClick={() => setAttempt(value => value + 1)}>Try again</button></div> : packages.length ? <div className="buddy-package-grid">{packages.map(({ id, input }) => <article className="buddy-package-card" key={id}>
      <Link className="buddy-package-cover" href={`/account/packages/${id}`}>{input.imageIds.length ? <img src={mediaUrl(input.imageIds[0])} alt={input.title} /> : <div className="buddy-cover-placeholder"><MapPin size={40} /><span>Your next experience starts here</span></div>}<span className={`buddy-publish-status ${input.published ? 'is-published' : ''}`}>{input.published ? 'Published' : 'Draft'}</span>{input.videoIds.length > 0 && <span className="buddy-clip-count"><Film size={15} />{input.videoIds.length} {input.videoIds.length === 1 ? 'clip' : 'clips'}</span>}</Link>
      <div className="buddy-package-card-body"><p>{input.destination || 'Add a destination'} · {input.durationMinutes} minutes</p><h2><Link href={`/account/packages/${id}`}>{input.title}</Link></h2><strong>From {money(Math.min(...input.options.map(option => option.price)))} <small>/ person</small></strong><div className="buddy-form-actions"><Link className="text-link" href={`/account/packages/${id}`}>Edit package <ArrowRight size={16} /></Link>{input.published && <Link className="text-link" href={`/experience/${id}`}>View listing <Eye size={16} /></Link>}</div></div>
    </article>)}</div> : <div className="buddy-package-empty"><div><MapPin size={44} /><Film size={26} /></div><h2>Start with something you love to share.</h2><p>A favourite food walk, a quiet trail, a day in your hometown. Turn your local knowledge into your first package.</p><Link className="button button-primary" href="/account/packages/new"><Plus size={18} />Create your first package</Link></div>}
  </div>;
}

export function BuddyPackageEditor({ id }: { id?: string }) { return <BuddyGate><PackageEditor id={id} /></BuddyGate>; }
function PackageEditor({ id }: { id?: string }) {
  const router = useRouter(); const [input, setInput] = useState<PackageEditorData>(emptyPackage);
  const [loading, setLoading] = useState(Boolean(id)); const [loadError, setLoadError] = useState(''); const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false); const [imageBusy, setImageBusy] = useState(false); const [videoBusy, setVideoBusy] = useState(false);
  const [error, setError] = useState(''); const [message, setMessage] = useState(''); const [dirty, setDirty] = useState(false);
  const [savedPublished, setSavedPublished] = useState(false); const [preview, setPreview] = useState(false);
  const { account } = useServerAuth();
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController(); setLoading(true); setLoadError('');
    void fetch(`/api/buddy/packages/${id}`, { cache: 'no-store', signal: controller.signal }).then(async response => {
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setInput(body.package.input); setSavedPublished(body.package.input.published); setDirty(false);
    }).catch(error => { if (error.name !== 'AbortError') setLoadError(error.message || 'Package could not be loaded.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [id, attempt]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn); return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  function change<K extends keyof PackageEditorData>(key: K, value: PackageEditorData[K]) { setInput(current => ({ ...current, [key]: value })); setDirty(true); setMessage(''); }
  async function save(published: boolean) {
    setError(''); setMessage('');
    const parsed = packageEditorSchema.safeParse({ ...input, published });
    if (!parsed.success) { setError(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).slice(0, 3).join(' ')); return; }
    setBusy(true);
    try {
      const response = await fetch(id ? `/api/buddy/packages/${id}` : '/api/buddy/packages', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(parsed.data) });
      const body = await response.json(); if (!response.ok) throw new Error(body.error);
      setInput(body.package.input); setSavedPublished(body.package.input.published); setDirty(false); setMessage(published ? 'Your package is published.' : 'Your draft is saved.');
      if (!id) router.replace(`/account/packages/${body.package.id}`);
    } catch (error) { setError(error instanceof Error ? error.message : 'Your changes could not be saved.'); }
    finally { setBusy(false); }
  }
  const blocked = busy || imageBusy || videoBusy;
  if (loading) return <div className="page-width standard-page" role="status">Opening your package…</div>;
  if (loadError) return <div className="page-width standard-page"><Back href="/account/packages" label="My packages" /><p role="alert">{loadError}</p><button className="button button-secondary" onClick={() => setAttempt(value => value + 1)}>Try again</button></div>;
  const updateOption = (index: number, values: Partial<PackageEditorData['options'][number]>) => change('options', input.options.map((option, i) => i === index ? { ...option, ...values } : option));
  const lines = (value: string) => value.split('\n');
  return <div className="page-width standard-page package-editor-page"><Back href="/account/packages" label="My packages" />
    <div className="buddy-page-heading"><div><p className="eyebrow">Package editor</p><h1>{id ? 'Make it worth the journey.' : 'What will you show them?'}</h1><p>Give travellers a clear picture of the experience, from the first hello to the last stop.</p></div><span className={`buddy-publish-status ${savedPublished ? 'is-published' : ''}`}>{savedPublished ? 'Published' : 'Draft'}{dirty ? ' · Unsaved changes' : ''}</span></div>
    <div className="package-editor-layout"><form className="package-editor-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(savedPublished); }}>
      <fieldset disabled={blocked} className="package-editor-fields">
        <section className="settings-panel" id="package-story"><div className="editor-section-title"><MapPin size={22} /><div><h2>The experience</h2><p>Start with the place, the people, and what you’ll do together.</p></div></div>
          <label className="field">Package title<input value={input.title} required minLength={2} maxLength={200} placeholder="A morning through Ella’s hidden trails" onChange={event => change('title', event.target.value)} /></label>
          <div className="editor-field-row"><label className="field">Destination<input maxLength={120} value={input.destination} onChange={event => change('destination', event.target.value)} placeholder="Ella" /></label><label className="field">Country<input maxLength={120} value={input.country} onChange={event => change('country', event.target.value)} /></label></div>
          <div className="editor-field-row"><label className="field">Category<select value={input.category} onChange={event => change('category', event.target.value)}>{categories.map(value => <option key={value}>{value}</option>)}</select></label><label className="field">Duration in minutes<input type="number" min={15} max={10080} step={1} value={input.durationMinutes} onChange={event => change('durationMinutes', Number(event.target.value))} /></label></div>
          <label className="field">Tell the story<textarea rows={5} maxLength={5000} value={input.description} placeholder="What makes this experience special? What will travellers see, do and discover?" onChange={event => change('description', event.target.value)} /></label>
          <label className="field">Highlights <small>One per line</small><textarea rows={3} value={input.highlights.join('\n')} onChange={event => change('highlights', lines(event.target.value))} placeholder={'Quiet trails with a local buddy\nBreakfast at a family-run café'} /></label>
        </section>
        <section className="settings-panel" id="package-media"><div className="editor-section-title"><Film size={22} /><div><h2>A glimpse of what’s ahead</h2><p>Choose a cover photo, then bring the experience to life with short clips.</p></div></div>
          <h3>Photos</h3><MediaPicker kind="image" ids={input.imageIds} onChange={ids => change('imageIds', ids)} onBusyChange={setImageBusy} disabled={blocked} />
          <h3>Video clips</h3><p className="editor-section-help">A view from the trail, a dish being made, or a quick hello. Travellers can watch these on your listing.</p><MediaPicker kind="video" ids={input.videoIds} onChange={ids => change('videoIds', ids)} onBusyChange={setVideoBusy} disabled={blocked} />
        </section>
        <section className="settings-panel" id="package-pricing"><div className="editor-section-title"><Clock size={22} /><div><h2>Price & availability</h2><p>Set prices in USD per person. Start times use Sri Lanka time.</p></div></div>
          {input.options.map((option, index) => <div className="editor-option" key={index}><div className="buddy-form-actions"><h3>Option {index + 1}</h3>{input.options.length > 1 && <button type="button" className="text-link" onClick={() => change('options', input.options.filter((_, i) => i !== index))}><X size={16} />Remove option {index + 1}</button>}</div>
            <label className="field">Option name<input maxLength={120} required value={option.name} onChange={event => updateOption(index, { name: event.target.value })} /></label>
            <div className="editor-field-row"><label className="field">Price per person (USD)<input type="number" min={0} max={100000} step="0.01" value={option.price} onChange={event => updateOption(index, { price: Number(event.target.value) })} /></label><label className="field">Maximum travellers<input type="number" min={1} max={12} value={option.capacity} onChange={event => updateOption(index, { capacity: Number(event.target.value) })} /></label></div>
            <label className="field">Start times <small>24-hour clock, separated by commas</small><input value={option.times.join(',')} onChange={event => updateOption(index, { times: event.target.value.split(',') })} placeholder="09:00,14:00" /></label>
          </div>)}
          {input.options.length < 8 && <button type="button" className="button button-secondary" onClick={() => change('options', [...input.options, { name: 'Private experience', price: 50, capacity: 4, times: ['09:00'] }])}><Plus size={16} />Add a pricing option</button>}
        </section>
        <ScheduleEditor packageId={id} value={input.schedule ?? defaultSchedule()} onChange={value => change('schedule', value)} /><section className="settings-panel" id="package-details"><h2>The practical details</h2><p className="editor-section-help">Help travellers arrive prepared.</p>
          <label className="field">Languages <small>Separated by commas</small><input value={input.languages.join(',')} onChange={event => change('languages', event.target.value.split(','))} placeholder="English,Sinhala" /></label>
          <label className="field">Meeting point<textarea rows={2} maxLength={500} value={input.meetingPoint} onChange={event => change('meetingPoint', event.target.value)} placeholder="Where should travellers meet you?" /></label>
          <div className="editor-field-row"><label className="field">What’s included <small>One per line</small><textarea rows={4} value={input.included.join('\n')} onChange={event => change('included', lines(event.target.value))} /></label><label className="field">Not included <small>One per line</small><textarea rows={4} value={input.notIncluded.join('\n')} onChange={event => change('notIncluded', lines(event.target.value))} /></label></div>
          <label className="editor-checkbox"><input type="checkbox" checked={input.freeCancellation} onChange={event => change('freeCancellation', event.target.checked)} />Free cancellation until 24 hours before the start</label>
          <label className="editor-checkbox"><input type="checkbox" checked={input.pickup} onChange={event => change('pickup', event.target.checked)} />Pickup is included</label>
        </section>
        <section className="settings-panel" id="package-itinerary"><h2>Your itinerary</h2><p className="editor-section-help">Optional stops to help travellers picture their day.</p>{input.itinerary.map((stop, index) => <div className="editor-option" key={index}><div className="buddy-form-actions"><h3>Stop {index + 1}</h3><button type="button" className="text-link" onClick={() => change('itinerary', input.itinerary.filter((_, i) => i !== index))}>Remove stop {index + 1}</button></div>
          <div className="editor-field-row"><label className="field">Time or duration<input value={stop.time} maxLength={60} onChange={event => change('itinerary', input.itinerary.map((value, i) => i === index ? { ...value, time: event.target.value } : value))} placeholder="09:00 or 30 minutes" /></label><label className="field">Stop name<input value={stop.title} maxLength={160} onChange={event => change('itinerary', input.itinerary.map((value, i) => i === index ? { ...value, title: event.target.value } : value))} /></label></div>
          <label className="field">What happens here?<textarea value={stop.detail} rows={2} maxLength={1000} onChange={event => change('itinerary', input.itinerary.map((value, i) => i === index ? { ...value, detail: event.target.value } : value))} /></label>
        </div>)}{input.itinerary.length < 20 && <button type="button" className="button button-secondary" onClick={() => change('itinerary', [...input.itinerary, { time: '', title: '', detail: '' }])}><Plus size={16} />Add a stop</button>}</section>
      </fieldset>
      <div className="editor-save-bar"><div>{imageBusy || videoBusy ? <span role="status">Wait for your upload to finish…</span> : dirty ? 'You have unsaved changes.' : 'Your package is up to date.'}</div><div><button type="submit" className="button button-secondary" disabled={blocked}><Save size={17} />{busy ? 'Saving…' : savedPublished ? 'Save changes' : 'Save draft'}</button><button type="button" className="button button-primary" disabled={blocked} onClick={() => void save(!savedPublished)}><Check size={17} />{savedPublished ? 'Unpublish' : 'Publish package'}</button></div></div>
      {error && <p className="error-message" role="alert">{error}</p>}{message && <p className="inline-note" role="status">{message}</p>}
    </form><aside className="editor-preview"><div className="editor-preview-label"><Eye size={17} /><strong>A traveller’s first look</strong></div><div className="editor-preview-card">{input.imageIds.length ? <img src={mediaUrl(input.imageIds[0])} alt="Package cover preview" /> : <div className="buddy-cover-placeholder"><MapPin size={42} /><span>Add a photo of your experience</span></div>}<div><p>{input.destination || 'Your destination'} · {input.category}</p><h2>{input.title || 'A good story starts here.'}</h2><span className="editor-preview-duration"><Clock size={16} />{input.durationMinutes} minutes{input.videoIds.length > 0 && <> · <Film size={16} />{input.videoIds.length} clips</>}</span><p>With {account?.displayName}</p><strong className="editor-preview-price">{money(Math.min(...input.options.map(value => value.price)))} <small>/ person</small></strong></div></div>
      <nav aria-label="Package editor sections"><a href="#package-story">The experience</a><a href="#package-media">Photos & clips</a><a href="#package-pricing">Price & availability</a><a href="#package-schedule">Operating schedule</a><a href="#package-details">Practical details</a><a href="#package-itinerary">Itinerary</a></nav>
      {id && savedPublished && <Link className="button button-secondary button-wide" href={`/experience/${id}`}><Eye size={17} />View published listing</Link>}
      <button type="button" className="text-link" onClick={() => setPreview(value => !value)}>{preview ? 'Hide clip preview' : 'Preview video clips'} <Film size={16} /></button>{preview && <div className="editor-clip-preview">{input.videoIds.length ? input.videoIds.map((id, index) => <video key={id} src={mediaUrl(id)} controls playsInline preload="metadata" aria-label={`Preview clip ${index + 1}`} />) : <p>Add a video clip to preview it here.</p>}</div>}
    </aside></div>
  </div>;
}
