import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sameOrigin, SESSION_COOKIE } from '@/lib/backend/auth-security';
import { sessionAccount } from '@/lib/backend/sessions';
import { sendMessage } from '@/lib/backend/message-commands';
import { ConversationAccessError } from '@/lib/backend/message-errors';
import { getConversation } from '@/lib/backend/message-queries';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const messageSchema = z.object({ body: z.string().trim().min(1).max(1000) }).strict();
const idSchema = z.string().uuid();

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const account = await sessionAccount(request.cookies.get(SESSION_COOKIE)?.value);
    if (!account) return NextResponse.json({ error: 'Sign in to open your messages.' }, { status: 401, headers });
    const id = idSchema.parse(params.id);
    return NextResponse.json({ conversation: await getConversation(account.id, id) }, { headers });
  } catch (error) {
    if (error instanceof ConversationAccessError || error instanceof z.ZodError) return NextResponse.json({ error: 'That conversation is unavailable.' }, { status: 404, headers });
    return NextResponse.json({ error: 'Messages are temporarily unavailable.' }, { status: 503, headers });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (!sameOrigin(request)) return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403, headers });
    const account = await sessionAccount(request.cookies.get(SESSION_COOKIE)?.value);
    if (!account) return NextResponse.json({ error: 'Sign in to send a message.' }, { status: 401, headers });
    const id = idSchema.parse(params.id);
    if (!request.headers.get('content-type')?.startsWith('application/json')) return NextResponse.json({ error: 'Enter a message up to 1,000 characters.' }, { status: 400, headers });
    const text = await request.text();
    if (text.length > 3000) return NextResponse.json({ error: 'Enter a message up to 1,000 characters.' }, { status: 400, headers });
    const { body } = messageSchema.parse(JSON.parse(text));
    const message = await sendMessage(account.id, id, body);
    return NextResponse.json({ message }, { status: 201, headers });
  } catch (error) {
    if (error instanceof ConversationAccessError || error instanceof z.ZodError) return NextResponse.json({ error: 'That conversation is unavailable.' }, { status: 404, headers });
    if (error instanceof SyntaxError) return NextResponse.json({ error: 'Enter a message up to 1,000 characters.' }, { status: 400, headers });
    return NextResponse.json({ error: 'Your message could not be sent.' }, { status: 503, headers });
  }
}
