import { z } from 'zod';
import type { Prisma } from '../../generated/documents';
import { documentDatabase } from './database';
import { accountDataSchema } from './documents';
import { ConversationAccessError, MessageRecipientError } from './message-errors';
import { customPackageSchema, type CustomPackage } from '../inbox';
import { RequestAccessError } from './request-commands';

const accountIdSchema = z.string().uuid();
const messageBodySchema = z.string().trim().min(1).max(1000);

async function requireActiveAccount(tx: Prisma.TransactionClient, id: string) {
  const account = await tx.accountDocument.findUnique({ where: { id } });
  if (!account || account.schemaVersion !== 1 || accountDataSchema.parse(account.data).status !== 'active') {
    throw new MessageRecipientError();
  }
  return accountDataSchema.parse(account.data);
}

/** Start or return the unique conversation shared by two active accounts. */
export async function startConversation(currentAccountId: string, recipientAccountId: string) {
  const current = accountIdSchema.parse(currentAccountId);
  const recipient = accountIdSchema.parse(recipientAccountId);
  if (current === recipient) throw new MessageRecipientError();
  const [participantOneId, participantTwoId] = [current, recipient].sort();

  return documentDatabase().$transaction(async tx => {
    await requireActiveAccount(tx, current);
    await requireActiveAccount(tx, recipient);
    return tx.conversation.upsert({
      where: { participantOneId_participantTwoId_contextKey: { participantOneId, participantTwoId, contextKey: 'direct' } },
      create: { participantOneId, participantTwoId },
      update: {},
      select: { id: true },
    });
  });
}

/** Persist one user-authored message after verifying conversation membership. */
export async function sendMessage(currentAccountId: string, conversationId: string, input: string, packageInput?: CustomPackage) {
  const senderId = accountIdSchema.parse(currentAccountId);
  const id = accountIdSchema.parse(conversationId);
  const body = messageBodySchema.parse(input);
  const offer = packageInput ? customPackageSchema.parse(packageInput) : undefined;

  return documentDatabase().$transaction(async tx => {
    const conversation = await tx.conversation.findUnique({ where: { id } });
    if (!conversation || (conversation.participantOneId !== senderId && conversation.participantTwoId !== senderId)) {
      throw new ConversationAccessError();
    }
    const recipientId = conversation.participantOneId === senderId ? conversation.participantTwoId : conversation.participantOneId;
    const sender = await requireActiveAccount(tx, senderId);
    if (offer && (!sender.roles.some(role => role === 'provider' || role === 'guide') || sender.onboarding !== 'completed')) {
      throw new RequestAccessError(403, 'Only buddies and guides can send custom packages.');
    }
    if (offer && !conversation.requestId) throw new RequestAccessError(403, 'Send a custom package in a request conversation.');
    if (offer) {
      const request = await tx.travelRequest.findUniqueOrThrow({ where: { id: conversation.requestId! } });
      if (request.travelerId === senderId) throw new RequestAccessError(403, 'Only the responding buddy or guide can offer a package.');
    }
    await requireActiveAccount(tx, recipientId);
    const message = await tx.message.create({ data: { conversationId: id, senderId, recipientId, body, ...(offer ? { package: offer } : {}) } });
    await tx.conversation.update({ where: { id }, data: { updatedAt: message.createdAt } });
    return message;
  });
}

/** Resolve the host on the server; never accept a caller-supplied package recipient. */
export async function startPackageConversation(currentAccountId: string, packageId: string) {
  const current = accountIdSchema.parse(currentAccountId);
  return documentDatabase().$transaction(async tx => {
    const sender = await requireActiveAccount(tx, current);
    if (sender.onboarding !== 'completed') throw new RequestAccessError(403, 'Complete your account to chat with a provider.');
    // Serialize starts with package changes and concurrent starts of the same thread.
    await tx.$queryRaw`SELECT id FROM travelbuddy_backend.packages WHERE id = ${packageId} FOR UPDATE`;
    const pack = await tx.experiencePackage.findUnique({ where: { id: packageId } });
    if (!pack?.published) throw new RequestAccessError(404, 'This package is no longer available.');
    if (!pack.ownerId) throw new RequestAccessError(409, 'This listing does not have a provider available for chat.');
    if (pack.ownerId === current) throw new RequestAccessError(409, 'You cannot start a chat with yourself.');
    const host = await requireActiveAccount(tx, pack.ownerId);
    if (host.onboarding !== 'completed' || !host.roles.some(role => role === 'provider' || role === 'guide')) throw new MessageRecipientError();
    const [participantOneId, participantTwoId] = [current, pack.ownerId].sort();
    const contextKey = `package:${packageId}`;
    return tx.conversation.upsert({
      where: { participantOneId_participantTwoId_contextKey: { participantOneId, participantTwoId, contextKey } },
      create: { participantOneId, participantTwoId, contextKey, packageId }, update: {}, select: { id: true },
    });
  });
}
