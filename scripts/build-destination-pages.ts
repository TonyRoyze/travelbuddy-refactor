// Facebook crawlers receive metadata without executing the SPA.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { loadEnv } from "vite";
import {
  destinationChoices,
  destinationMetadata,
  destinationSlug,
} from "../src/features/catalog/destination-links";
const env = loadEnv("production", process.cwd(), "");
const site = process.env.PUBLIC_SITE_URL || env.PUBLIC_SITE_URL;
if (!site) {
  console.log(
    "PUBLIC_SITE_URL is unset: destination pages contain relative canonical URLs. Set it for production Facebook previews.",
  );
}
if (
  site &&
  (new URL(site).protocol !== "https:" || new URL(site).pathname !== "/")
)
  throw new Error("PUBLIC_SITE_URL must be the public HTTPS origin.");
const escape = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
const template = await readFile("dist/index.html", "utf8");
for (const town of destinationChoices) {
  const meta = destinationMetadata(town, site || "https://localhost.invalid");
  const canonical = site ? meta.url : new URL(meta.url).pathname;
  const head = `<title>${escape(meta.title)}</title><meta name="description" content="${escape(meta.description)}"><link rel="canonical" href="${escape(canonical)}"><meta property="og:type" content="website"><meta property="og:site_name" content="TravelBuddy"><meta property="og:title" content="${escape(meta.title)}"><meta property="og:description" content="${escape(meta.description)}"><meta property="og:url" content="${escape(canonical)}"><meta property="og:image" content="${escape(meta.image)}"><meta name="twitter:card" content="summary_large_image">`;
  const dir = `dist/destinations/${destinationSlug(town)}`;
  await mkdir(dir, { recursive: true });
  await writeFile(
    `${dir}/index.html`,
    template.replace(/<title>.*?<\/title>/, head),
  );
}
console.log(
  `Built ${destinationChoices.length} public destination landing pages.`,
);
