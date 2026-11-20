import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/backend/auth-security';
import { sessionAccount } from '@/lib/backend/sessions';
import { careConfigured, createTicket, isCareAgent, listTickets } from '@/lib/backend/support-tickets';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const schema = z.object({ subject: z.string().trim().min(3).max(120), category: z.enum(['Booking', 'Complaint', 'Report', 'Other']), body: z.string().trim().min(10).max(2000) }).strict();
export async function GET(request: NextRequest) {
  try { const account = await sessionAccount(request); if (!account) return NextResponse.json({ error: 'Sign in to view support tickets.' }, { status: 401, headers }); return NextResponse.json({ tickets: await listTickets(account.id), careAgent: isCareAgent(account.id), available: careConfigured() }, { headers }); }
  catch { return NextResponse.json({ error: 'Support tickets are temporarily unavailable.' }, { status: 503, headers }); }
}
export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers });
    const account = await sessionAccount(request); if (!account) return NextResponse.json({ error: 'Sign in to contact customer care.' }, { status: 401, headers });
    if (!careConfigured()) return NextResponse.json({ error: 'Customer care is not configured yet.' }, { status: 503, headers });
    if (!request.headers.get('content-type')?.startsWith('application/json')) throw new Error();
    const text = await request.text(); if (text.length > 12000) throw new Error();
    const input = schema.parse(JSON.parse(text)); const id = await createTicket(account.id, input.subject, input.category, input.body);
    return NextResponse.json({ id }, { status: 201, headers });
  } catch (error) { if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Check your ticket details and try again.' }, { status: 400, headers }); return NextResponse.json({ error: 'Your ticket could not be submitted.' }, { status: 503, headers }); }
}
