# Publication notes — TravelBuddy Phase 1 terms

Prepared 28 October 2026. This file is an internal handover, not part of the customer-facing Terms.

## Basis and scope

The accompanying draft is based on the current repository, particularly `README.md`, `docs/phase-one-feature-audit.md`, `docs/vidura-marketplace-features.md`, the checkout and booking-policy components, the payment service and cancellation migration. It includes the 26 October review implementation. Repository inspection establishes implemented behaviour, not production deployment or actual merchant settlement.

The supplied Viator text concerns a 2024 sponsored affiliate/creator campaign. It is not a general marketplace customer agreement. This draft replaces that structure with TravelBuddy marketplace terms; it does not change or satisfy any separate Viator affiliate obligations. It deliberately omits creator deliverables, promotional dates, Viator brand bidding restrictions, Massachusetts jurisdiction and Viator's USD 100 liability cap. No Viator affiliation is asserted.

## Fill in and confirm before publication

1. Replace every bracketed placeholder: exact legal operator, registration details where applicable, address, website, support email, telephone, privacy contact, Privacy Policy URL and effective date. The repository's SiyothSoft folder name does not establish the contracting legal entity.
2. Confirm the proposed contracting structure: independent Providers supply experiences; TravelBuddy supplies the marketplace and facilitates payment. Align this with the PayHere merchant account, invoicing, actual collection authority, taxes and Provider contracts. If TravelBuddy sells experiences as principal, the draft must change accordingly.
3. Confirm proposed business policies introduced by this draft: account holders and Providers must be 18 or older; a limited operational content licence; a refund or agreed alternative for Provider cancellation; manual complaint handling; and Sri Lankan governing law. These are drafting choices, not facts proved by the code. Ask Sri Lankan counsel to review the completed draft and actual business model before publication.
4. Publish an accurate Privacy Policy. Cover account and profile data, public uploads/reviews, booking and billing contacts, messages, map/location use, payment sharing, hosting and other processors, international transfers if any, retention, security, privacy contacts and applicable rights. State current legal requirements accurately rather than claiming every provision of a privacy statute is already operative.

## Match acceptance and operations to the draft

- Add a permanent Terms link and Privacy Policy link. The inspected footer currently has no policy links. Present the Terms before account creation and Provider onboarding, and obtain clear acceptance with a version/date record. The inspected checkout checkbox currently accepts cancellation policies only; it does not establish acceptance of these full Terms. Proposed checkout text: “I agree to the TravelBuddy Terms and Conditions and the cancellation policy for each booking. I have read the Privacy Policy.” Link each policy; keep optional marketing consent separate.
- Keep the policy accepted for each booking available with its confirmation. The implementation snapshots payment and cancellation terms; do not assume it already stores acceptance of a versioned full Terms document.
- Activate and test PayHere merchant configuration, public callbacks and refund processing before advertising online payment as live. Current repository checks use callback fixtures/intercepted gateway requests and do not establish real settlement. PayHere documents merchant/domain prerequisites for checkout and live permissions/IP approval for its Merchant APIs. See [Checkout API](https://support.payhere.lk/api-&-mobile-sdk/checkout-api) and [Refund API](https://support.payhere.lk/api-&-mobile-sdk/refund-api).
- Arrange a real manual process for Provider cancellations, exceptional refunds, disputed or uncertain payments, non-card refunds and complaints. Do not promise automated Provider cancellation, a fixed bank refund deadline, or automatic no-show collection. These are not established by the inspected implementation. The gateway's terms distinguish card refunds from non-card payments requiring merchant handling: [PayHere Terms](https://www.payhere.lk/legal/).
- Retain the actual policy boundary: free cancellation is allowed at least 24 hours before start in Sri Lanka time. Otherwise paid and pay-on-arrival bookings are blocked from standard self-service cancellation. Unpaid online cancellation releases the whole order. Eligible paid cancellation can apply to one booking. The draft does not convert every booking to free cancellation.
- Establish separate Provider commercial terms for commissions, payout timing, collection authority, taxes, refund responsibility and any genuine verification process. Do not invent these figures or claim escrow, insurance or vetting from the existence of a dashboard.
- Review age-policy enforcement and the content licence against the actual registration and upload flows. These proposed terms do not themselves implement age checks or rights-clearance controls.

## Legal-source checks

These are context for review, not a legal-compliance certification:

- The [Sri Lanka Consumer Affairs Authority FAQ](https://caa.gov.lk/web/index.php?Itemid=496&id=75&lang=en&option=com_content&view=article) describes a consumer complaint route for goods and services. The draft preserves mandatory remedies and does not impose a shorter contractual complaint deadline.
- The [Data Protection Authority's current notice](https://www.dpa.gov.lk/notice.php) distinguishes statutory commencement dates and provisions not yet operative. This is why the draft refers to applicable privacy law and a separate accurate notice rather than claiming all statutory rights are already in force. Recheck commencement and obligations when publishing.

The delivered Terms are an editable draft. Publishing them, configuring payment services and implementing policy acceptance are separate work; no application behaviour was changed in preparing these documents.
