import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
const Context = createContext<{ session: Session | null; ready: boolean }>({
  session: null,
  ready: false,
});
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{
    session: Session | null;
    ready: boolean;
  }>({ session: null, ready: false });
  const client = useQueryClient();
  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ session, ready: true });
      if (event === "SIGNED_OUT" || event === "SIGNED_IN") client.clear();
    });
    return () => data.subscription.unsubscribe();
  }, [client]);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export const useSession = () => useContext(Context);
