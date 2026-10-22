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
  canCancel?: boolean;
  cancellationDeadline?: string;
  paymentMethod?: "online" | "pay_later";
  paymentStatus?: "pending" | "paid" | "due" | "expired" | "disputed";
  paymentExpiresAt?: string | null;
  refundStatus?: "pending" | "refunded" | null;
  currency?: string;
  experience: Experience;
}

export interface CartItem {
  id: string;
  experienceId: string;
  option: number;
  date: string;
  time: string;
  travelers: number;
  unitPrice: number;
  lineTotal: number;
  optionName: string | null;
  available: boolean;
  experience: Experience;
}

export interface Cart {
  items: CartItem[];
  total: number;
  itemCount: number;
}
