# Google login and registration

The `backend/google-auth` feature and its database foundation are merged into the V1.1 customer app on `main`.

## Behavior

The V1.1 login and registration screens use Google's official Sign in with Google button, rendered in English, as their only sign-in option. A verified first-time Google identity creates a traveler account with pending onboarding. The traveler confirms their name and account creation at `/register/google`, then opens `/account/security`. Returning identities open their existing account. The Google account shortcut in the V1.1 header opens the protected server account page. Google accounts are identified by `sub`, never by email; no automatic email linking or administrator/provider/guide role assignment occurs. Password-based production authentication is not implemented.

Google Identity Services supplies an ID token to the browser callback. The server uses Google's official authentication library to verify the signature, audience, issuer, and token lifetime. A signed, short-lived HttpOnly challenge cookie binds the token nonce and CSRF value to the initiating browser. Mutating requests require the configured origin. Unverified Google email claims are rejected. Credentials are not logged, stored in local storage, or persisted in the database.

Application sessions use random 256-bit tokens in HttpOnly cookies, Secure on HTTPS, SameSite=Lax, and seven-day absolute expiry. Only SHA-256 hashes are stored in the JSONB `sessions` table. Session reads check expiry and the account's active status. Logout revokes the database record and clears the cookie. A new login rotates the previous browser session. Expired records can be pruned by a scheduled database maintenance job; expiry is enforced even before pruning. Account/session protected APIs require server session checks; frontend demo role checks are never trusted by these endpoints.

The Google account page is server protected. Existing marketplace, booking, provider and guide features remain frontend demonstrations and are not converted to production services by this feature. Their local profiles remain separate from the Google identity.

## Configuration

This feature uses `google-auth-library` 11 and requires Node.js 22 or later.

1. In Google Cloud Console, configure Google Auth Platform branding/audience and create an OAuth client of type **Web application**.
2. Add each exact application origin under **Authorized JavaScript origins**, for example `http://localhost:3000` and your production HTTPS origin. Add development accounts as test users when the consent app is in testing mode.
3. Set `GOOGLE_CLIENT_ID` to that web client ID. This popup ID-token flow does not require an OAuth client secret or a redirect URI.
4. Set `AUTH_APP_URL` to the same exact origin, without a path. Development HTTP is allowed only for localhost; production requires HTTPS. If running the preview on port 3101, configure that origin in Google and in this variable.
5. Generate `AUTH_SECRET` with `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`. Keep it server-side in environment configuration; never commit it.
6. Configure PostgreSQL `DOCUMENT_DATABASE_URL` with `schema=travelbuddy_backend` and run `npm run db:documents:deploy`. This applies the foundation and session migrations.
7. Run `npm run db:documents:generate`, then start the application.

## Local sign-in and role test accounts

The Google button is already rendered on `/login` and `/register`. With the configuration above, use `/login` for returning accounts and `/register` for first-time accounts. The Google popup is provided by Google's Identity Services; it is hidden and a retry message is shown if the client ID or connection is unavailable.

To test with several Google identities:

1. In Google Auth Platform, add each tester's Google account under **Audience → Test users** while the consent app is in Testing mode.
2. Sign in once with each separate Google account. Each first sign-in creates a separate `traveler` account. Complete the onboarding screen.
3. Use a **disposable local/test database**. First look up the account by the tester's Google email and confirm the result is exactly one account:

   ```sql
   SELECT a.id, i.data->>'email' AS email, a.data->'roles' AS roles
   FROM travelbuddy_backend.accounts AS a
   JOIN travelbuddy_backend.auth_identities AS i
     ON i.data->>'accountId' = a.id::text
   WHERE i.data->>'provider' = 'google'
     AND lower(i.data->>'email') = lower('provider.test@example.com');
   ```

   Then change the role using that account UUID. Choose an allowed role (`traveler`, `provider`, `guide`, or `admin`):

   ```sql
   BEGIN;

   UPDATE travelbuddy_backend.accounts AS a
   SET data = jsonb_set(a.data, '{roles}', '["provider"]'::jsonb),
       revision = a.revision + 1,
       updated_at = now()
   WHERE a.id = 'PASTE-ACCOUNT-UUID-HERE'::uuid
   RETURNING a.id, a.data->'roles' AS roles, a.revision;

   COMMIT;
   ```

   Change `'["provider"]'` to `'["guide"]'`, `'["admin"]'`, or `'["traveler"]'` as needed. For combined roles, use e.g. `'["traveler","provider"]'`. Check that the `RETURNING` clause returns exactly one row. Run the SQL against the same PostgreSQL schema configured by `DOCUMENT_DATABASE_URL` (`travelbuddy_backend`).

Role values are account metadata today. Role-specific authorization and provider/guide/admin functionality are not implemented by this V1.1 customer app. Do not grant elevated roles in a shared or production database using this testing procedure. Production role changes should go through a future authenticated, audited admin operation.

When Google configuration is missing, the screens show a clear unavailable state. Database outages do not issue a session or report successful sign-in. UI login errors are generic and contain no database credentials or Google token details.

## Validation

`npm run test:google-auth` runs isolated checks for challenge tampering/expiry, CSRF origin checks, token nonce and verified-email requirements, identity reuse, concurrent signup recovery, secure cookie flags, safe configuration failures, unauthenticated onboarding, and logout cookie clearing. It uses synthetic claims only for local helper tests; the production endpoint always verifies tokens with Google first.

`npm run test:documents:integration` requires a migrated, disposable test PostgreSQL database. Real Google login requires configured Google credentials and a reachable migrated database and cannot be verified with mock claims alone.

The source branch passed isolated authentication checks, document checks, TypeScript checking, and production build validation. The integrated V1.1 app is checked with its customer workflow suite, the document/authentication suites, and a production build. The real Google popup/credential exchange, authenticated onboarding, and database session lifecycle remain unverified because no Google client ID or running migrated PostgreSQL database was available. The integration test now also covers session hashing, expiry, revocation, and suspended accounts when a test database is supplied.

References: [Google Identity Services JavaScript API](https://developers.google.com/identity/gsi/web/reference/js-reference), [server-side ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).
