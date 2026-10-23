# Vidura marketplace features — 22 October 2026

The current Vite app implements the five requested Vidura items: PayHere payment processing, cancellation/pay-later information, Buddy package management, the provider booking/chat dashboard, and Facebook destination links. Traveler booking-history work assigned to Kasun was not expanded beyond the payment/cancellation information needed by these flows.

## PayHere and cancellation

Checkout supports online payment and optional payment on arrival. Online orders hold inventory for 15 minutes. PayHere receives the exact database total in **LKR**. Package creation, current catalog prices, cart totals and new online/arrival orders use LKR. Historical bookings retain their original recorded amounts/currencies. Free orders require no gateway transaction. Each order's payment method and cancellation terms are persisted; package edits cannot change historical booking terms.

Online orders progress through pending, paid, expired or disputed states. Only a validated server notification with the correct merchant, checksum, amount and currency can confirm payment. Returning to the website never marks an order paid. Billing/card details are entered on the hosted PayHere checkout; the app collects the billing contact/address and does not collect card numbers. The app retains one gateway attempt per order. Repeated callbacks are idempotent; a second successful payment is queued for refund. Failed/cancelled callbacks allow retry within the original hold window and do not overwrite a verified success. Chargebacks are shown as disputed and stop outstanding automatic refunds for merchant review.

Expired holds release all order items. Expiry runs during availability, checkout and traveler order/history reads, plus the payment worker. Search ignores elapsed holds even if the worker is down. A late success never restores cancelled places: it queues a refund. Cancelling an unpaid hold releases the whole order, because its single gateway session covers all items.

Cancellation/payment information appears on the experience, cart review and checkout, booking details/history and payment page. Free cancellation ends exactly 24 hours before the snapshotted start in Asia/Colombo time; the UI shows the specific deadline and the API enforces it. Other paid/arrival bookings are non-refundable. Online cancellation records a refund for the exact booking amount, allowing individual cart items to be cancelled without refunding unrelated items. Refunds remain pending until the gateway confirms them.

Buddies can enable **Allow payment on arrival** per package. Travelers can choose it only when every package in the cart offers it. The full balance is due directly to each Buddy at the meeting/pickup point; there is no online deposit or automated cash collection. This is an explicit optional setting while the long-term pay-later policy is undecided. Existing package choices are preserved, and new packages default to online payment.

## Private payment service setup

`pnpm dev` starts Vite (5173), the media service (5174) and payment service (5175). Without PayHere credentials, browsing, existing bookings, provider management and eligible pay-on-arrival checkout work; online checkout clearly shows that it is unavailable.

Copy `.env.payments.example` to the ignored `.env.payments.local` and configure:

- The existing server-only Supabase URL, publishable key and service key. Local development can reuse `.env.media.local` for these values.
- `PAYHERE_MODE=sandbox`, merchant ID, and the domain-specific merchant secret from PayHere Integrations.
- `PAYMENTS_SITE_URL`: the browser application's origin. `PAYMENTS_CALLBACK_URL`: a publicly reachable HTTPS origin forwarding `/payments-api/notify` to the payment service. PayHere cannot reach localhost; sandbox testing needs a public callback endpoint. Both settings must be origins without paths.
- `PAYHERE_APP_ID` and `PAYHERE_APP_SECRET` to enable automatic full/partial refunds through the Merchant API. Keep them server-only. PayHere requires the appropriate merchant permissions/domain/IP approval for live Merchant API calls.

Apply `pnpm db:migrate`, then start the services. For production, run `pnpm payments:serve` under a supervisor with private environment settings and proxy `/payments-api/` to its private loopback/container port. Set the site's exact HTTPS origin and switch to `PAYHERE_MODE=live` only after a successful real sandbox transaction and callback/refund check. Use the secret for that approved domain. Do not put merchant, Merchant API or service keys in `VITE_` variables.

The payment worker expires holds and processes at most one queued refund every 15 seconds. A timeout, failed response or interrupted processing is marked for merchant review; it is never retried automatically because PayHere's refund endpoint provides no app idempotency key. Check the merchant portal before retrying or resolving an uncertain refund. Without Merchant API credentials, refunds remain queued for merchant processing, never falsely marked completed. Private `payment_refunds` records retain amounts, status and gateway reference; resolve reviewed cases through trusted server administration after checking PayHere, not through a browser RPC. Logs identify refund records without logging secrets or card data.

## Buddy bookings and chat

`/account/dashboard` is available to active, onboarded Buddy/Guide accounts and linked from `/account` and the Buddy navigation. It shows upcoming and today counts, unread messages, guest/contact information, date/time/option/places, booking references and payment/refund state. Search filters include status, date, guest or reference with server pagination. The traveler inbox shows package conversations for this Buddy's experiences. Messages open the same reusable private package thread, including after a listing is unpublished. Viewing rendered messages records a participant-scoped read marker. Other providers and travelers cannot access these reservations or threads. Dashboard data polls every 15 seconds; the existing inbox polls every five seconds.

