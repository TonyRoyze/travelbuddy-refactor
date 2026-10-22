'use client';
import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import type { PackageSchedule } from '@/lib/availability';
import { today } from '@/lib/customer';
export function ScheduleEditor({ value, onChange, packageId }: { value: PackageSchedule; onChange: (value: PackageSchedule) => void; packageId?: string }) {
  const [reserved, setReserved] = useState<{ date: string; time: string; option: number; travelers: number }[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!packageId) return;
    const controller = new AbortController();
    const load = () => { void fetch(`/api/buddy/packages/${packageId}/reservations`, { cache: 'no-store', signal: controller.signal }).then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error); setReserved(body.reservations); setError(''); }).catch(error => { if (error.name !== 'AbortError') setError('Reserved places could not be loaded. Reload to try again.'); }); };
    load(); window.addEventListener('focus', load); const interval = window.setInterval(load, 30000);
    return () => { controller.abort(); window.removeEventListener('focus', load); window.clearInterval(interval); };
  }, [packageId]);
  const exception = (index: number, patch: Partial<PackageSchedule['exceptions'][number]>) => onChange({ ...value, exceptions: value.exceptions.map((item, i) => i === index ? { ...item, ...patch } : item) });
  return <section className="settings-panel" id="package-schedule"><h2>When can travellers join you?</h2><p className="editor-section-help">Choose operating dates and days. Each option’s start times and group size become bookable slots. Confirmed bookings reserve places immediately.</p>
    <div className="editor-field-row"><label className="field">First operating date<input type="date" value={value.startDate} onChange={event => onChange({ ...value, startDate: event.target.value })} /></label><label className="field">Last operating date<input type="date" min={value.startDate} value={value.endDate} onChange={event => onChange({ ...value, endDate: event.target.value })} /></label></div>
    <fieldset className="schedule-weekdays"><legend>Operating days</legend><div>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day, index) => <label key={day}><input type="checkbox" checked={value.weekdays.includes(index)} onChange={event => onChange({ ...value, weekdays: event.target.checked ? [...value.weekdays, index].sort() : value.weekdays.filter(value => value !== index) })} />{day}</label>)}</div></fieldset>
    <h3>Date-specific changes</h3><p className="editor-section-help">Close a date, or open a special date with different start times or capacity. These changes apply to each option on that date.</p>
    {value.exceptions.map((item, index) => <div className="editor-option" key={index}><div className="buddy-form-actions"><label className="field">Date<input type="date" value={item.date} min={value.startDate} max={value.endDate} onChange={event => exception(index, { date: event.target.value })} /></label><button type="button" className="text-link" onClick={() => onChange({ ...value, exceptions: value.exceptions.filter((_, i) => i !== index) })}>Remove date change {index + 1}</button></div>
      <label className="editor-checkbox"><input type="checkbox" checked={item.closed} onChange={event => exception(index, { closed: event.target.checked })} />Closed on this date</label>{!item.closed && <div className="editor-field-row"><label className="field">Special capacity <small>Leave blank for each option’s usual capacity</small><input type="number" min={1} max={12} value={item.capacity ?? ''} onChange={event => exception(index, { capacity: event.target.value ? Number(event.target.value) : undefined })} /></label><label className="field">Special start times <small>Leave blank to keep usual times</small><input value={item.times?.join(',') ?? ''} placeholder="09:00,14:00" onChange={event => exception(index, { times: event.target.value ? event.target.value.split(',') : undefined })} /></label></div>}
    </div>)}{value.exceptions.length < 366 && <button type="button" className="button button-secondary" onClick={() => onChange({ ...value, exceptions: [...value.exceptions, { date: today(), closed: true }] })}><Plus size={16} />Add a date change</button>}
    {packageId && <div className="schedule-reservations"><h3>Reserved places</h3>{error ? <p role="alert">{error}</p> : reserved.length ? <div className="schedule-table-wrap"><table><thead><tr><th>Date</th><th>Start</th><th>Option</th><th>Places reserved</th></tr></thead><tbody>{reserved.map(row => <tr key={`${row.date}-${row.time}-${row.option}`}><td>{row.date}</td><td>{row.time}</td><td>{row.option + 1}</td><td>{row.travelers}</td></tr>)}</tbody></table></div> : <p>No upcoming reservations yet.</p>}<small>All times are Sri Lanka time. Schedule edits cannot remove a booked slot or reduce capacity below reserved places.</small></div>}
  </section>;
}
