import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/backend/auth-security';
import { sessionAccount } from '@/lib/backend/sessions';
import { replyTicket, setTicketStatus, ticketDetail } from '@/lib/backend/support-tickets';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const inputSchema = z.discriminatedUnion('action', [z.object({ action: z.literal('reply'), body: z.string().trim().min(1).max(2000) }).strict(), z.object({ action: z.literal('status'), status: z.enum(['open', 'closed']) }).strict()]);
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try { const account = await sessionAccount(request); if (!account) return NextResponse.json({ error: 'Sign in to view this ticket.' }, { status: 401, headers }); const id = z.string().uuid().parse(params.id); const ticket = await ticketDetail(account.id, id); if (!ticket) return NextResponse.json({ error: 'Ticket unavailable.' }, { status: 404, headers }); return NextResponse.json({ ticket }, { headers }); }
  catch (error) { return NextResponse.json({ error: 'Ticket unavailable.' }, { status: error instanceof z.ZodError ? 404 : 503, headers }); }
}
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers });
    const account = await sessionAccount(request); if (!account) return NextResponse.json({ error: 'Sign in to update this ticket.' }, { status: 401, headers });
    const id = z.string().uuid().parse(params.id); if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers });
    const text = await request.text(); if (text.length > 12000) return NextResponse.json({ error: 'Message is too long.' }, { status: 400, headers });
    const input = inputSchema.parse(JSON.parse(text));
    const updated = input.action === 'reply' ? await replyTicket(account.id, id, input.body) : await setTicketStatus(account.id, id, input.status);
    if (!updated) return NextResponse.json({ error: 'Ticket unavailable or closed.' }, { status: 404, headers });
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) { return NextResponse.json({ error: 'Your update could not be saved.' }, { status: error instanceof z.ZodError || error instanceof SyntaxError ? 400 : 503, headers }); }
}
