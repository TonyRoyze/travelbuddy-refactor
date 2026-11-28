import { createFileRoute } from "@tanstack/react-router";
import { AdminGate } from "@/features/admin/admin-gate";
import { VerificationConsole } from "@/features/admin/verification-console";

export const Route = createFileRoute("/_authenticated/admin/verifications")({
  component: AdminVerificationsPage,
});

function AdminVerificationsPage() {
  return (
    <AdminGate>
      <VerificationConsole />
    </AdminGate>
  );
}
