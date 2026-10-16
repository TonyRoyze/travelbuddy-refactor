import type { Experience } from "@/features/catalog/types";
export interface Booking {
  id: string;
  orderId: string;
  experienceId: string;
  option: number;
  date: string;
  time: string;
  travelers: number;
  total: number;
  travelerName: string;
  travelerEmail: string;
  reference: string;
  status: "Upcoming" | "Completed" | "Cancelled";
  experience: Experience;
}
