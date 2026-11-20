import React from 'react';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { Benefits } from '../src/components/Benefits';
import { benefitIconKey } from '../src/lib/benefit-icons';
import { experiences } from '../src/lib/catalog';

const cases = {
  'Local guide': 'guide', 'English-speaking guide': 'guide',
  'All food tastings': 'food', 'Welcome drink': 'drink', 'Extra cocktails': 'cocktail',
  Breakfast: 'breakfast', 'Hotel pickup': 'pickup', 'Hotel pickup outside Tissamaharama': 'pickup',
  'Hotel transfer': 'transport', Gratuities: 'tip', 'Park entry': 'ticket',
  'Hotel room': 'room', 'Room service': 'roomService', 'Free Wi-Fi': 'wifi',
  'Swimming pool': 'pool', 'Air conditioning': 'airConditioning', Parking: 'parking',
  'Something new': 'other', 'Team activity': 'other',
};
for (const [label, icon] of Object.entries(cases)) assert.equal(benefitIconKey(label), icon, label);
for (const experience of experiences) {
  for (const label of [...experience.included, ...experience.notIncluded]) {
    assert.notEqual(benefitIconKey(label), 'other', `Unmapped catalog benefit: ${label}`);
  }
}
const html = renderToStaticMarkup(<Benefits included={['Welcome drink', { label: 'Chef’s special', icon: 'food' }]} notIncluded={['Hotel pickup']}/>);
assert.ok(html.indexOf('benefit-included') < html.indexOf('benefit-excluded'));
for (const expected of ['lucide-glass-water', 'lucide-utensils', 'lucide-car', 'Welcome drink', 'Hotel pickup', 'What’s included', 'Not included']) assert.ok(html.includes(expected), expected);
assert.ok(!html.includes('lucide-check'));
assert.ok(!html.includes('lucide-x'));
assert.ok(renderToStaticMarkup(<Benefits included={[]} notIncluded={[]}/>).includes('No exclusions listed'));
console.log('PASS benefit icon mapping, catalog coverage, explicit overrides, column order, labels and empty states');
