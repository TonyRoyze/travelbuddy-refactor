import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  addListener: vi.fn(),
  getLaunchUrl: vi.fn(),
  open: vi.fn(),
  close: vi.fn(),
  signInWithOAuth: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: native.isNativePlatform },
}));
vi.mock("@capacitor/app", () => ({
  App: { addListener: native.addListener, getLaunchUrl: native.getLaunchUrl },
}));
vi.mock("@capacitor/browser", () => ({
  Browser: { open: native.open, close: native.close },
}));
vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { signInWithOAuth: native.signInWithOAuth } },
}));

import { initializeNativeAuth, signInWithProvider } from "./native-auth";

const callback =
  "com.travelbuddy.app://auth/callback?code=one-use-code&returnTo=%2Fbookings";

beforeEach(() => {
  vi.resetAllMocks();
  const storage = new Map<string, string>();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal("location", { origin: "capacitor://localhost" });
  native.isNativePlatform.mockReturnValue(true);
  native.addListener.mockResolvedValue({ remove: vi.fn() });
  native.getLaunchUrl.mockResolvedValue(undefined);
  native.open.mockResolvedValue(undefined);
  native.close.mockResolvedValue(undefined);
  native.signInWithOAuth.mockResolvedValue({
    data: { url: "https://supabase.example/auth/v1/authorize?provider=google" },
    error: null,
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("native authentication", () => {
  it("keeps the WebView in the app while opening OAuth in the system browser sheet", async () => {
    await signInWithProvider("google", "/bookings");
    expect(native.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "com.travelbuddy.app://auth/callback?returnTo=%2Fbookings",
        skipBrowserRedirect: true,
      },
    });
    expect(native.open).toHaveBeenCalledWith({
      url: "https://supabase.example/auth/v1/authorize?provider=google",
    });
  });

  it("preserves browser redirects on the website and installs no native listeners", async () => {
    native.isNativePlatform.mockReturnValue(false);
    vi.stubGlobal("location", { origin: "https://travel.example" });
    await signInWithProvider("google", "/bookings");
    await initializeNativeAuth(vi.fn());
    expect(native.signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "https://travel.example/auth/callback?returnTo=%2Fbookings",
        skipBrowserRedirect: false,
      },
    });
    expect(native.open).not.toHaveBeenCalled();
    expect(native.addListener).not.toHaveBeenCalled();
  });

  it("handles cold links, dismisses the browser, and does not replay a code on reload", async () => {
    native.getLaunchUrl.mockResolvedValue({ url: callback });
    const navigate = vi.fn().mockResolvedValue(undefined);
    await initializeNativeAuth(navigate);
    expect(native.addListener).toHaveBeenCalledWith(
      "appUrlOpen",
      expect.any(Function),
    );
    expect(native.close).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(
      "/auth/callback?code=one-use-code&returnTo=%2Fbookings",
    );
    await initializeNativeAuth(navigate);
    expect(navigate).toHaveBeenCalledOnce();
  });

  it("handles warm callbacks even when there is no browser sheet to close", async () => {
    native.close.mockRejectedValue(new Error("No browser is open"));
    const navigate = vi.fn().mockResolvedValue(undefined);
    await initializeNativeAuth(navigate);
    const listener = native.addListener.mock.calls[0][1] as (event: {
      url: string;
    }) => void;
    listener({ url: "https://evil.example/auth/callback?code=ignored" });
    listener({ url: callback });
    listener({ url: callback });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    expect(native.close).toHaveBeenCalledOnce();
  });

  it("reports provider failures without opening a browser", async () => {
    native.signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: new Error("Provider unavailable"),
    });
    await expect(signInWithProvider("google", "/")).rejects.toThrow(
      "Provider unavailable",
    );
    expect(native.open).not.toHaveBeenCalled();
  });
});
