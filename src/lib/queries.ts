import { queryOptions } from "@tanstack/react-query";
import { rpc } from "./supabase";
import type { SearchFilters } from "./validation";
import type { Account } from "@/features/account/types";
import type { Experience, Catalog } from "@/features/catalog/types";
import type { Booking } from "@/features/bookings/types";
export const accountQuery = () =>
  queryOptions({
    queryKey: ["account"],
    queryFn: async () => (await rpc("account", {})) as unknown as Account,
    staleTime: 30_000,
    retry: false,
  });
export const catalogQuery = (filters: SearchFilters & { country?: string }) =>
  queryOptions({
    queryKey: ["catalog", filters],
    queryFn: async () =>
      (await rpc("catalog", {
        filters,
      })) as unknown as Catalog,
    staleTime: filters.live ? 0 : 30_000,
    refetchInterval: filters.live ? 15_000 : filters.date ? 30_000 : false,
  });
export const packageQuery = (id: string) =>
  queryOptions({
    queryKey: ["package", id],
    queryFn: async () =>
      (await rpc("package_detail", {
        package_id: id,
      })) as unknown as Experience,
  });
export const bookingsQuery = () =>
  queryOptions({
    queryKey: ["bookings"],
    queryFn: async () => (await rpc("bookings", {})) as unknown as Booking[],
  });
