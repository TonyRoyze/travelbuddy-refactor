"use client";
import { useState, type FormEvent } from "react";
import { Photo } from "./UI";
import { ShieldCheck } from "lucide-react";
import { experiences } from "@/lib/catalog";
import { GoogleLogoutButton } from "./GoogleLogoutButton";
import type { ServerAccount } from "./ServerAuthProvider";

export function GoogleOnboarding({ account }: { account: ServerAccount }) {
  const [name, setName] = useState(account.displayName);
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: name,
          acceptAccountCreation: accepted,
        }),
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(body.error || "Your account could not be completed.");
      window.location.assign("/account/security");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Your account could not be completed.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="google-onboarding">
      <aside className="onboarding-landscape" aria-label="A view of Sigiriya, Sri Lanka">
        <Photo
          src={experiences[1].image}
          alt="Sigiriya rising above the green Sri Lankan landscape"
          sizes="(max-width: 760px) 1px, (max-width: 1100px) 40vw, 420px"
          priority
        />
        <div className="onboarding-landscape-copy">
          <h2>Your next story<br />starts here.</h2>
          <p>Sigiriya, Sri Lanka</p>
        </div>
      </aside>
      <section className="onboarding-content" aria-labelledby="onboarding-title">
        <header className="onboarding-heading">
          <p className="onboarding-identity"><ShieldCheck size={18} aria-hidden="true" />Signed in with Google</p>
          <h1 id="onboarding-title">Welcome to<br />TravelBuddy.</h1>
          <p>One last detail before you explore. Confirm the name you’d like to use on your traveler account.</p>
        </header>
        <form className="onboarding-form" onSubmit={submit} aria-busy={busy}>
          <label className="field onboarding-name">
            Your name
            <input
              autoComplete="name"
              maxLength={120}
              required
              disabled={busy}
              value={name}
              aria-describedby="onboarding-name-help"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <p id="onboarding-name-help" className="onboarding-help">This is how you’ll appear on TravelBuddy.</p>
          <label className="onboarding-consent">
            <input
              type="checkbox"
              required
              disabled={busy}
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
            />
            <span>Create my TravelBuddy traveler account.</span>
          </label>
          {error && <p className="error-message" role="alert">{error}</p>}
          <button className="button button-primary button-wide" disabled={busy}>
            {busy ? "Saving your account…" : "Complete registration"}
          </button>
          <p className="onboarding-disclosure">Trips and bookings are still demonstrations stored on this device.</p>
        </form>
        <footer className="onboarding-footer">
          <p>Using a different Google account?</p>
          <GoogleLogoutButton />
        </footer>
      </section>
    </div>
  );
}
