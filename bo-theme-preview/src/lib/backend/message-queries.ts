import { documentDatabase } from './database';
import { accountDataSchema } from './documents';
import { ConversationAccessError } from './message-errors';

function accountName(data: unknown) {
  return accountDataSchema.parse(data).displayName;
}

/** List only conversations visible to the current account, newest activity first. */
export async function listConversations(currentAccountId: string) {
  const conversations = await documentDatabase().conversation.findMany({
    where: { OR: [{ participantOneId: currentAccountId }, { participantTwoId: currentAccountId }] },
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: 50,
    include: {
      participantOne: { select: { id: true, data: true } },
      participantTwo: { select: { id: true, data: true } },
      request: { select: { id: true, title: true, destination: true, details: true, closed: true, pickupLocation: true, latitude: true, longitude: true } },
      messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
    },
  });

  return conversations.map(conversation => {
    const other = conversation.participantOneId === currentAccountId ? conversation.participantTwo : conversation.participantOne;
    const latest = conversation.messages[0];
    return {
      id: conversation.id,
      request: conversation.request,
      updatedAt: conversation.updatedAt,
      participant: { id: other.id, displayName: accountName(other.data) },
      latestMessage: latest ? { body: latest.body, senderId: latest.senderId, createdAt: latest.createdAt } : null,
    };
  });
}

/** Read a bounded, newest-first window of messages after checking membership. */
export async function getConversation(currentAccountId: string, conversationId: string) {
  const conversation = await documentDatabase().conversation.findUnique({
    where: { id: conversationId },
    include: {
      participantOne: { select: { id: true, data: true } },
      participantTwo: { select: { id: true, data: true } },
      request: { select: { id: true, title: true, destination: true, details: true, closed: true, pickupLocation: true, latitude: true, longitude: true } },
      messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 },
    },
  });
  if (!conversation || (conversation.participantOneId !== currentAccountId && conversation.participantTwoId !== currentAccountId)) {
    throw new ConversationAccessError();
  }
  const other = conversation.participantOneId === currentAccountId ? conversation.participantTwo : conversation.participantOne;
  return {
    id: conversation.id,
    request: conversation.request,
    participant: { id: other.id, displayName: accountName(other.data) },
    messages: conversation.messages.reverse(),
  };
}
