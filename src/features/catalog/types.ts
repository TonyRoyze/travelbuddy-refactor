export interface Experience {
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
  duration: string;
  freeCancellation: boolean;
  description: string;
  supplier: string;
  languages: string[];
  highlights: string[];
  included: string[];
  notIncluded: string[];
  meetingPoint: string;
  canChat?: boolean;
  liveNow?: boolean;
  providerId?: string | null;
  options: {
    name: string;
    price: number;
    duration: string;
    detail: string;
    times: string[];
    capacity?: number;
  }[];
  itinerary: { time: string; title: string; detail: string }[];
  videoIds?: string[];
}
export interface Catalog {
  items: Experience[];
  total: number;
  page: number;
  pageSize: number;
}
export interface Availability {
  date: string;
  slots: { time: string; capacity: number; remaining: number }[];
  next: { date: string; time: string } | null;
}
