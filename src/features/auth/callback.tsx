import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { safeReturn } from "@/lib/validation";
import { Loading, Problem } from "@/components/feedback";
let exchange: Promise<unknown> | undefined;
export function AuthCallback() {
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get("code");
    const providerError = params.get("error_description");
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
    exchange ??= supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) throw error;
      });
    exchange
      .then(() => location.replace(safeReturn(params.get("returnTo"))))
      .catch(setError);
  }, []);
  return error ? <Problem error={error} /> : <Loading />;
}
