import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { closeTravelRequest } from '@/lib/backend/request-commands';
import { requestAccount, requestBody, requestError, requestHeaders, requestSignIn } from '@/lib/backend/request-http';

export const dynamic = 'force-dynamic';
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const account = await requestAccount(request, true);
    if (!account) return requestSignIn();
    const id = z.string().uuid().parse(params.id);
    z.object({ closed: z.literal(true) }).strict().parse(await requestBody(request));
    await closeTravelRequest(account.id, id);
    return NextResponse.json({ closed: true }, { headers: requestHeaders });
  } catch (error) { return requestError(error); }
}
