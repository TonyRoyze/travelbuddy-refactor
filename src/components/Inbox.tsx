'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, ChevronRight, MessageCircle, Package, Send, X } from 'lucide-react';
import { experiences, getExperience } from '@/lib/catalog';
import { money, safeReturn } from '@/lib/customer';
import { useCustomer } from './CustomerProvider';
import { Empty, Gate, PageHeading, Photo } from './UI';

export function InboxPage() { return <Gate><InboxContent /></Gate>; }
function InboxContent() {
  const { data, user, sendMessage, sharePackage } = useCustomer();
  const params = useSearchParams(); const router = useRouter();
  const conversations = data.conversations.filter(chat => chat.owner === user!.id);
  const conversation = conversations.find(chat => chat.id === params.get('conversation'));
  const experience = conversation && getExperience(conversation.experienceId);
  const [message, setMessage] = useState(''); const [sharing, setSharing] = useState(false);
  const [packageId, setPackageId] = useState(experiences[0]?.id ?? '');
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { setMessage(''); setSharing(false); }, [conversation?.id]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'instant' as ScrollBehavior }); }, [conversation?.messages.length]);
  const returnParam = params.get('return');
  const returnLink = returnParam && (/^\/booking\//.test(returnParam) || returnParam.startsWith(`/experience/${conversation?.experienceId}`)) ? safeReturn(returnParam) : `/experience/${conversation?.experienceId}`;
  function submit(event: FormEvent) { event.preventDefault(); if (!conversation || !message.trim()) return; sendMessage(conversation.id, message); setMessage(''); }
  function submitPackage(event: FormEvent) {
    event.preventDefault(); if (!conversation) return;
    const item = getExperience(packageId); if (!item) return;
    sharePackage(conversation.id, { experienceId: item.id, title: item.title, image: item.image, price: item.price });
    setSharing(false);
  }
  return <div className={`page-width inbox-page ${conversation ? 'has-conversation' : ''}`}>
    {!conversation && <PageHeading eyebrow="A good conversation goes a long way" title="A little local insight." text="Ask about an experience before you book." />}
    {!conversations.length ? <Empty icon={<MessageCircle size={34}/>} title="Start with a good question." text="Use Contact before booking on an experience to begin a conversation." href="/search"/> :
      <div className="inbox-layout">
        <aside className="conversation-list"><h2>Your conversations</h2>{conversations.map(chat => { const listing = getExperience(chat.experienceId); if (!listing) return null; const latest = chat.messages[chat.messages.length - 1]; return <button key={chat.id} className={conversation?.id === chat.id ? 'active' : ''} onClick={() => router.push(`/inbox?conversation=${chat.id}`)}><span className="provider-avatar">{listing.supplier[0]}</span><span><strong>{listing.supplier}</strong><small>{listing.title}</small><span>{latest?.package?.title ?? latest?.text ?? 'No messages yet'}</span></span><ChevronRight size={18}/></button>; })}</aside>
        {conversation && experience ? <section className="conversation-panel">
          <div className="chat-header"><Link href="/inbox" className="icon-button" aria-label="Back to conversations"><ArrowLeft size={20}/></Link><div><h1>{experience.supplier}</h1><p>Experience host</p></div><Link className="text-link" href={returnLink}>Back to booking <ArrowRight size={16}/></Link></div>
          <Link href={returnLink} className="chat-experience"><Photo src={experience.image} alt=""/><div><strong>{experience.title}</strong><span>{experience.destination} · From {money(experience.price)}</span></div><ChevronRight size={18}/></Link>
          <div className="chat-messages" aria-label="Conversation messages" role="log" aria-live="polite">{conversation.messages.map(value => <article key={value.id} className={`message message-${value.author}`}><span>{value.author === 'sample' ? 'Host' : 'You'}</span>{value.package ? <Link href={`/experience/${value.package.experienceId}`} className="shared-package"><Photo src={value.package.image} alt=""/><span className="shared-package-copy"><strong>{value.package.title}</strong><span>From {money(value.package.price)} / person</span><small>View package details <ArrowRight size={14}/></small></span></Link> : <p>{value.text}</p>}<time>{new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value.at))}</time></article>)}<div ref={end}/></div>
          {sharing && <form className="package-share-form" onSubmit={submitPackage}><label htmlFor="share-package"><Package size={17}/>Choose a package</label><select id="share-package" value={packageId} onChange={event => setPackageId(event.target.value)}>{experiences.map(item => <option key={item.id} value={item.id}>{item.title} · {money(item.price)}</option>)}</select><button className="button button-primary" type="submit">Share package</button><button className="icon-button" type="button" aria-label="Cancel sharing" onClick={() => setSharing(false)}><X size={18}/></button></form>}
          <form className="chat-composer" onSubmit={submit}><button type="button" className="button button-secondary share-package-trigger" onClick={() => setSharing(value => !value)} aria-expanded={sharing}><Package size={17}/><span>Share package</span></button><label className="sr-only" htmlFor="chat-message">Your message</label><input id="chat-message" value={message} maxLength={1000} onChange={event => setMessage(event.target.value)} placeholder="Ask about the experience…" autoComplete="off"/><button className="button button-primary" disabled={!message.trim()} aria-label="Send message"><Send size={19}/></button></form>
        </section> : <div className="conversation-placeholder"><MessageCircle size={34}/><h2>Pick up a conversation.</h2><p>Select a host to see your messages.</p></div>}
      </div>}
  </div>;
}
