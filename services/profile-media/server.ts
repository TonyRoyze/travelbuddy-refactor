import { createServer } from "node:http";
import { loadEnvFile } from "node:process";
import { existsSync } from "node:fs";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../../src/types/database";
if (existsSync(".env.media.local")) loadEnvFile(".env.media.local");
const url = process.env.SUPABASE_URL,
  key = process.env.SUPABASE_PUBLISHABLE_KEY,
  secret = process.env.SUPABASE_SECRET_KEY;
if (!url || !key || !secret)
  throw new Error(
    "Configure the profile upload service in .env.media.local; see .env.media.example.",
  );
const allowed = new Set(
  (
    process.env.MEDIA_ALLOWED_ORIGINS ??
    "http://localhost:5173,http://127.0.0.1:5173"
  ).split(","),
);
const service = createClient<Database, "travelbuddy_api">(url, secret, {
  db: { schema: "travelbuddy_api" },
  auth: { persistSession: false, autoRefreshToken: false },
});
const storage = process.env.SUPABASE_STORAGE_SECRET_KEY
  ? createClient(url, process.env.SUPABASE_STORAGE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : service;
const exec = promisify(execFile);
const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
};
class UploadError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const active = new Set<string>();
const server = createServer(
  { requestTimeout: 45000, headersTimeout: 10000 },
  async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const send = (status: number, body: unknown) => {
      res.writeHead(status);
      res.end(JSON.stringify(body));
    };
    if (req.url === "/profile-media/health" && req.method === "GET") {
      send(200, { ready: true });
      return;
    }
    let actor: string | undefined,
      storagePath: string | undefined,
      committed = false;
    try {
      const packageUpload = req.url === "/profile-media/package-upload";
      if (
        (!packageUpload && req.url !== "/profile-media/upload") ||
        req.method !== "POST"
      )
        throw new UploadError("Upload endpoint not found.", 404);
      if (!allowed.has(req.headers.origin ?? ""))
        throw new UploadError(
          "Open your profile in TravelBuddy before uploading.",
          403,
        );
      const authorization = req.headers.authorization;
      if (!authorization?.startsWith("Bearer "))
        throw new UploadError("Sign in before uploading.", 401);
      const client = createClient<Database, "travelbuddy_api">(url, key, {
        db: { schema: "travelbuddy_api" },
        global: { headers: { Authorization: authorization } },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const verified = await client.auth.getUser(authorization.slice(7));
      if (verified.error || !verified.data.user)
        throw new UploadError("Sign in before uploading.", 401);
      const account = await client.rpc("account");
      if (account.error)
        throw new UploadError("Your account is unavailable.", 403);
      const a = account.data as {
        id: string;
        revision: number;
        onboarding: string;
        roles: string[];
        profileVideoIds: string[];
      };
      if (a.onboarding !== "completed")
        throw new UploadError("Complete registration first.", 403);
      const mime = req.headers["content-type"] ?? "",
        kind = req.headers["x-media-kind"],
        revision = Number(req.headers["x-profile-revision"]);
      if (
        !["photo", "video"].includes(String(kind)) ||
        !extensions[mime] ||
        (kind === "photo"
          ? !mime.startsWith("image/")
          : !mime.startsWith("video/"))
      )
        throw new UploadError(
          "Choose a JPEG, PNG, WebP photo or MP4/WebM clip.",
        );
      if (
        !packageUpload &&
        (!Number.isInteger(revision) || revision !== a.revision)
      )
        throw new UploadError(
          "Your profile changed. Reload it before uploading again.",
          409,
        );
      if (
        (packageUpload || kind === "video") &&
        !a.roles.some((role) => ["provider", "guide"].includes(role))
      )
        throw new UploadError(
          "Only buddies and guides can publish introduction videos.",
          403,
        );
      if (!packageUpload && kind === "video" && a.profileVideoIds.length >= 3)
        throw new UploadError(
          "Remove a clip before uploading another. You can save up to three.",
        );
      if (active.size >= 4 || active.has(verified.data.user.id))
        throw new UploadError(
          "An upload is already in progress. Try again shortly.",
          429,
        );
      actor = verified.data.user.id;
      active.add(actor);
      const max =
        kind === "photo" && !packageUpload ? 5 * 1024 * 1024 : 25 * 1024 * 1024;
      if (Number(req.headers["content-length"]) > max)
        throw new UploadError(
          kind === "photo" && !packageUpload
            ? "Photos must be 5 MB or smaller."
            : "Files must be 25 MB or smaller.",
          413,
        );
      let size = 0;
      const chunks: Buffer[] = [];
      for await (const part of req) {
        const chunk = Buffer.from(part);
        size += chunk.length;
        if (size > max) throw new UploadError("This file is too large.", 413);
        chunks.push(chunk);
      }
      if (!size) throw new UploadError("Choose a non-empty file.");
      const bytes = Buffer.concat(chunks),
        dir = await mkdtemp(join(tmpdir(), "tb-profile-media-"));
      let duration: number | null = null;
      try {
        const path = join(dir, "upload." + extensions[mime]);
        await writeFile(path, bytes);
        let probe: {
          format?: { duration?: string; format_name?: string };
          streams?: {
            codec_type?: string;
            codec_name?: string;
            width?: number;
            height?: number;
          }[];
        };
        try {
          const { stdout } = await exec(
            process.env.FFPROBE_PATH ?? "ffprobe",
            [
              "-v",
              "error",
              "-protocol_whitelist",
              "file,pipe",
              "-show_entries",
              "format=duration,format_name:stream=codec_type,codec_name,width,height",
              "-of",
              "json",
              path,
            ],
            { timeout: 15000, maxBuffer: 65536 },
          );
          probe = JSON.parse(stdout);
        } catch {
          throw new UploadError(
            "This file could not be read. Choose a valid photo or export a valid video clip.",
          );
        }
        const video = probe.streams?.find(
          (stream) => stream.codec_type === "video",
        );
        if (
          !video?.width ||
          !video.height ||
          video.width > 4096 ||
          video.height > 4096
        )
          throw new UploadError("Use dimensions up to 4096 × 4096.");
        if (kind === "photo") {
          const codecs: Record<string, string> = {
            "image/jpeg": "mjpeg",
            "image/png": "png",
            "image/webp": "webp",
          };
          if (video.codec_name !== codecs[mime])
            throw new UploadError(
              "The photo contents do not match its file type.",
            );
        } else {
          duration = Number(probe.format?.duration);
          const format = mime === "video/mp4" ? /mp4/ : /webm/;
          const codecs =
            mime === "video/mp4" ? ["h264", "av1"] : ["vp8", "vp9", "av1"];
          if (
            !format.test(probe.format?.format_name ?? "") ||
            !codecs.includes(video.codec_name ?? "")
          )
            throw new UploadError("Export an H.264 MP4 or VP8/VP9 WebM video.");
          if (!Number.isFinite(duration) || duration <= 0 || duration > 60)
            throw new UploadError("Video clips must be 60 seconds or shorter.");
        }
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
      const id = randomUUID();
      storagePath = `${a.id}/${id}.${extensions[mime]}`;
      const uploaded = await storage.storage
        .from("buddy-media")
        .upload(storagePath, bytes, { contentType: mime, upsert: false });
      if (uploaded.error)
        throw new UploadError("Upload failed. Please try again.", 503);
      const metadata = {
        id,
        path: storagePath,
        mimeType: mime,
        bytes: size,
        duration,
      };
      const saved = packageUpload
        ? await service.rpc("commit_package_upload", {
            actor_id: actor,
            input: metadata,
          })
        : await service.rpc("commit_profile_upload", {
            actor_id: actor,
            input: metadata,
            expected_revision: revision,
          });
      if (saved.error)
        throw new UploadError(
          saved.error.message,
          ["40001", "PT409"].includes(saved.error.code) ? 409 : 400,
        );
      committed = true;
      send(201, { mediaId: id });
    } catch (error) {
      if (storagePath && !committed) {
        const removed = await storage.storage
          .from("buddy-media")
          .remove([storagePath]);
        if (removed.error)
          console.error("Failed to remove a rejected profile upload.");
      }
      send(error instanceof UploadError ? error.status : 503, {
        error:
          error instanceof UploadError
            ? error.message
            : "Your file could not be saved. Please try again.",
      });
    } finally {
      if (actor) active.delete(actor);
    }
  },
);
server.listen(
  Number(process.env.MEDIA_PORT ?? 5174),
  process.env.MEDIA_HOST ?? "127.0.0.1",
  () => console.log("Profile media service ready."),
);
