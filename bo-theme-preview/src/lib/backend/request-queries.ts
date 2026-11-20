import { documentDatabase } from './database';
import { accountDataSchema } from './documents';
import { distanceKm, type Coordinates } from '../inbox';

export async function listTravelRequests(accountId: string, own = false, nearby?: Coordinates & { radiusKm: number }) {
  const db = documentDatabase();
  const nearest = nearby ? await db.$queryRaw<{ id: string; distance: number }[]>`
    SELECT r.id, 6371 * acos(least(1.0, greatest(-1.0,
      sin(radians(${nearby.latitude}::double precision)) * sin(radians(r.latitude)) +
      cos(radians(${nearby.latitude}::double precision)) * cos(radians(r.latitude)) *
      cos(radians(r.longitude - ${nearby.longitude}::double precision))
    ))) AS distance
    FROM travelbuddy_backend.travel_requests r
    JOIN travelbuddy_backend.accounts a ON a.id = r.traveler_id
    WHERE NOT r.closed AND r.latitude IS NOT NULL AND r.longitude IS NOT NULL
      AND a.schema_version = 1 AND a.data->>'status' = 'active'
      AND r.latitude BETWEEN ${nearby.latitude - nearby.radiusKm / 110} AND ${nearby.latitude + nearby.radiusKm / 110}
      AND (${!own} OR r.traveler_id = ${accountId}::uuid)
      AND 6371 * acos(least(1.0, greatest(-1.0,
        sin(radians(${nearby.latitude}::double precision)) * sin(radians(r.latitude)) +
        cos(radians(${nearby.latitude}::double precision)) * cos(radians(r.latitude)) *
        cos(radians(r.longitude - ${nearby.longitude}::double precision))
      ))) <= ${nearby.radiusKm}
    ORDER BY distance, r.created_at DESC, r.id DESC LIMIT 50
  ` : null;
  const requests = await documentDatabase().travelRequest.findMany({
    where: {
      ...(own ? { travelerId: accountId } : { closed: false }),
      ...(nearest ? { id: { in: nearest.map(value => value.id) } } : {}),
      traveler: { schemaVersion: 1, data: { path: ['status'], equals: 'active' } },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 50,
    include: {
      traveler: { select: { id: true, data: true } },
      // Never expose another buddy's reply, identity, or conversation ID on the board.
      conversations: { where: { OR: [{ participantOneId: accountId }, { participantTwoId: accountId }] }, select: { id: true } },
    },
  });
  const result = requests.map(({ traveler, travelerId, conversations, ...request }) => ({
    ...request,
    traveler: { id: travelerId, displayName: accountDataSchema.parse(traveler.data).displayName },
    conversations,
    distanceKm: nearby && request.latitude !== null && request.longitude !== null ? distanceKm(nearby, { latitude: request.latitude, longitude: request.longitude }) : null,
  }));
  return nearby ? result.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)) : result;
}
