"""Local Vidura feature checks; use the private fixture from test-payments-http.ts."""

import json, sys, os, secrets, hashlib
from urllib.parse import parse_qs
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

fixture = json.loads(Path(sys.argv[1]).read_text())
origin = "http://localhost:5173"
guest = "UI Payment Traveler " + secrets.token_hex(3)
message = "Meeting confirmed for " + guest
reply = "Thank you from " + guest
with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path=os.environ.get(
            "PLAYWRIGHT_CHROMIUM_EXECUTABLE",
            "/Users/vidura/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell",
        ),
    )
    contexts = [
        browser.new_context(viewport={"width": 1280, "height": 900}) for _ in range(2)
    ]
    host, traveler = [c.new_page() for c in contexts]
    errors = []
    for page in [host, traveler]:
        page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        # Reconnaissance: anonymous destination page and its actual share target.
        traveler.goto(origin + "/destinations/ella?utm_source=facebook&fbclid=qa")
        traveler.wait_for_load_state("networkidle")
        expect(
            traveler.get_by_role("heading", name="Discover Ella", exact=True)
        ).to_be_visible()
        expect(
            traveler.get_by_role("link", name="Share on Facebook")
        ).to_have_attribute(
            "href",
            "https://www.facebook.com/sharer/sharer.php?u=http%3A%2F%2Flocalhost%3A5173%2Fdestinations%2Fella",
        )
        traveler.reload()
        expect(
            traveler.get_by_role("heading", name="Discover Ella", exact=True)
        ).to_be_visible()
        for i, page in enumerate([host, traveler]):
            page.goto(origin + "/login")
            page.get_by_role("button", name="Continue with email", exact=True).click()
            page.get_by_label("Email address", exact=True).fill(
                fixture["users"][i]["email"]
            )
            page.get_by_label("Password", exact=True).fill(
                fixture["users"][i]["password"]
            )
            page.get_by_role("button", name="Sign in with email", exact=True).click()
            page.wait_for_url(origin + "/")
        # Buddy can manage payment terms in the full existing editor.
        host.goto(origin + "/account/packages/" + fixture["packages"][0])
        expect(
            host.get_by_role("checkbox", name="Allow payment on arrival:", exact=False)
        ).to_be_checked()
        host.get_by_role(
            "checkbox", name="Allow payment on arrival:", exact=False
        ).uncheck()
        host.get_by_role("button", name="Save changes", exact=True).click()
        host.wait_for_timeout(500)
        host.reload()
        expect(
            host.get_by_role("checkbox", name="Allow payment on arrival:", exact=False)
        ).not_to_be_checked()
        host.get_by_role(
            "checkbox", name="Allow payment on arrival:", exact=False
        ).check()
        host.get_by_role("button", name="Save changes", exact=True).click()
        host.wait_for_timeout(500)
        # Complete a pay-on-arrival booking through real checkout controls.
        package = fixture["packages"][0]
        traveler.goto(
            origin
            + "/checkout?packageId="
            + package
            + "&date="
            + fixture["paymentQA"]["day"]
            + "&time=11%3A00&option=0&travelers=1"
        )
        traveler.get_by_label("Full name", exact=True).fill(guest)
        traveler.get_by_role("button", name="Review booking", exact=True).click()
        traveler.get_by_role("button", name="Pay on arrival", exact=True).click()
        traveler.get_by_role(
            "checkbox", name="I have reviewed and accept", exact=False
        ).check()
        traveler.get_by_role("button", name="Confirm booking", exact=False).click()
        traveler.wait_for_url("**/confirmation/**")
        expect(traveler.get_by_text("Due on arrival", exact=True)).to_be_visible()
        expect(
            traveler.get_by_text("Amount due to your Buddy on arrival:", exact=False)
        ).to_be_visible()
        traveler.screenshot(
            path="/tmp/travelbuddy-arrival-confirmation.png", full_page=True
        )
        # Inbox dashboard lists reservations, filters by guest, and opens a two-way thread.
        host.goto(origin + "/account/dashboard")
        expect(
            host.get_by_role("heading", name="Bookings & conversations", exact=True)
        ).to_be_visible()
        host.get_by_label("Guest or reference", exact=True).fill(guest)
        host.get_by_role("button", name="Find bookings", exact=True).click()
        expect(host.get_by_text("1 matching bookings", exact=False)).to_be_visible()
        expect(host.get_by_text(guest, exact=True)).to_be_visible()
        host.get_by_role("button", name="Message traveler", exact=True).click()
        host.wait_for_url("**/inbox**")
        host.get_by_label("Your message", exact=True).fill(message)
        host.get_by_role("button", name="Send", exact=True).click()
        expect(
            host.get_by_label("Messages", exact=True).get_by_text(message, exact=True)
        ).to_be_visible()
        traveler.get_by_role("button", name="Contact provider", exact=True).click()
        traveler.wait_for_url("**/inbox**")
        expect(
            traveler.get_by_label("Messages", exact=True).get_by_text(
                message, exact=True
            )
        ).to_be_visible()
        traveler.get_by_label("Your message", exact=True).fill(reply)
        traveler.get_by_role("button", name="Send", exact=True).click()
        expect(
            host.get_by_label("Messages", exact=True).get_by_text(reply, exact=True)
        ).to_be_visible(timeout=12000)
        # An unavailable gateway does not pretend to have charged the customer.
        traveler.goto(origin + "/payments/" + fixture["paymentQA"]["pendingOrder"])
        expect(
            traveler.get_by_role("heading", name="Complete your payment", exact=True)
        ).to_be_visible()
        expect(
            traveler.get_by_text("Online payments are not configured yet.", exact=False)
        ).to_be_visible()
        # Exercise the real server-signed form while intercepting the external gateway.
        # No card request is sent to PayHere by this local contract test.
        if os.environ.get("PAYMENT_TEST_ENDPOINT"):
            endpoint = os.environ["PAYMENT_TEST_ENDPOINT"]
            traveler.route(
                "**/payments-api/**",
                lambda route: route.fulfill(
                    response=route.fetch(
                        url=endpoint + "/" + route.request.url.rsplit("/", 1)[-1]
                    )
                ),
            )
            captured = {}

            def gateway(route):
                captured.update(
                    {
                        key: values[0]
                        for key, values in parse_qs(route.request.post_data).items()
                    }
                )
                route.fulfill(
                    status=200,
                    content_type="text/html",
                    body="<h1>Test gateway handoff</h1>",
                )

            traveler.route("https://sandbox.payhere.lk/pay/checkout", gateway)
            traveler.reload()
            traveler.get_by_label("First name", exact=True).fill("QA")
            traveler.get_by_label("Last name", exact=True).fill("Traveler")
            traveler.get_by_label("Phone", exact=True).fill("+94770000000")
            traveler.get_by_label("Address", exact=True).fill("Test address")
            traveler.get_by_label("City", exact=True).fill("Colombo")
            traveler.get_by_role("button", name="with PayHere", exact=False).click()
            expect(
                traveler.get_by_role("heading", name="Test gateway handoff")
            ).to_be_visible()
            assert captured["amount"] == "25.55" and captured["currency"] == "LKR"
            md5 = lambda value: hashlib.md5(value.encode()).hexdigest().upper()
            secret = md5("local-contract-test-secret")
            assert captured["hash"] == md5(
                captured["merchant_id"]
                + captured["order_id"]
                + captured["amount"]
                + captured["currency"]
                + secret
            )
            traveler.goto(
                origin
                + "/payments/"
                + fixture["paymentQA"]["pendingOrder"]
                + "?returned=1"
            )
            expect(
                traveler.get_by_text("Waiting for payment confirmation", exact=True)
            ).to_be_visible()
            expect(
                traveler.get_by_role("heading", name="Payment received", exact=True)
            ).not_to_be_visible()
            callback = {
                "merchant_id": captured["merchant_id"],
                "order_id": captured["order_id"],
                "payment_id": "ui-" + secrets.token_hex(8),
                "payhere_amount": captured["amount"],
                "payhere_currency": captured["currency"],
                "status_code": "2",
            }
            callback["md5sig"] = md5(
                callback["merchant_id"]
                + callback["order_id"]
                + callback["payhere_amount"]
                + callback["payhere_currency"]
                + "2"
                + secret
            )
            response = traveler.request.post(endpoint + "/notify", form=callback)
            assert response.status == 200
            traveler.goto(origin + "/payments/" + fixture["paymentQA"]["pendingOrder"])
            expect(
                traveler.get_by_role("heading", name="Payment received", exact=True)
            ).to_be_visible()
        # Paid cancellation retains a visible refund status.
        traveler.goto(origin + "/payments/" + fixture["paymentQA"]["paidOrder"])
        expect(traveler.get_by_text("Refund:", exact=False)).to_be_visible()
        # Mobile provider dashboard has no horizontal overflow; filter is still operable.
        host.set_viewport_size({"width": 390, "height": 844})
        host.goto(origin + "/account/dashboard")
        expect(
            host.get_by_role("heading", name="Bookings & conversations", exact=True)
        ).to_be_visible()
        host.get_by_label("Booking status", exact=True).select_option("All")
        host.get_by_role("button", name="Find bookings", exact=True).click()
        expect(
            host.get_by_role("button", name="Message traveler", exact=True).first
        ).to_be_visible()
        assert host.evaluate("document.documentElement.scrollWidth <= innerWidth"), (
            "Mobile horizontal overflow"
        )
        host.screenshot(
            path="/tmp/travelbuddy-provider-dashboard-mobile.png", full_page=True
        )
        assert not errors, errors
        print(
            "Vidura browser checks passed: destination deep links, editor payment terms, real pay-on-arrival checkout, policy/confirmation, provider filtering, two-way chat, signed gateway handoff/callback where enabled, pending gateway state, refund display and mobile dashboard."
        )
    finally:
        for context in contexts:
            context.close()
        browser.close()
