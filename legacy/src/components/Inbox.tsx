'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ChevronRight, LockKeyhole, MapPin, MessageCircle, Plus, Send, Package, LocateFixed } from 'lucide-react';
import { useServerAuth } from './ServerAuthProvider';
import { Empty, Gate, PageHeading, Sheet } from './UI';
import { PickupLocation } from './PickupLocation';
import { CustomPackageCard, CustomPackageForm } from './CustomPackage';
import type { Coordinates, CustomPackage } from '@/lib/inbox';

type RequestPost = { id: string; title: string; destination: string; details: string; pickupLocation: string | null; latitude: number | null; longitude: number | null; distanceKm: number | null; closed: boolean; createdAt: string; traveler: { id: string; displayName: string }; conversations: { id: string }[] };
type RequestContext = Pick<RequestPost, 'id' | 'title' | 'destination' | 'closed' | 'pickupLocation' | 'latitude' | 'longitude'> & { details?: string };
type Conversation = { package: { id: string; title: string; destination: string; published: boolean } | null; id: string; participant: { id: string; displayName: string }; request: RequestContext | null; latestMessage: { body: string; createdAt: string } | null };
type ConversationDetail = Omit<Conversation, 'latestMessage'> & { messages: { id: string; senderId: string; body: string; package: CustomPackage | null; createdAt: string }[] };
type Tab = 'requests' | 'replies';

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...options });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Your inbox is unavailable. Please try again.');
  return body;
}
function json(method: string, body: unknown): RequestInit { return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'Please try again.'; }
function dateLabel(value: string) { return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

export function InboxPage({ testAccountsEnabled = false }: { testAccountsEnabled?: boolean }) {
  const { account } = useServerAuth();
  return <Gate><InboxContent key={account?.id} testAccountsEnabled={testAccountsEnabled} /></Gate>;
}
function InboxContent({ testAccountsEnabled }: { testAccountsEnabled: boolean }) {
  const { account } = useServerAuth();
  const router = useRouter(); const params = useSearchParams();
  const selectedId = params.get('conversation');
  const requestFilter = params.get('request');
  const packageId = params.get('package');
  const bookingQuery = params.get('booking') ?? '';
  const [openingError, setOpeningError] = useState('');
  const [openingAttempt, setOpeningAttempt] = useState(0);
  const tab: Tab = packageId || selectedId || ['replies', 'mine', 'messages'].includes(params.get('tab') ?? '') ? 'replies' : 'requests';
  const canPost = account!.roles.includes('traveler');
  const canReply = account!.roles.some(role => role === 'guide' || role === 'provider');
  const [requests, setRequests] = useState<RequestPost[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [composing, setComposing] = useState(params.get('compose') === '1' && canPost);
  const [title, setTitle] = useState(params.get('title')?.slice(0, 120) ?? '');
  const [destination, setDestination] = useState(params.get('destination')?.slice(0, 120) ?? '');
  const [pickup, setPickup] = useState(''); const [position, setPosition] = useState<Coordinates | null>(null);
  const [nearby, setNearby] = useState<(Coordinates & { radiusKm: number }) | null>(null); const [searchingNearby, setSearchingNearby] = useState(false);
  const [searchLocation, setSearchLocation] = useState(''); const [searchPosition, setSearchPosition] = useState<Coordinates | null>(null); const [radius, setRadius] = useState(25);
  const [offering, setOffering] = useState<RequestPost | 'conversation' | null>(null);
  const [details, setDetails] = useState(''); const [replying, setReplying] = useState<RequestPost | null>(null);
  const [reply, setReply] = useState(''); const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false); const [formError, setFormError] = useState(''); const [notice, setNotice] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const visibleConversation = conversation?.id === selectedId ? conversation : null;

  useEffect(() => {
    if (!packageId || selectedId) return;
    let cancelled = false;
    setOpeningError('');
    api<{ conversation: { id: string } }>('/api/messages', json('POST', { packageId }))
      .then(result => {
        if (cancelled) return;
        const query = new URLSearchParams({ conversation: result.conversation.id });
        if (bookingQuery) query.set('booking', bookingQuery);
        router.replace(`/inbox?${query}`);
      }).catch(failure => { if (!cancelled) setOpeningError(errorText(failure)); });
    return () => { cancelled = true; };
  }, [packageId, selectedId, bookingQuery, openingAttempt, router]);

  useEffect(() => {
    const controller = new AbortController(); let running = false;
    setLoading(true); setError(''); setRequests([]);
    async function load() {
      if (running) return;
      running = true;
      try {
        const options = { signal: controller.signal };
        const results = await Promise.all([
          api<{ requests: RequestPost[] }>(tab === 'replies' && canPost ? '/api/requests?mine=1' : nearby && tab === 'requests' ? `/api/requests?latitude=${nearby.latitude}&longitude=${nearby.longitude}&radius=${nearby.radiusKm}` : '/api/requests', options),
          api<{ conversations: Conversation[] }>('/api/messages', options),
        ]);
        if (!controller.signal.aborted) { setRequests(results[0].requests); setConversations(results[1].conversations); setError(''); }
      } catch (failure) { if (!controller.signal.aborted) setError(errorText(failure)); }
      finally { running = false; if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); const timer = window.setInterval(load, 5000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [tab, revision, nearby, canPost]);
  useEffect(() => { setConversation(null); setMessage(''); setFormError(''); }, [selectedId]);
  useEffect(() => {
    if (!selectedId) return;
    const controller = new AbortController(); let running = false;
    async function load() {
      if (running) return;
      running = true;
      try {
        const result = await api<{ conversation: ConversationDetail }>(`/api/messages/${encodeURIComponent(selectedId!)}`, { signal: controller.signal });
        if (!controller.signal.aborted) { setConversation(result.conversation); setFormError(''); }
      } catch (failure) { if (!controller.signal.aborted) setFormError(errorText(failure)); }
      finally { running = false; }
    }
    void load(); const timer = window.setInterval(load, 5000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [selectedId, revision]);
  useEffect(() => {
    const log = end.current?.parentElement;
    if (log) log.scrollTop = log.scrollHeight;
  }, [visibleConversation?.messages.length]);

  function switchTab(next: Tab) { setNotice(''); router.push(next === 'requests' ? '/inbox' : `/inbox?tab=${next}`); }
  async function publish(event: FormEvent) {
    event.preventDefault(); setBusy(true); setFormError('');
    try {
      await api('/api/requests', json('POST', { title, destination, details, ...(pickup.trim() ? { pickupLocation: pickup.trim() } : {}), ...(position ? { location: position } : {}) }));
      setComposing(false); setTitle(''); setDestination(''); setDetails(''); setPickup(''); setPosition(null);
      setNotice('Your request is posted. Buddies and guides can reply privately.');
      router.push('/inbox?tab=replies'); setRevision(value => value + 1);
    } catch (failure) { setFormError(errorText(failure)); } finally { setBusy(false); }
  }
  async function sendReply(event: FormEvent) {
    event.preventDefault(); if (!replying) return;
    setBusy(true); setFormError('');
    try {
      const result = await api<{ conversation: { id: string } }>(`/api/requests/${replying.id}/reply`, json('POST', { body: reply }));
      setReplying(null); setReply(''); setRevision(value => value + 1);
      router.push(`/inbox?conversation=${result.conversation.id}`);
    } catch (failure) { setFormError(errorText(failure)); } finally { setBusy(false); }
  }
  async function send(event: FormEvent) {
    event.preventDefault(); if (!visibleConversation || !message.trim()) return;
    setBusy(true); setFormError('');
    try {
      await api(`/api/messages/${visibleConversation.id}`, json('POST', { body: message }));
      setMessage(''); setRevision(value => value + 1);
    } catch (failure) { setFormError(errorText(failure)); } finally { setBusy(false); }
  }
  async function closePost(id: string) {
    setBusy(true); setError('');
    try { await api(`/api/requests/${id}`, json('PATCH', { closed: true })); setNotice('Request closed. Your existing conversations stay available.'); setRevision(value => value + 1); }
    catch (failure) { setError(errorText(failure)); } finally { setBusy(false); }
  }
  async function sendPackage(offer: CustomPackage) {
    if (!offering) return; setBusy(true); setFormError('');
    try {
      const body = { body: `Custom package: ${offer.title}`, package: offer };
      if (offering === 'conversation') {
        if (!visibleConversation) return;
        await api(`/api/messages/${visibleConversation.id}`, json('POST', body));
      } else {
        const result = await api<{ conversation: { id: string } }>(`/api/requests/${offering.id}/reply`, json('POST', body));
        router.push(`/inbox?conversation=${result.conversation.id}`);
      }
      setOffering(null); setRevision(value => value + 1); setNotice('Custom package sent privately.');
    } catch (failure) { setFormError(errorText(failure)); } finally { setBusy(false); }
  }
  function dismissForm() { if (busy) return; setComposing(false); setReplying(null); setOffering(null); setFormError(''); }

  return <div className={`page-width inbox-page request-inbox ${selectedId ? 'has-conversation' : ''}`}>
    {testAccountsEnabled && <div className="test-account-banner"><span>Signed in as {account!.displayName}</span><Link href="/test-accounts" className="text-link">Switch test account</Link></div>}
    {<PageHeading title="Inbox" action={canPost ? <button className="button button-primary" onClick={() => { setFormError(''); setComposing(true); }}><Plus size={18}/>Post a request</button> : undefined}/>}
    <nav className="request-tabs" aria-label="Inbox sections">
      <button className={tab === 'requests' ? 'active' : ''} aria-current={tab === 'requests' ? 'page' : undefined} onClick={() => switchTab('requests')}>Traveller requests</button>
      <button className={tab === 'replies' ? 'active' : ''} aria-current={tab === 'replies' ? 'page' : undefined} onClick={() => switchTab('replies')}><LockKeyhole size={16}/>Replies</button>
    </nav>
    {packageId && !selectedId && <div className="request-notice" role={openingError ? 'alert' : 'status'}>{openingError || 'Opening your private provider chat…'}{openingError && <button className="text-link" onClick={() => setOpeningAttempt(value => value + 1)}>Try again</button>}<Link className="text-link" href={`/experience/${encodeURIComponent(packageId)}?${new URLSearchParams(bookingQuery)}`}>Return to package</Link></div>}
    {notice && <p className="request-notice" role="status">{notice}</p>}
    {error && <div className="request-error" role="alert"><p>{error}</p><button className="text-link" onClick={() => setRevision(value => value + 1)}>Try again</button></div>}
    {(tab === 'requests') ? <>
      {/*<div className="request-board-heading"><h2>{tab === 'replies' ? 'Your requests' : nearby ? 'Requests near you' : 'What travellers have in mind'}</h2><p>{canReply ? 'See a plan you can help with? Send the traveller a private reply.' : 'Your post is visible to signed-in members. Replies stay between you and each buddy or guide.'}</p></div>*/}
      {canReply && tab === 'requests' && <div className="nearby-controls"><button type="button" className={`button ${nearby ? 'button-secondary' : 'button-primary'}`} aria-pressed={!nearby} onClick={() => setNearby(null)}>All requests</button><button type="button" className={`button ${nearby ? 'button-primary' : 'button-secondary'}`} aria-pressed={Boolean(nearby)} onClick={() => setSearchingNearby(true)}><LocateFixed size={16}/>{nearby ? `Within ${nearby.radiusKm} km` : 'Nearby requests'}</button>{nearby && <span className="field-help">Nearest pickup points first</span>}</div>}
      {loading ? <p className="loading-state" role="status">Loading requests…</p> : !requests.length ? !error && <Empty icon={<MapPin size={32}/>} title="The next adventure starts here." text={canPost ? 'Post a destination and an idea. A buddy or guide can help you make it happen.' : 'New traveller requests will appear here. Come back soon to offer your local knowledge.'}/> : <div className="request-board">{requests.map(post => {
        const own = post.traveler.id === account!.id;
        return <article className="request-post" key={post.id}>
          <div className="request-post-meta"><span className="provider-avatar" aria-hidden="true">{post.traveler.displayName[0]}</span><div><strong>{own ? 'You' : post.traveler.displayName}</strong><time dateTime={post.createdAt}>Posted {dateLabel(post.createdAt)}</time></div><span className={`status-pill ${post.closed ? '' : 'status-completed'}`}>{post.closed ? 'Closed' : 'Open request'}</span></div>
          <h3>{post.title}</h3><p className="request-destination"><MapPin size={16}/>{post.destination}</p><p className="request-details">{post.details}</p>{post.pickupLocation && <p className="request-pickup"><LocateFixed size={16}/><span>Pickup / current location: <strong>{post.pickupLocation}</strong>{post.distanceKm !== null && ` · ${post.distanceKm.toFixed(1)} km away`}</span>{post.latitude !== null && post.longitude !== null && <a className="text-link" href={`https://www.openstreetmap.org/?mlat=${post.latitude}&mlon=${post.longitude}#map=16/${post.latitude}/${post.longitude}`} target="_blank" rel="noreferrer">View pin</a>}</p>}
          <div className="request-post-actions">{own ? <><Link className="button button-secondary" href={`/inbox?tab=replies&request=${post.id}`}><MessageCircle size={16}/>{post.conversations.length ? `${post.conversations.length} private ${post.conversations.length === 1 ? 'reply' : 'replies'}` : 'View private replies'}</Link>{!post.closed && <button className="text-link" disabled={busy} onClick={() => void closePost(post.id)}>Close request</button>}</> : canReply ? post.conversations.length ? <Link className="button button-secondary" href={`/inbox?conversation=${post.conversations[0].id}`}><MessageCircle size={16}/>Continue privately</Link> : <button className="button button-primary" disabled={busy || post.closed} onClick={() => { setReplying(post); setReply(''); setFormError(''); }}><LockKeyhole size={16}/>Reply privately</button> : <span className="field-help">Buddies and guides can reply to this request.</span>}{canReply && !own && !post.closed && <button type="button" className="button button-secondary" disabled={busy} onClick={() => { setOffering(post); setFormError(''); }}><Package size={16}/>Send custom package</button>}</div>
        </article>;
      })}</div>}
      {requests.length === 50 && <p className="field-help">Showing the 50 most recent requests.</p>}
    </> : null}
    {tab === 'replies' && !selectedId && <div className="reply-board">
      {loading ? <p className="loading-state" role="status">Loading replies…</p> : <>
        {(canPost ? requests : Array.from(new Map(conversations.filter(chat => chat.request).map(chat => [chat.request!.id, chat.request!])).values())).map(post => <article className="request-post reply-post" key={post.id}>
          <details className="reply-request-details"><summary><h3>{post.title}</h3><ChevronRight size={18}/></summary><div><p className="request-destination"><MapPin size={16}/>{post.destination}</p>{post.details && <p className="request-details">{post.details}</p>}{post.pickupLocation && <p className="request-pickup"><LocateFixed size={16}/><span>Pickup / current location: <strong>{post.pickupLocation}</strong></span>{post.latitude !== null && post.longitude !== null && <a className="text-link" href={`https://www.openstreetmap.org/?mlat=${post.latitude}&mlon=${post.longitude}#map=16/${post.latitude}/${post.longitude}`} target="_blank" rel="noreferrer">View pin</a>}</p>}{canPost && !post.closed && <button className="text-link" disabled={busy} onClick={() => void closePost(post.id)}>Close request</button>}</div></details>
          <details className="request-threads" open={requestFilter === post.id || undefined}><summary><MessageCircle size={16}/>Threads ({conversations.filter(chat => chat.request?.id === post.id).length})<ChevronRight size={16}/></summary><ThreadList conversations={conversations.filter(chat => chat.request?.id === post.id)}/></details>
        </article>)}
        {conversations.some(chat => !chat.request) && <article className="request-post reply-post"><h3>Private conversations</h3><ThreadList conversations={conversations.filter(chat => !chat.request)}/></article>}
        {(!canPost || !requests.length) && !conversations.length && !error && <Empty icon={<MessageCircle size={32}/>} title="No replies yet" text={canPost ? 'Post a request to start making plans with a buddy or guide.' : 'Reply to a traveller request to start a private conversation.'}/>}
      </>}
    </div>}
    {tab === 'replies' && selectedId && <div className="inbox-layout">
      {visibleConversation ? <section className="conversation-panel" aria-label="Private conversation">
        <div className="chat-header"><Link href="/inbox?tab=replies" className="icon-button" aria-label="Back to private replies"><ArrowLeft size={20}/></Link><h1>{visibleConversation.participant.displayName.trim().split(/\s+/)[0]}<LockKeyhole size={16} aria-label="Private conversation" role="img"/></h1></div>
        <div className="chat-messages" aria-label="Conversation messages" role="log" aria-live="polite">{visibleConversation.request && <article className="message request-message" aria-label="Original traveller request"><details className="chat-request"><summary><MapPin size={16}/><strong>{visibleConversation.request.title}</strong><span>{visibleConversation.request.destination}{visibleConversation.request.closed && ' · Closed request'}</span></summary><p>{visibleConversation.request.details}</p>{visibleConversation.request.pickupLocation && <p>Pickup / current location: {visibleConversation.request.pickupLocation}</p>}</details></article>}{visibleConversation.package && <article className="message request-message" aria-label="Package being discussed"><strong>{visibleConversation.package.title}</strong><p>{visibleConversation.package.destination}</p><Link className="text-link" href={`/experience/${encodeURIComponent(visibleConversation.package.id)}?${new URLSearchParams(bookingQuery)}`}>{visibleConversation.package.published ? 'Return to booking' : 'View package'}</Link><p className="field-help">Chatting does not confirm a booking or reserve places.</p></article>}{visibleConversation.messages.map(value => <article key={value.id} className={`message message-${value.senderId === account!.id ? 'customer' : 'sample'}`}><span>{value.senderId === account!.id ? 'You' : visibleConversation.participant.displayName}</span>{value.package ? <CustomPackageCard offer={value.package}/> : <p>{value.body}</p>}<time dateTime={value.createdAt}>{dateLabel(value.createdAt)} · {new Date(value.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</time></article>)}<div ref={end}/></div>
        {formError && <p className="error-message chat-error" role="alert">{formError}</p>}
        <form className="chat-composer" onSubmit={send}>{canReply && visibleConversation.request && <button type="button" className="button button-secondary custom-package-trigger" disabled={busy} onClick={() => { setOffering('conversation'); setFormError(''); }} aria-label="Send custom package"><Package size={18}/><span>Custom package</span></button>}<label className="sr-only" htmlFor="private-message">Your message</label><input id="private-message" value={message} disabled={busy} maxLength={1000} onChange={event => setMessage(event.target.value)} placeholder="Write a private message…" autoComplete="off"/><button className="button button-primary" disabled={busy || !message.trim()} aria-label="Send message"><Send size={19}/></button></form>
      </section> : <div className="conversation-placeholder"><MessageCircle size={34}/><h2>{selectedId ? formError ? 'Conversation unavailable.' : 'Opening your conversation…' : 'A local connection starts with a reply.'}</h2><p>{selectedId ? formError || 'Loading private messages.' : 'Choose a conversation to read messages and make a plan.'}</p>{formError && <button className="button button-secondary" onClick={() => setRevision(value => value + 1)}>Try again</button>}</div>}
    </div>}
    <Sheet open={composing} onClose={dismissForm} title="What would you like to do?">
      <form className="request-form" onSubmit={publish} aria-busy={busy}><p>Share your idea with the community. A buddy or guide can reply to you privately.</p><fieldset disabled={busy}>
        <label className="field">Your plan<input value={title} onChange={event => setTitle(event.target.value)} required minLength={3} maxLength={120} placeholder="A sunrise hike and breakfast with a local"/></label>
        <label className="field">Destination<input value={destination} onChange={event => setDestination(event.target.value)} required minLength={2} maxLength={120} placeholder="Ella, Sri Lanka"/></label>
        <PickupLocation label="Pickup or current location (optional)" value={pickup} position={position} onChange={(label, point) => { setPickup(label); setPosition(point); }} disabled={busy}/>
        <label className="field">Tell us more<textarea value={details} onChange={event => setDetails(event.target.value)} required minLength={10} maxLength={2000} rows={5} placeholder="When are you visiting? Who’s joining? What would make it a good day?"/><span className="field-help">10–2,000 characters. Keep contact details for private messages.</span></label>
      </fieldset>{formError && <p className="error-message" role="alert">{formError}</p>}<button className="button button-primary button-wide" disabled={busy}>{busy ? 'Posting…' : 'Post request'}</button></form>
    </Sheet>
    <Sheet open={searchingNearby} onClose={() => setSearchingNearby(false)} title="Find nearby requests"><div className="request-form"><PickupLocation label="Search from" value={searchLocation} position={searchPosition} onChange={(label, point) => { setSearchLocation(label); setSearchPosition(point); }} requirePin/><label className="field">Distance<select value={radius} onChange={event => setRadius(Number(event.target.value))}>{[5, 10, 25, 50, 100].map(km => <option key={km} value={km}>Within {km} km</option>)}</select></label><button type="button" className="button button-primary" disabled={!searchPosition} onClick={() => { if (searchPosition) { setNearby({ ...searchPosition, radiusKm: radius }); setSearchingNearby(false); } }}>Find requests</button></div></Sheet>
    <Sheet open={Boolean(offering)} onClose={dismissForm} title="Send a custom package">{offering && <CustomPackageForm key={typeof offering === 'string' ? selectedId : offering.id} onSubmit={sendPackage} busy={busy} error={formError}/>}</Sheet>
    <Sheet open={Boolean(replying)} onClose={dismissForm} title="Reply privately">
      <form className="request-form" onSubmit={sendReply} aria-busy={busy}><div className="reply-context"><strong>{replying?.title}</strong><p>{replying?.traveler.displayName} · {replying?.destination}</p></div><p><LockKeyhole size={15}/>Only you and this traveller can see your reply.</p><label className="field">Your reply<textarea value={reply} disabled={busy} onChange={event => setReply(event.target.value)} required maxLength={1000} rows={5} placeholder="Introduce yourself and tell them how you can help…"/></label>{formError && <p className="error-message" role="alert">{formError}</p>}<button className="button button-primary button-wide" disabled={busy || !reply.trim()}>{busy ? 'Sending…' : 'Send private reply'}</button></form>
    </Sheet>
  </div>;
}

function ThreadList({ conversations }: { conversations: Conversation[] }) {
  return <div className="request-thread-list">{conversations.length ? conversations.map(chat => <Link key={chat.id} href={`/inbox?conversation=${chat.id}`} className="request-thread"><span className="provider-avatar" aria-hidden="true">{chat.participant.displayName[0]}</span><span><strong>{chat.participant.displayName.trim().split(/\s+/)[0]}</strong><small>{chat.package ? `${chat.package.title} · ` : ''}{chat.latestMessage?.body ?? 'No messages yet'}</small></span><ChevronRight size={18}/></Link>) : <p className="field-help">No replies yet. Threads will appear here when a buddy or guide responds.</p>}</div>;
}
