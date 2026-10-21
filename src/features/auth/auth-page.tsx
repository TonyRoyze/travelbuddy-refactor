import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { Provider } from "@supabase/supabase-js";
import { Apple, Mail } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { safeReturn } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Problem } from "@/components/feedback";
export function AuthPage({
  mode,
  returnTo = "/",
}: {
  mode: "login" | "register" | "recover" | "reset";
  returnTo?: string;
}) {
  const [error, setError] = useState<unknown>();
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState(false);
  const [emailExpanded, setEmailExpanded] = useState(false);
  const [oauthFailure, setOauthFailure] = useState(false);
  const [lastProvider, setLastProvider] = useState<Provider | null>(null);
  const navigate = useNavigate();
  const target = safeReturn(returnTo);
  const providers = useQuery({
    queryKey: ["auth-providers"],
    queryFn: async () => {
      const r = await fetch(
        import.meta.env.VITE_SUPABASE_URL + "/auth/v1/settings",
        { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } },
      );
      if (!r.ok) throw new Error("Could not load sign-in options");
      return (await r.json()) as { external: Record<string, boolean> };
    },
    staleTime: 300000,
  });
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(undefined);
    setPending(true);
    setNotice("");
    const f = new FormData(e.currentTarget);
    const email = String(f.get("email") ?? "").trim();
    const password = String(f.get("password") ?? "");
    try {
      if (mode === "recover") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo:
            location.origin + "/auth/callback?returnTo=/reset-password",
        });
        if (error) throw error;
        setNotice("Check your email for a password reset link.");
      } else if (mode === "reset") {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
        setNotice("Password updated.");
        await navigate({ to: "/account" });
      } else if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo:
              location.origin +
              "/auth/callback?returnTo=" +
              encodeURIComponent(target),
          },
        });
        if (error) throw error;
        if (!data.session)
          setNotice("Check your email to confirm your account.");
        else
          await navigate({
            to: "/register/complete",
            search: { returnTo: target },
          });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        window.location.assign(target);
      }
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }
  async function oauth(provider: Provider) {
    setPending(true);
    setLastProvider(provider);
    setOauthFailure(false);
    setError(undefined);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo:
            location.origin +
            "/auth/callback?returnTo=" +
            encodeURIComponent(target),
        },
      });
      if (error) throw error;
    } catch (e) {
      setError(e);
      if (mode === "login") setOauthFailure(true);
      setPending(false);
    }
  }
  const title = {
    login: "Good to see you again.",
    register: "Let’s start somewhere.",
    recover: "Forgot your password?",
    reset: "Choose a new password",
  }[mode];
  if (mode === "login") {
    const configuredProviders = (
      ["google", "facebook", "apple"] as Provider[]
    ).filter((provider) => providers.data?.external[provider]);

    return (
      <div className="mx-auto grid min-h-[min(820px,calc(100dvh-8rem))] max-w-[1440px] overflow-hidden rounded-[1.5rem] border border-border bg-background shadow-sm md:grid-cols-[1.2fr_1fr]">
        <section className="relative isolate flex min-h-52 flex-col justify-end overflow-hidden bg-hero px-6 py-7 text-hero-foreground sm:min-h-60 sm:px-9 sm:py-9 md:min-h-[min(820px,calc(100dvh-8rem))] md:px-12 md:py-12">
          <img
            src="https://images.unsplash.com/photo-1711100358840-ce6fd71c31b3?auto=format&fit=crop&w=1600&q=90"
            alt="Sigiriya rising above the green landscape of Sri Lanka"
            className="absolute inset-0 -z-20 size-full object-cover"
          />
          <div className="absolute inset-0 -z-10 bg-linear-to-t from-[#071e19]/95 via-[#071e19]/30 to-[#071e19]/10" />
          <div className="flex flex-col items-start gap-4 sm:gap-6">
            <img
              src="/brand/buddy-mark-inverse.svg"
              alt=""
              className="size-10 sm:size-14"
            />
            <h2 className="text-2xl leading-tight font-semibold tracking-tight sm:text-3xl md:text-4xl">
              Good company.
              <br />
              Great discoveries.
            </h2>
            <p className="max-w-sm text-sm leading-relaxed text-white/85 sm:text-base">
              A little curiosity can lead somewhere wonderful.
            </p>
          </div>
          <p className="mt-6 hidden text-xs text-white/75 sm:block md:mt-12">
            TravelBuddy · Your next story starts here.
          </p>
        </section>

        <section className="flex items-center justify-center px-6 py-10 sm:px-10 md:px-12 lg:px-16">
          <div className="w-full max-w-[430px]">
            <p className="mb-4 text-sm font-semibold tracking-[0.08em] text-primary">
              YOUR TRAVEL SPACE
            </p>
            <h1 className="text-3xl leading-tight font-bold tracking-tight sm:text-4xl">
              Good to see
              <br className="hidden sm:block" /> you again.
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground">
              Your saved ideas and next adventures are waiting.
            </p>

            {!emailExpanded ? (
              <div className="mt-8 flex flex-col gap-3">
                {configuredProviders.map((provider) => (
                  <Button
                    key={provider}
                    type="button"
                    variant="outline"
                    disabled={pending}
                    onClick={() => oauth(provider)}
                    className="h-[54px] w-full rounded-full border-border/80 bg-card/80 text-muted-foreground shadow-none hover:border-border hover:bg-card hover:text-foreground"
                  >
                    <ProviderIcon provider={provider} />
                    Continue with{" "}
                    {provider[0].toUpperCase() + provider.slice(1)}
                  </Button>
                ))}
                {providers.isError && (
                  <p
                    className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive"
                    role="alert"
                  >
                    Sign-in options are temporarily unavailable. Please try
                    again.
                  </p>
                )}
                {oauthFailure && (
                  <div
                    className="rounded-lg bg-destructive/10 px-4 py-3 text-sm leading-relaxed text-destructive"
                    role="alert"
                  >
                    <p>Sign-in is temporarily unavailable. Please try again.</p>
                    {lastProvider && (
                      <Button
                        type="button"
                        variant="link"
                        disabled={pending}
                        onClick={() => void oauth(lastProvider)}
                        className="mt-2 h-auto px-0 py-0 font-semibold text-primary"
                      >
                        Try again
                      </Button>
                    )}
                  </div>
                )}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEmailExpanded(true)}
                  className="mt-1 h-[54px] w-full rounded-full border-border bg-card font-semibold text-foreground shadow-none hover:bg-muted"
                >
                  <Mail data-icon="inline-start" />
                  Continue with email
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
                <Button
                  type="button"
                  variant="link"
                  onClick={() => setEmailExpanded(false)}
                  className="h-auto w-fit px-0 py-0 text-sm font-semibold"
                >
                  Other sign-in options
                </Button>
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="email">Email address</FieldLabel>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      autoFocus
                      required
                      maxLength={320}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                    />
                  </Field>
                </FieldGroup>
                {error !== undefined && <Problem error={error} />}
                <Button disabled={pending} type="submit" size="lg">
                  {pending ? "Please wait…" : "Sign in with email"}
                </Button>
                <Link
                  to="/forgot-password"
                  className="text-center text-sm font-semibold text-primary hover:underline"
                >
                  Forgot password?
                </Link>
              </form>
            )}

            <p className="mt-8 text-center text-sm text-muted-foreground">
              New to TravelBuddy?{" "}
              <Link
                to="/register"
                search={{ returnTo: target }}
                className="font-bold text-primary underline decoration-1 underline-offset-4"
              >
                Create an account
              </Link>
            </p>
            <p role="status" className="sr-only">
              {notice}
            </p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-5xl overflow-hidden rounded-xl border bg-card md:min-h-[600px] md:grid-cols-2">
      <div className="relative isolate hidden flex-col justify-end gap-5 overflow-hidden bg-hero px-10 py-12 text-hero-foreground md:flex">
        <img
          src="https://images.unsplash.com/photo-1711100358840-ce6fd71c31b3?auto=format&fit=crop&w=1000&q=85"
          alt="Sigiriya, Sri Lanka"
          className="absolute inset-0 -z-20 size-full object-cover"
        />
        <div className="absolute inset-0 -z-10 bg-linear-to-t from-hero/95 to-hero/25" />
        <h2 className="text-3xl leading-tight font-bold">
          Good company.
          <br />
          Great discoveries.
        </h2>
        <p>Your next story starts with a local connection.</p>
      </div>
      <Card className="justify-center gap-6 rounded-none py-8 shadow-none ring-0 [--card-spacing:--spacing(6)] md:[--card-spacing:--spacing(10)]">
        <CardHeader>
          <CardTitle>
            <h1 className="text-3xl">{title}</h1>
          </CardTitle>
          <CardDescription>
            {mode === "register"
              ? "Join as a traveler or share your world as a buddy."
              : "Keep your TravelBuddy account secure."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="flex flex-col gap-5">
            <FieldGroup>
              {mode !== "reset" && (
                <Field>
                  <FieldLabel htmlFor="email">Email address</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={320}
                  />
                </Field>
              )}
              {mode !== "recover" && (
                <Field>
                  <FieldLabel htmlFor="password">Password</FieldLabel>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    minLength={8}
                    required
                  />
                </Field>
              )}
            </FieldGroup>
            {error !== undefined && <Problem error={error} />}
            <p role="status">{notice}</p>
            <Button disabled={pending} type="submit" size="lg">
              {pending
                ? "Please wait…"
                : {
                    login: "Sign in",
                    register: "Create account",
                    recover: "Send reset link",
                    reset: "Update password",
                  }[mode]}
            </Button>
          </form>
          {mode === "register" && (
            <div className="mt-5 flex flex-col gap-2">
              {(["google", "facebook", "apple"] as Provider[])
                .filter((p) => providers.data?.external[p])
                .map((p) => (
                  <Button
                    key={p}
                    variant="outline"
                    disabled={pending}
                    onClick={() => oauth(p)}
                  >
                    Continue with {p[0].toUpperCase() + p.slice(1)}
                  </Button>
                ))}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap justify-between gap-3">
          <Link to="/login" search={{ returnTo: target }}>
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}

function ProviderIcon({ provider }: { provider: Provider }) {
  if (provider === "apple")
    return <Apple className="size-5 fill-current" aria-hidden="true" />;
  if (provider === "facebook")
    return (
      <span
        className="w-5 text-center text-xl leading-none font-bold text-[#1877f2]"
        aria-hidden="true"
      >
        f
      </span>
    );
  return (
    <span
      className="w-5 text-center text-xl leading-none font-bold text-[#4285f4]"
      aria-hidden="true"
    >
      G
    </span>
  );
}
