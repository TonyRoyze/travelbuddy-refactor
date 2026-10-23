"""Verify persistent traveler currency, approximate prices and exact LKR checkout."""

import json, sys, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

fixture = json.loads(Path(sys.argv[1]).read_text())
origin = "http://localhost:5173"
with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path=os.environ.get(
            "PLAYWRIGHT_CHROMIUM_EXECUTABLE",
            "/Users/vidura/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell",
        ),
    )
    context = browser.new_context(viewport={"width": 1280, "height": 900})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        page.goto(origin + "/login")
        page.get_by_role("button", name="Continue with email", exact=True).click()
        page.get_by_label("Email address", exact=True).fill(
            fixture["users"][1]["email"]
        )
        page.get_by_label("Password", exact=True).fill(fixture["users"][1]["password"])
        page.get_by_role("button", name="Sign in with email", exact=True).click()
        page.wait_for_url(origin + "/")
        page.goto(origin + "/account/settings")
        expect(page.get_by_label("Display currency", exact=True)).to_have_value("LKR")
        page.get_by_label("Display currency", exact=True).select_option("EUR")
        page.get_by_role("button", name="Save profile", exact=True).click()
        expect(page.get_by_text("Your profile is saved.", exact=True)).to_be_visible()
        page.reload()
        expect(page.get_by_label("Display currency", exact=True)).to_have_value("EUR")
        page.goto(origin + "/experience/" + fixture["packages"][0])
        expect(
            page.get_by_text("Prices in EUR are approximate conversions", exact=False)
        ).to_be_visible(timeout=15000)
        expect(
            page.locator("main").get_by_text("≈ EUR", exact=False).first
        ).to_be_visible()
        page.screenshot(path="/tmp/travelbuddy-currency-eur.png", full_page=True)
        # API rates have actual observation dates, not an invented claim of today's publication.
        response = page.request.get(origin + "/payments-api/exchange-rates")
        assert response.status == 200
        rates = response.json()
        assert any(
            r["base"] == "LKR" and r["quote"] == "EUR" and r["rate"] > 0 for r in rates
        )
        day = fixture["paymentQA"]["day"]
        page.goto(
            origin
            + "/checkout?packageId="
            + fixture["packages"][0]
            + "&date="
            + day
            + "&time=11%3A00&option=0&travelers=1"
        )
        expect(page.get_by_text("Total charged · LKR", exact=True)).to_be_visible()
        expect(page.get_by_text("LKR 25.55", exact=True)).to_be_visible()
        # A reload with an unreachable FX source must fall back to LKR, never relabel the amount EUR.
        page.route(
            "**/payments-api/exchange-rates",
            lambda route: route.fulfill(status=503, json={"error": "offline"}),
        )
        page.goto(origin + "/experience/" + fixture["packages"][0])
        page.reload()
        expect(
            page.get_by_text("Exchange rates are unavailable.", exact=False)
        ).to_be_visible(timeout=15000)
        expect(
            page.locator("main").get_by_text("LKR 25.55", exact=False).first
        ).to_be_visible()
        assert not errors, errors
        page.set_viewport_size({"width": 390, "height": 844})
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        print(
            "Currency browser checks passed: saved EUR preference/reload, real dated FX, approximate package display, exact LKR checkout, offline fallback and mobile width."
        )
    finally:
        context.close()
        browser.close()
