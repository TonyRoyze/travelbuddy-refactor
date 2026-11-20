import {
  AirVent, BedDouble, Bus, Camera, Car, Coffee, ConciergeBell, Cookie,
  CreditCard, Dumbbell, GlassWater, HandCoins, Heater, Martini, Package,
  ParkingCircle, Plane, Sailboat, Shield, Sparkles, Ticket, Trees,
  UserRound, Utensils, Waves, Wifi, type LucideIcon,
} from 'lucide-react';

// Stable keys also allow future structured amenities to select an icon explicitly.
export const benefitIcons = {
  guide: UserRound, food: Utensils, breakfast: Coffee, snack: Cookie,
  drink: GlassWater, cocktail: Martini, transport: Bus, pickup: Car,
  ticket: Ticket, nature: Trees, boat: Sailboat, flight: Plane,
  safety: Shield, photo: Camera, tip: HandCoins, expense: CreditCard,
  room: BedDouble, wifi: Wifi, pool: Waves, parking: ParkingCircle,
  airConditioning: AirVent, heating: Heater, housekeeping: Sparkles,
  roomService: ConciergeBell, gym: Dumbbell, other: Package,
} satisfies Record<string, LucideIcon>;
export type BenefitIconKey = keyof typeof benefitIcons;

// Specific phrases precede broad categories; full words avoid accidental matches.
const rules: [RegExp, BenefitIconKey][] = [
  [/\b(breakfast|coffee|tea)\b/i, 'breakfast'],
  [/\b(cocktails?|wine|beer|alcohol)\b/i, 'cocktail'],
  [/\b(drinks?|beverages?|water|juice|refreshments?)\b/i, 'drink'],
  [/\b(snacks?|cookies?|biscuits?)\b/i, 'snack'],
  [/\b(food|tastings?|meals?|lunch|dinner|buffet)\b/i, 'food'],
  [/\b(pick[ -]?up|shuttle|jeep|driver|private car|taxi)\b/i, 'pickup'],
  [/\b(transfers?|transport|transportation|bus)\b/i, 'transport'],
  [/\b(tickets?|entrance|entry|admission|passes?)\b/i, 'ticket'],
  [/\b(naturalists?|rangers?)\b/i, 'nature'],
  [/\b(guides?|hosts?|skippers?)\b/i, 'guide'],
  [/\b(snorkel|snorkeling|snorkelling|pool|swimming)\b/i, 'pool'],
  [/\b(boats?|sailing|cruise)\b/i, 'boat'],
  [/\b(helicopter|flights?|airfare)\b/i, 'flight'],
  [/\b(safety|insurance|briefing|first aid)\b/i, 'safety'],
  [/\b(photos?|photographs?|photography|camera)\b/i, 'photo'],
  [/\b(tips?|gratuities)\b/i, 'tip'],
  [/\b(expenses?|purchases?|fees?)\b/i, 'expense'],
  [/\b(wi[ -]?fi|internet)\b/i, 'wifi'],
  [/\b(parking)\b/i, 'parking'],
  [/\b(air[ -]?conditioning|ac)\b/i, 'airConditioning'],
  [/\b(heating|heater)\b/i, 'heating'],
  [/\b(housekeeping|cleaning|linen|towels?)\b/i, 'housekeeping'],
  [/\b(room service|concierge)\b/i, 'roomService'],
  [/\b(gym|fitness)\b/i, 'gym'],
  [/\b(rooms?|beds?|accommodation|overnight|hotel stay)\b/i, 'room'],
];

export function benefitIconKey(label: string): BenefitIconKey {
  return rules.find(([pattern]) => pattern.test(label))?.[1] ?? 'other';
}
