import { createFileRoute } from "@tanstack/react-router";
import { ReviewsPage } from "@/features/reviews/reviews";

export const Route = createFileRoute("/_authenticated/account/reviews")({
  component: ReviewsPage,
});
