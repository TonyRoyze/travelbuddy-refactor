import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  authCallbackUrl,
  callbackError,
  createCodeExchanger,
  nativeAuthCallbackPath,
} from "./oauth";

function mockAuth(exchangeCodeForSession: ReturnType<typeof vi.fn>) {
  return { exchangeCodeForSession } as unknown as SupabaseClient["auth"];
}

describe("OAuth callback", () => {
  it("uses the registered app scheme for native OAuth and password recovery", () => {
    const url = new URL(
      authCallbackUrl("capacitor://localhost", "/reset-password", true),
    );
    expect(`${url.protocol}//${url.host}${url.pathname}`).toBe(
      "com.travelbuddy.app://auth/callback",
    );
    expect(url.searchParams.get("returnTo")).toBe("/reset-password");
  });

  it("routes native PKCE codes locally and sanitizes their return destination", () => {
    const path = nativeAuthCallbackPath(
      "com.travelbuddy.app://auth/callback?code=one-use-code&returnTo=%2Fcheckout%3Ftravelers%3D2&ignored=value",
    );
    const url = new URL(path!, "https://travel.example");
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("code")).toBe("one-use-code");
    expect(url.searchParams.get("returnTo")).toBe("/checkout?travelers=2");
    expect(url.searchParams.has("ignored")).toBe(false);
    const unsafe = nativeAuthCallbackPath(
      "com.travelbuddy.app://auth/callback?code=code&returnTo=https://evil.example",
    );
    expect(
      new URL(unsafe!, "https://travel.example").searchParams.get("returnTo"),
    ).toBe("/");
  });

  it.each([
    "not a URL",
    "https://auth/callback?code=code",
    "com.travelbuddy.app://evil/callback?code=code",
    "com.travelbuddy.app://auth/other?code=code",
    "com.travelbuddy.app://auth:123/callback?code=code",
    "com.travelbuddy.app://user@auth/callback?code=code",
  ])("ignores unrelated or malformed deep links: %s", (url) => {
    expect(nativeAuthCallbackPath(url)).toBeNull();
  });

  it("forwards native provider errors without accepting implicit-flow tokens", () => {
    const path = nativeAuthCallbackPath(
      "com.travelbuddy.app://auth/callback#error_description=User+cancelled&access_token=token",
    );
    const url = new URL(path!, "https://travel.example");
    expect(url.searchParams.get("error_description")).toBe("User cancelled");
    expect(url.searchParams.has("access_token")).toBe(false);
    expect(url.hash).toBe("");
  });

  it("preserves booking context and rejects external destinations", () => {
    const url = new URL(
      authCallbackUrl(
        "https://travel.example",
        "/checkout?travelers=2&option=1",
      ),
    );
    expect(url.pathname).toBe("/auth/callback");
    expect(url.searchParams.get("returnTo")).toBe(
      "/checkout?travelers=2&option=1",
    );
    expect(
      new URL(
        authCallbackUrl("https://travel.example", "//evil.example"),
      ).searchParams.get("returnTo"),
    ).toBe("/");
  });

  it("exchanges a one-use code once across duplicate mounts, then accepts a new code", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ data: { session: {} }, error: null });
    const exchange = createCodeExchanger(mockAuth(request));
    const first = exchange("first");
    expect(exchange("first")).toBe(first);
    await first;
    await exchange("second");
    expect(request.mock.calls).toEqual([["first"], ["second"]]);
  });

  it("allows a new sign-in after a failed exchange", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        data: { session: null },
        error: new Error("Expired code"),
      })
      .mockResolvedValueOnce({ data: { session: {} }, error: null });
    const exchange = createCodeExchanger(mockAuth(request));
    await expect(exchange("expired")).rejects.toThrow("Expired code");
    await expect(exchange("fresh")).resolves.toBeUndefined();
  });

  it("rejects an exchange without a session", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ data: { session: null }, error: null });
    await expect(
      createCodeExchanger(mockAuth(request))("code"),
    ).rejects.toThrow("did not create a session");
  });

  it("reads provider errors from query parameters and fragments", () => {
    expect(
      callbackError(
        new URL("https://travel.example/auth/callback?error=access_denied"),
      ),
    ).toBe("access_denied");
    expect(
      callbackError(
        new URL(
          "https://travel.example/auth/callback#error=access_denied&error_description=User+cancelled",
        ),
      ),
    ).toBe("User cancelled");
  });
});
