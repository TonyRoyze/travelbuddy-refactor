// Isolated upload contract checks: real FFmpeg, fake Supabase, no user data.
import assert from "node:assert/strict";
import sharp from "sharp";
import { createServer } from "node:http";
import type { Server } from "node:http";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

const accountId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let rejectCommit = false;
let authStatus = 200;
const uploads: { path: string; mime: string; bytes: Buffer }[] = [];
const commits: { name: string; input: Record<string, unknown> }[] = [];
let removed = 0;
const backend = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  const path = req.url ?? "";
  res.setHeader("Content-Type", "application/json");
  if (path === "/auth/v1/user") {
    res.statusCode =
      req.headers.authorization === "Bearer test-session" ? authStatus : 401;
    res.end(
      JSON.stringify(
        res.statusCode === 200
          ? { id: userId, aud: "authenticated", email: "fixture@example.test" }
          : { msg: "Authentication unavailable or invalid", code: "test_auth" },
      ),
    );
  } else if (path === "/rest/v1/rpc/account") {
    res.end(
      JSON.stringify({
        id: accountId,
        revision: 1,
        onboarding: "completed",
        roles: ["provider"],
        profileVideoIds: [],
      }),
    );
  } else if (path.startsWith("/rest/v1/rpc/commit_")) {
    commits.push({ name: path, input: JSON.parse(bytes.toString()).input });
    res.statusCode = rejectCommit ? 400 : 200;
    res.end(
      JSON.stringify(
        rejectCommit
          ? { message: "Registration rejected", code: "P0001" }
          : commits.at(-1)?.input.id,
      ),
    );
  } else if (
    path.startsWith("/storage/v1/object/buddy-media/") &&
    req.method === "POST"
  ) {
    uploads.push({ path, mime: String(req.headers["content-type"]), bytes });
    res.end(JSON.stringify({ Key: path }));
  } else if (
    path === "/storage/v1/object/buddy-media" &&
    req.method === "DELETE"
  ) {
    removed++;
    res.end("[]");
  } else {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "Unexpected fixture request" }));
  }
});
async function listen(server: Server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return address.port;
}
const backendPort = await listen(backend);
const reservation = createServer();
const mediaPort = await listen(reservation);
await new Promise<void>((resolve) => reservation.close(() => resolve()));
const dir = await mkdtemp(join(tmpdir(), "tb-media-contract-"));
const child = spawn(
  "node_modules/.bin/tsx",
  ["services/profile-media/server.ts"],
  {
    env: {
      ...process.env,
      SUPABASE_URL: `http://127.0.0.1:${backendPort}`,
      SUPABASE_PUBLISHABLE_KEY: "fixture-public-key",
      SUPABASE_SECRET_KEY: "fixture-service-key",
      SUPABASE_STORAGE_SECRET_KEY: "fixture-storage-key",
      MEDIA_HOST: "127.0.0.1",
      MEDIA_PORT: String(mediaPort),
      MEDIA_ALLOWED_ORIGINS: "http://localhost:5173",
    },
    stdio: ["ignore", "ignore", "pipe"],
  },
);
let serviceErrors = "";
child.stderr.on("data", (chunk) => {
  serviceErrors += chunk.toString();
});
const base = `http://127.0.0.1:${mediaPort}/profile-media`;
async function upload(
  bytes: Buffer,
  mime = "image/png",
  route = "package-upload",
  token = "test-session",
  kind = "photo",
) {
  return fetch(`${base}/${route}`, {
    method: "POST",
    headers: {
      Origin: "http://localhost:5173",
      Authorization: `Bearer ${token}`,
      "Content-Type": mime,
      "X-Media-Kind": kind,
      "X-Profile-Revision": "1",
    },
    body: new Uint8Array(bytes),
  });
}
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null) throw new Error(serviceErrors);
    try {
      ready = (await fetch(`${base}/health`)).ok;
    } catch {
      /* starting */
    }
    if (ready) break;
    await delay(100);
  }
  assert.ok(ready, "Upload service must start");
  for (const extension of ["png", "jpg", "webp"]) {
    const path = join(dir, `source.${extension}`);
    await sharp({
      create: {
        width: 64,
        height: 48,
        channels: 4,
        background: { r: 0, g: 128, b: 0, alpha: 0.5 },
      },
    })
      .toFormat(extension === "jpg" ? "jpeg" : (extension as "png" | "webp"))
      .toFile(path);
    const original = await readFile(path);
    const mime = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
    for (const route of ["package-upload", "upload"]) {
      const response = await upload(original, mime, route);
      assert.equal(response.status, 201, await response.text());
      const saved = uploads.at(-1)!;
      assert.match(saved.path, /\.webp$/);
      assert.equal(saved.mime, "image/webp");
      assert.equal(saved.bytes.toString("ascii", 0, 4), "RIFF");
      assert.equal(saved.bytes.toString("ascii", 8, 12), "WEBP");
      assert.equal(commits.at(-1)!.input.mimeType, "image/webp");
      assert.equal(commits.at(-1)!.input.bytes, saved.bytes.length);
      await writeFile(join(dir, "saved.webp"), saved.bytes);
      const probe = JSON.parse(
        execFileSync(
          "ffprobe",
          [
            "-v",
            "error",
            "-show_entries",
            "stream=codec_name,width,height",
            "-of",
            "json",
            join(dir, "saved.webp"),
          ],
          { encoding: "utf8" },
        ),
      );
      assert.equal(probe.streams[0].codec_name, "webp");
      assert.equal(probe.streams[0].width, 64);
      assert.equal(probe.streams[0].height, 48);
      if (extension !== "jpg") {
        const { data, info } = await sharp(saved.bytes)
          .raw()
          .toBuffer({ resolveWithObject: true });
        assert.equal(info.channels, 4, "Transparency must survive conversion");
        assert.ok(Math.abs(data[3] - 128) <= 1);
      }
    }
  }
  const oriented = await sharp(join(dir, "source.jpg"))
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const orientedResponse = await upload(oriented, "image/jpeg");
  assert.equal(orientedResponse.status, 201, await orientedResponse.text());
  const orientedMetadata = await sharp(uploads.at(-1)!.bytes).metadata();
  assert.equal(orientedMetadata.width, 48);
  assert.equal(orientedMetadata.height, 64);
  assert.equal(
    orientedMetadata.exif,
    undefined,
    "EXIF must be stripped after applying orientation",
  );
  const original = await readFile(join(dir, "source.png"));
  const count = uploads.length;
  assert.equal((await upload(original, "image/jpeg")).status, 400);
  assert.equal((await upload(Buffer.from("corrupt"))).status, 400);
  assert.equal(
    (await upload(original, "image/png", "package-upload", "invalid-session"))
      .status,
    401,
  );
  assert.equal(
    uploads.length,
    count,
    "Invalid uploads must never reach Storage",
  );
  authStatus = 503;
  assert.equal(
    (await upload(original)).status,
    503,
    "Auth outages must not be presented as signed-out sessions",
  );
  authStatus = 200;
  rejectCommit = true;
  assert.equal((await upload(original)).status, 400);
  assert.equal(
    removed,
    1,
    "Rejected registration must remove the uploaded WebP",
  );
  rejectCommit = false;
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    "color=c=green:s=64x48:r=1",
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    join(dir, "clip.mp4"),
  ]);
  const clip = await readFile(join(dir, "clip.mp4"));
  const video = await upload(
    clip,
    "video/mp4",
    "package-upload",
    "test-session",
    "video",
  );
  assert.equal(video.status, 201, await video.text());
  assert.equal(uploads.at(-1)!.mime, "video/mp4");
  assert.deepEqual(uploads.at(-1)!.bytes, clip);
  console.log(
    "Media checks passed: JPEG/PNG/WebP conversion before profile/package storage, transparency, orientation, stripped EXIF, dimensions and metadata, invalid sessions/files, auth outages, cleanup and unchanged videos.",
  );
} finally {
  const exited = once(child, "exit");
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await exited;
  }
  await new Promise<void>((resolve) => backend.close(() => resolve()));
  await rm(dir, { recursive: true, force: true });
}
