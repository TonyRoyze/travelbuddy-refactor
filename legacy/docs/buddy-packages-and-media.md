# Buddy packages and video clips

Buddy accounts open **Your account → My packages** to create or edit their own experiences. Packages start as drafts and can be published or unpublished. Publishing requires a destination, country, category, description, meeting point, and cover photo. Existing sample packages remain separate from buddy-owned packages.

The editor includes photos, up to three video clips, USD prices per person, group limits, start times in Sri Lanka time, languages, inclusions, cancellation terms, pickup, and itinerary stops. Published packages appear in package search and have public pages at `/experience/[id]`. Operating calendars, live capacity, checkout and cancellation are backed by persistent inventory; see [live availability and profile photos](live-availability-and-profile-photos.md).

**Account settings** includes a separate profile-clips section. Saving these clips makes them visible on the public buddy page at `/buddy/[accountId]`. Package clips become public when their package is published. Unattached uploads and draft-only media are available only to the uploading buddy. Removing all public references removes access through the app immediately; an already issued playback link remains valid for up to one hour.

## Setup

1. Apply the private-schema migrations with `pnpm db:documents:deploy`, using the existing dedicated migration connection.
2. Set `SUPABASE_URL` and a server-only `SUPABASE_STORAGE_SECRET_KEY`, or the existing `SUPABASE_SECRET_KEY`. Never put either secret in a `NEXT_PUBLIC_` variable.
3. Run `pnpm db:media:setup` once to create or configure the private `buddy-media` bucket. The browser uploads through the authenticated app API; no browser Storage policies or service keys are needed.
4. Install `ffprobe` on the app host. The Docker image includes it via FFmpeg. Set `FFPROBE_PATH` if it is outside the process PATH.
5. Restart the development server after generating the changed Prisma client.

Uploads accept H.264/AV1 MP4 or VP8/VP9/AV1 WebM clips up to 60 seconds and 25 MiB. Photos accept JPEG, PNG, or WebP up to 25 MiB. Media dimensions must not exceed 4096 pixels in either direction. The API checks actual media contents and video duration using ffprobe and limits multipart request sizes while reading. Configure an upstream reverse proxy to accept at least 26 MiB request bodies and allow sufficient upload time.

Media bytes live in Supabase Storage; ownership and metadata live in `travelbuddy_backend.media_assets`. The private schema grants database access only to the backend runtime role, with RLS enabled. Package writes and media attachments verify the signed-in buddy’s ownership. Revision checks prevent an outdated editor from overwriting newer changes. Uploads use unique paths. Removing a file from an editor detaches it when saved; uploaded objects are retained in storage for now, including abandoned uploads.

## Verification

Run `pnpm test:buddy:http` against the local app and local Supabase after setup. It creates temporary buddy/traveller accounts, generates real media with FFmpeg, and checks uploads, byte-range playback, invalid and oversized files, server-enforced clip duration, role/origin protection, ownership, drafts, publishing, package search, stale revisions, profile clips, and removal. Test packages, accounts, and stored files are cleaned up afterwards.
