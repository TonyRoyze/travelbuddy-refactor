import { randomUUID } from 'node:crypto';
import type { ExperiencePackage } from '../../generated/documents';
import { packageEditorSchema, mediaUrl, type PackageEditorData } from '../package-editor';
import { documentDatabase } from './database';
import { packageDataSchema } from './packages';
import { BuddyError } from './buddy-access';
import { requireOwnedMedia } from './media';
import { readSchedule } from '../availability';
import { protectReservedSlots } from './inventory';

export function editorPackage(row: ExperiencePackage) {
  const data = packageDataSchema.parse(row.data);
  return { id: row.id, revision: row.revision, updatedAt: row.updatedAt.toISOString(), input: {
    title: data.title, schedule: readSchedule(row.schedule), destination: data.destination, country: data.country, category: data.category, description: data.description,
    durationMinutes: row.durationMinutes, languages: data.languages,
    imageIds: data.gallery.map(url => url.replace('/api/media/', '')), videoIds: data.videoIds ?? [],
    highlights: data.highlights, included: data.included, notIncluded: data.notIncluded, meetingPoint: data.meetingPoint,
    freeCancellation: data.freeCancellation, pickup: data.pickup, options: data.options.map(option => ({ name: option.name, price: option.price, capacity: option.capacity ?? 12, times: option.times })),
    itinerary: data.itinerary, published: row.published, revision: row.revision,
  } satisfies PackageEditorData };
}

export async function saveBuddyPackage(ownerId: string, displayName: string, raw: unknown, id?: string) {
  const parsed = packageEditorSchema.safeParse(raw);
  if (!parsed.success) throw new BuddyError(parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).slice(0, 3).join(' '), 400);
  const input = parsed.data;
  const db = documentDatabase();
  let previous: ExperiencePackage | null = null;
  if (id) {
    previous = await db.experiencePackage.findFirst({ where: { id, ownerId } });
    if (!previous) throw new BuddyError('Package not found.', 404);
    if (input.revision !== previous.revision) throw new BuddyError('This package changed. Reload before saving.', 409);
  } else if (await db.experiencePackage.count({ where: { ownerId } }) >= 100) {
    throw new BuddyError('You can keep up to 100 packages.', 400);
  }
  await Promise.all([requireOwnedMedia(ownerId, input.imageIds, 'image'), requireOwnedMedia(ownerId, input.videoIds, 'video')]);
  const packageId = id ?? `buddy-${randomUUID()}`;
  const duration = input.durationMinutes % 60 === 0 ? `${input.durationMinutes / 60} hours` : `${input.durationMinutes} minutes`;
  const price = Math.min(...input.options.map(option => option.price));
  const priorData = previous ? packageDataSchema.parse(previous.data) : null;
  const data = packageDataSchema.parse({
    id: packageId, title: input.title, destination: input.destination, country: input.country, category: input.category,
    image: input.imageIds.length ? mediaUrl(input.imageIds[0]) : '/brand/buddy-mark.svg', gallery: input.imageIds.map(mediaUrl),
    rating: priorData?.rating ?? 0, reviews: priorData?.reviews ?? 0, price, duration,
    freeCancellation: input.freeCancellation, payLater: false, pickup: input.pickup,
    languages: input.languages, supplier: displayName, description: input.description, highlights: input.highlights,
    included: input.included, notIncluded: input.notIncluded, meetingPoint: input.meetingPoint,
    options: input.options.map(option => ({ ...option, duration, detail: `Up to ${option.capacity} travellers` })),
    itinerary: input.itinerary, videoIds: input.videoIds,
  });
  const fields = {
    schedule: input.schedule ?? readSchedule(previous?.schedule),
    title: input.title, destination: input.destination, country: input.country, category: input.category,
    price, durationMinutes: input.durationMinutes, duration, freeCancellation: input.freeCancellation,
    published: input.published, data,
  };
  if (!id) return editorPackage(await db.experiencePackage.create({ data: { id: packageId, ownerId, ...fields, rating: 0 } }));
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM travelbuddy_backend.packages WHERE id = ${id} FOR UPDATE`;
    const locked = await tx.experiencePackage.findFirst({ where: { id, ownerId } });
    if (!locked || locked.revision !== input.revision) throw new BuddyError('This package changed. Reload before saving.', 409);
    await protectReservedSlots(tx, locked, data, fields.schedule);
    const result = await tx.experiencePackage.updateMany({ where: { id, ownerId, revision: input.revision }, data: { ...fields, revision: { increment: 1 } } });
    if (result.count !== 1) throw new BuddyError('This package changed. Reload before saving.', 409);
    return editorPackage(await tx.experiencePackage.findUniqueOrThrow({ where: { id } }));
  });
}
