import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authCallbackUrl, callbackError, createCodeExchanger } from "./oauth";

function mockAuth(exchangeCodeForSession: ReturnType<typeof vi.fn>) {
  return { exchangeCodeForSession } as unknown as SupabaseClient["auth"];
}

describe("OAuth callback", () => {
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
