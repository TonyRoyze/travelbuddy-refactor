import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";

const topic = "provider-live-now";

export function useLiveNowUpdates() {
  const client = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel(topic)
      .on("broadcast", { event: "changed" }, () => {
        void client.invalidateQueries({ queryKey: ["catalog"] });
        void client.invalidateQueries({ queryKey: ["package"] });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [client]);
}

export function broadcastLiveNowChange() {
  const channel = supabase.channel(topic);
  let finished = false;
  const timeout = window.setTimeout(() => {
    if (finished) return;
    finished = true;
    void supabase.removeChannel(channel);
  }, 5000);
  channel.subscribe((status) => {
    if (finished) return;
    if (status === "SUBSCRIBED") {
      finished = true;
      window.clearTimeout(timeout);
      void channel
        .send({ type: "broadcast", event: "changed", payload: {} })
        .finally(() => supabase.removeChannel(channel));
    } else if (
      status === "CHANNEL_ERROR" ||
      status === "CLOSED" ||
      status === "TIMED_OUT"
    ) {
      finished = true;
      window.clearTimeout(timeout);
      void supabase.removeChannel(channel);
    }
  });
}
