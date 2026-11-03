# TravelBuddy Atelier UI redesign verification

Date: 30 October 2026 (Asia/Colombo). Branch: `codex/atelier-ui-redesign`.

## Scope and preservation

UI changes only; backend files changed: **0**; API and business logic changes: **0**; new functional features: **0**; new dependencies: **0**.

`/prompt for ui/` is ignored in `.gitignore`, including the supplied references and local QA artifacts. `git check-ignore` confirms the prompt is ignored. Pre-existing untracked `.next/`, `.next-package-search-build/`, and `src/generated/` were recorded and left untouched.

Changes introduce the specified linen/ink/forest palette, light/dark semantic tokens, DM Sans / Instrument Serif typography (with fallbacks), 6px action geometry, quieter cards/alerts/dialogs, visible focus states, reduced-motion overrides, an editorial split hero, text categories, square borderless listings, and a safe-area-aware floating four-tab dock. Product/forms/price text stays sans-serif. Existing real media URLs and data remain intact. All four existing Home featured results are retained; their layout is three columns on desktop.

Booking selection remains in its existing position and keeps its existing interaction. The filter disclosure remains the existing expand/collapse control. New sheets/sticky booking flows were skipped because they require interaction/state work beyond the UI-only contract. Existing desktop destinations, role-specific navigation and focused-route conditions are retained. No wishlist or fake production content was added.

## Behavior and file audit

Every TSX diff was reviewed. An additional local TypeScript AST comparison against HEAD confirms all 18 edited shell/feature files preserve non-JSX logic and nonpresentation JSX props, including handlers, names, validation props, navigation/search targets and query options. The comparison normalizes formatting, removes JSX presentation, excludes className and media presentation props, and permits removal of the decorative brand image. This is static evidence, not a substitute for authenticated end-to-end tests.

`src/app/theme.tsx`, all route definitions, API/query clients, validation, auth/session implementation, business models/providers, server/services, database/Supabase, migrations, configuration, package manifest and lockfile have no diff. Shared primitive changes affect class strings and presentation only. The `.gitignore` edit is explicitly requested; this report is documentation.

Local audit evidence: `prompt for ui/qa/implementation/behavior-audit.json` and `audit-behavior.mjs` (ignored).

## Verification results

- PASS: `node node_modules/typescript/bin/tsc -b`.
- PASS: `node node_modules/vite/bin/vite.js build`.
- PASS: `node --import tsx scripts/build-destination-pages.ts` (34 destination pages). Existing environment warning: `PUBLIC_SITE_URL` is unset, so generated canonical URLs are relative.
- PASS: `node node_modules/vitest/vitest.mjs run`: **11 test files, 39 tests** (existing booking/cart/attempt, auth, currency, profile, package, nearby, validation, PayHere, refund and exchange-rate tests).
- PASS: maintained-source lint: `node node_modules/eslint/bin/eslint.js src scripts services vite.config.ts eslint.config.js --ignore-pattern 'src/generated/**'`.
- Full `eslint .`: FAILED with **9,861 errors** in the pre-existing generated/build trees (`.next-package-search-build/` and `src/generated/`). Those unrelated artifacts/configuration were not modified to suppress errors.
- PASS: changed UI files checked/formatted with the existing Prettier installation.
- PASS: `git diff --check`.
- Browser: Home, Search, Detail and Nearby initial state tested at 1440×900, 1024×768, 820×1180, 390×844, 360×780. No horizontal document overflow after fixing wrapping for long backend errors.
- Browser: destination filter `Ella` applied through the existing form; heading/result and URL remained correct after refresh.
- Browser: gallery opens; Escape closes it and restores focus to the original photo button.
- Browser: all 17 protected URL patterns redirect to sign-in with their `returnTo` preserved. These are gate checks, **not** authenticated flow passes. Dynamic protected routes use an explicitly unavailable test identifier, never a claimed real booking/order.
- Browser: actual shared Button/Input/Card/Badge/Alert/Bubble components inspected in an ignored local light/dark QA fixture. Primary buttons measure **48px** high with **6px** radius; light and dark foreground/background tokens are correct; both fonts loaded. Fixture is not imported by the application.
- Not verified: full application theme switching/system preference, all hover/disabled combinations, reduced-motion browser emulation, 200–400% zoom, cross-browser, device keyboard/safe-area hardware behavior, long-content states for every authenticated route, before/after network payload capture, signed-in Traveller/Buddy/pending-onboarding roles, payment gateway, inventory holds/refresh edge cases, cancellations/refunds, chat delivery, package save/publish, uploads. Source logic remains unchanged for those flows.

## Existing backend limitation

The real experience detail displays: `Could not find the function travelbuddy_api.experience_reviews(package_id) in the schema cache`. The alert remains visible and now wraps at narrow widths. No backend fix was attempted. No new broken flow was identified in the tested public states; authenticated flows remain not verified.

## Responsive measurements