The existing full package editor remains at `/account/packages`, including media, schedules/exceptions, pricing, itinerary, drafts/publishing, revision conflict handling and booked-slot protection. It now persists the optional arrival-payment setting. Existing media and schedules remain intact; see [package editor coverage](buddy-package-editor.md).

## Destination links and Facebook previews

Share `/destinations/colombo`, `/destinations/ella`, `/destinations/nuwara-eliya`, `/destinations/sigiriya` or any slug from the 33 starter towns, plus Yala. Home destination tiles use these links. Landing pages are public, filter actual published Sri Lankan experiences for the town, keep working after reload and accept Facebook's tracking parameters. They expose copy-link and Facebook-share actions, plus a link to nearby live hosts. Changing filters carries the destination/country into normal search.

Set `PUBLIC_SITE_URL=https://your-public-origin` during `pnpm build`. The build creates 34 destination HTML files with destination-specific title, description, canonical URL and Open Graph image/text so Facebook can read previews without executing JavaScript. Serve real files/directories before the SPA fallback: Nginx `try_files $uri $uri/ /index.html;`. Rebuild when the public origin changes. Without the variable, development builds still work but canonical URLs remain relative; configure it before sharing deployed links. These pages list the current Supabase catalog in the browser; they do not contain invented offers. Use Meta's Sharing Debugger to refresh Facebook's cache after deployment. The feature does not post to Facebook or require a Facebook app/token.

## Verification

Core: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:db`, `pnpm test:compat`. Database tests run only on the disposable database and roll back fixtures. Payment tests cover server-only privileges, exact totals, replay, arrival terms, refund idempotency, chargebacks, and provider inbox ownership/read markers. Unit tests cover signatures and Merchant API refund success/failure/uncertain outcomes.

Local integrated workflow with the app/Supabase running:

```sh
pnpm test:nearby:http --keep-fixtures
PLAYWRIGHT_PYTHON=/path/to/playwright/python pnpm exec tsx scripts/test-payments-http.ts /generated/fixture.json --browser
pnpm test:nearby:http --cleanup /generated/fixture.json
```

The HTTP test starts an isolated payment service on 5176 with dummy sandbox keys, real local Auth/database requests, and signed callback fixtures. It tests tampering, duplicate notifications, expiry and late refunds. Browser checks cover editor persistence, arrival checkout, provider filtering/chat, mobile layout, and billing -> server-signed HTML form -> intercepted sandbox handoff -> verified callback -> paid state. The external PayHere request is intercepted; **no actual card transaction or real merchant refund is performed** by these tests. Actual sandbox checkout, merchant approval, public callback reachability and live settlement require the account/environment configuration above. Credentials stay in private temporary fixture files and cleanup removes only generated test data.

References: [PayHere Checkout API](https://support.payhere.lk/api-%26-mobile-sdk/checkout-api), [Refund API](https://support.payhere.lk/api-%26-mobile-sdk/refund-api).

## Traveler display currency — 22 October

Travelers choose LKR, USD, EUR, GBP, AUD, CAD, INR, JPY, SGD, CNY, AED, CHF or NZD in `/account/settings` and save their profile. This private preference persists in Supabase and follows the account across devices. Buddies author prices and see settlement amounts in LKR. Traveler discovery, package details, cart summaries and booking totals show approximate preferred-currency amounts. Checkout, payment buttons, gateway requests and arrival balances clearly retain the exact settlement amount/currency.

The public `/payments-api/exchange-rates` endpoint fetches the [Frankfurter daily LKR rates](https://frankfurter.dev/) without an API key, coalesces concurrent requests and caches them for one hour. The conversion disclaimer shows the selected quote's actual observation date. Some quotes lag today, especially on non-publication days. Cached rates up to seven days old can survive an upstream failure with their original dates; older, future, malformed or unavailable quotes are not used. Without a usable rate the UI shows the original currency amount, normally LKR. Exchange-rate data only affects display; it cannot change an invoice, reservation, cancellation amount or payment notification validation.

The additive LKR migration converts existing USD package/option prices once using the recorded 2026-10-21 USD quote fetched on 2026-10-22 (1 LKR = 0.00302 USD). It records the source prices/rate in the private `package_currency_migrations` audit table and increments revisions. Future LKR package prices do not float with daily rates. Historical reservations and paid amounts are not relabeled. Unpaid old USD gateway sessions expire at cutover; new checkout and payment attempts require LKR. Refunds of historical payments retain the original payment's currency.

Currency values are typed columns on packages/bookings and remain outside the legacy strict snapshot JSON. Legacy inventory readers retain compatibility; the archived UI still assumes USD, so use the Vite app for LKR pricing and checkout.
