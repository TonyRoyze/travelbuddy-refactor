import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session";
import { supabase } from "@/lib/supabase";

export function useMessageUpdates() {
  const { session } = useSession();
  const userId = session?.user.id;
  const client = useQueryClient();

  useEffect(() => {
    if (!userId) return;
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ["messages"] });
      void client.invalidateQueries({ queryKey: ["conversations"] });
      void client.invalidateQueries({ queryKey: ["provider-dashboard"] });
    };
    const channel = supabase
      .channel(`chat:${userId}`, { config: { private: true } })
      .on("broadcast", { event: "changed" }, refresh)
      .subscribe((status) => {
        // Catch messages committed during initial connection or reconnection.
        if (status === "SUBSCRIBED") refresh();
      });
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, client]);
}
