import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin } from '@/lib/backend/auth-security';
import { sessionAccount } from '@/lib/backend/sessions';
import { startConversation } from '@/lib/backend/message-commands';
import { MessageRecipientError } from '@/lib/backend/message-errors';
import { listConversations } from '@/lib/backend/message-queries';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const startSchema = z.object({ recipientId: z.string().uuid() }).strict();

export async function GET(request: NextRequest) {
  try {
    const account = await sessionAccount(request);
    if (!account) return NextResponse.json({ error: 'Sign in to open your messages.' }, { status: 401, headers });
    return NextResponse.json({ conversations: await listConversations(account.id) }, { headers });
  } catch {
    return NextResponse.json({ error: 'Messages are temporarily unavailable.' }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers });
    const account = await sessionAccount(request);
    if (!account) return NextResponse.json({ error: 'Sign in to start a conversation.' }, { status: 401, headers });
    if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'Invalid conversation details.' }, { status: 400, headers });
    const text = await request.text();
    if (text.length > 2000) return NextResponse.json({ error: 'Invalid conversation details.' }, { status: 400, headers });
    const body = startSchema.parse(JSON.parse(text));
    const conversation = await startConversation(account.id, body.recipientId);
    return NextResponse.json({ conversation }, { status: 201, headers });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return NextResponse.json({ error: 'Enter a valid recipient account ID.' }, { status: 400, headers });
    if (error instanceof MessageRecipientError) return NextResponse.json({ error: 'That recipient account is unavailable.' }, { status: 404, headers });
    return NextResponse.json({ error: 'A conversation could not be started.' }, { status: 503, headers });
  }
}
