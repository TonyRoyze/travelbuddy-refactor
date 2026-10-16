import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { Provider } from "@supabase/supabase-js";
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
      setPending(false);
    }
  }
  const title = {
    login: "Good to see you again.",
    register: "Let’s start somewhere.",
    recover: "Forgot your password?",
    reset: "Choose a new password",
  }[mode];
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
            {mode === "login"
              ? "Sign in to book experiences and talk with your host."
              : mode === "register"
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
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={mode === "login" ? 1 : 8}
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
          {(mode === "login" || mode === "register") && (
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
          {mode === "login" ? (
            <>
              <Link to="/register" search={{ returnTo: target }}>
                Create account
              </Link>
              <Link to="/forgot-password">Forgot password?</Link>
            </>
          ) : (
            <Link to="/login" search={{ returnTo: target }}>
              Back to sign in
            </Link>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
