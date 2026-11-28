import { once } from "node:events";
import type { Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadVerificationConfig } from "./config";
import { accountId, sessionId } from "./fixtures.test-support";
import {
  createVerificationServer,
  createVerificationServerDependencies,
  type VerificationServerDependencies,
} from "./server";

const origin = "http://localhost:5173";
const baseConfig = loadVerificationConfig({});
const headers = { Origin: origin, Authorization: "Bearer fixture-token" };
const account = { id: accountId, status: "active", roles: ["admin"] };
const imagePath = `/verification-api/admin/applications/${accountId}/images/id-front`;
const sessionPath = "/verification-api/liveness/session";
let server: Server | undefined;

async function listen(deps: VerificationServerDependencies) {
  server = createVerificationServer(deps).listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("HTTP test server did not start.");
  return `http://127.0.0.1:${address.port}`;
}

function dependencies() {
  return {
    config: baseConfig,
    provider: {
      livenessConfigured: true,
      visionConfigured: true,
      createLivenessSession: vi
        .fn<
          VerificationServerDependencies["provider"]["createLivenessSession"]
        >()
        .mockResolvedValue({
          sessionId,
          authToken: "opaque",
          expiresInSeconds: 300,
        }),
    },
    authenticate: vi
      .fn<VerificationServerDependencies["authenticate"]>()
      .mockResolvedValue(account),
    getImage: vi
      .fn<VerificationServerDependencies["getImage"]>()
      .mockResolvedValue({ mimeType: "image/jpeg", base64: "/9j/" }),
  };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  const current = server;
  server = undefined;
  if (current)
    await new Promise<void>((resolve, reject) =>
      current.close((error) => (error ? reject(error) : resolve())),
    );
});

describe("verification HTTP API", () => {
  it("serves health and public configuration without authentication", async () => {
    const deps = dependencies();
    const base = await listen(deps);
    expect(
      await (await fetch(base + "/verification-api/health")).json(),
    ).toEqual({ ready: true });
    const response = await fetch(base + "/verification-api/config", {
      headers,
    });
    expect(await response.json()).toEqual({
      livenessConfigured: true,
      visionConfigured: true,
      mode: "auto",
      providerMode: "option_a_inhouse",
    });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(deps.authenticate).not.toHaveBeenCalled();
  });

  it("checks allowed origins, preflight, bearer authentication and active account before issuing liveness", async () => {
    const deps = dependencies();
    const base = await listen(deps);
    const preflight = await fetch(base + sessionPath, {
      method: "OPTIONS",
      headers: { Origin: origin },
    });
    expect(preflight.status).toBe(204);
    expect(
      (
        await fetch(base + sessionPath, {
          method: "POST",
          headers: { ...headers, Origin: "https://denied.test" },
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await fetch(base + sessionPath, {
          method: "POST",
          headers: { Origin: origin },
        })
      ).status,
    ).toBe(401);
    deps.authenticate.mockResolvedValueOnce({
      ...account,
      status: "suspended",
    });
    expect(
      (await fetch(base + sessionPath, { method: "POST", headers })).status,
    ).toBe(403);
    expect(deps.provider.createLivenessSession).not.toHaveBeenCalled();
    const success = await fetch(base + sessionPath, {
      method: "POST",
      headers,
    });
    expect(success.status).toBe(200);
    expect(await success.json()).toEqual({
      configured: true,
      sessionId,
      authToken: "opaque",
      expiresInSeconds: 300,
    });
    expect(deps.provider.createLivenessSession).toHaveBeenCalledWith(accountId);
  });

  it("returns a clean zero-provider response after authentication", async () => {
    const deps = dependencies();
    deps.provider.livenessConfigured = false;
    const base = await listen(deps);
    expect(
      await (
        await fetch(base + sessionPath, { method: "POST", headers })
      ).json(),
    ).toEqual({ configured: false });
    expect(deps.provider.createLivenessSession).not.toHaveBeenCalled();
  });

  it("enforces admin role, input validation and image availability before streaming private bytes", async () => {
    const deps = dependencies();
    const base = await listen(deps);
    deps.authenticate.mockResolvedValueOnce({
      ...account,
      roles: ["provider"],
    });
    expect((await fetch(base + imagePath, { headers })).status).toBe(403);
    expect(
      (await fetch(base + imagePath.replace(accountId, "invalid"), { headers }))
        .status,
    ).toBe(400);
    expect(
      (
        await fetch(base + imagePath.replace("id-front", "invalid"), {
          headers,
        })
      ).status,
    ).toBe(400);
    expect(deps.getImage).not.toHaveBeenCalled();
    deps.getImage.mockResolvedValueOnce(null);
    expect((await fetch(base + imagePath, { headers })).status).toBe(404);
    const submittedAt = "2026-11-28T10:00:00Z";
    const response = await fetch(
      `${base}${imagePath}?submittedAt=${encodeURIComponent(submittedAt)}`,
      {
        headers: { Authorization: headers.Authorization },
      },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(
      Buffer.from([0xff, 0xd8, 0xff]),
    );
    expect(deps.getImage).toHaveBeenLastCalledWith(
      accountId,
      "id-front",
      submittedAt,
    );
    expect(
      (
        await fetch(`${base}${imagePath}?submittedAt=not-a-timestamp`, {
          headers,
        })
      ).status,
    ).toBe(400);
  });

  it("verifies the JWT with Supabase and uses a separate privileged client for image RPCs", async () => {
    const originalFetch = fetch;
    const calls: Array<{
      path: string;
      key: string | null;
      auth: string | null;
      body: unknown;
    }> = [];
    const fetcher: typeof fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      if (url.hostname === "127.0.0.1") return originalFetch(input, init);
      const requestHeaders = new Headers(init?.headers);
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as unknown)
          : null;
      calls.push({
        path: url.pathname,
        key: requestHeaders.get("apikey"),
        auth: requestHeaders.get("authorization"),
        body,
      });
      if (url.pathname === "/auth/v1/user") {
        return requestHeaders.get("authorization") === "Bearer fixture-token"
          ? Response.json({ id: accountId })
          : Response.json({ message: "Invalid token" }, { status: 401 });
      }
      if (url.pathname.endsWith("/rpc/account"))
        return Response.json({ id: accountId, roles: ["admin"] });
      return Response.json({ mimeType: "image/jpeg", base64: "/9j/" });
    };
    vi.stubGlobal("fetch", fetcher);
    const base = await listen(
      createVerificationServerDependencies(
        loadVerificationConfig({
          SUPABASE_URL: "https://fixture.supabase.co",
          SUPABASE_PUBLISHABLE_KEY: "publishable",
          SUPABASE_SECRET_KEY: "secret",
        }),
      ),
    );
    expect(
      (
        await fetch(base + imagePath, {
          headers: { ...headers, Authorization: "Bearer bad" },
        })
      ).status,
    ).toBe(401);
    expect(calls).toHaveLength(1);
    expect((await fetch(base + imagePath, { headers })).status).toBe(200);
    expect(calls.slice(1)).toEqual([
      {
        path: "/auth/v1/user",
        key: "publishable",
        auth: "Bearer fixture-token",
        body: null,
      },
      {
        path: "/rest/v1/rpc/account",
        key: "publishable",
        auth: "Bearer fixture-token",
        body: {},
      },
      {
        path: "/rest/v1/rpc/get_buddy_application_image",
        key: "secret",
        auth: "Bearer secret",
        body: { p_account_id: accountId, p_kind: "id-front" },
      },
    ]);
  });
});
