import { queryOptions } from "@tanstack/react-query";
import { rpc } from "@/lib/supabase";
import type { EditorPackage } from "./model";
export const buddyPackagesQuery = () =>
  queryOptions({
    queryKey: ["buddy-packages"],
    queryFn: async () =>
      (await rpc("buddy_packages", {})) as unknown as EditorPackage[],
    staleTime: 0,
  });
export const buddyPackageQuery = (id: string) =>
  queryOptions({
    queryKey: ["buddy-package", id],
    queryFn: async () =>
      (await rpc("buddy_package", {
        package_id: id,
      })) as unknown as EditorPackage,
    staleTime: 0,
    retry: false,
  });
export type Reservation = {
  date: string;
  time: string;
  option: number;
  travelers: number;
};
export const reservationsQuery = (id?: string) =>
  queryOptions({
    queryKey: ["package-reservations", id],
    enabled: !!id,
    queryFn: async () =>
      (await rpc("package_reservations", {
        package_id: id!,
      })) as unknown as Reservation[],
    refetchInterval: 30000,
    staleTime: 0,
    retry: false,
  });
