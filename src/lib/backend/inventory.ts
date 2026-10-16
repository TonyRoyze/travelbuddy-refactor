import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Prisma, ExperiencePackage, ScheduledBooking } from '../../generated/documents';
import { documentDatabase } from './database';
import { packageDataSchema } from './packages';
import { BuddyError } from './buddy-access';
import { dateSchema, readSchedule, scheduledSlots, timeSchema, type PackageSchedule } from '../availability';
import { addDays, today } from '../customer';

export const checkoutSchema = z.object({
  idempotencyKey: z.string().uuid(), travelerName: z.string().trim().min(2).max(120), travelerEmail: z.string().trim().email().max(320),
  items: z.array(z.object({ id: z.string().uuid(), experienceId: z.string().min(1).max(80), option: z.number().int().min(0).max(7), date: dateSchema, time: timeSchema, travelers: z.number().int().min(1).max(12) }).strict()).min(1).max(20)
    .refine(items => new Set(items.map(item => item.id)).size === items.length, 'Each cart item must be unique.'),
}).strict();
export type CheckoutInput = z.infer<typeof checkoutSchema>;
const dbDate = (date: string) => new Date(date + 'T00:00:00Z');
const dateString = (date: Date) => date.toISOString().slice(0, 10);
const activeOwner = { OR: [{ ownerId: null }, { owner: { data: { path: ['status'], equals: 'active' } } }] };

export function publicBooking(booking: ScheduledBooking, travelerId: string) {
  const experience = packageDataSchema.parse(booking.snapshot);
  const start = new Date(`${dateString(booking.date)}T${booking.time}:00+05:30`).getTime();
  return { id: booking.id, orderId: booking.orderId, experienceId: booking.packageId, option: booking.optionIndex,
    date: dateString(booking.date), time: booking.time, travelers: booking.travelers, owner: travelerId,
    status: booking.status === 'cancelled' ? 'Cancelled' as const : start + durationMinutes(experience.duration) * 60000 <= Date.now() ? 'Completed' as const : 'Upcoming' as const,
    reference: `TB-${booking.id.slice(0, 8).toUpperCase()}`, total: Number(booking.total), created: booking.createdAt.toISOString(),
    travelerName: booking.travelerName, travelerEmail: booking.travelerEmail, experience,
  };
}
function durationMinutes(value: string) { const amount = parseFloat(value); return value.includes('minute') ? amount : amount * 60; }
export async function travelerBookings(travelerId: string) {
  const rows = await documentDatabase().scheduledBooking.findMany({ where: { order: { travelerId } }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: 1000 });
  return rows.map(row => publicBooking(row, travelerId));
}

export async function packageAvailability(id: string, date: string, option: number, travelers = 1) {
  const db = documentDatabase();
  const pack = await db.experiencePackage.findFirst({ where: { id, published: true, ...activeOwner } });
  if (!pack) throw new BuddyError('Experience not found.', 404);
  const experience = packageDataSchema.parse(pack.data); const schedule = readSchedule(pack.schedule);
  if (!experience.options[option]) throw new BuddyError('Choose a valid experience option.', 400);
  const last = addDays(today(), 180);
  const totals = await db.scheduledBooking.groupBy({ by: ['date', 'time'], where: { packageId: id, optionIndex: option, status: 'confirmed', date: { gte: dbDate(today()), lte: dbDate(last) } }, _sum: { travelers: true } });
  const used = new Map(totals.map(row => [`${dateString(row.date)}:${row.time}`, row._sum.travelers ?? 0]));
  const slotsFor = (day: string) => scheduledSlots(experience, schedule, day, option).map(slot => ({ ...slot, remaining: Math.max(0, slot.capacity - (used.get(`${day}:${slot.time}`) ?? 0)) }));
  let next: { date: string; time: string } | null = null;
  for (let day = date < today() ? today() : date; day <= last; day = addDays(day, 1)) {
    const found = slotsFor(day).find(slot => slot.remaining >= travelers);
    if (found) { next = { date: day, time: found.time }; break; }
  }
  return { date, slots: slotsFor(date), next };
}

