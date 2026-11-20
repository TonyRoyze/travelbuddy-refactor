import assert from 'node:assert/strict';
import { experiences } from '../src/lib/catalog';
import { packageDataSchema, packageSearchParamsSchema, packageWhere } from '../src/lib/backend/packages';
import { localSearchSuggestions } from '../src/lib/search-suggestions';

for (const experience of experiences) {
  assert.equal(packageDataSchema.parse(experience).id, experience.id);
}

const defaults = packageSearchParamsSchema.parse({});
assert.deepEqual({ ...defaults, freeCancellation: defaults.freeCancellation === 'true' }, {
  sort: 'recommended', page: 1, pageSize: 24, freeCancellation: false,
});
assert.deepEqual(packageWhere({ ...defaults, freeCancellation: false }), { AND: [{ published: true }] });

const filters = packageSearchParamsSchema.parse({
  q: '  Sigiriya  ', destination: 'Ella', category: 'Day trips',
  minPrice: '20', maxPrice: '80', duration: 'long', freeCancellation: 'true',
  sort: 'price-low', page: '2', pageSize: '12',
});
assert.deepEqual({ ...filters, freeCancellation: filters.freeCancellation === 'true' }, {
  q: 'Sigiriya', destination: 'Ella', category: 'Day trips', minPrice: 20, maxPrice: 80,
  duration: 'long', freeCancellation: true, sort: 'price-low', page: 2, pageSize: 12,
});

const query = packageWhere({ ...filters, freeCancellation: filters.freeCancellation === 'true' });
assert.deepEqual(query, { AND: [
  { published: true },
  { OR: [
    { title: { contains: 'Sigiriya', mode: 'insensitive' } },
    { destination: { contains: 'Sigiriya', mode: 'insensitive' } },
    { country: { contains: 'Sigiriya', mode: 'insensitive' } },
    { category: { contains: 'Sigiriya', mode: 'insensitive' } },
  ] },
  { destination: { contains: 'Ella', mode: 'insensitive' } },
  { category: { equals: 'Day trips', mode: 'insensitive' } },
  { price: { gte: 20, lte: 80 } },
  { durationMinutes: { gt: 240 } },
  { freeCancellation: true },
] });

assert.throws(() => packageSearchParamsSchema.parse({ minPrice: '90', maxPrice: '20' }));
assert.throws(() => packageSearchParamsSchema.parse({ duration: 'overnight' }));
assert.throws(() => packageSearchParamsSchema.parse({ pageSize: '51' }));
assert.equal(localSearchSuggestions('CoL')[0]?.value, 'Colombo');
assert.equal(localSearchSuggestions('sig')[0]?.value, 'Sigiriya');
assert.deepEqual(localSearchSuggestions('xqzz'), []);
console.log(`Package catalog payload and search-filter checks passed (${experiences.length} sample packages).`);
