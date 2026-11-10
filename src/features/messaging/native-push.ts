import { App } from "@capacitor/app";
import {
  Capacitor,
  registerPlugin,
  type PluginListenerHandle,
} from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { rpc, supabase } from "@/lib/supabase";

const nativeEnvironment = registerPlugin<{
  getEnvironment(): Promise<{ environment: "sandbox" | "production" }>;
}>("TravelBuddyPushEnvironment");
const tokenKey = "travelbuddy:push-token";
const installationKey = "travelbuddy:push-installation";
let stopCurrent: (() => void) | undefined;
let saving: Promise<unknown> = Promise.resolve();
export type PushState = "checking" | "prompt" | "denied" | "enabled" | "error";
export const isIphone = () => Capacitor.getPlatform() === "ios";

export function pushConversation(
  data: Record<string, unknown>,
  userId: string,
): string | undefined {
  if (
    data.recipientUserId !== userId ||
    typeof data.conversationId !== "string"
  )
    return;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      data.conversationId,
    )
  )
    return;
  return data.conversationId;
}

export function createNativePush(options: {
  userId: string;
  onState: (state: PushState) => void;
  onMessage: () => void;
  onOpen: (conversationId: string) => void;
}) {
  let active = true;
  let listeners: Promise<void> | undefined;
  const handles: PluginListenerHandle[] = [];
  const state = (value: PushState) => {
    if (active) options.onState(value);
  };
  const add = async (handle: Promise<PluginListenerHandle>) => {
    const value = await handle;
    if (active) handles.push(value);
    else await value.remove();
  };
  const stop = () => {
    active = false;
    handles.splice(0).forEach((handle) => void handle.remove());
  };
  stopCurrent?.();
  stopCurrent = stop;
  const setup = () =>
    (listeners ??= (async () => {
      await add(
        PushNotifications.addListener("registration", ({ value }) => {
          if (!active) return;
          saving = saving
            .catch(() => {})
            .then(async () => {
              if (!active) return;
              const { data } = await supabase.auth.getSession();
              if (!active || data.session?.user.id !== options.userId) return;
              const { environment } = await nativeEnvironment.getEnvironment();
              let installation = localStorage.getItem(installationKey);
              if (!installation) {
                installation = crypto.randomUUID();
                localStorage.setItem(installationKey, installation);
              }
              if (!active) return;
              await rpc("register_push_device", {
                device_token: value,
                installation_id: installation,
                environment,
              });
              localStorage.setItem(tokenKey, value);
              state("enabled");
            })
            .catch(() => state("error"));
        }),
      );
      await add(
        PushNotifications.addListener("registrationError", () =>
          state("error"),
        ),
      );
      await add(
        PushNotifications.addListener(
          "pushNotificationReceived",
          (notification) => {
            if (active && notification.data?.recipientUserId === options.userId)
              options.onMessage();
          },
        ),
      );
      await add(
        PushNotifications.addListener(
          "pushNotificationActionPerformed",
          ({ notification }) => {
            if (!active) return;
            const conversation = pushConversation(
              notification.data ?? {},
              options.userId,
            );
            if (conversation) options.onOpen(conversation);
          },
        ),
      );
      await add(
        App.addListener("appStateChange", ({ isActive }) => {
          if (active && isActive) void start(false);
        }),
      );
    })());
  const start = async (requestPermission: boolean) => {
    if (!isIphone() || !active) return;
    state("checking");
    try {
      await setup();
      let permission = await PushNotifications.checkPermissions();
      if (requestPermission && permission.receive === "prompt")
        permission = await PushNotifications.requestPermissions();
      if (!active) return;
      if (permission.receive === "granted") {
        await PushNotifications.register();
      } else {
        // Revocation in iOS Settings must stop queued delivery as well.
        const token = localStorage.getItem(tokenKey);
        if (token) {
          await saving;
          await rpc("unregister_push_device", { device_token: token });
          localStorage.removeItem(tokenKey);
        }
        state(permission.receive === "denied" ? "denied" : "prompt");
      }
    } catch {
      state("error");
    }
  };
  return { start, stop };
}

export async function unregisterCurrentPushDevice() {
  if (!isIphone()) return;
  stopCurrent?.();
  await saving;
  const token = localStorage.getItem(tokenKey);
  if (token) await rpc("unregister_push_device", { device_token: token });
  await PushNotifications.unregister();
  // Capacitor rejects this call if this launch never registered with APNs.
  // Revocation has already succeeded; notification cleanup must not block logout.
  await PushNotifications.removeAllDeliveredNotifications().catch(() => {});
  localStorage.removeItem(tokenKey);
}
