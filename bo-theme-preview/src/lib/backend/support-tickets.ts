import { randomUUID } from 'crypto';
import { documentDatabase } from './database';

export function isCareAgent(id: string) {
  return (process.env.SUPPORT_AGENT_ACCOUNT_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean).includes(id);
}
export function careConfigured() { return (process.env.SUPPORT_AGENT_ACCOUNT_IDS ?? '').split(',').some(value => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim())); }
export async function listTickets(accountId: string) {
  const db = documentDatabase();
  return isCareAgent(accountId)
    ? db.$queryRaw`SELECT id, subject, category, status, created_at AS "createdAt", updated_at AS "updatedAt" FROM support_tickets ORDER BY updated_at DESC LIMIT 200`
    : db.$queryRaw`SELECT id, subject, category, status, created_at AS "createdAt", updated_at AS "updatedAt" FROM support_tickets WHERE owner_id = ${accountId}::uuid ORDER BY updated_at DESC LIMIT 200`;
}
export async function ticketDetail(accountId: string, id: string) {
  const db = documentDatabase();
  const rows = await db.$queryRaw<{ id: string; ownerId: string; subject: string; category: string; status: string }[]>`SELECT id, owner_id AS "ownerId", subject, category, status FROM support_tickets WHERE id = ${id}::uuid`;
  const ticket = rows[0];
  if (!ticket || (ticket.ownerId !== accountId && !isCareAgent(accountId))) return null;
  const messages = await db.$queryRaw`SELECT id, sender_role AS "senderRole", body, created_at AS "createdAt" FROM support_ticket_messages WHERE ticket_id = ${id}::uuid ORDER BY created_at, id`;
  return { ...ticket, messages };
}
export async function createTicket(accountId: string, subject: string, category: string, body: string) {
  const id = randomUUID();
  await documentDatabase().$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO support_tickets (id, owner_id, subject, category) VALUES (${id}::uuid, ${accountId}::uuid, ${subject}, ${category})`;
    await tx.$executeRaw`INSERT INTO support_ticket_messages (id, ticket_id, sender_id, sender_role, body) VALUES (${randomUUID()}::uuid, ${id}::uuid, ${accountId}::uuid, 'customer', ${body})`;
  });
  return id;
}
export async function replyTicket(accountId: string, id: string, body: string) {
  const ticket = await ticketDetail(accountId, id);
  if (!ticket || ticket.status !== 'open') return false;
  const role = ticket.ownerId === accountId ? 'customer' : 'care';
  await documentDatabase().$transaction(async tx => {
    await tx.$executeRaw`INSERT INTO support_ticket_messages (id, ticket_id, sender_id, sender_role, body) VALUES (${randomUUID()}::uuid, ${id}::uuid, ${accountId}::uuid, ${role}, ${body})`;
    await tx.$executeRaw`UPDATE support_tickets SET updated_at = CURRENT_TIMESTAMP WHERE id = ${id}::uuid`;
  });
  return true;
}
export async function setTicketStatus(accountId: string, id: string, status: 'open' | 'closed') {
  const ticket = await ticketDetail(accountId, id);
  if (!ticket) return false;
  await documentDatabase().$executeRaw`UPDATE support_tickets SET status = ${status}, updated_at = CURRENT_TIMESTAMP WHERE id = ${id}::uuid`;
  return true;
}
