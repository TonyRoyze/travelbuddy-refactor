'use client';
import { useState, type FormEvent } from 'react';
import { Car, Package, PersonStanding } from 'lucide-react';
import { customPackageSchema, type CustomPackage } from '@/lib/inbox';

export function CustomPackageCard({ offer }: { offer: CustomPackage }) {
  return <div className="custom-package-card"><span className="custom-package-label"><Package size={16}/>Custom package</span><h3>{offer.title}</h3><p>{offer.description}</p><div className="custom-package-price"><strong>{new Intl.NumberFormat('en-US', { style: 'currency', currency: offer.currency }).format(offer.price)}</strong><span>Total package price · {offer.currency}</span></div><div className="custom-package-vehicle">{offer.hasVehicle ? <Car size={18}/> : <PersonStanding size={18}/>}<span>{offer.hasVehicle ? `Vehicle available: ${offer.vehicleDetails}` : 'No vehicle included'}</span></div></div>;
}

export function CustomPackageForm({ onSubmit, busy, error }: { onSubmit: (offer: CustomPackage) => Promise<void>; busy: boolean; error: string }) {
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [price, setPrice] = useState(''); const [currency, setCurrency] = useState<'USD' | 'LKR'>('LKR');
  const [hasVehicle, setHasVehicle] = useState(false); const [vehicleDetails, setVehicleDetails] = useState(''); const [validation, setValidation] = useState('');
  function submit(event: FormEvent) {
    event.preventDefault();
    const result = customPackageSchema.safeParse({ title, description, price: Number(price), currency, hasVehicle, ...(hasVehicle ? { vehicleDetails } : {}) });
    if (!result.success) { setValidation(result.error.issues[0]?.message ?? 'Check your package details.'); return; }
    setValidation(''); void onSubmit(result.data);
  }
  return <form className="request-form" onSubmit={submit} aria-busy={busy}><p>Send a package tailored to this traveller. The price and vehicle details stay in your private conversation.</p><fieldset disabled={busy}>
    <label className="field">Package title<input value={title} onChange={event => setTitle(event.target.value)} required minLength={3} maxLength={120} placeholder="Sunrise walk, pickup and local breakfast"/></label>
    <label className="field">What’s included<textarea value={description} onChange={event => setDescription(event.target.value)} required minLength={10} maxLength={1000} rows={4} placeholder="Describe the plan, group size, duration and everything included in your price."/></label>
    <div className="package-price-fields"><label className="field">Total price<input type="number" min="0.01" max="10000000" step="0.01" value={price} onChange={event => setPrice(event.target.value)} required placeholder="8500"/></label><label className="field">Currency<select value={currency} onChange={event => setCurrency(event.target.value as 'USD' | 'LKR')}><option value="LKR">LKR</option><option value="USD">USD</option></select></label></div>
    <fieldset className="package-vehicle-choice"><legend>Do you have a vehicle for this package?</legend><label><input type="radio" name="vehicle" checked={hasVehicle} onChange={() => setHasVehicle(true)}/>Yes, vehicle available</label><label><input type="radio" name="vehicle" checked={!hasVehicle} onChange={() => setHasVehicle(false)}/>No vehicle</label></fieldset>
    {hasVehicle && <label className="field">Vehicle details<input value={vehicleDetails} onChange={event => setVehicleDetails(event.target.value)} required maxLength={120} placeholder="Air-conditioned car, seats 3 travellers"/></label>}
  </fieldset>{(validation || error) && <p className="error-message" role="alert">{validation || error}</p>}<button className="button button-primary button-wide" disabled={busy}>{busy ? 'Sending package…' : 'Send custom package'}</button></form>;
}
