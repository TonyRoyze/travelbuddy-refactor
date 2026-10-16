# V1.1 UI refinement

Applied the supplied Resize and Apple UI guides, prioritizing responsive structure and typography. The customer feature scope and TravelBuddy palette remain the same.

## Shared foundations

- Platform system font throughout the interface; weights 400, 500, 600, and 700.
- Fluid hierarchy: display 36–64px, page heading 30–48px, section heading 24–36px, subheading 20–24px, card title 17–18px, body 16–17px, secondary text 14–15px, and captions 12–13px.
- Rem-based spacing tokens using the 4/8px scale. Content margins are 16px, 20px, 32px, and 40px at the respective guide breakpoints.
- Main content capped at 1200px; reading/settings/help at 680px; sign-in forms at 420px.
- Major home sections separated by 48px on phones and 96px on desktop.
- Phone experience cards use two columns per the updated preference; desktop gains more columns as space allows. The home destination section is a horizontal rail with swipe, keyboard focus, and previous/next buttons. Images have stable aspect ratios; titles grow naturally without fixed text heights.
- Header heights of 56px on phones and 64px from tablet upwards. Explore, Live now, Bookings, and Inbox keep their order in bottom navigation below 768px and top navigation above it.
- 48px primary controls, at least 44px icon actions, 16px inputs, visible focus indicators, safe-area padding, and room below fixed booking/navigation bars.
- Restrained translucent navigation, instant press feedback, reduced-motion and reduced-transparency alternatives, and a stronger-contrast preference. Saved theme choices take precedence; otherwise initial appearance follows the system preference.

## Implementation

`src/app/responsive.css` documents the tokens and responsive composition rules. Existing component sheets use those tokens for typography, spacing, and radii. `src/app/layout.tsx` loads the foundation after component styles. The customer provider reads the initial system appearance when there is no saved choice.

## Verification

Browser checks at 360, 390, 768, 1024, and 1440 pixels covered home, search, experience details, Live Now, registration, support, bookings, reviews, inbox, account, settings, and the empty cart. These screens had no document horizontal overflow. Visible form fields remained at 16px at normal text size. Header heights measured 56px and 64px as intended.

An additional 200% root-text check covered home, search, experience details, and registration. It revealed crowded header/detail actions; those now wrap. The experience page and booking sheet were rechecked at 200% after the fix. Light and dark settings, customer demo sign-in, and mobile booking cards were visually reviewed.

Screenshots and breakpoint observations are saved in `output/qa`. TypeScript and the production build are checked using pnpm.
