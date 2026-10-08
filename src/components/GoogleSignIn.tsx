"use client";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { useCustomer } from "./CustomerProvider";

type GoogleId = {
  initialize: (config: {
    client_id: string;
    nonce: string;
    auto_select: boolean;
    callback: (response: { credential: string }) => void;
  }) => void;
  renderButton: (
    element: HTMLElement,
    config: {
      theme: string;
      size: string;
      text: string;
      shape: string;
      logo_alignment: string;
      width: number;
      locale: string;
    },
  ) => void;
  disableAutoSelect: () => void;
};
declare global {
  interface Window {
    google?: { accounts: { id: GoogleId } };
  }
}

export function GoogleSignIn({
  registration = false,
}: {
  registration?: boolean;
}) {
  const { logout: logoutDemo } = useCustomer();
  const container = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [config, setConfig] = useState<{
    clientId: string;
    nonce: string;
    csrf: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (container.current) container.current.inert = busy;
  }, [busy]);

  useEffect(() => {
    const controller = new AbortController();
    setConfig(null);
    setError("");
    fetch("/api/auth/google", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error || "Google sign-in is unavailable.");
        setConfig(body);
      })
      .catch((err) => {
        if (!controller.signal.aborted)
          setError(
            err instanceof Error
              ? err.message
              : "Google sign-in is unavailable.",
          );
      });
    return () => controller.abort();
  }, [retry]);

  useEffect(() => {
    const google = window.google?.accounts.id;
    if (!scriptReady || !config || !container.current || !google) return;
    google.initialize({
      client_id: config.clientId,
      nonce: config.nonce,
      auto_select: false,
      callback: async ({ credential }) => {
        if (inFlight.current) return;
        inFlight.current = true;
        setBusy(true);
        setError("");
        try {
          const response = await fetch("/api/auth/google", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ credential, csrf: config.csrf }),
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Google sign-in failed.");
          logoutDemo();
          window.location.assign(
            result.redirect === "/register/google"
              ? "/register/google"
              : "/account/security",
          );
        } catch (err) {
          setError(
            err instanceof Error
              ? err.message
              : "Google sign-in failed. Please try again.",
          );
          setBusy(false);
          inFlight.current = false;
        }
      },
    });
    container.current.replaceChildren();
    google.renderButton(container.current, {
      theme: "outline",
      size: "large",
      text: registration ? "signup_with" : "signin_with",
      shape: "pill",
      logo_alignment: "left",
      width: Math.min(430, container.current.clientWidth || 280),
      locale: "en",
    });
  }, [scriptReady, config, registration]);

  return (
    <section
      className="google-sign-in"
      aria-label={registration ? "Register with Google" : "Sign in with Google"}
      aria-busy={busy}
    >
      {config && (
        <Script
          src="https://accounts.google.com/gsi/client?hl=en"
          strategy="afterInteractive"
          onReady={() => setScriptReady(true)}
          onError={() =>
            setError(
              "Google could not load. Check your connection and try again.",
            )
          }
        />
      )}
      <div
        ref={container}
        hidden={!config || Boolean(error)}
        className={busy ? "google-button google-button-busy" : "google-button"}
      />
      {!error && (!config || !scriptReady || busy) && (
        <p role="status">
          {busy ? "Signing in securely…" : "Loading Google sign-in…"}
        </p>
      )}
      {error && (
        <>
          <p className="error-message" role="alert">
            {error}
          </p>
          <button
            type="button"
            className="text-link"
            onClick={() => {
              if (config && !window.google) {
                window.location.reload();
                return;
              }
              setScriptReady(Boolean(window.google));
              setRetry((value) => value + 1);
            }}
          >
            Try again
          </button>
        </>
      )}
      {/*<p className="google-auth-note">
        {registration
          ? "Create a traveler account with Google."
          : "Your first Google sign-in creates a traveler account."}
      </p>*/}
    </section>
  );
}
