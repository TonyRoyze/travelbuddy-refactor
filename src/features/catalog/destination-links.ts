import { sriLankanTowns } from "../nearby/towns";
import { destinations } from "./destinations";
export const destinationSlug = (town: string) =>
  town
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
export const destinationChoices = [
  ...new Set<string>([...sriLankanTowns, "Yala"]),
];
export function destinationFromSlug(slug: string) {
  return destinationChoices.find(
    (town) => destinationSlug(town) === slug.toLowerCase(),
  );
}
export function destinationMetadata(town: string, origin: string) {
  const url = new URL(`/destinations/${destinationSlug(town)}`, origin).href;
  return {
    title: `${town} experiences in Sri Lanka | TravelBuddy`,
    description: `Discover experiences in ${town}, Sri Lanka. Compare local Buddy packages, choose a date and chat with your host before booking.`,
    url,
    image:
      destinations.find((d) => d.name === town)?.image ?? destinations[0].image,
  };
}
