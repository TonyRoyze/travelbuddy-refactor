import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { replyToTravelRequest } from '@/lib/backend/request-commands';
import { requestAccount, requestBody, requestError, requestHeaders, requestSignIn } from '@/lib/backend/request-http';
import { customPackageSchema } from '@/lib/inbox';

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const account = await requestAccount(request, true);
    if (!account) return requestSignIn();
    const id = z.string().uuid().parse(params.id);
    const { body, package: offer } = z.object({ body: z.string().trim().min(1).max(1000), package: customPackageSchema.optional() }).strict().parse(await requestBody(request));
    const conversation = await replyToTravelRequest(account.id, id, body, offer);
    return NextResponse.json({ conversation }, { status: 201, headers: requestHeaders });
  } catch (error) { return requestError(error); }
}
