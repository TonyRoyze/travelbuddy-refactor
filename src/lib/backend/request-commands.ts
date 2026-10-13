import { z } from 'zod';
import type { Prisma } from '../../generated/documents';
import { documentDatabase } from './database';
import { accountDataSchema } from './documents';
import { coordinatesSchema, customPackageSchema, type CustomPackage } from '../inbox';

export const travelRequestSchema = z.object({
  title: z.string().trim().min(3).max(120),
  destination: z.string().trim().min(2).max(120),
  details: z.string().trim().min(10).max(2000),
  pickupLocation: z.string().trim().min(2).max(200).optional(),
  location: coordinatesSchema.optional(),
}).strict().refine(value => !value.location || Boolean(value.pickupLocation), { message: 'Name your pickup or current location.', path: ['pickupLocation'] });
export class RequestAccessError extends Error {
  constructor(public status: 403 | 404 | 409, message: string) { super(message); }
}

async function activeAccount(tx: Prisma.TransactionClient, id: string) {
  const record = await tx.accountDocument.findUnique({ where: { id } });
  if (!record || record.schemaVersion !== 1) throw new RequestAccessError(403, 'Your account is unavailable.');
  const account = accountDataSchema.parse(record.data);
  if (account.status !== 'active' || account.onboarding !== 'completed') throw new RequestAccessError(403, 'Complete your active account to use the inbox.');
  return account;
}

export async function createTravelRequest(accountId: string, input: unknown) {
  const { location, ...data } = travelRequestSchema.parse(input);
  return documentDatabase().$transaction(async tx => {
    const account = await activeAccount(tx, accountId);
    if (!account.roles.includes('traveler')) throw new RequestAccessError(403, 'Only travellers can post requests.');
    return tx.travelRequest.create({ data: { ...data, ...location, travelerId: accountId } });
  });
}

export async function closeTravelRequest(accountId: string, requestId: string) {
  return documentDatabase().$transaction(async tx => {
    await activeAccount(tx, accountId);
    const result = await tx.travelRequest.updateMany({ where: { id: requestId, travelerId: accountId }, data: { closed: true } });
    if (!result.count) throw new RequestAccessError(404, 'That request is unavailable.');
  });
}

export async function replyToTravelRequest(accountId: string, requestId: string, input: string, packageInput?: CustomPackage) {
  const body = z.string().trim().min(1).max(1000).parse(input);
  const offer = packageInput ? customPackageSchema.parse(packageInput) : undefined;
  return documentDatabase().$transaction(async tx => {
    const account = await activeAccount(tx, accountId);
    if (!account.roles.some(role => role === 'provider' || role === 'guide')) throw new RequestAccessError(403, 'Only buddies and guides can reply to requests.');
    // Serialize closing and responding so a closed request cannot acquire a new reply.
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM travelbuddy_backend.travel_requests WHERE id = ${requestId}::uuid FOR UPDATE`;
    if (!rows.length) throw new RequestAccessError(404, 'That request is unavailable.');
    const request = await tx.travelRequest.findUniqueOrThrow({ where: { id: requestId } });
    if (request.closed) throw new RequestAccessError(409, 'This request is closed to new replies.');
    if (request.travelerId === accountId) throw new RequestAccessError(403, 'You cannot reply to your own request.');
    await activeAccount(tx, request.travelerId);
    const [participantOneId, participantTwoId] = [accountId, request.travelerId].sort();
    const contextKey = request.id;
    const conversation = await tx.conversation.upsert({
      where: { participantOneId_participantTwoId_contextKey: { participantOneId, participantTwoId, contextKey } },
      create: { participantOneId, participantTwoId, contextKey, requestId: request.id },
      update: {},
      select: { id: true },
    });
    const message = await tx.message.create({ data: { conversationId: conversation.id, senderId: accountId, recipientId: request.travelerId, body, ...(offer ? { package: offer } : {}) } });
    await tx.conversation.update({ where: { id: conversation.id }, data: { updatedAt: message.createdAt } });
    return conversation;
  });
}
