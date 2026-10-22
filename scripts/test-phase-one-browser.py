"""Local Phase 1 audit. Uses and appends users to a generated nearby fixture."""

import json, sys, os, secrets, base64
from pathlib import Path
from urllib.parse import urlencode
from playwright.sync_api import sync_playwright, expect

fixture_path = Path(sys.argv[1])
fixture = json.loads(fixture_path.read_text())
origin = "http://localhost:5173"
with sync_playwright() as p:
    browser = p.chromium.launch(
        headless=True,
        executable_path=os.environ.get(
            "PLAYWRIGHT_CHROMIUM_EXECUTABLE",
            "/Users/vidura/Library/Caches/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-mac-arm64/chrome-headless-shell",
        ),
    )
    host_context = browser.new_context(viewport={"width": 1280, "height": 900})
    visitor_context = browser.new_context(viewport={"width": 1280, "height": 900})
    host = host_context.new_page()
    visitor = visitor_context.new_page()
    errors = []
    for page in [host, visitor]:
        page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        # Real registration and onboarding through the UI (local Auth auto-confirms).
        email = (
            "phase-one-ui-"
            + fixture["tag"]
            + "-"
            + secrets.token_hex(3)
            + "@example.test"
        )
        password = secrets.token_urlsafe(32)
        visitor.goto(origin + "/register")
        visitor.get_by_label("Email address", exact=True).fill(email)
        visitor.get_by_label("Password", exact=True).fill(password)
        visitor.get_by_role("button", name="Create account", exact=True).click()
        visitor.wait_for_url("**/register/complete**")
        identity = visitor.evaluate(
            """async()=>{const {supabase,rpc}=await import('/src/lib/supabase.ts');const user=(await supabase.auth.getUser()).data.user;const account=await rpc('account');return {id:user.id,accountId:account.id}}"""
        )
        fixture["users"].append({**identity, "email": email, "password": password})
        fixture_path.write_text(json.dumps(fixture))
        fixture_path.chmod(0o600)
        visitor.get_by_label("Display name", exact=True).fill("UI Audit Traveller")
        visitor.get_by_role(
            "checkbox", name="I agree to create my TravelBuddy account."
        ).check()
        visitor.get_by_role("button", name="Complete registration", exact=True).click()
        visitor.wait_for_url(origin + "/")
        visitor.goto(origin + "/account/settings")
        visitor.get_by_label("A little about you").fill(
            "I enjoy local food and quiet tea trails."
        )
        image = visitor.evaluate(
            """()=>{const c=document.createElement('canvas');c.width=c.height=50;c.getContext('2d').fillRect(0,0,50,50);return c.toDataURL('image/png').split(',')[1]}"""
        )
        visitor.locator('input[accept^="image/"]').set_input_files(
            {
                "name": "audit-profile.png",
                "mimeType": "image/png",
                "buffer": base64.b64decode(image),
            }
        )
        expect(
            visitor.get_by_text("Your profile photo is saved.", exact=True)
        ).to_be_visible()
        visitor.get_by_role("button", name="Save profile", exact=True).click()
        expect(
            visitor.get_by_text("Your profile is saved.", exact=True)
        ).to_be_visible()
        visitor.reload()
        expect(visitor.get_by_label("A little about you")).to_have_value(
            "I enjoy local food and quiet tea trails."
        )
        # Full suggestion selection and filters; main search preserves applied filters.
        visitor.goto(origin + "/search")
        visitor.get_by_role(
            "combobox", name="Destination or experience", exact=True
        ).fill("Sig")
        expect(
            visitor.get_by_role("option", name="Sigiriya destination", exact=True)
        ).to_be_visible()
        visitor.get_by_role(
            "combobox", name="Destination or experience", exact=True
        ).press("ArrowDown")
        visitor.get_by_role(
            "combobox", name="Destination or experience", exact=True
        ).press("Enter")
        visitor.wait_for_url("**q=Sigiriya**")
        visitor.locator("#destination").fill("Sigiriya")
        visitor.locator("#duration").select_option("long")
        search_date = visitor.evaluate(
            "async()=>{const {today}=await import('/src/lib/validation.ts');const {addDays}=await import('/src/features/catalog/selection.ts');return addDays(today(),2)}"
        )
        visitor.locator("#search-date").fill(search_date)
        visitor.get_by_role("button", name="Apply filters", exact=True).click()
        visitor.wait_for_url("**duration=long**")
        visitor.get_by_role(
            "combobox", name="Destination or experience", exact=True
        ).fill("Rock")
        visitor.locator('button[aria-label="Search experiences"]').click()
        visitor.wait_for_url("**q=Rock**")
        assert "date=" + search_date in visitor.url and "duration=long" in visitor.url
        visitor.get_by_role("button", name="Reset", exact=True).click()
        expect(visitor.locator("#search-date")).to_have_value("")
        expect(visitor.locator("#duration")).to_have_value("")
        # Public gallery, including keyboard navigation and closing.
        visitor.goto(origin + "/experience/colombo-food")
        visitor.get_by_role(
            "button", name="Open experience photo 1", exact=True
        ).click()
        expect(visitor.get_by_role("dialog")).to_be_visible()
        visitor.get_by_role("button", name="Next photo", exact=True).click()
        expect(visitor.get_by_text("Photo 2 of 3", exact=True)).to_be_visible()
        visitor.keyboard.press("ArrowRight")
        expect(visitor.get_by_text("Photo 3 of 3", exact=True)).to_be_visible()
        visitor.keyboard.press("Escape")
        expect(visitor.get_by_role("dialog")).to_have_count(0)
        # Host goes online/offline; Live Now search refreshes automatically.
        host.goto(origin + "/login?returnTo=/account")
        host.get_by_role("button", name="Continue with email", exact=True).click()
        host.get_by_label("Email address", exact=True).fill(
            fixture["users"][0]["email"]
        )
        host.get_by_label("Password", exact=True).fill(fixture["users"][0]["password"])
        host.get_by_role("button", name="Sign in with email", exact=True).click()
        host.wait_for_url("**/account")
        toggle = host.get_by_role("switch", name="Accepting requests", exact=True)
        expect(toggle).to_be_visible()
        if toggle.is_checked():
            toggle.click()
        expect(host.get_by_text("Not accepting requests", exact=True)).to_be_visible()
        visitor.goto(
            origin + "/search?" + urlencode({"q": "QA Tea walk", "live": "true"})
        )
        cards = visitor.locator(
            'main a[href^="/experience/nearby-qa-' + fixture["tag"] + '"]'
        )
        expect(cards).to_have_count(0)
        host.get_by_role("switch", name="Accepting requests", exact=True).click()
        expect(
            host.get_by_text("Online and accepting requests", exact=True)
        ).to_be_visible()
        visitor.bring_to_front()
        expect(cards).to_have_count(6, timeout=20000)
        host.get_by_role("switch", name="Accepting requests", exact=True).click()
        expect(host.get_by_text("Not accepting requests", exact=True)).to_be_visible()
        visitor.bring_to_front()
        expect(cards).to_have_count(0, timeout=20000)
        host.get_by_role("switch", name="Accepting requests", exact=True).click()
        expect(
            host.get_by_text("Online and accepting requests", exact=True)
        ).to_be_visible()
        print(
            "Browser registration/profile/search/gallery/live checks passed.",
            flush=True,
        )
        # Book Now chooses nearest actual availability in Sri Lanka time.
        visitor.goto(origin + "/experience/" + fixture["packages"][0])
        expect(
            visitor.get_by_role("button", name="Book Now", exact=True)
        ).to_be_enabled()
        nearest = visitor.evaluate(
            """async id=>{const {rpc}=await import('/src/lib/supabase.ts');const {today}=await import('/src/lib/validation.ts');return (await rpc('availability',{package_id:id,day:today(),option_index:0,travelers:1})).next}""",
            fixture["packages"][0],
        )
        assert visitor.locator("#date").input_value() == nearest["date"]
        assert visitor.locator("#time").input_value() == nearest["time"]
        future = visitor.evaluate(
            """async id=>{const {rpc}=await import('/src/lib/supabase.ts');const {today}=await import('/src/lib/validation.ts');const {addDays}=await import('/src/features/catalog/selection.ts');return (await rpc('availability',{package_id:id,day:addDays(today(),3),option_index:0,travelers:2})).next}""",
            fixture["packages"][0],
        )
        visitor.locator("#date").fill(future["date"])
        visitor.locator("#travelers").fill("2")
        expect(
            visitor.get_by_role("button", name="Book Now", exact=True)
        ).to_be_enabled()
        visitor.locator("#time").select_option(future["time"])
        visitor.get_by_role("button", name="Chat with provider", exact=True).click()
        visitor.get_by_label("Your message", exact=True).fill(
            "Can we meet near the station?"
        )
        visitor.get_by_role("button", name="Send", exact=True).click()
        expect(
            visitor.get_by_text("Can we meet near the station?", exact=True)
        ).to_be_visible()
        host.goto(origin + "/inbox")
        host.get_by_role("button").filter(has_text="UI Audit Traveller").first.click()
        host.get_by_label("Your message", exact=True).fill(
            "Yes, meet by the main entrance."
        )
        host.get_by_role("button", name="Send", exact=True).click()
        expect(
            visitor.get_by_label("Messages", exact=True).get_by_text(
                "Yes, meet by the main entrance.", exact=True
            )
        ).to_be_visible(timeout=10000)
        assert (
            visitor.evaluate(
                """async()=>{const {rpc}=await import('/src/lib/supabase.ts');return (await rpc('bookings')).length}"""
            )
            == 0
        )
        visitor.get_by_role("button", name="Back to booking", exact=True).click()
        expect(visitor.locator("#date")).to_have_value(future["date"])
        expect(visitor.locator("#travelers")).to_have_value("2")
        expect(
            visitor.get_by_role("button", name="Add to cart", exact=True)
        ).to_be_enabled()
        visitor.get_by_role("button", name="Add to cart", exact=True).click()
        visitor.goto(origin + "/cart")
        visitor.reload()
        expect(
            visitor.get_by_role("link", name="Edit booking", exact=True)
        ).to_have_count(1)
        visitor.get_by_role("link", name="Edit booking", exact=True).click()
        visitor.locator("#travelers").fill("3")
        visitor.get_by_role("button", name="Update cart", exact=True).click()
        visitor.wait_for_url("**/cart")
        expect(
            visitor.get_by_role("link", name="Edit booking", exact=True)
        ).to_have_count(1)
        visitor.goto(origin + "/experience/" + fixture["packages"][1])
        expect(
            visitor.get_by_role("button", name="Add to cart", exact=True)
        ).to_be_enabled()
        visitor.get_by_role("button", name="Add to cart", exact=True).click()
        visitor.goto(origin + "/cart")
        expect(
            visitor.get_by_role("link", name="Edit booking", exact=True)
        ).to_have_count(2)
        visitor.get_by_role(
            "link", name="Continue to checkout · 2 experiences", exact=True
        ).click()
        visitor.get_by_role("button", name="Review booking", exact=True).click()
        visitor.get_by_role(
            "checkbox",
            name="I have reviewed and accept the cancellation policies for every booking.",
        ).check()
        visitor.get_by_role("button", name="Confirm bookings ·", exact=False).click()
        expect(
            visitor.get_by_role("heading", name="You’re going places.", exact=True)
        ).to_be_visible()
        expect(visitor.locator("main article")).to_have_count(2)
        visitor.goto(origin + "/cart")
        expect(
            visitor.get_by_text("Your cart is ready for an adventure", exact=True)
        ).to_be_visible()
        visitor.goto(origin + "/bookings")
        expect(visitor.locator("main article")).to_have_count(2)
        reserved = visitor.locator("main article").filter(has_text="QA Tea walk 1")
        reserved.get_by_role("button", name="Cancel reservation", exact=True).click()
        reserved.get_by_role("button", name="Confirm cancellation", exact=True).click()
        expect(reserved.get_by_text("Cancelled", exact=True)).to_be_visible()
        visitor.reload()
        expect(visitor.get_by_text("Cancelled", exact=True)).to_be_visible()
        visitor.set_viewport_size({"width": 390, "height": 844})
        visitor.goto(origin + "/search")
        visitor.get_by_role("button", name="Filter experiences", exact=True).click()
        expect(visitor.locator("#search-date")).to_be_visible()
        assert visitor.evaluate("document.documentElement.scrollWidth<=innerWidth"), (
            "Mobile overflow"
        )
        assert not errors, errors
        print(
            "Phase 1 browser passed: UI signup/onboarding/photo/bio, keyboard autocomplete, date/duration/reset, gallery, live off/on polling, nearest time, bidirectional chat and selection retention, persistent cart/edit, multi-item checkout, history/cancellation and mobile filters."
        )
    finally:
        browser.close()
