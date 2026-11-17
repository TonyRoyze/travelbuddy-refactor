import { z } from 'zod';
import type { Prisma } from '../../generated/documents';
import { documentDatabase } from './database';

const optionSchema = z.object({
  name: z.string(), price: z.number().nonnegative(), duration: z.string(), detail: z.string(),
  times: z.array(z.string()), capacity: z.number().int().positive().optional(),
}).strict();

export const packageDataSchema = z.object({
  id: z.string().min(1).max(80), title: z.string().min(1).max(200),
  destination: z.string().min(1).max(120), country: z.string().min(1).max(120),
  category: z.string().min(1).max(80), image: z.string().min(1), gallery: z.array(z.string()),
  rating: z.number().min(0).max(5), reviews: z.number().int().nonnegative(), price: z.number().nonnegative(),
  originalPrice: z.number().nonnegative().optional(), duration: z.string().min(1).max(80), tag: z.string().optional(),
  freeCancellation: z.boolean(), payLater: z.boolean(), pickup: z.boolean(), languages: z.array(z.string()),
  supplier: z.string(), description: z.string(), highlights: z.array(z.string()), included: z.array(z.string()),
  notIncluded: z.array(z.string()), meetingPoint: z.string(), options: z.array(optionSchema),
  itinerary: z.array(z.object({ time: z.string(), title: z.string(), detail: z.string() }).strict()),
}).strict();

export const packageSearchParamsSchema = z.object({
  q: z.string().trim().max(120).optional(),
  destination: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  minPrice: z.coerce.number().finite().min(0).max(100000).optional(),
  maxPrice: z.coerce.number().finite().min(0).max(100000).optional(),
  duration: z.enum(['short', 'long']).optional(),
  freeCancellation: z.enum(['true', 'false']).optional(),
  sort: z.enum(['recommended', 'price-low', 'rating']).default('recommended'),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(24),
}).strict().refine(value => value.minPrice === undefined || value.maxPrice === undefined || value.minPrice <= value.maxPrice, {
  message: 'Minimum price must not exceed maximum price.',
});

export type PackageSearch = {
  q?: string;
  destination?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  duration?: 'short' | 'long';
  freeCancellation?: boolean;
  sort: 'recommended' | 'price-low' | 'rating';
  page: number;
  pageSize: number;
};

function searchText(value: string) { return { contains: value, mode: 'insensitive' as const }; }

export function packageWhere(filters: PackageSearch): Prisma.ExperiencePackageWhereInput {
  const and: Prisma.ExperiencePackageWhereInput[] = [{ published: true }];
  if (filters.q) and.push({ OR: [
    { title: searchText(filters.q) }, { destination: searchText(filters.q) },
    { country: searchText(filters.q) }, { category: searchText(filters.q) },
  ] });
  if (filters.destination) and.push({ destination: searchText(filters.destination) });
  if (filters.category) and.push({ category: { equals: filters.category, mode: 'insensitive' } });
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) and.push({ price: {
    ...(filters.minPrice !== undefined ? { gte: filters.minPrice } : {}),
    ...(filters.maxPrice !== undefined ? { lte: filters.maxPrice } : {}),
  } });
  if (filters.duration) and.push({ durationMinutes: filters.duration === 'short' ? { lte: 240 } : { gt: 240 } });
  if (filters.freeCancellation) and.push({ freeCancellation: true });

  return { AND: and };
}

export async function searchPackages(filters: PackageSearch) {
  const where = packageWhere(filters);
  const orderBy: Prisma.ExperiencePackageOrderByWithRelationInput[] = filters.sort === 'price-low'
    ? [{ price: 'asc' }, { id: 'asc' }]
    : filters.sort === 'rating'
      ? [{ rating: 'desc' }, { id: 'asc' }]
      : [{ sortOrder: 'asc' }, { id: 'asc' }];
  const db = documentDatabase();
  const [rows, total] = await Promise.all([
    db.experiencePackage.findMany({ where, orderBy, skip: (filters.page - 1) * filters.pageSize, take: filters.pageSize, select: { id: true, data: true } }),
    db.experiencePackage.count({ where }),
  ]);
  const packages = rows.map(row => {
    const item = packageDataSchema.parse(row.data);
    if (item.id !== row.id) throw new Error('Package document ID does not match its record.');
    return item;
  });
  return { packages, total, page: filters.page, pageSize: filters.pageSize };
}

export type PackageSuggestion = { value: string; kind: 'destination' | 'country' | 'category' | 'package' };

export async function suggestPackages(query: string): Promise<PackageSuggestion[]> {
  const normalizedQuery = query.toLocaleLowerCase();
  const db = documentDatabase();
  const [destinations, countries, categories, packages] = await Promise.all([
    db.experiencePackage.groupBy({
      by: ['destination'], where: { published: true, destination: searchText(query) },
      orderBy: { destination: 'asc' }, take: 5,
    }),
    db.experiencePackage.groupBy({
      by: ['country'], where: { published: true, country: searchText(query) },
      orderBy: { country: 'asc' }, take: 4,
    }),
    db.experiencePackage.groupBy({
      by: ['category'], where: { published: true, category: searchText(query) },
      orderBy: { category: 'asc' }, take: 4,
    }),
    db.experiencePackage.findMany({
      where: { published: true, title: searchText(query) },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], take: 6,
      select: { title: true },
    }),
  ]);

  const suggestions: PackageSuggestion[] = [
    ...destinations.map(({ destination }) => ({ value: destination, kind: 'destination' as const })),
    ...countries.map(({ country }) => ({ value: country, kind: 'country' as const })),
    ...categories.map(({ category }) => ({ value: category, kind: 'category' as const })),
    ...packages.map(({ title }) => ({ value: title, kind: 'package' as const })),
  ];
  const seen = new Set<string>();
  return suggestions
    .filter(item => {
      const key = `${item.kind}:${item.value.toLocaleLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(!a.value.toLocaleLowerCase().startsWith(normalizedQuery)) - Number(!b.value.toLocaleLowerCase().startsWith(normalizedQuery)) || a.value.localeCompare(b.value))
    .slice(0, 8);
}
