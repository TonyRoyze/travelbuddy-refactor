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
export const catalogQuery = (filters: SearchFilters) =>
  queryOptions({
    queryKey: ["catalog", filters],
    queryFn: async () =>
      (await rpc("catalog", {
        filters,
      })) as unknown as Catalog,
    staleTime: 30_000,
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
