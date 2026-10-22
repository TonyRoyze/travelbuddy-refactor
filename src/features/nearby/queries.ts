import { queryOptions } from "@tanstack/react-query";
import { discoveryTowns } from "./towns";
import { rpc } from "@/lib/supabase";
import type { LiveResults, ProviderDiscovery } from "./types";
export const areasQuery = () =>
  queryOptions({
    queryKey: ["nearby-areas"],
    queryFn: async () =>
      discoveryTowns((await rpc("nearby_areas", {})) as unknown as string[]),
    staleTime: 30_000,
  });
export const liveQuery = (area: string) =>
  queryOptions({
    queryKey: ["nearby-live", area],
    queryFn: async () => ({
      ...((await rpc("nearby_live", {
        area_name: area,
      })) as unknown as LiveResults),
      receivedAt: Date.now(),
    }),
    enabled: area.length >= 2,
    staleTime: 0,
    refetchInterval: 15_000,
  });
export const providerDiscoveryQuery = () =>
  queryOptions({
    queryKey: ["provider-discovery"],
    queryFn: async () =>
      (await rpc("provider_discovery", {})) as unknown as ProviderDiscovery,
    staleTime: 0,
  });
