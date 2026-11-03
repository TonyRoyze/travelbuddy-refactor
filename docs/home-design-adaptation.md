# Home page design

The user's attached Airbnb home screenshot is the visual reference for this update.

- Replaced the large promotional hero with a compact discovery header and a wide, rounded Where / When / Who search form.
- Kept TravelBuddy branding and its green primary action. The original four text navigation tabs (Home, Explore, Bookings or Dashboard, and Inbox) and account actions are retained without emojis.
- Added eight rounded photo category links, followed by real experience listings and Sri Lankan destinations. Category photos prefer matching catalog imagery with illustrative fallbacks.
- Category tiles scroll horizontally on smaller screens. The search form stacks on mobile, and listings adjust to the available width.
- Search sends the destination query and date to the existing catalog. Guest count is preserved through search results into the experience's existing availability selector; catalog results themselves do not guarantee availability for the selected group size.
- The home route now renders a dedicated `HomePage`. The replaced hero code was removed from `CatalogPage`, which continues to serve search and destination results.

Validation: TypeScript passed, guest-count/search validation tests passed (13 tests), and formatting passed. Production build was checked. Browser visual and interaction verification could not be completed: the in-app browser timed out connecting to both the loopback preview and localhost, and native app discovery also timed out. No screenshot is presented as verified output for this update.
