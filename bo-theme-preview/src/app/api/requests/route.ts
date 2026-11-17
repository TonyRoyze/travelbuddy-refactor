import { NextRequest, NextResponse } from 'next/server';
import { createTravelRequest } from '@/lib/backend/request-commands';
import { listTravelRequests } from '@/lib/backend/request-queries';
import { requestAccount, requestBody, requestError, requestHeaders, requestSignIn } from '@/lib/backend/request-http';
import { coordinatesSchema } from '@/lib/inbox';
import { RequestAccessError } from '@/lib/backend/request-commands';
import { z } from 'zod';

export const dynamic = 'force-dynamic';
export async function GET(request: NextRequest) {
  try {
    const account = await requestAccount(request);
    if (!account) return requestSignIn();
    const params = request.nextUrl.searchParams;
    let nearby;
    if (params.has('latitude') || params.has('longitude') || params.has('radius')) {
      if (!account.data.roles.some(role => role === 'provider' || role === 'guide')) throw new RequestAccessError(403, 'Nearby requests are available to buddies and guides.');
      nearby = coordinatesSchema.extend({ radiusKm: z.number().min(1).max(100) }).parse({ latitude: params.has('latitude') ? Number(params.get('latitude')) : NaN, longitude: params.has('longitude') ? Number(params.get('longitude')) : NaN, radiusKm: Number(params.get('radius') ?? 25) });
    }
    return NextResponse.json({ requests: await listTravelRequests(account.id, params.get('mine') === '1', nearby) }, { headers: requestHeaders });
  } catch (error) { return requestError(error); }
}
export async function POST(request: NextRequest) {
  try {
    const account = await requestAccount(request, true);
    if (!account) return requestSignIn();
    return NextResponse.json({ request: await createTravelRequest(account.id, await requestBody(request)) }, { status: 201, headers: requestHeaders });
  } catch (error) { return requestError(error); }
}
