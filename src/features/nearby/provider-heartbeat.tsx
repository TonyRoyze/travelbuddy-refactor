import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session";
import { accountQuery } from "@/lib/queries";
import { rpc } from "@/lib/supabase";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ProviderPresence } from "./types";
export const heartbeatKey = (userId: string) => ["provider-heartbeat", userId];
export function useProviderHeartbeat() {
  const { session } = useSession();
  const account = useQuery({ ...accountQuery(), enabled: !!session });
  const enabled =
    !!session &&
    account.data?.onboarding === "completed" &&
    account.data.roles.some((role) => role === "provider" || role === "guide");
  return useQuery({
    queryKey: heartbeatKey(session?.user.id ?? ""),
    enabled,
    queryFn: async () =>
      (await rpc("provider_heartbeat", {})) as unknown as ProviderPresence,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
    staleTime: 20_000,
    retry: false,
  });
}
export function ProviderHeartbeat() {
  const heartbeat = useProviderHeartbeat();
  return heartbeat.error ? (
    <Alert className="mb-4">
      <AlertDescription>
        Your online status could not be renewed. You’ll disappear from live
        discovery if the connection does not recover.
      </AlertDescription>
    </Alert>
  ) : null;
}
