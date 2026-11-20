import React from 'react';
import { benefitIcons, benefitIconKey, type BenefitIconKey } from '@/lib/benefit-icons';

type Benefit = string | { label: string; icon?: BenefitIconKey };

function BenefitList({ items, included }: { items: Benefit[]; included: boolean }) {
  return <div className={`benefit-column ${included ? 'benefit-included' : 'benefit-excluded'}`}>
    <h3>{included ? 'What’s included' : 'Not included'}</h3>
    {items.length ? <ul>{items.map((item, index) => {
      const label = typeof item === 'string' ? item : item.label;
      const key = typeof item === 'string' ? benefitIconKey(label) : item.icon ?? benefitIconKey(label);
      const Icon = benefitIcons[key];
      return <li key={`${label}-${index}`}><span className="benefit-icon"><Icon size={20} strokeWidth={1.8} aria-hidden="true"/></span><span>{label}</span></li>;
    })}</ul> : <p className="benefit-empty">{included ? 'Check the full package details for inclusions.' : 'No exclusions listed. Check the package details before booking.'}</p>}
  </div>;
}

/** Shared by experience tiles and detail pages, and ready for hotel amenities. */
export function Benefits({ included, notIncluded, compact = false }: { included: Benefit[]; notIncluded: Benefit[]; compact?: boolean }) {
  return <div className={`benefits-grid${compact ? ' benefits-compact' : ''}`}>
    <BenefitList items={included} included/>
    <BenefitList items={notIncluded} included={false}/>
  </div>;
}
