import { createFileRoute } from "@tanstack/react-router";
import { AuthCallback } from "@/features/auth/callback";
export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});
