import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { safeReturn } from "@/lib/validation";
import { Loading, Problem } from "@/components/custom-ui/feedback";
import { callbackError, createCodeExchanger } from "./oauth";
const exchangeCode = createCodeExchanger(supabase.auth);
export function AuthCallback() {
  const [error, setError] = useState<unknown>();
  useEffect(() => {
    let active = true;
    const url = new URL(location.href);
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
        if (active) location.replace(safeReturn(params.get("returnTo")));
      })
      .catch((error: unknown) => {
        if (active) setError(error);
      });
    return () => {
      active = false;
    };
  }, []);
  return error ? <Problem error={error} /> : <Loading />;
}
