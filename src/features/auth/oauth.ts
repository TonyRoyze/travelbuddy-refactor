import type { SupabaseClient } from "@supabase/supabase-js";
import { safeReturn } from "@/lib/validation";

export const NATIVE_AUTH_CALLBACK = "com.travelbuddy.app://auth/callback";

export function authCallbackUrl(
  origin: string,
  returnTo: string,
  native = false,
) {
  const url = new URL(native ? NATIVE_AUTH_CALLBACK : "/auth/callback", origin);
  url.searchParams.set("returnTo", safeReturn(returnTo));
  return url.toString();
}

// Only accept our registered auth endpoint, never arbitrary incoming app URLs.
export function nativeAuthCallbackPath(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const callback = new URL(NATIVE_AUTH_CALLBACK);
  if (
    url.protocol !== callback.protocol ||
    url.host !== callback.host ||
    url.pathname !== callback.pathname ||
    url.username ||
    url.password
  )
    return null;

  const search = new URLSearchParams();
  const code = url.searchParams.get("code");
  if (code) search.set("code", code);
  const error = callbackError(url);
  if (error) search.set("error_description", error);
  search.set("returnTo", safeReturn(url.searchParams.get("returnTo")));
  return `/auth/callback?${search}`;
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
