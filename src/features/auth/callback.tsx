import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { safeReturn } from "@/lib/validation";
import { Loading, Problem } from "@/components/custom-ui/feedback";
import { callbackError, createCodeExchanger } from "./oauth";
const exchangeCode = createCodeExchanger(supabase.auth);
export function AuthCallback() {
  const [error, setError] = useState<unknown>();
  const href = useLocation({ select: (location) => location.href });
  const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    setError(undefined);
    const url = new URL(href, location.origin);
    const params = url.searchParams;
    const code = params.get("code");
    const providerError = callbackError(url);
    if (providerError) {
      setError(new Error(providerError));
      return;
    }
    if (!code) {
      setError(
        new Error(
          "This sign-in link is invalid or expired. Request another link.",
        ),
      );
      return;
    }
    void exchangeCode(code)
      .then(() => {
        if (active)
          return navigate({
            href: safeReturn(params.get("returnTo")),
            replace: true,
          });
      })
      .catch((error: unknown) => {
        if (active) setError(error);
      });
    return () => {
      active = false;
    };
  }, [href, navigate]);
  return error ? <Problem error={error} /> : <Loading />;
}
