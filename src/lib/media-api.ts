import { Capacitor } from "@capacitor/core";

export function resolveMediaApiUrl(
  path: string,
  native: boolean,
  origin = "https://travelbuddy.shalinda.com",
) {
  if (!native) return path;
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.username || base.password) {
    throw new Error("Native uploads require an HTTPS media API origin.");
  }
  return new URL(path, base.origin).toString();
}

export function mediaApiUrl(path: string) {
  return resolveMediaApiUrl(
    path,
    Capacitor.isNativePlatform(),
    import.meta.env.VITE_MEDIA_API_ORIGIN || undefined,
  );
}
