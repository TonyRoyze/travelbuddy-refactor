import { App } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import type { Provider } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { authCallbackUrl, nativeAuthCallbackPath } from "./oauth";

const callbackStorageKey = "travelbuddy:native-auth-callback";

export async function signInWithProvider(provider: Provider, returnTo: string) {
  const native = Capacitor.isNativePlatform();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo: authCallbackUrl(location.origin, returnTo, native),
      skipBrowserRedirect: native,
    },
  });
  if (error) throw error;
  if (native) {
    if (!data.url)
      throw new Error("Could not open the sign-in page. Try again.");
    await Browser.open({ url: data.url });
  }
}

export async function initializeNativeAuth(
  navigate: (href: string) => Promise<unknown>,
) {
  if (!Capacitor.isNativePlatform()) return;

  const handleUrl = async (url: string) => {
    const path = nativeAuthCallbackPath(url);
    if (!path || sessionStorage.getItem(callbackStorageKey) === path) return;
    // iOS can deliver the same link as both a launch URL and an appUrlOpen event.
    // Keep this across WebView reloads so a consumed launch code is not replayed.
    sessionStorage.setItem(callbackStorageKey, path);
    try {
      await Browser.close();
    } catch {
      // A cold launch or an email link may have no in-app browser to dismiss.
    }
    await navigate(path);
  };

  await App.addListener("appUrlOpen", ({ url }) => {
    void handleUrl(url).catch(() => {
      console.error("Could not open the native authentication callback.");
    });
  });
  const launch = await App.getLaunchUrl();
  if (launch?.url) await handleUrl(launch.url);
}
