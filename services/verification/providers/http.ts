import { setTimeout } from "node:timers/promises";

export class ProviderRequestError extends Error {
  constructor(public readonly status?: number) {
    super("Verification provider request failed.");
  }
}

export async function requestProvider<T>(
  fetcher: typeof fetch,
  url: URL,
  init: RequestInit,
  read: (response: Response) => Promise<T>,
  deadline?: AbortSignal,
  maxRetries = 2,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    if (deadline?.aborted) throw new ProviderRequestError();
    const timeout = AbortSignal.timeout(15000);
    const signal = deadline ? AbortSignal.any([deadline, timeout]) : timeout;
    try {
      const response = await fetcher(url, {
        ...init,
        redirect: "error",
        signal,
      });
      if (response.ok) return await read(response);
      await response.body?.cancel().catch(() => {});
      throw new ProviderRequestError(response.status);
    } catch (error) {
      const status =
        error instanceof ProviderRequestError ? error.status : undefined;
      const retryable = status === undefined || status === 429 || status >= 500;
      if (attempt >= maxRetries || !retryable || deadline?.aborted)
        throw new ProviderRequestError(status);
      await setTimeout(250 * 2 ** attempt, undefined, {
        signal: deadline,
      }).catch(() => {
        throw new ProviderRequestError(status);
      });
    }
  }
}

export function readJson(response: Response): Promise<unknown> {
  return response.json();
}
