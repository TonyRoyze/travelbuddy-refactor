import { z } from 'zod';
import type { Prisma } from '../../generated/documents';
import { documentDatabase } from './database';
import { accountDataSchema } from './documents';
import { ConversationAccessError, MessageRecipientError } from './message-errors';

const accountIdSchema = z.string().uuid();
const messageBodySchema = z.string().trim().min(1).max(1000);

async function requireActiveAccount(tx: Prisma.TransactionClient, id: string) {
  const account = await tx.accountDocument.findUnique({ where: { id } });
  if (!account || account.schemaVersion !== 1 || accountDataSchema.parse(account.data).status !== 'active') {
    throw new MessageRecipientError();
  }
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
      where: { participantOneId_participantTwoId: { participantOneId, participantTwoId } },
      create: { participantOneId, participantTwoId },
      update: {},
      select: { id: true },
    });
  });
}

/** Persist one user-authored message after verifying conversation membership. */
export async function sendMessage(currentAccountId: string, conversationId: string, input: string) {
  const senderId = accountIdSchema.parse(currentAccountId);
  const id = accountIdSchema.parse(conversationId);
  const body = messageBodySchema.parse(input);

  return documentDatabase().$transaction(async tx => {
    const conversation = await tx.conversation.findUnique({ where: { id } });
    if (!conversation || (conversation.participantOneId !== senderId && conversation.participantTwoId !== senderId)) {
      throw new ConversationAccessError();
    }
    const recipientId = conversation.participantOneId === senderId ? conversation.participantTwoId : conversation.participantOneId;
    await requireActiveAccount(tx, senderId);
    await requireActiveAccount(tx, recipientId);
    const message = await tx.message.create({ data: { conversationId: id, senderId, recipientId, body } });
    await tx.conversation.update({ where: { id }, data: { updatedAt: message.createdAt } });
    return message;
  });
}
