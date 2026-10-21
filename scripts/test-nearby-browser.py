"""Run against local Vite using a fixture from test-nearby-http.ts --keep-fixtures."""
import json
import os
import sys
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

fixture = json.loads(Path(sys.argv[1]).read_text())
origin = "http://127.0.0.1:5173"

def login(page, user):
    page.goto(origin + "/login")
    page.wait_for_load_state("networkidle")
    result = page.evaluate("""async credentials => {
      const {supabase}=await import('/src/lib/supabase.ts');
      const {error}=await supabase.auth.signInWithPassword(credentials);
      return error?.message ?? null;
    }""", {"email": user["email"], "password": user["password"]})
    assert result is None, result

def expire_host():
    account_id = fixture["users"][0]["accountId"]
    subprocess.run(["docker", "exec", "-i", "supabase-db", "psql", "-X", "-qAt", "-U", "supabase_admin", "-d", "postgres", "-v", "ON_ERROR_STOP=1"], input=f"UPDATE travelbuddy_private.provider_presence SET last_seen=clock_timestamp()-interval '3 minutes' WHERE provider_id='{account_id}'::uuid;", text=True, check=True)

with sync_playwright() as p:
    launch = {"headless": True}
    if os.getenv("PLAYWRIGHT_CHROMIUM_EXECUTABLE"):
        launch["executable_path"] = os.environ["PLAYWRIGHT_CHROMIUM_EXECUTABLE"]
    browser = p.chromium.launch(**launch)
    host_context = browser.new_context(viewport={"width":1280,"height":900})
    visitor_context = browser.new_context(viewport={"width":1280,"height":900})
    errors = []
    host = host_context.new_page()
    visitor = visitor_context.new_page()
    for page in [host, visitor]:
        page.on("pageerror", lambda error: errors.append(str(error)))
    try:
        login(host, fixture["users"][0])
        host.goto(origin + "/account")
        host.wait_for_load_state("networkidle")
        expect(host.get_by_role("switch", name="Accepting requests")).to_be_checked()
        expect(host.get_by_text("Online and accepting requests", exact=True)).to_be_visible()
        # Edit the real provider-owned meeting point through the Account UI.
        host.locator("#provider-package").select_option(fixture["packages"][0])
        host.locator("#meeting-label").fill("Ella station main entrance")
        host.locator(".leaflet-container").click(position={"x": 120, "y": 100})
        assert host.locator("#meeting-lat").input_value()
        host.locator("#meeting-lat").fill("6.8734")
        host.locator("#meeting-lng").fill("81.0464")
        host.get_by_role("button", name="Save meeting point", exact=True).click()
        expect(host.get_by_text("Meeting point saved.", exact=True)).to_be_visible()
        visitor.goto(origin + "/nearby")
        visitor.wait_for_load_state("networkidle")
        expect(visitor.get_by_text("Start with a place", exact=True)).to_be_visible()
        visitor.locator("#nearby-area").select_option(label=fixture["area"])
        expect(visitor.get_by_role("heading", name="1 host online in " + fixture["area"], exact=True)).to_be_visible()
        expect(visitor.locator("main article")).to_have_count(2)
        expect(visitor.locator(".leaflet-marker-icon")).to_have_count(1)
        expect(visitor.get_by_text("Ella station main entrance", exact=True)).to_be_visible()
        visitor.locator(".leaflet-marker-icon").click()
        expect(visitor.get_by_text("Selected meeting point", exact=True)).to_be_visible()
        expect(visitor.locator("main article")).to_have_count(2)
        visitor.locator(".leaflet-tile-loaded").first.wait_for()
        visitor.screenshot(path="/tmp/travelbuddy-nearby-desktop.png", full_page=True)
        visitor.get_by_role("button", name="List view", exact=True).click()
        expect(visitor.locator(".leaflet-container")).to_have_count(0)
        expect(visitor.locator("main article")).to_have_count(2)
        assert "view=list" in visitor.url
        visitor.locator("#nearby-area").select_option(label="QA Kandy " + fixture["tag"])
        expect(visitor.locator("main article")).to_have_count(1)
        visitor.locator("#nearby-area").select_option(label=fixture["area"])
        expect(visitor.locator("main article")).to_have_count(2)
        visitor.set_viewport_size({"width":390,"height":844})
        visitor.get_by_role("button", name="Map view", exact=True).click()
        expect(visitor.locator(".leaflet-marker-icon")).to_have_count(1)
        assert visitor.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Mobile overflow"
        visitor.screenshot(path="/tmp/travelbuddy-nearby-mobile.png", full_page=True)
        visitor.get_by_role("button", name="List view", exact=True).click()
        visitor.route("https://tile.openstreetmap.org/**", lambda route: route.abort())
        visitor.get_by_role("button", name="Map view", exact=True).click()
        expect(visitor.get_by_text("Map tiles could not load.", exact=False)).to_be_visible()
        visitor.get_by_role("button", name="List view", exact=True).click()
        expect(visitor.locator("main article")).to_have_count(2)
        visitor.unroute("https://tile.openstreetmap.org/**")
        # Manual off must win over all heartbeat clients.
        host.get_by_role("switch", name="Accepting requests").click()
        expect(host.get_by_role("switch", name="Accepting requests")).not_to_be_checked()
        visitor.get_by_role("button", name="Refresh", exact=True).click()
        expect(visitor.get_by_text("It’s quiet here right now", exact=True)).to_be_visible()
        host.get_by_role("switch", name="Accepting requests").click()
        expect(host.get_by_text("Online and accepting requests", exact=True)).to_be_visible()
        visitor.get_by_role("button", name="Refresh", exact=True).click()
        expect(visitor.locator("main article")).to_have_count(2)
        # Authenticated traveler reaches the real package chat without reserving.
        login(visitor, fixture["users"][1])
        visitor.goto(origin + "/nearby?area=" + fixture["area"].replace(" ", "%20") + "&view=list")
        expect(visitor.locator("main article")).to_have_count(2)
        visitor.get_by_role("link", name="Chat with host", exact=True).first.click()
        expect(visitor.get_by_role("button", name="Back to booking")).to_be_visible()
        assert "packageId=" in visitor.url
        # Closing the final provider context stops heartbeat renewal.
        host_context.close()
        expire_host()
        visitor.goto(origin + "/nearby?area=" + fixture["area"].replace(" ", "%20"))
        expect(visitor.get_by_text("It’s quiet here right now", exact=True)).to_be_visible()
        assert not errors, errors
        print("Nearby browser checks passed: real provider login, point editing, shared pins, synchronized map/list, town change, mobile layout, manual off/on, package chat and closed-app expiry.")
        print("Screenshots: /tmp/travelbuddy-nearby-desktop.png and /tmp/travelbuddy-nearby-mobile.png")
    finally:
        browser.close()
