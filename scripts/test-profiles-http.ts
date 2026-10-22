import assert from "node:assert/strict";
import { loadEnvFile } from "node:process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/types/database";
import type { Account, BuddyProfile } from "../src/features/account/types";
loadEnvFile(".env.media.local");
const url = process.env.SUPABASE_URL!;
assert.ok(
  ["localhost", "127.0.0.1"].includes(new URL(url).hostname),
  "Local tests only",
);
const fixture = JSON.parse(await readFile(process.argv[2], "utf8")) as {
  users: { email: string; password: string; accountId: string }[];
};
const client = () =>
  createClient<Database, "travelbuddy_api">(
    url,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      db: { schema: "travelbuddy_api" },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
const host = client(),
  traveler = client(),
  anon = client();
for (const [index, c] of [host, traveler].entries()) {
  const { error } = await c.auth.signInWithPassword(fixture.users[index]);
  assert.ifError(error);
}
async function account(c = host) {
  const r = await c.rpc("account");
  assert.ifError(r.error);
  return r.data as unknown as Account;
}
const dir = await mkdtemp(join(tmpdir(), "tb-profile-test-"));
try {
  for (const [name, args] of Object.entries({
    "photo.png": [
      "-f",
      "lavfi",
      "-i",
      "color=c=green:s=128x128",
      "-frames:v",
      "1",
    ],
    "clip.mp4": [
      "-f",
      "lavfi",
      "-i",
      "color=c=green:s=128x128:r=1",
      "-t",
      "1",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
    ],
    "long.mp4": [
      "-f",
      "lavfi",
      "-i",
      "color=c=green:s=128x128:r=1",
      "-t",
      "61",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
    ],
  }))
    execFileSync("ffmpeg", ["-loglevel", "error", ...args, join(dir, name)]);
  const photo = await readFile(join(dir, "photo.png")),
    clip = await readFile(join(dir, "clip.mp4"));
  async function upload(
    bytes: Uint8Array,
    mime: string,
    kind: string,
    c = host,
    revision?: number,
    origin = "http://127.0.0.1:5173",
  ) {
    const token = (await c.auth.getSession()).data.session?.access_token;
    const response = await fetch("http://127.0.0.1:5173/profile-media/upload", {
      method: "POST",
      headers: {
        Origin: origin,
        Authorization: token ? `Bearer ${token}` : "",
        "Content-Type": mime,
        "X-Media-Kind": kind,
        "X-Profile-Revision": String(
          revision ?? (token ? (await account(c)).revision : 0),
        ),
      },
      body: new Uint8Array(bytes),
    });
    const body = await response.json();
    return { status: response.status, body };
  }
  assert.equal((await upload(photo, "image/png", "photo", anon)).status, 401);
  assert.equal(
    (
      await upload(
        photo,
        "image/png",
        "photo",
        host,
        undefined,
        "https://wrong.example",
      )
    ).status,
    403,
  );
  assert.equal(
    (await upload(Buffer.alloc(6 * 1024 * 1024), "image/png", "photo")).status,
    413,
  );
  assert.equal((await upload(photo, "image/jpeg", "photo")).status, 400);
  assert.equal(
    (await upload(Buffer.from("not a photo"), "image/png", "photo")).status,
    400,
  );
  assert.equal(
    (await upload(await readFile(join(dir, "long.mp4")), "video/mp4", "video"))
      .status,
    400,
  );
  const previous = await account();
  const profileInput = {
    displayName: previous.displayName,
    profileDetails: previous.profileDetails,
  };
  assert.ifError(
    (
      await host.rpc("save_profile", {
        input: profileInput,
        expected_revision: previous.revision,
      })
    ).error,
  );
  const started = Date.now();
  const conflict = await host.rpc("save_profile", {
    input: profileInput,
    expected_revision: previous.revision,
  });
  assert.equal(conflict.status, 409);
  assert.ok(
    Date.now() - started < 5000,
    "Stale profile edits must return promptly",
  );
  const before = await account();
  const saved = await upload(photo, "image/png", "photo");
  assert.equal(saved.status, 201, JSON.stringify(saved.body));
  assert.equal((await account()).avatarMediaId, saved.body.mediaId);
  assert.equal(
    (await upload(photo, "image/png", "photo", host, before.revision)).status,
    409,
  );
  const publicProfile = await anon.rpc("buddy_profile", {
    profile_id: fixture.users[0].accountId,
  });
  assert.ifError(publicProfile.error);
  assert.equal(
    (publicProfile.data as unknown as BuddyProfile).avatarMediaId,
    saved.body.mediaId,
  );
  assert.ok(
    !JSON.stringify(publicProfile.data).includes(fixture.users[0].email),
  );
  const signed = await anon.functions.invoke("media-url", {
    body: { id: saved.body.mediaId },
  });
  assert.ifError(signed.error);
  assert.equal((await fetch(signed.data.url)).status, 200);
  const travelerPhoto = await upload(photo, "image/png", "photo", traveler);
  assert.equal(travelerPhoto.status, 201, JSON.stringify(travelerPhoto.body));
  assert.ok(
    (await anon.rpc("media_path", { media_id: travelerPhoto.body.mediaId }))
      .error,
  );
  assert.equal(
    (await upload(clip, "video/mp4", "video", traveler)).status,
    403,
  );
  for (let n = 0; n < 3; n++) {
    const result = await upload(clip, "video/mp4", "video");
    assert.equal(result.status, 201, JSON.stringify(result.body));
  }
  assert.equal((await account()).profileVideoIds.length, 3);
  assert.equal((await upload(clip, "video/mp4", "video")).status, 400);
  const a = await account(),
    reversed = [...a.profileVideoIds].reverse();
  const reordered = await host.rpc("set_profile_media", {
    input: { kind: "videos", ids: reversed },
    expected_revision: a.revision,
  });
  assert.ifError(reordered.error);
  assert.deepEqual((await account()).profileVideoIds, reversed);
  const foreign = await traveler.rpc("set_profile_media", {
    input: { kind: "photo", id: saved.body.mediaId },
    expected_revision: (await account(traveler)).revision,
  });
  assert.ok(foreign.error);
  console.log(
    "Profile HTTP checks passed: real uploads and signing, public/private media access, forged files, duration/size limits, stale revisions, clip limits/order and ownership.",
  );
} finally {
  await rm(dir, { recursive: true, force: true });
}
