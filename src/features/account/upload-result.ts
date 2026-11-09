/** Only an explicit media ID confirms that the service committed an upload. */
export async function readUploadResult(response: Response): Promise<string> {
  const body: unknown = await response.json().catch(() => null);
  const result =
    body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : undefined;
  if (
    !response.ok ||
    typeof result?.mediaId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      result.mediaId,
    )
  ) {
    throw new Error(
      typeof result?.error === "string"
        ? result.error
        : "Your file was not saved. The upload service is unavailable. Please try again.",
    );
  }
  return result.mediaId;
}
