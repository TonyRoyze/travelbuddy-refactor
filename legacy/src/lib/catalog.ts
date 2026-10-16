export type Experience = {
  id: string;
  title: string;
  destination: string;
  country: string;
  category: string;
  image: string;
  gallery: string[];
  rating: number;
  reviews: number;
  price: number;
  originalPrice?: number;
  duration: string;
  tag?: string;
  freeCancellation: boolean;
  payLater: boolean;
  pickup: boolean;
  languages: string[];
  supplier: string;
  description: string;
  highlights: string[];
  included: string[];
  notIncluded: string[];
  meetingPoint: string;
  options: { name: string; price: number; duration: string; detail: string; times: string[]; capacity?: number }[];
  itinerary: { time: string; title: string; detail: string }[];
};

const photos = {
  colombo: "https://images.unsplash.com/photo-1757439828772-0cadbd8e667e?auto=format&fit=crop&w=1200&q=85",
  food: "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1200&q=85",
  sigiriya: "https://images.unsplash.com/photo-1711100358840-ce6fd71c31b3?auto=format&fit=crop&w=1200&q=85",
  safari: "https://images.unsplash.com/photo-1516426122078-c23e76319801?auto=format&fit=crop&w=1200&q=85",
  bali: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=85",
  kyoto: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=1200&q=85",
  amalfi: "https://images.unsplash.com/photo-1533105079780-92b9be482077?auto=format&fit=crop&w=1200&q=85",
  newyork: "https://images.unsplash.com/photo-1522083165195-3424ed129620?auto=format&fit=crop&w=1200&q=85",
};

