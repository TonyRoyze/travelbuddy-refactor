import assert from 'node:assert/strict';
import { meetingPointLinks } from '../src/lib/meeting-point';
import { experiences } from '../src/lib/catalog';

for (const experience of experiences) {
  const links = meetingPointLinks(experience);
  const google = new URL(links.google);
  assert.equal(google.origin, 'https://www.google.com');
  assert.equal(google.searchParams.get('api'), '1');
  assert.equal(google.searchParams.get('query'), links.query);
  assert.equal(new URL(links.apple).searchParams.get('q'), links.query);
  assert.equal(new URL(links.embed).searchParams.get('output'), 'embed');
  assert.ok(links.query.includes(experience.country));
}
const hotel = meetingPointLinks({ meetingPoint: 'Your hotel in central Dambulla or Sigiriya', destination: 'Sigiriya', country: 'Sri Lanka' });
assert.equal(hotel.pickup, true);
assert.equal(hotel.query, 'Sigiriya, Sri Lanka');
assert.equal(meetingPointLinks({ meetingPoint: 'Tissamaharama hotel lobby', destination: 'Yala', country: 'Sri Lanka' }).pickup, true);
const publicPoint = meetingPointLinks({ meetingPoint: 'Outside the Old Dutch Hospital, Colombo', destination: 'Colombo', country: 'Sri Lanka' });
assert.equal(publicPoint.pickup, false);
assert.ok(publicPoint.query.includes('Old Dutch Hospital'));
const special = meetingPointLinks({ meetingPoint: 'Café & pier #3', destination: 'Amalfi', country: 'Italy' });
assert.equal(new URL(special.google).searchParams.get('query'), 'Café & pier #3, Amalfi, Italy');
assert.equal(meetingPointLinks({ meetingPoint: '', destination: 'Colombo', country: 'Sri Lanka' }).query, 'Colombo, Sri Lanka');
console.log('PASS map links, encoding, country context, pickup areas and missing meeting points');
