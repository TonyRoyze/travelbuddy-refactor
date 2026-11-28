import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { loadVerificationConfig, type VerificationConfig } from "./config";
import { createVerificationClient } from "./db";
import { createVerificationProvider } from "./providers/in-house";
import type { IdentityVerificationProvider } from "./providers/interface";
import {
  imageKindSchema,
  imageMimeTypes,
  imageSchema,
  type ApplicationImage,
  type ImageKind,
} from "./types";

const accountSchema = z.object({
  id: z.uuid(),
  status: z.literal("active").optional(),
  roles: z.array(z.string()),
});
type Account = z.infer<typeof accountSchema>;

class RequestError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface VerificationServerDependencies {
  config: Pick<VerificationConfig, "allowedOrigins" | "mode" | "providerMode">;
  provider: Pick<
    IdentityVerificationProvider,
    "livenessConfigured" | "visionConfigured" | "createLivenessSession"
  >;
  authenticate(token: string): Promise<unknown>;
  getImage(
    accountId: string,
    kind: ImageKind,
    submittedAt?: string,
  ): Promise<ApplicationImage | null>;
}

const healthPath = "/verification-api/health";
const configPath = "/verification-api/config";
const sessionPath = "/verification-api/liveness/session";
const imagePath =
  /^\/verification-api\/admin\/applications\/([^/]+)\/images\/([^/]+)$/;

export function createVerificationServer(deps: VerificationServerDependencies) {
  return createServer(
    { requestTimeout: 50_000, headersTimeout: 10_000 },
    async (req, res) => {
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");
      const send = (status: number, body: unknown) => {
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(body));
      };
      try {
        const path = req.url?.split("?", 1)[0] ?? "";
        const origin = req.headers.origin;
        const allowed = origin && deps.config.allowedOrigins.has(origin);
        const match = path.match(imagePath);
        if (allowed) {
          res.setHeader("Access-Control-Allow-Origin", origin);
          res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
          res.setHeader(
            "Access-Control-Allow-Headers",
            "Authorization, Content-Type",
          );
        }
        res.setHeader("Vary", "Origin");
        if (
          req.method === "OPTIONS" &&
          (path === sessionPath || path === configPath || match)
        ) {
          if (!allowed)
            throw new RequestError(403, "This origin is not allowed.");
          res.writeHead(204);
          res.end();
          return;
        }

        if (req.method === "GET" && path === healthPath)
          return send(200, { ready: true });
        if (req.method === "GET" && path === configPath) {
          return send(200, {
            livenessConfigured: deps.provider.livenessConfigured,
            visionConfigured: deps.provider.visionConfigured,
            mode: deps.config.mode,
            providerMode: deps.config.providerMode,
          });
        }
        const wantsSession = req.method === "POST" && path === sessionPath;
        if (!wantsSession && !(req.method === "GET" && match))
          throw new RequestError(404, "Verification endpoint not found.");
        // Same-origin image fetches may omit Origin. A known cross-origin caller must be allowlisted.
        if ((origin && !allowed) || (wantsSession && !allowed))
          throw new RequestError(403, "This origin is not allowed.");
        const token =
          req.headers.authorization?.match(/^Bearer ([^\s,]+)$/i)?.[1];
        if (!token) throw new RequestError(401, "Sign in to continue.");
        const account = accountSchema.safeParse(await deps.authenticate(token));
        if (!account.success)
          throw new RequestError(403, "Your account is unavailable.");

        if (wantsSession) {
          req.resume();
          if (!deps.provider.livenessConfigured)
            return send(200, { configured: false });
          const session = await deps.provider.createLivenessSession(
            account.data.id,
          );
          return send(
            200,
            session ? { configured: true, ...session } : { configured: false },
          );
        }

        if (!account.data.roles.includes("admin"))
          throw new RequestError(403, "Administrator access is required.");
        const accountId = z.uuid().safeParse(match?.[1]);
        const kind = imageKindSchema.safeParse(match?.[2]);
        const url = new URL(req.url ?? "", "http://localhost");
        const submittedAtParam = url.searchParams.get("submittedAt");
        const submittedAt =
          submittedAtParam === null
            ? undefined
            : z.iso.datetime({ offset: true }).safeParse(submittedAtParam);
        if (
          !accountId.success ||
          !kind.success ||
          (submittedAt !== undefined && !submittedAt.success)
        )
          throw new RequestError(400, "Choose a valid application and image.");
        const image = await deps.getImage(
          accountId.data,
          kind.data,
          submittedAt?.data,
        );
        if (!image)
          throw new RequestError(404, "Application image is unavailable.");
        const mime = z.enum(imageMimeTypes).safeParse(image.mimeType);
        const content = Buffer.from(image.base64, "base64");
        if (!mime.success || !content.length)
          throw new RequestError(404, "Application image is unavailable.");
        res.writeHead(200, {
          "Content-Type": mime.data,
          "Content-Length": content.length,
        });
        res.end(content);
      } catch (error) {
        send(error instanceof RequestError ? error.status : 503, {
          error:
            error instanceof RequestError
              ? error.message
              : "Verification is temporarily unavailable. Please try again.",
        });
      }
    },
  );
}

export function createVerificationServerDependencies(
  config: VerificationConfig,
): VerificationServerDependencies {
  const { supabaseUrl, supabasePublishableKey, supabaseSecretKey } = config;
  const service =
    supabaseUrl && supabaseSecretKey
      ? createVerificationClient(supabaseUrl, supabaseSecretKey)
      : null;
  return {
    config,
    provider: createVerificationProvider(config),
    authenticate: async (token): Promise<Account | null> => {
      if (!supabaseUrl || !supabasePublishableKey)
        throw new RequestError(
          503,
          "Sign-in verification is temporarily unavailable.",
        );
      const client = createVerificationClient(
        supabaseUrl,
        supabasePublishableKey,
        token,
      );
      const user = await client.auth.getUser(token);
      if (user.error && (!user.error.status || user.error.status >= 500))
        throw new RequestError(
          503,
          "Sign-in verification is temporarily unavailable.",
        );
      if (user.error || !user.data.user)
        throw new RequestError(401, "Sign in to continue.");
      const account = await client.rpc("account");
      return account.error ? null : accountSchema.parse(account.data);
    },
    getImage: async (accountId, kind, submittedAt) => {
      if (!service)
        throw new RequestError(
          503,
          "Application images are temporarily unavailable.",
        );
      const result = await service.rpc("get_buddy_application_image", {
        p_account_id: accountId,
        p_kind: kind,
        ...(submittedAt ? { p_submission: submittedAt } : {}),
      });
      if (result.error) throw new Error("Could not load application image.");
      return imageSchema.nullable().parse(result.data);
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const config = loadVerificationConfig();
    const server = createVerificationServer(
      createVerificationServerDependencies(config),
    );
    server.on("error", () => {
      console.error("Verification API could not start.");
      process.exitCode = 1;
    });
    server.listen(config.port, config.host);
    const stop = () => server.close();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch {
    console.error("Verification API configuration is invalid.");
    process.exitCode = 1;
  }
}
