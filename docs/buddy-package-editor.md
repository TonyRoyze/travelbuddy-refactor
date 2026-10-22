# Buddy package management

Buddy and Guide accounts have a dedicated dashboard at `/account`: My packages, Buddy profile, Bookings & conversations at `/account/dashboard`, Traveller conversations, account access, and live discovery controls. Traveller accounts retain their personal bookings, cart and settings. Buddy profile editing lives at `/account/profile`; a Buddy visiting `/account/settings` is redirected there. Owners also get management links on their public Buddy profile.

`/account/packages` lists only the signed-in Buddy’s packages, including drafts. Create at `/account/packages/new` or edit at `/account/packages/:id`. Restored legacy capabilities:

- Title, destination, country, category, story, duration and highlights.
- Up to six photos, cover ordering, removal and signed previews; up to three introduction clips with ordering, removal and playback. Package files use the shared `file-upload.tsx` component, actual upload progress and server-side format validation. Photos support JPEG/PNG/WebP; clips MP4/WebM, 60 seconds maximum. Each package file is limited to 25 MB. Profile photos retain their separate 5 MB limit.
- Up to eight pricing options, prices in LKR per person, capacity of 1–12 guests, and up to 24 start times per option.
- Operating date range, weekly operating days, and up to 366 unique date overrides for closures, special capacity or start times.
- Languages, meeting point, included/excluded items, pickup, free cancellation and optional full payment on arrival.
- Up to 20 itinerary stops, draft saving, publishing, unpublishing, public listing links, unsaved-change protection and conflict recovery.
- Upcoming reserved places, grouped by date/time/option and refreshed every 30 seconds. Schedule edits cannot remove future booked slots, rename booked options or reduce capacity below reservations. Checkout and editing use the same package row locks and slot rules.

New packages derive ownership and supplier name from the authenticated Buddy. All mutations check the active/completed provider role and ownership in Postgres, with explicit private function grants and a restricted executor. Stale revisions return HTTP 409. Existing catalog photos remain editable without replacing them or accepting arbitrary external media URLs. Drafts are private. Publishing requires a cover photo, destination, country, category, meeting point and at least 20 characters of description. Each Buddy can keep at most 100 packages.

Package uploads use the existing Node media service at `/profile-media/package-upload`. Validated files are registered privately; the package save attaches them. Uploaded files do not alter the Buddy’s profile photo or introduction clips. Unused uploads remain privately owned, consistent with the legacy media lifecycle. Updating a package’s destination or meeting-point description clears its old discovery pin; save a matching pin from the Buddy dashboard before it can appear in Nearby again.

Apply `pnpm db:migrate`, then run `pnpm dev` (Vite, media and payment services). Existing private `.env.media.local`, FFmpeg/ffprobe, private `buddy-media` storage and the `media-url` Edge Function are required; see [profile service setup](profile-parity.md).

Validation includes database authorization/publishing/revision/booked-slot tests, unit validation, the legacy booking compatibility suite, and real browser draft/media/publish/reload/conflict/mobile/Traveller-denial flows. No production accounts or packages are created by these tests.
