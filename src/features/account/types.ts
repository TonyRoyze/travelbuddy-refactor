export interface Account {
  id: string;
  displayName: string;
  email: string;
  roles: ("traveler" | "provider" | "guide" | "admin")[];
  onboarding: "pending" | "completed";
  revision: number;
  liveNow: boolean;
}
