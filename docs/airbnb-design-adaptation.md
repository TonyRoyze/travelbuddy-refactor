# Experience design adaptation

Reference inspected in the browser: https://www.airbnb.com/experiences/3581717

## Observed design

- White canvas, near-black sans-serif text, subdued secondary text, and light dividers.
- Desktop introduction splits a large, rounded 2 × 2 photo mosaic on the left from a centered title, description, rating, location, and host facts on the right.
- Host facts use compact rows with circular icons and two levels of text.
- Booking actions use rounded containers, light shadows, and pill-shaped primary actions.
- Body sections use clear, compact headings with generous vertical space: activities, reviews, meeting point, host information, and things to know.

## TravelBuddy implementation

- Shared light-mode background, neutral text, radius tokens, and editorial typography adapted in `src/app/styles.css`. TravelBuddy's green accent and existing dark palette retained.
- Experience introduction now uses the split mosaic/summary layout on desktop and stacks on narrow screens. Available real images populate up to four tiles; one, two, and three image layouts are supported. Existing gallery dialog and arrow navigation remain available.
- Host, location, duration, and language facts use existing experience data.
- “Choose a date” links to the existing booking panel. Date, traveler, option, availability, cart, chat, and checkout handlers remain in place.
- Cancellation and payment details appear under “Things to know.”
- Catalog cards use rounded photos, compact sans-serif titles and pricing. Home shows up to six experiences, with visible category icons and rounded destination tiles.

## Verification for this update

- Passed: `node node_modules/typescript/bin/tsc -b`.
- Passed: `node node_modules/vite/bin/vite.js build`.
- Passed: Prettier on the five edited implementation files.
- Passed: `git diff --check` (existing line-ending warnings only).
- Local Vite server started successfully at http://127.0.0.1:5173/.
- Browser visual and interaction QA remains unverified: the in-app browser returned `ERR_CONNECTION_TIMED_OUT` for the local preview. Reference inspection succeeded, but local screenshots could not be captured.
- Existing working-tree changes were present before this update; this document does not claim verification of those earlier changes or authenticated booking/payment flows.
