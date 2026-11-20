import type { Experience } from './catalog';

export function meetingPointLinks(experience: Pick<Experience, 'meetingPoint' | 'destination' | 'country'>) {
  const address = experience.meetingPoint.trim();
  // Accommodation pickup is arranged individually; it is not a public meeting pin.
  const pickup = /\b(your (hotel|accommodation)|hotel lobby)\b/i.test(address);
  const query = pickup || !address
    ? `${experience.destination}, ${experience.country}`
    : `${address}, ${experience.destination}, ${experience.country}`;
  return {
    pickup, address, query,
    google: `https://www.google.com/maps/search/?${new URLSearchParams({ api: '1', query })}`,
    apple: `https://maps.apple.com/?${new URLSearchParams({ q: query })}`,
    embed: `https://www.google.com/maps?${new URLSearchParams({ q: query, output: 'embed' })}`,
  };
}
