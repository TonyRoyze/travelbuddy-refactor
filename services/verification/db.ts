import { createClient } from "@supabase/supabase-js";

export function createVerificationClient(
  url: string,
  key: string,
  token?: string,
) {
  return createClient(url, key, {
    db: { schema: "travelbuddy_api" },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      ...(token && { headers: { Authorization: `Bearer ${token}` } }),
      fetch: (input, init) => {
        const timeout = AbortSignal.timeout(8000);
        return fetch(input, {
          ...init,
          signal: init?.signal
            ? AbortSignal.any([init.signal, timeout])
            : timeout,
        });
      },
    },
  });
}
