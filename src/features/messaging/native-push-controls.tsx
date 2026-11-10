import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createNativePush, isIphone, type PushState } from "./native-push";

export function NativePushControls() {
  const { session } = useSession();
  const userId = session?.user.id;
  const [state, setState] = useState<PushState>("checking");
  const controller = useRef<ReturnType<typeof createNativePush> | undefined>(
    undefined,
  );
  const navigate = useNavigate();
  const client = useQueryClient();
  useEffect(() => {
    if (!userId || !isIphone()) return;
    const push = createNativePush({
      userId,
      onState: setState,
      onMessage: () => {
        for (const key of ["messages", "conversations", "provider-dashboard"])
          void client.invalidateQueries({ queryKey: [key] });
      },
      onOpen: (conversation) => {
        void navigate({ to: "/inbox", search: { conversation } });
      },
    });
    controller.current = push;
    void push.start(false);
    return () => {
      push.stop();
      controller.current = undefined;
    };
  }, [userId, client, navigate]);
  if (!userId || !isIphone() || state === "checking" || state === "enabled")
    return null;
  return (
    <Alert className="mb-4">
      <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
        <span>
          {state === "denied"
            ? "Message notifications are off. Enable them in iPhone Settings → Notifications → TravelBuddy."
            : state === "error"
              ? "Message notifications could not be enabled. Check your connection and try again."
              : "Get notified on your iPhone when someone messages you, even when the app is closed."}
        </span>
        {state !== "denied" && (
          <Button
            size="sm"
            onClick={() => void controller.current?.start(true)}
          >
            {state === "error" ? "Retry notifications" : "Enable notifications"}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
