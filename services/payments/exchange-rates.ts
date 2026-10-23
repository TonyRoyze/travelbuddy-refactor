import {
  currencies,
  validRates,
  type ExchangeRate,
} from "../../src/features/currency/model";
let cache: { rates: ExchangeRate[]; checked: number } | undefined;
let refreshing: Promise<ExchangeRate[]> | undefined;
export async function exchangeRates(): Promise<ExchangeRate[]> {
  if (cache && Date.now() - cache.checked < 3600000)
    return validRates(cache.rates);
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const response = await fetch(
        `https://api.frankfurter.dev/v2/rates?base=LKR&quotes=${currencies.filter((c) => c !== "LKR").join(",")}`,
        { signal: AbortSignal.timeout(8000) },
      );
      if (!response.ok) throw new Error("Rates unavailable");
      const rates = validRates(await response.json());
      if (!rates.length) throw new Error("Rates unavailable");
      cache = { rates, checked: Date.now() };
      return rates;
    } catch {
      const retained = validRates(cache?.rates ?? []);
      if (retained.length) return retained;
      throw new Error("Exchange rates are temporarily unavailable.");
    } finally {
      refreshing = undefined;
    }
  })();
  return refreshing;
}
