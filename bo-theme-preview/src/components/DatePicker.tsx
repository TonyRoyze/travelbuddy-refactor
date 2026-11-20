'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

export function DatePicker({ value, min, max, onChange }: { value: string; min: string; max: string; onChange: (value: string) => void }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState((value || min).slice(0, 7));
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const days = new Date(year, monthNumber, 0).getDate();
  const previous = new Date(year, monthNumber - 2, 1);
  const next = new Date(year, monthNumber, 1);
  const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  const close = () => { setOpen(false); trigger.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => { if (!popup.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    const hide = () => setOpen(false);
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', hide);
    window.addEventListener('scroll', hide, true);
    popup.current?.querySelector<HTMLButtonElement>('[aria-pressed="true"], .calendar-day:not(:disabled)')?.focus();
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', escape); window.removeEventListener('resize', hide); window.removeEventListener('scroll', hide, true); };
  }, [open]);
  const choose = (date: string) => { onChange(date); close(); };
  return <span className="date-picker"><button ref={trigger} type="button" className="date-picker-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => {
    if (open) { close(); return; }
    const rect = trigger.current!.getBoundingClientRect();
    setPosition({ left: Math.max(12, Math.min(rect.left, window.innerWidth - 316)), top: rect.bottom + 340 < window.innerHeight ? rect.bottom + 6 : Math.max(12, rect.top - 346) });
    setMonth((value || min).slice(0, 7)); setOpen(true);
  }}><span className={value ? '' : 'date-placeholder'}>{value ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : 'Choose a date'}</span><CalendarDays size={18} aria-hidden="true"/></button>{open && createPortal(<div ref={popup} id={id} role="dialog" aria-label="Choose a date" className="calendar-popover" style={position}><div className="calendar-heading"><button type="button" aria-label="Previous month" disabled={monthKey(previous) < min.slice(0, 7)} onClick={() => setMonth(monthKey(previous))}><ChevronLeft size={18}/></button><strong aria-live="polite">{first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</strong><button type="button" aria-label="Next month" disabled={monthKey(next) > max.slice(0, 7)} onClick={() => setMonth(monthKey(next))}><ChevronRight size={18}/></button></div><div className="calendar-grid"><div className="calendar-weekdays">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <span key={day}>{day}</span>)}</div>{Array.from({ length: first.getDay() }, (_, index) => <span key={`blank-${index}`}/>)}{Array.from({ length: days }, (_, index) => { const date = `${month}-${String(index + 1).padStart(2, '0')}`; return <button key={date} className="calendar-day" type="button" disabled={date < min || date > max} aria-label={new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { dateStyle: 'full' })} aria-pressed={date === value} onClick={() => choose(date)}>{index + 1}</button>; })}</div><div className="calendar-footer"><button type="button" onClick={() => choose('')}>Clear</button><button type="button" onClick={() => choose(min)}>Today</button></div></div>, document.body)}</span>;
}
