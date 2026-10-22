export interface Conversation {
  unread?: number;
  id: string;
  packageId: string | null;
  packageTitle: string | null;
  name: string;
  updatedAt: string;
  preview: string | null;
}
export interface ChatMessage {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  package: {
    title: string;
    description: string;
    price: number;
    currency: string;
    vehicleDetails?: string;
  } | null;
}