Values below are `documentElement.clientWidth / scrollWidth`, in CSS pixels. Desktop scrollbar subtraction explains values smaller than the requested viewport. Equal values mean no horizontal document overflow.

| Viewport | Home        | Search      | Detail      | Nearby initial |
| -------- | ----------- | ----------- | ----------- | -------------- |
| 1440×900 | 1425 / 1425 | 1425 / 1425 | 1425 / 1425 | 1425 / 1425    |
| 1024×768 | 1009 / 1009 | 1009 / 1009 | 1009 / 1009 | 1009 / 1009    |
| 820×1180 | 805 / 805   | 805 / 805   | 805 / 805   | 805 / 805      |
| 390×844  | 375 / 375   | 375 / 375   | 375 / 375   | 375 / 375      |
| 360×780  | 345 / 345   | 345 / 345   | 345 / 345   | 345 / 345      |

Measured Home card columns: **3 / 3 / 2 / 1 / 1**. Search: **3 / 2 / 2 / 1 / 1**. Checkout/Inbox/editor entry screenshots at all five sizes show their focused sign-in gate, without document overflow; protected screen interiors were unavailable.

## All 28 route patterns

“Shared” means the route inherits the new shell, tokens and existing primitives; route/guard definitions were not edited.

| ID  | Route                   | UI coverage                                                     | Browser result                                                                   |
| --- | ----------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| P01 | `/`                     | Split editorial hero, text categories, responsive real listings | Rendered; five sizes                                                             |
| P02 | `/search`               | Search, existing filters, result counts, listing grid           | Rendered; five sizes; destination filter survives refresh                        |
| P03 | `/destinations/$slug`   | Shared catalog, existing share controls                         | Ella rendered; mobile                                                            |
| P04 | `/experience/$id`       | Editorial title/gallery, existing booking selector, policies    | Real Ella trek rendered; five sizes; gallery keyboard tested                     |
| P05 | `/nearby`               | Shared controls, neutral toolbar and existing list/map styles   | Initial area-selection state rendered; five sizes; live map not verified         |
| P06 | `/buddy/$id`            | Editorial identity, existing public details and listings        | Real Vidura profile rendered; mobile                                             |
| P07 | `/login`                | Focused shell, existing sign-in controls, typography            | Rendered; desktop/mobile; authentication not submitted                           |
| P08 | `/register`             | Shared auth form/primitives                                     | Rendered; desktop/mobile; registration not submitted                             |
| P09 | `/forgot-password`      | Shared auth form/primitives                                     | Rendered; desktop/mobile; recovery not submitted                                 |
| P10 | `/reset-password`       | Shared auth form/primitives                                     | Rendered; desktop/mobile; password update not verified                           |
| P11 | `/auth/callback`        | Shared feedback/primitives                                      | Missing-code error rendered; desktop/mobile; valid OAuth not verified            |
| P12 | `/register/complete`    | Shared onboarding form/primitives                               | Sign-in redirect and returnTo verified; onboarding not verified                  |
| P13 | `/account`              | Shared account cards/primitives                                 | Sign-in redirect and returnTo verified; account contents not verified            |
| P14 | `/account/settings`     | Neutral profile sidebar and shared forms                        | Sign-in redirect verified; Traveller preferences not verified                    |
| P15 | `/account/profile`      | Neutral profile sidebar and shared forms                        | Sign-in redirect verified; Buddy profile editing not verified                    |
| P16 | `/account/security`     | Shared account controls/primitives                              | Sign-in redirect verified; account changes not verified                          |
| P17 | `/account/reviews`      | Shared review forms/primitives                                  | Sign-in redirect verified; eligible reviews not verified                         |
| P18 | `/account/dashboard`    | Readable summary values, shared controls/cards                  | Sign-in redirect verified; Buddy dashboard not verified                          |
| P19 | `/account/packages`     | 4:3 media, shared cards/actions                                 | Sign-in redirect verified; package list not verified                             |
| P20 | `/account/packages/new` | Neutral editor sidebar/save panel, shared fields                | Sign-in redirect at five sizes; editor/save/upload not verified                  |
| P21 | `/account/packages/$id` | Same existing editor, shared fields/status                      | Sign-in redirect verified; owned-package editing not verified                    |
| P22 | `/cart`                 | Shared booking summary, square media, total separator           | Sign-in redirect verified; persistence/edit/remove not verified                  |
| P23 | `/checkout`             | Existing two-column form/review, clearer total                  | Sign-in redirect at five sizes; checkout/holds not verified                      |
| P24 | `/payments/$orderId`    | Shared billing forms, separated order items                     | Sign-in redirect verified; PayHere/polling/refunds not verified                  |
| P25 | `/bookings`             | Shared status cards, history/list geometry                      | Sign-in redirect verified; booking history not verified                          |
| P26 | `/booking/$id`          | Shared booking details/status/actions                           | Sign-in redirect verified; cancellation not verified                             |
| P27 | `/confirmation/$id`     | Shared order/confirmation/status presentation                   | Sign-in redirect verified; order membership/payment states not verified          |
| P28 | `/inbox`                | Neutral thread surface, bubbles and composer                    | Sign-in redirect at five sizes; delivery/pagination/mobile keyboard not verified |

