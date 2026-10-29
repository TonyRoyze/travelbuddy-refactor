# Profiles and media

Account overview is at `/account`, Traveller editing at `/account/settings`, Buddy editing at `/account/profile`, and account access at `/account/security`. Existing account JSON fields and media IDs are retained. Travellers can edit name, bio, home base, languages, interests and travel style. Buddies/Guides can edit specialties and years of experience instead. Photo uploads support JPEG, PNG and WebP up to 5 MB. Buddy/Guide introduction videos support MP4/WebM up to 25 MB and 60 seconds each, with at most three clips; clips can be reordered or removed. Light/dark/system display preferences persist in this browser.

Public `/buddy/:id` pages show active, completed Buddy/Guide profiles and their published experiences. Email, private traveller fields, internal roles and Auth identifiers are omitted from the public response. Traveller profiles are private. Package host names and nearby results link to the public profile.

## Local upload service

Install FFmpeg (`brew install ffmpeg` on macOS) so `ffprobe` is on PATH, or set `FFPROBE_PATH`. Copy `.env.media.example` to `.env.media.local` and configure server credentials for the same Supabase instance as `.env.local`. Keep this file private; service credentials must never have a `VITE_` prefix. Apply `pnpm db:migrate` and run `pnpm dev` to start Vite on 5173 and the upload service on 5174. `pnpm media:serve` runs just the upload service. Existing Supabase Storage and the `media-url` Edge Function are required.

The browser sends raw file bytes to same-origin `/profile-media/upload`. The service verifies the Auth JWT, account state, role and revision; checks actual format, dimensions, duration and byte count with ffprobe; converts photos to WebP with Sharp at quality 82, applying photo orientation, preserving transparency and stripping metadata; uploads to the private `buddy-media` bucket; and atomically registers/attaches the media through a service-only RPC. Package uploads use the same conversion through `/profile-media/package-upload`. Only the converted photo is uploaded, with a `.webp` path, `image/webp` content type and converted byte count. Animated images become a still image using their first frame. Videos retain their original format. Existing stored photos remain readable. A failed conversion saves nothing; a failed registration removes the uploaded object. Concurrent profile edits return a conflict instead of overwriting another edit. Uploading media preserves unsaved text fields in the editor.

`pnpm dev` checks that the browser's public API key is accepted by the upload service's Supabase instance when their URLs and keys differ. If the browser uses a remote instance but `.env.media.local` still points at local Supabase, signed-in uploads fail with a sign-in error. Set `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and, if needed, `SUPABASE_STORAGE_SECRET_KEY` in `.env.media.local` to that remote instance's credentials, then restart `pnpm dev`. Never copy a server key into `.env.local` or a `VITE_` variable.

Removing or replacing media detaches it from the profile. Previously signed URLs may remain usable for their five-minute lifetime. Detached media stays privately owned, matching legacy storage behavior; this feature does not permanently delete historical files.

## Deployment

The static Vite build needs the separate Node upload service. Run `pnpm media:serve` under a process supervisor with Node 22.12+, installed ffprobe and private environment variables. Proxy `/profile-media/` to that service on the same public origin, set `MEDIA_ALLOWED_ORIGINS` to the exact public HTTPS origin, and permit request bodies up to 26 MB with a timeout longer than 45 seconds. Keep the service port private. The service binds to loopback by default; set `MEDIA_HOST=0.0.0.0` only when required by the container network. Storage signing uses the existing Edge Function.

## Verification

`pnpm test:media:http` runs the upload service against an isolated fake Supabase backend with real image conversion and FFmpeg validation. It checks WebP output for profile and package uploads, transparency, orientation and metadata removal, invalid files and sessions, Auth outages, rollback cleanup and video preservation without accessing user data.

`pnpm test:db` includes profile persistence, stale revision, ownership, role escalation and public field/media authorization checks on the disposable database. For local real-upload checks, start the app and run:

```sh
pnpm test:nearby:http --keep-fixtures
pnpm exec tsx scripts/test-profiles-http.ts /path/printed/by/fixture/command/fixture.json
pnpm test:nearby:http --cleanup /path/printed/by/fixture/command/fixture.json
```

The last command removes only the generated accounts, users, packages and their media objects. The HTTP checks use local Supabase and FFmpeg and cover signed URLs, private traveller photos, forged/corrupt files, upload limits, role/ownership restrictions and stale edits.
