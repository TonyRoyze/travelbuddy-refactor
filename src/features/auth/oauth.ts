import type { SupabaseClient } from "@supabase/supabase-js";
import { safeReturn } from "@/lib/validation";

export function authCallbackUrl(origin: string, returnTo: string) {
  const url = new URL("/auth/callback", origin);
  url.searchParams.set("returnTo", safeReturn(returnTo));
  return url.toString();
}

// React StrictMode can mount the callback twice. Exchange each one-use code once,
// while allowing a later sign-in attempt to exchange its own code.
export function createCodeExchanger(auth: SupabaseClient["auth"]) {
  let current: { code: string; promise: Promise<void> } | undefined;
  return (code: string) => {
    if (current?.code === code) return current.promise;
    const promise = auth
      .exchangeCodeForSession(code)
      .then(({ data, error }) => {
        if (error) throw error;
        if (!data.session)
          throw new Error(
            "Sign-in did not create a session. Please try again.",
          );
      });
    current = { code, promise };
    return promise;
  };
}

export function callbackError(url: URL) {
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.slice(1));
  return (
    query.get("error_description") ||
    hash.get("error_description") ||
    query.get("error") ||
    hash.get("error")
  );
}