## Screenshots and local artifacts

All captures and raw measurement JSON are in `prompt for ui/qa/implementation/` (intentionally ignored). Before screenshots cover Home and Search at all five sizes; before Detail/Checkout/Inbox/editor interiors were not captured. After screenshots cover the real Home/Search/Detail, Nearby initial state, Buddy, destination, auth pages, gallery, dark/light primitives, and protected-entry redirects. No protected-entry screenshot is presented as an authenticated screen.

- `before-home-{1440,1024,820,390,360}.jpg`
- `before-search-{1440,1024,820,390,360}.jpg`
- `after-home-{1440,1024,820,390,360}.jpg`, `final-home-desktop.jpg`
- `after-search-{1440,1024,820,390,360}.jpg`
- `after-detail-{1440,1024,820,390,360}.jpg`
- `after-nearby-{1440,1024,820,390,360}.jpg`
- `after-buddy-390.jpg`, `after-destination-390.jpg`, `after-gallery-360.jpg`
- `after-primitives-light-dark-{1440,360}.jpg`
- `gate-_checkout-{1440,1024,820,390,360}.jpg`, analogous Inbox and package-new gate captures; all protected routes have 390px gate captures.
- `after-_{login,register,forgot-password,reset-password,auth_callback}-{1440,390}.jpg`
- `home-measurements.json`, `search-measurements.json`, `detail-measurements.json`, `nearby-measurements.json`, `auth-measurements.json`, `protected-route-measurements.json`, `focused-gate-measurements.json`.

## git diff --name-only

Exact tracked-file output (the newly added `docs/ui-redesign-verification.md` is untracked until staged and therefore is listed separately):

```text
.gitignore
src/app/shell.tsx
src/app/styles.css
src/components/ui/alert.tsx
src/components/ui/badge.tsx
src/components/ui/bubble.tsx
src/components/ui/button.tsx
src/components/ui/card.tsx
src/components/ui/dialog.tsx
src/components/ui/input-group.tsx
src/components/ui/input.tsx
src/components/ui/native-select.tsx
src/components/ui/textarea.tsx
src/features/account/buddy-profile.tsx
src/features/account/profile-settings.tsx
src/features/account/provider-dashboard.tsx
src/features/auth/auth-page.tsx
src/features/bookings/bookings-page.tsx
src/features/bookings/cart-page.tsx
src/features/bookings/checkout-page.tsx
src/features/catalog/catalog-page.tsx
src/features/catalog/experience-card.tsx
src/features/catalog/experience-page.tsx
src/features/catalog/photo-gallery.tsx
src/features/catalog/search-input.tsx
src/features/messaging/inbox-page.tsx
src/features/nearby/nearby-page.tsx
src/features/packages/package-editor.tsx
src/features/packages/package-list.tsx
src/features/payments/payment-page.tsx
```

Additional new file: `docs/ui-redesign-verification.md`.

## git diff --stat

```text
.gitignore                                  |   1 +
 src/app/shell.tsx                           |  34 +++--
 src/app/styles.css                          | 197 +++++++++++++++++++++-------
 src/components/ui/alert.tsx                 |   6 +-
 src/components/ui/badge.tsx                 |   4 +-
 src/components/ui/bubble.tsx                |   2 +-
 src/components/ui/button.tsx                |  11 +-
 src/components/ui/card.tsx                  |   8 +-
 src/components/ui/dialog.tsx                |  11 +-
 src/components/ui/input-group.tsx           |   2 +-
 src/components/ui/input.tsx                 |   2 +-
 src/components/ui/native-select.tsx         |   2 +-
 src/components/ui/textarea.tsx              |   2 +-
 src/features/account/buddy-profile.tsx      |  10 +-
 src/features/account/profile-settings.tsx   |   7 +-
 src/features/account/provider-dashboard.tsx |  11 +-
 src/features/auth/auth-page.tsx             |  54 ++++----
 src/features/bookings/bookings-page.tsx     |  40 +++---
 src/features/bookings/cart-page.tsx         |   4 +-
 src/features/bookings/checkout-page.tsx     |   4 +-
 src/features/catalog/catalog-page.tsx       |  75 ++++++-----
 src/features/catalog/experience-card.tsx    |  16 +--
 src/features/catalog/experience-page.tsx    |  19 ++-
 src/features/catalog/photo-gallery.tsx      |   6 +-
 src/features/catalog/search-input.tsx       |   2 +-
 src/features/messaging/inbox-page.tsx       |  41 ++++--
 src/features/nearby/nearby-page.tsx         |   6 +-
 src/features/packages/package-editor.tsx    |  14 +-
 src/features/packages/package-list.tsx      |   4 +-
 src/features/payments/payment-page.tsx      |   7 +-
 30 files changed, 365 insertions(+), 237 deletions(-)
```
