import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session";
import { accountQuery } from "@/lib/queries";
import {
  convertedAmount,
  formatMoney,
  validRates,
  type DisplayCurrency,
  type ExchangeRate,
} from "./model";
const Context = createContext<{
  currency: DisplayCurrency;
  rates: ExchangeRate[];
  pending: boolean;
}>({ currency: "LKR", rates: [], pending: false });
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const { session } = useSession();
  const account = useQuery({ ...accountQuery(), enabled: !!session });
  const traveler =
    !!account.data &&
    !account.data.roles.some((r) => r === "provider" || r === "guide");
  const currency = traveler
    ? (account.data!.profileDetails.displayCurrency ?? "LKR")
    : "LKR";
  const query = useQuery({
    queryKey: ["exchange-rates"],
    enabled: currency !== "LKR",
    queryFn: async () => {
      const response = await fetch("/payments-api/exchange-rates");
      if (!response.ok) throw new Error("Rates unavailable");
      return validRates(await response.json());
    },
    staleTime: 3600000,
    refetchInterval: 3600000,
    retry: 1,
  });
  const rates = validRates(query.data ?? []);
  return (
    <Context.Provider value={{ currency, rates, pending: query.isFetching }}>
      {children}
    </Context.Provider>
  );
}
export function useMoney() {
  const { currency, rates } = useContext(Context);
  return (amount: number, base = "LKR") => {
    const converted = convertedAmount(amount, base, currency, rates);
    return converted === null
      ? formatMoney(amount, base)
      : (base === currency ? "" : "≈ ") + formatMoney(converted, currency);
  };
}
export function CurrencyNotice() {
  const { currency, rates, pending } = useContext(Context);
  if (currency === "LKR") return null;
  const rate = rates.find((r) => r.quote === currency);
  return (
    <p className="text-xs leading-relaxed text-muted-foreground">
      {rate
        ? `Prices in ${currency} are approximate conversions using the latest available rate (${rate.date}). All new payments are charged in LKR. Your bank’s rate and fees may differ.`
        : pending
          ? "Loading approximate exchange rates. Payments are charged in LKR."
          : "Exchange rates are unavailable. Original prices are shown; new payments are charged in LKR."}
    </p>
  );
}
export function useDisplayCurrency() {
  return useContext(Context).currency;
}
