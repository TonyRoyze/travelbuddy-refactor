import pg from "pg";
import sharp from "sharp";

const [accountId] = process.argv.slice(2);
if (!accountId || !process.env.DATABASE_URL) {
  console.error(
    "Usage: node scripts/check-buddy-face.mjs <account UUID> (requires DATABASE_URL)",
  );
  process.exit(1);
}

try {
  const { AZURE_FACE_ENDPOINT, AZURE_FACE_KEY } = process.env;
  if (!AZURE_FACE_ENDPOINT || !AZURE_FACE_KEY) {
    throw new Error(
      "Set AZURE_FACE_ENDPOINT and AZURE_FACE_KEY on the operator machine.",
    );
  }
  const endpoint = new URL(AZURE_FACE_ENDPOINT);
  if (
    endpoint.protocol !== "https:" ||
    !/^[a-z0-9-]+\.cognitiveservices\.azure\.com$/.test(endpoint.host) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== "/" ||
    endpoint.search ||
    endpoint.hash
  ) {
    throw new Error(
      "Use your Azure Face resource's HTTPS cognitiveservices.azure.com endpoint.",
    );
  }

  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  let evidence;
  try {
    const result = await db.query(
      `SELECT a.submitted_at::text, i.kind, i.content
       FROM travelbuddy_private.buddy_applications a
       JOIN travelbuddy_private.buddy_application_images i USING (account_id)
       WHERE a.account_id = $1 AND a.status = 'pending'
         AND a.details->'faceComparisonConsent' = 'true'::jsonb
         AND i.kind IN ('id-front', 'selfie')`,
      [accountId],
    );
    evidence = result.rows;
  } finally {
    await db.end();
  }
  if (evidence.length !== 2) {
    throw new Error(
      "A pending application with both images and Azure Face consent is required.",
    );
  }

  async function call(path, body, contentType) {
    let response;
    try {
      response = await fetch(new URL(`/face/v1.2/${path}`, endpoint), {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": AZURE_FACE_KEY,
          "Content-Type": contentType,
        },
        body,
        redirect: "error",
        signal: globalThis.AbortSignal.timeout(15_000),
      });
    } catch {
      throw new Error("Could not reach Azure Face.");
    }
    if (!response.ok) {
      throw new Error(
        `Azure Face returned HTTP ${response.status}. Check resource configuration and limited-access approval.`,
      );
    }
    return response.json();
  }

  async function detect(image) {
    // Normalize the accepted upload formats and apply EXIF orientation.
    const jpeg = await sharp(image, { limitInputPixels: 24_000_000 })
      .rotate()
      .resize(1920, 1920, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 92 })
      .toBuffer()
      .catch(() => {
        throw new Error(
          "An application image could not be decoded. Review it manually.",
        );
      });
    const faces = await call(
      "detect?_overload=detect&detectionModel=detection_03&recognitionModel=recognition_04&returnFaceId=true&faceIdTimeToLive=60",
      jpeg,
      "application/octet-stream",
    );
    return Array.isArray(faces) &&
      faces.length === 1 &&
      typeof faces[0]?.faceId === "string"
      ? faces[0].faceId
      : null;
  }

  const [faceId1, faceId2] = await Promise.all(
    evidence.map(({ content }) => detect(content)),
  );
  let comparison = "inconclusive";
  if (faceId1 && faceId2) {
    const result = await call(
      "verify",
      JSON.stringify({ faceId1, faceId2 }),
      "application/json",
    );
    if (typeof result?.isIdentical !== "boolean")
      throw new Error("Unexpected Azure Face verification response.");
    comparison = result.isIdentical ? "match" : "no_match";
  }
  console.log(
    JSON.stringify({
      accountId,
      submittedAt: evidence[0].submitted_at,
      comparison,
    }),
  );
} catch (error) {
  // Do not print request bodies, images, Azure face IDs or credentials.
  console.error(
    error instanceof Error && !("code" in error)
      ? error.message
      : "Could not read the buddy application from the database.",
  );
  process.exitCode = 1;
}
