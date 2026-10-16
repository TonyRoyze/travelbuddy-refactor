# Profile photos and live booking inventory

Travelers and buddies can upload, replace, or remove a profile photo in **Your account → Account settings**. JPEG, PNG and WebP photos up to 5 MiB are accepted. The server validates actual file contents using ffprobe. Photos are stored in the existing private Supabase bucket with an owner-bound media record. Traveler photos remain private; buddy photos appear on the public buddy profile. Updated photos appear in the account header and profile screens after saving.

## Scheduling

The package editor includes an operating date range, weekly operating days, and date-specific exceptions. An exception can close a date or open it with custom capacity and start times. Start times use **Asia/Colombo**. Each package option, date and start time has its own capacity; options do not share a common pool of places. Travelers can book up to 180 days ahead.

Packages with no saved schedule retain the prior default: Monday–Saturday, with a rolling 180-day window. Saving a schedule makes the date range explicit. The editor shows upcoming reserved places. A package edit cannot remove a future booked option/start time or reduce its capacity below existing reservations. Unpublishing stops new bookings and preserves existing bookings.

## Booking behavior

Experience pages, including buddy listings, use `GET /api/packages/[id]/availability`. Availability refreshes every 15 seconds and when the page regains focus. Package search date and live-availability filters use the same server inventory. The cart does **not** reserve places.

Checkout posts all cart items to `POST /api/bookings`. The server locks package rows in stable ID order, checks their latest publication state, schedule, capacity and prices, and creates the entire booking order in one database transaction. A failure rolls back all items. Concurrent checkouts cannot reserve the same last places. Cart data and browser storage cannot override server capacity or prices.

Checkout requests include a per-account idempotency key retained across retries and page reloads in the same browser tab. Retrying identical details returns the existing reservations; reusing a key with different details fails. Package details and cancellation terms are snapshotted at booking time. No payment gateway or payment collection is added by this feature.

`GET /api/bookings` returns only the signed-in account’s bookings. Booking and confirmation screens refresh from this API, including on another device. Cancellation verifies ownership and the original cancellation terms, locks the same package row, and releases places exactly once. Booked travelers retain access to their package’s saved photos/clips if a listing is unpublished. Reviews remain a separate browser-based feature.

Old local demonstration bookings are not imported into inventory. Server booking orders are the source of truth. The new `booking_orders` and `scheduled_bookings` tables live in the private backend schema, with RLS, restricted grants, foreign keys, constraints and indexes.

## Setup and verification

Run `pnpm db:documents:generate` and `pnpm db:documents:deploy` using the existing migration connection, then restart the app after client generation. Existing package catalog records are reused; no catalog reseeding is required. Media setup and ffprobe requirements remain as documented in [buddy packages and media](buddy-packages-and-media.md).

Run `pnpm test:inventory:http` against the local app and local Supabase. It creates temporary users and an experience, tests photo upload/replacement/removal/privacy, schedules and exceptions, simultaneous capacity conflicts, idempotent retries, full-cart rollback, booking ownership, cancellation, live search, schedule protection, access to booking snapshots and private-table permissions, then cleans up its records and uploaded objects.

## Book Now and provider chat

The booking panel defaults to today in Asia/Colombo and selects the earliest future start time with enough live places for the selected party. If today has no space, it selects the next available date and time and explains the change. Explicit date/time selections are retained when still available. Book Now adds the selection to the cart and opens checkout; the traveler still reviews and confirms before a reservation is made.

Chat with provider is available from the package booking panel and the cart/review screen. It opens a private inbox thread without creating a booking or public travel request. The server resolves the active provider from the published package, preventing recipient spoofing and self-chat. Concurrent starts reuse a thread for that traveler, provider and package; different packages have separate threads. Both participants can exchange messages through the existing inbox. The package title and return-to-booking link appear in the thread, retaining date, time, option and party size during the round trip. Returning to a package rechecks live availability. Listings with no provider account display an unavailable-chat message. Unpublishing blocks new starts but preserves existing private history.

Apply all document migrations and regenerate the Prisma client before running this feature. `pnpm test:inventory:http` also verifies package chat privacy, host resolution, thread reuse, package isolation, message exchange and no booking side effects.
