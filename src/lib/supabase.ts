import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key)
  throw new Error(
    "Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env.local.",
  );
export const supabase = createClient<Database, "travelbuddy_api">(url, key, {
  db: { schema: "travelbuddy_api" },
  auth: { flowType: "pkce", detectSessionInUrl: false },
});
type Functions = Database["travelbuddy_api"]["Functions"];
export async function rpc<N extends keyof Functions>(
  name: N,
  args: Functions[N]["Args"] extends never
    ? Record<string, never>
    : Functions[N]["Args"],
): Promise<Functions[N]["Returns"]> {
  const { data, error } = await supabase
    .schema("travelbuddy_api")
    .rpc(name, args as never);
  if (error) throw new Error(error.message);
  return data as Functions[N]["Returns"];
}
