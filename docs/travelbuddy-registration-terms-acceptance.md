# Role-specific registration agreement copy and implementation handover

Prepared 29 October 2026. Internal guidance; do not show this file as the legal agreement.

## Agreements to use

| Registration choice | Agreement | Required checkbox label |
| --- | --- | --- |
| Traveller | `travelbuddy-traveller-registration-terms.md` | I have read and agree to the TravelBuddy Traveller Terms and Conditions. |
| Buddy / Guide | `travelbuddy-buddy-guide-registration-terms.md` | I have read and agree to the TravelBuddy Buddy / Guide Terms and Conditions. |

Show a separate linked notice beneath the checkbox: **Read our Privacy Policy to understand how we use your personal information.** Do not treat acceptance of the Terms as blanket consent to all personal-data uses. Optional marketing consent must have its own unchecked control.

Link the agreement name to its full text, available before acceptance. Label the action **Complete registration**. Neither checkbox is preselected. Explain a blocked submission with **Please agree to the [role] Terms and Conditions to complete registration.**

## Current role mapping

The inspected onboarding screen offers `traveler` (Traveller) and `buddy` (Buddy). The `onboard` database function maps `buddy` to stored role `guide`. Therefore Buddy and Guide need one hosting agreement in the current registration flow, not separate checkboxes based only on their different labels.

The database also recognises `provider` and `admin`, but neither is a choice on the inspected registration screen. Do not advertise accommodation registration from the backend role name or apply an experience-host agreement to accommodation services without reviewing their scope. Admin access should follow internal access policies, rather than a public registration agreement.

## Required application behaviour when implemented

1. Present the role agreement after role selection and before completing onboarding. Email signup creates an authentication identity before role selection; Google/Facebook/Apple users must also pass through the same onboarding acceptance gate.
2. Switching role changes the agreement and resets acceptance. A previously accepted Traveller checkbox must not carry over to Buddy / Guide.
3. Validate acceptance on the server within the registration/onboarding operation, not only through a browser checkbox. Complete the role assignment and acceptance record atomically. Do not trust an arbitrary client-supplied document version; validate against the version currently required for that role.
4. Store the authenticated account ID, accepted agreement identifier, immutable version or content hash, applicable role and server timestamp. Retain the exact accepted text. A name or ordinary login event alone does not establish acceptance.
5. Require acceptance when a user adds a new role, and when a material revision requires renewed agreement. Ordinary repeat sign-in need not request the same accepted version again.
6. Keep accepted Terms accessible from the account. Existing users need a deliberate acceptance rollout; do not fabricate historical acceptance records or silently treat them as having agreed.
7. Preserve the separate checkout acceptance of each booking's cancellation policy. Registration acceptance does not replace disclosure of the specific price, payment method and cancellation deadline for a booking.

## Publication and implementation status

The two role agreements replace the earlier combined draft **for the intended registration use**. They are standalone drafts, so a registrant does not need to accept the combined document as well. The earlier combined draft is retained as background.

Fill every legal-operator, address, contact, URL and effective-date placeholder; publish the actual Privacy Policy; confirm the independent-provider contracting model; review the proposed adult eligibility and other legal/business policies with counsel. Confirm merchant, commercial and manual refund arrangements using `travelbuddy-terms-phase-1-publication-notes.md`.

This change prepares documents and registration wording only. It does not publish them, change the existing checkbox, implement server validation or record acceptance. The current checkbox in `src/features/account/account-page.tsx` says only “I agree to create my TravelBuddy account.” It does not identify an agreement or submit acceptance to `onboard`.