export const experiences: Experience[] = [
  { id: "colombo-food", title: "Colombo Street Food Night with a Local Host", destination: "Colombo", country: "Sri Lanka", category: "Food & drink", image: photos.food, gallery: [photos.food, photos.colombo, photos.sigiriya], rating: 4.9, reviews: 382, price: 42, originalPrice: 52, duration: "3 hours", tag: "Likely to sell out", freeCancellation: true, payLater: true, pickup: false, languages: ["English"], supplier: "Ceylon Compass", description: "Follow a local host through Colombo's neon-lit food stalls and family-run kitchens. Taste the city’s most-loved bites and hear the stories behind them.", highlights: ["8+ generous tastings", "Small group of 12 travelers", "Local host with insider stories"], included: ["Local guide", "All food tastings", "Welcome drink"], notIncluded: ["Hotel pickup", "Gratuities"], meetingPoint: "Outside the Old Dutch Hospital, Colombo", options: [{ name: "Small group evening tasting", price: 42, duration: "3 hours", detail: "8 tastings · max 12 people", times: ["17:30", "18:30"] }, { name: "Private food walk", price: 96, duration: "3 hours", detail: "Your group only · up to 6 people", times: ["17:00", "18:00", "19:00"] }], itinerary: [{ time: "5:30 PM", title: "Meet your host", detail: "Settle in over a chilled king coconut near the Old Dutch Hospital." }, { time: "6:00 PM", title: "Galle Face bites", detail: "Try spicy isso wade and the city’s legendary street-side snacks." }, { time: "7:15 PM", title: "Family kitchen", detail: "Finish with a home-style curry spread and a sweet treat." }] },
  { id: "sigiriya-dawn", title: "Sigiriya Rock Fortress at Sunrise & Village Breakfast", destination: "Sigiriya", country: "Sri Lanka", category: "Day trips", image: photos.sigiriya, gallery: [photos.sigiriya, photos.colombo], rating: 4.8, reviews: 621, price: 68, originalPrice: 80, duration: "8 hours", tag: "Traveler favorite", freeCancellation: true, payLater: true, pickup: true, languages: ["English", "German"], supplier: "Island Soul Journeys", description: "Beat the heat and the crowds on a dawn climb of the Lion Rock, followed by a warm village breakfast prepared by a local family.", highlights: ["Dawn entry to Sigiriya", "Village breakfast", "Air-conditioned transport"], included: ["Hotel pickup", "Entrance ticket", "Breakfast", "English-speaking guide"], notIncluded: ["Drinks", "Tips"], meetingPoint: "Your hotel in central Dambulla or Sigiriya", options: [{ name: "Sunrise shared tour", price: 68, duration: "8 hours", detail: "Shared vehicle · max 10", times: ["04:30"] }, { name: "Private sunrise tour", price: 144, duration: "8 hours", detail: "Private vehicle · up to 5", times: ["04:30", "05:00"] }], itinerary: [{ time: "4:30 AM", title: "Hotel pickup", detail: "Travel in comfort under the stars to the ancient rock fortress." }, { time: "6:00 AM", title: "Climb Sigiriya", detail: "Reach the summit as the jungle canopy turns gold." }, { time: "10:30 AM", title: "Village breakfast", detail: "Share a generous, home-cooked meal beside a lotus pond." }] },
  { id: "yala-safari", title: "Yala National Park: Leopard Safari with a Naturalist", destination: "Yala", country: "Sri Lanka", category: "Wildlife", image: photos.safari, gallery: [photos.safari, photos.sigiriya], rating: 4.7, reviews: 208, price: 74, duration: "7 hours", tag: "New", freeCancellation: true, payLater: false, pickup: true, languages: ["English"], supplier: "Wild Coast Expeditions", description: "Search for leopards, elephants and sloth bears with a passionate naturalist in Sri Lanka’s most famous national park.", highlights: ["Private safari jeep", "Expert naturalist", "Sunrise or afternoon departure"], included: ["Park entry", "Jeep and driver", "Naturalist"], notIncluded: ["Meals", "Hotel pickup outside Tissamaharama"], meetingPoint: "Tissamaharama hotel lobby", options: [{ name: "Sunrise safari", price: 74, duration: "7 hours", detail: "Private jeep · max 6", times: ["05:00"] }, { name: "Afternoon safari", price: 74, duration: "6 hours", detail: "Private jeep · max 6", times: ["14:00"] }], itinerary: [{ time: "5:00 AM", title: "Enter the wild", detail: "Open the park gates before sunrise and look for movement in the scrub." }, { time: "8:30 AM", title: "Leopard country", detail: "Your naturalist reads tracks and calls to find elusive big cats." }, { time: "11:30 AM", title: "Lagoon stop", detail: "Pause for a packed breakfast beside a quiet wildlife lagoon." }] },
  { id: "bali-temple", title: "Bali Water Temples & Rice Terraces: Small Group Day Trip", destination: "Ubud", country: "Indonesia", category: "Tours & sightseeing", image: photos.bali, gallery: [photos.bali], rating: 4.9, reviews: 1044, price: 39, duration: "9 hours", tag: "Best seller", freeCancellation: true, payLater: true, pickup: true, languages: ["English", "French"], supplier: "Bali Good Times", description: "Discover sacred water temples, emerald rice terraces and the quieter side of Bali with a local guide.", highlights: ["Tirta Empul temple", "Tegallalang rice terraces", "Small group experience"], included: ["Hotel pickup", "Temple entry", "Guide"], notIncluded: ["Lunch", "Personal expenses"], meetingPoint: "Your Ubud accommodation", options: [{ name: "Shared minivan", price: 39, duration: "9 hours", detail: "Max 12 guests", times: ["08:00"] }, { name: "Private car", price: 92, duration: "9 hours", detail: "Up to 4 guests", times: ["08:00", "09:00"] }], itinerary: [{ time: "8:00 AM", title: "Tirta Empul", detail: "Learn about Balinese water purification traditions." }, { time: "11:00 AM", title: "Rice terraces", detail: "Walk the famous valley paths above Tegallalang." }, { time: "2:00 PM", title: "Hidden village", detail: "Meet craftspeople and sip coffee away from the crowds." }] },
  { id: "kyoto-night", title: "Gion After Dark: Geisha District Walking Tour", destination: "Kyoto", country: "Japan", category: "Cultural experiences", image: photos.kyoto, gallery: [photos.kyoto], rating: 4.8, reviews: 518, price: 55, duration: "2 hours", tag: "Small group", freeCancellation: true, payLater: true, pickup: false, languages: ["English"], supplier: "Kyoto Walks", description: "Wander lantern-lit lanes in Gion and discover the rituals, architecture and hidden tea houses of old Kyoto.", highlights: ["Local historian guide", "Lantern-lit Gion", "Tea house etiquette"], included: ["Guide", "Seasonal snack"], notIncluded: ["Transport", "Dinner"], meetingPoint: "Gion-Shijo Station", options: [{ name: "Gion evening walk", price: 55, duration: "2 hours", detail: "Max 10 guests", times: ["18:00", "19:00"] }], itinerary: [{ time: "6:00 PM", title: "Hanamikoji Street", detail: "Read the details hidden in Gion’s traditional machiya houses." }, { time: "7:00 PM", title: "Tea house lanes", detail: "Learn how geiko and maiko traditions shaped Kyoto nightlife." }] },
  { id: "amalfi-cruise", title: "Amalfi Coast Sunset Cruise with Aperitivo", destination: "Amalfi", country: "Italy", category: "Cruises & sailing", image: photos.amalfi, gallery: [photos.amalfi], rating: 4.9, reviews: 766, price: 89, originalPrice: 105, duration: "4 hours", tag: "Top rated", freeCancellation: true, payLater: false, pickup: false, languages: ["English", "Italian"], supplier: "Mare Blu", description: "Sail past pastel villages and hidden coves as the sun drops into the Tyrrhenian Sea. Swim, sip and settle into la dolce vita.", highlights: ["Sunset swim stop", "Italian aperitivo", "Small boat with 12 guests"], included: ["Skipper", "Drinks and snacks", "Snorkel gear"], notIncluded: ["Hotel transfer", "Extra cocktails"], meetingPoint: "Amalfi harbor, pier 3", options: [{ name: "Sunset shared cruise", price: 89, duration: "4 hours", detail: "Max 12 guests", times: ["16:30", "17:30"] }], itinerary: [{ time: "4:30 PM", title: "Cast off", detail: "Leave Amalfi harbor with a local skipper and a chilled drink." }, { time: "6:00 PM", title: "Swim in a cove", detail: "Cool off in clear water beneath the cliffs." }, { time: "7:00 PM", title: "Golden hour", detail: "Watch the coastline glow over a table of Italian aperitivo." }] },
  { id: "nyc-skyline", title: "New York City Skyline Helicopter Tour", destination: "New York City", country: "United States", category: "Air tours", image: photos.newyork, gallery: [photos.newyork], rating: 4.6, reviews: 1902, price: 279, duration: "20 minutes", tag: "Iconic", freeCancellation: false, payLater: false, pickup: false, languages: ["English"], supplier: "Skyline Air", description: "See Manhattan, the Statue of Liberty and the bridges from a private window seat in the sky.", highlights: ["Window seat guaranteed", "Manhattan and harbor views", "Professional pilot"], included: ["Safety briefing", "Helicopter flight"], notIncluded: ["Transfers", "Photos"], meetingPoint: "Downtown Manhattan Heliport", options: [{ name: "Manhattan panorama", price: 279, duration: "20 minutes", detail: "Window seat · shared flight", times: ["10:00", "12:00", "15:00"] }], itinerary: [{ time: "10:00 AM", title: "Check in", detail: "Meet the flight crew and complete a short safety briefing." }, { time: "10:30 AM", title: "Take flight", detail: "Circle over Manhattan, Ellis Island and the Brooklyn Bridge." }] },
];

export const destinations = [
  { name: "Colombo", country: "Sri Lanka", image: photos.colombo, count: 184 },
  { name: "Bali", country: "Indonesia", image: photos.bali, count: 512 },
  { name: "Kyoto", country: "Japan", image: photos.kyoto, count: 328 },
  { name: "Amalfi Coast", country: "Italy", image: photos.amalfi, count: 241 },
];

export const categories = ["Tours & sightseeing", "Food & drink", "Tickets & passes", "Day trips", "Wildlife", "Cruises & sailing", "Cultural experiences", "Outdoor activities"];


export function getExperience(id: string) { return experiences.find(experience => experience.id === id); }
