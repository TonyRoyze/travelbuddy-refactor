import { queryOptions } from "@tanstack/react-query";
import { z } from "zod";
import { rpc } from "@/lib/supabase";

const statusSchema = z.object({
  status: z.enum(["pending", "approved", "changes_requested"]),
  submittedAt: z.string(),
  message: z.string().nullable(),
});
export type BuddyApplicationStatus = z.infer<typeof statusSchema>;

export function buddyApplicationQuery(accountId?: string) {
  return queryOptions({
    queryKey: ["buddy-application", accountId],
    queryFn: async () =>
      statusSchema.nullable().parse(await rpc("buddy_application_status", {})),
    staleTime: 0,
  });
}

async function encodeImage(file: File) {
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () =>
      reject(
        new Error("Could not read an application image. Select it again."),
      );
    reader.readAsDataURL(file);
  });
  return { type: file.type, base64: url.slice(url.indexOf(",") + 1) };
}

export async function submitBuddyApplication(data: FormData) {
  const entries = Array.from(data.entries());
  const application = Object.fromEntries(
    entries.filter(([, value]) => typeof value === "string"),
  );
  const images = Object.fromEntries(
    await Promise.all(
      entries.flatMap(([key, value]) =>
        value instanceof File
          ? [encodeImage(value).then((image) => [key, image] as const)]
          : [],
      ),
    ),
  );
  return statusSchema.parse(
    await rpc("submit_buddy_application", {
      application: {
        ...application,
        faceComparisonConsent: data.get("faceComparisonConsent") === "yes",
      },
      images,
    }),
  );
}
