# Browser security headers

`next.config.mjs` adds security headers to pages, APIs, errors, and static assets.
Middleware supplies a fresh CSP script nonce and `private, no-store` for pages
and APIs, including anonymous requests and auth redirects. The root layout reads
the nonce, forcing dynamic page rendering, and applies it to the theme script.
Next.js applies the same nonce to its bootstrap and hydration scripts.

Scripts cannot use inline code without a nonce, or eval in production. Inline
styles remain allowed for Leaflet and animated components. Images are restricted
to this origin, data/blob URLs, Unsplash, and OpenStreetMap tiles. Browser API calls
stay on this origin; Supabase authentication runs on the server. Development
additionally permits eval and WebSockets for Next.js hot reload.

COEP uses `credentialless` so public cross-origin photos and map tiles do not
require CORP headers from their providers. COOP is `same-origin`; social sign-in
uses full-page redirects, rather than popup communication. Permissions Policy
allows location on this origin while disabling camera, microphone, payment, and
USB. Revisit these policies when adding a browser integration.

HSTS is emitted in production with a one-year lifetime, scoped to this hostname.
Production must be served over HTTPS. It intentionally omits `includeSubDomains`
and preload because other hosts have separate deployment requirements.

Next.js retains immutable caching for versioned JS/CSS bundles. Public static
assets can also be cached; ZAP's informational caching observation is expected
for these files. The modern-web-application informational alert describes the
framework and does not require a code change.

## Verification and deployment

Run `pnpm build`, start it with `pnpm start`, then run
`pnpm exec tsx scripts/check-security-http.ts`. Set `SECURITY_TEST_URL` to a local
origin if using a different port. This test expects production headers.

Deploy the new application image through the usual Kubernetes workflow. Check
headers at the public HTTPS origin after rollout: any CDN/proxy must preserve
these headers and honor `private, no-store`. Purge previously cached HTML if the
edge has cached it. Re-run ZAP using its Client Spider and authenticated workflows
to cover application routes, forms, and APIs. Verify map tiles, images, location
permission, email sign-in, and social sign-in in a browser.

The November 13 report references `/assets/*.js` bundles, whereas this code serves
Next.js bundles at `/_next/static/`. A clean local test does not establish that
the scanned public deployment has been updated.