// Every writer acquires the same package row locks, in ID order. Capacity checks,
// reservation creation, cancellation and schedule changes therefore serialize.
export async function reserveBookings(travelerId: string, input: CheckoutInput) {
  const db = documentDatabase();
  const fingerprint = createHash('sha256').update(JSON.stringify({ ...input, idempotencyKey: undefined })).digest('hex');
  const replay = async (tx: Prisma.TransactionClient) => {
    const order = await tx.bookingOrder.findUnique({ where: { travelerId_idempotencyKey: { travelerId, idempotencyKey: input.idempotencyKey } }, include: { bookings: { orderBy: { id: 'asc' } } } });
    if (!order) return null;
    if (order.fingerprint !== fingerprint) throw new BuddyError('This checkout attempt has different details. Start a new checkout.', 409);
    return order.bookings.map(row => publicBooking(row, travelerId));
  };
  try {
    return await db.$transaction(async tx => {
      const ids = [...new Set(input.items.map(item => item.experienceId))].sort();
      for (const id of ids) await tx.$queryRaw`SELECT id FROM travelbuddy_backend.packages WHERE id = ${id} FOR UPDATE`;
      const previous = await replay(tx); if (previous) return previous;
      const packages = await tx.experiencePackage.findMany({ where: { id: { in: ids }, published: true, ...activeOwner } });
      if (packages.length !== ids.length) throw new BuddyError('An experience is no longer available. Review your cart.', 409);
      const order = await tx.bookingOrder.create({ data: { travelerId, idempotencyKey: input.idempotencyKey, fingerprint } });
      const result = [];
      for (const item of input.items) {
        const pack = packages.find(pack => pack.id === item.experienceId)!;
        if (pack.ownerId === travelerId) throw new BuddyError('You cannot book your own package.', 400);
        const experience = packageDataSchema.parse(pack.data);
        const slot = scheduledSlots(experience, readSchedule(pack.schedule), item.date, item.option).find(slot => slot.time === item.time);
        if (!slot) throw new BuddyError(`${experience.title}: that date or start time is unavailable. Choose another time.`, 409);
        const used = await tx.scheduledBooking.aggregate({ where: { packageId: pack.id, optionIndex: item.option, date: dbDate(item.date), time: item.time, status: 'confirmed' }, _sum: { travelers: true } });
        if ((used._sum.travelers ?? 0) + item.travelers > slot.capacity) throw new BuddyError(`${experience.title}: only ${Math.max(0, slot.capacity - (used._sum.travelers ?? 0))} places remain. Review your cart.`, 409);
        const cents = Math.round(experience.options[item.option].price * 100) * item.travelers;
        const booking = await tx.scheduledBooking.create({ data: { orderId: order.id, packageId: pack.id, optionIndex: item.option, date: dbDate(item.date), time: item.time,
          travelers: item.travelers, total: (cents / 100).toFixed(2), travelerName: input.travelerName, travelerEmail: input.travelerEmail, snapshot: experience } });
        result.push(publicBooking(booking, travelerId));
      }
      return result;
    }, { maxWait: 10000, timeout: 20000 });
  } catch (error) {
    // Concurrent retries with different package sets can reach the unique order constraint.
    if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') { const previous = await replay(db); if (previous) return previous; }
    throw error;
  }
}

export async function cancelReservation(travelerId: string, id: string) {
  const db = documentDatabase();
  const existing = await db.scheduledBooking.findFirst({ where: { id, order: { travelerId } } });
  if (!existing) throw new BuddyError('Booking not found.', 404);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM travelbuddy_backend.packages WHERE id = ${existing.packageId} FOR UPDATE`;
    const booking = await tx.scheduledBooking.findFirstOrThrow({ where: { id, order: { travelerId } } });
    if (booking.status === 'cancelled') return publicBooking(booking, travelerId);
    const snapshot = packageDataSchema.parse(booking.snapshot);
    const start = new Date(`${dateString(booking.date)}T${booking.time}:00+05:30`).getTime();
    if (!snapshot.freeCancellation || start - Date.now() < 86400000) throw new BuddyError('This booking is outside its free cancellation period.', 409);
    return publicBooking(await tx.scheduledBooking.update({ where: { id }, data: { status: 'cancelled' } }), travelerId);
  });
}

export async function protectReservedSlots(tx: Prisma.TransactionClient, pack: ExperiencePackage, next: { options: { name: string; times: string[]; capacity?: number }[] }, schedule: PackageSchedule) {
  const active = await tx.scheduledBooking.groupBy({ by: ['date', 'time', 'optionIndex'], where: { packageId: pack.id, status: 'confirmed', date: { gte: dbDate(today()) } }, _sum: { travelers: true } });
  const previous = packageDataSchema.parse(pack.data);
  for (const row of active) {
    const date = dateString(row.date);
    if (new Date(`${date}T${row.time}:00+05:30`).getTime() <= Date.now()) continue;
    const slot = scheduledSlots(next, schedule, date, row.optionIndex).find(slot => slot.time === row.time);
    if (next.options[row.optionIndex]?.name !== previous.options[row.optionIndex]?.name || !slot || slot.capacity < (row._sum.travelers ?? 0)) {
      throw new BuddyError(`There are confirmed bookings on ${date} at ${row.time}. Keep that option, start time and enough capacity.`, 409);
    }
  }
}
