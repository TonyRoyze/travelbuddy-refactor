# iOS with Capacitor

TravelBuddy uses Capacitor 8.6.0 to bundle the Vite application into a native iOS app. The native project uses Swift Package Manager and is committed under `ios/`. `capacitor.config.ts` sets the app name to **TravelBuddy**, the provisional bundle identifier to **com.travelbuddy.app**, and the web asset directory to `dist`.

## Requirements

- macOS, Xcode 26 or later, and the Xcode command line tools.
- The Node and pnpm versions described in the root README.
- An installed iOS Simulator runtime, or a connected iPhone and an Apple signing team configured in Xcode.

The generated project targets iOS 15 or later. Choose the final bundle identifier before registering the app for distribution; update both `capacitor.config.ts` and the App target's Bundle Identifier in Xcode if it changes.

## Build and open

Install dependencies and configure the public frontend environment using the root README, then run:

```sh
pnpm ios:sync
pnpm ios:open
```

`ios:sync` runs the production web build, copies `dist` into the iOS project, and updates native dependencies. `ios:open` opens `ios/App/App.xcodeproj` in Xcode. Select the App scheme and a simulator or connected iPhone, then run it. For a physical device, set the signing team under the App target's Signing & Capabilities tab.

For command-line builds and deployment:

```sh
pnpm ios:run
```

This rebuilds and syncs before asking Capacitor to select a target. To select a particular target, run `pnpm exec cap run ios --no-sync --target <id>` after syncing. After each web change, run `pnpm ios:sync` again before running from Xcode. The app loads its bundled assets; deploying the website does not update an installed app's bundle.

Commit native source, project settings, and app assets. Generated web assets, copied Capacitor configuration, and Xcode user/build files are ignored by `ios/.gitignore`. The app icon and launch screen currently use the generated Capacitor placeholders.

## Backend connectivity and next steps

### Native sign-in configuration

The app registers the custom URL scheme `com.travelbuddy.app` and sends native OAuth, confirmation, and password recovery callbacks to `com.travelbuddy.app://auth/callback`. OAuth opens in a Safari browser sheet. When iOS receives the return link, the app dismisses that sheet and exchanges the PKCE code inside its own WebView, where the original verifier and session storage live. Website sign-in continues to use the website's `/auth/callback`.

**Required on the Supabase Auth server:** append `com.travelbuddy.app://auth/callback**` to the allowed redirect URLs. For hosted Supabase, use Authentication → URL Configuration → Redirect URLs. For the self-hosted Docker setup, append it to `ADDITIONAL_REDIRECT_URLS` (mapped to `GOTRUE_URI_ALLOW_LIST` on the Auth service), preserve the existing web URLs, and recreate the Auth service. If this URL is missing, Supabase can fall back to its configured website URL and leave the user in the browser. Changing the app's bundle identifier later also requires updating the registered scheme, `NATIVE_AUTH_CALLBACK` in `src/features/auth/oauth.ts`, and this allowlist.

Email confirmation and password recovery links should be opened on the same device/app installation that requested them because the PKCE verifier stays in that app. The configured email templates must preserve the requested redirect URL.

### iPhone layout and navigation

The viewport uses `viewport-fit=cover`; the web shell applies the top and side safe areas and reserves bottom space for the home indicator and navigation. Keep `ios.contentInset` set to `never` so UIKit does not add another layer of insets. `TravelBuddyViewController` enables WebKit's back/forward navigation gestures: swipe from the left edge to go back, or from the right edge to go forward when there is navigation history.

### Remaining integrations

The native container serves the bundled application at `capacitor://localhost`. It does not start Vite, the media service, the payment service, or the database. Frontend `VITE_*` values are embedded at build time and must use endpoints reachable from the target device. A real iPhone's `localhost` refers to that phone. Use HTTPS endpoints for release builds, and never embed server-only keys in the web bundle.

The following integrations still need native support before an end-to-end release:

- **Media uploads:** native builds send profile and package uploads to `https://travelbuddy.shalinda.com`; override with `VITE_MEDIA_API_ORIGIN` when building for another deployment. The media service permits `capacitor://localhost` with explicit CORS preflight headers and still verifies every upload JWT. Rebuild and sync the iOS app after changing this setting. Website uploads remain same-origin.
- **Payment APIs:** `/payments-api` still requires a reachable native API origin before relying on native online checkout.
- **PayHere:** the existing hosted checkout submits a form away from the app. Implement and verify a browser or native payment handoff with a return link into the app. Keep the server notification as the authority for successful payments.
- **Device experience:** validate safe areas, keyboard behavior, external links, background/resume behavior, permissions, and offline states on iPhone. Add camera, location, or push plugins when implementing those capabilities.
- **Distribution:** replace placeholder assets, configure signing, and complete account deletion, privacy disclosures, and App Store preparation.

## References

- [Capacitor installation](https://capacitorjs.com/docs/getting-started)
- [iOS environment setup](https://capacitorjs.com/docs/getting-started/environment-setup)
- [Capacitor iOS configuration](https://capacitorjs.com/docs/ios/configuration)
