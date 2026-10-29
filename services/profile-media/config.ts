export async function checkUploadProject(
  browser: { url: string; key: string },
  server: { url: string; key: string },
) {
  if (browser.url === server.url || browser.key === server.key) return;
  // Different public/internal URLs can legitimately reach the same instance.
  // Ask the server gateway whether it accepts the browser's public API key.
  let response: Response;
  try {
    response = await fetch(new URL("/auth/v1/settings", server.url), {
      headers: { apikey: browser.key },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new Error(
      `The upload service cannot reach ${new URL(server.url).origin}. The browser uses ${new URL(browser.url).origin}. Check SUPABASE_URL and matching credentials in .env.media.local, then restart pnpm dev.`,
    );
  }
  if (!response.ok)
    throw new Error(
      `Uploads use ${new URL(server.url).origin}, but the browser uses ${new URL(browser.url).origin} and its API key is rejected by the upload instance. Configure .env.media.local with credentials for the browser's Supabase instance, then restart pnpm dev.`,
    );
}
