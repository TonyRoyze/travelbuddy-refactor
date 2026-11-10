import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
type PushEvent = {
  value?: string;
  notification?: { data: Record<string, unknown> };
};
const mocks = vi.hoisted(() => ({
  platform: "ios",
  callbacks: {} as Record<string, (event: PushEvent) => unknown>,
  permission: "granted",
  rpc: vi.fn(),
  remove: vi.fn(),
  register: vi.fn(),
  request: vi.fn(),
  unregister: vi.fn(),
  clear: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@capacitor/core", () => ({
  Capacitor: { getPlatform: () => mocks.platform },
  registerPlugin: () => ({
    getEnvironment: async () => ({ environment: "sandbox" }),
  }),
}));
const listener = async (
  name: string,
  callback: (event: PushEvent) => unknown,
) => {
  mocks.callbacks[name] = callback;
  return { remove: mocks.remove };
};
vi.mock("@capacitor/app", () => ({
  App: {
    addListener: (...args: [string, (event: PushEvent) => unknown]) =>
      listener(...args),
  },
}));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: {
    addListener: (...args: [string, (event: PushEvent) => unknown]) =>
      listener(...args),
    checkPermissions: async () => ({ receive: mocks.permission }),
    requestPermissions: mocks.request,
    register: mocks.register,
    unregister: mocks.unregister,
    removeAllDeliveredNotifications: mocks.clear,
  },
}));
vi.mock("@/lib/supabase", () => ({
  rpc: mocks.rpc,
  supabase: { auth: { getSession: mocks.getSession } },
}));
import {
  createNativePush,
  pushConversation,
  unregisterCurrentPushDevice,
} from "./native-push";
const conversationId = "11111111-1111-4111-8111-111111111111";
const options = () => ({
  userId: "recipient",
  onState: vi.fn(),
  onOpen: vi.fn(),
  onMessage: vi.fn(),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.clear.mockResolvedValue(undefined);
  mocks.callbacks = {};
  mocks.platform = "ios";
  mocks.permission = "granted";
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "recipient" } } },
  });
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());
describe("iPhone message push lifecycle", () => {
  it("registers an opted-in device, opens only its recipient's conversation, and revokes on sign-out", async () => {
    const callbacks = options();
    const push = createNativePush(callbacks);
    await push.start(false);
    expect(mocks.request).not.toHaveBeenCalled();
    expect(mocks.register).toHaveBeenCalledOnce();
    mocks.callbacks.registration({ value: "ab".repeat(32) });
    await vi.waitFor(() =>
      expect(callbacks.onState).toHaveBeenLastCalledWith("enabled"),
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "register_push_device",
      expect.objectContaining({
        device_token: "ab".repeat(32),
        environment: "sandbox",
      }),
    );
    mocks.callbacks.pushNotificationActionPerformed({
      notification: { data: { conversationId, recipientUserId: "other" } },
    });
    expect(callbacks.onOpen).not.toHaveBeenCalled();
    mocks.callbacks.pushNotificationActionPerformed({
      notification: { data: { conversationId, recipientUserId: "recipient" } },
    });
    expect(callbacks.onOpen).toHaveBeenCalledWith(conversationId);
    await unregisterCurrentPushDevice();
    expect(mocks.rpc).toHaveBeenLastCalledWith("unregister_push_device", {
      device_token: "ab".repeat(32),
    });
    expect(mocks.unregister).toHaveBeenCalledOnce();
    expect(mocks.clear).toHaveBeenCalledOnce();
    expect(mocks.remove).toHaveBeenCalledTimes(5);
    mocks.callbacks.registration({ value: "cd".repeat(32) });
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it("waits for an explicit opt-in and reports denied permissions", async () => {
    mocks.permission = "prompt";
    const callbacks = options();
    const push = createNativePush(callbacks);
    await push.start(false);
    expect(callbacks.onState).toHaveBeenLastCalledWith("prompt");
    expect(mocks.register).not.toHaveBeenCalled();
    mocks.request.mockResolvedValue({ receive: "denied" });
    await push.start(true);
    expect(callbacks.onState).toHaveBeenLastCalledWith("denied");
    expect(mocks.register).not.toHaveBeenCalled();
    push.stop();
  });
  it("does not register on the web or save a late callback after account switching", async () => {
    mocks.platform = "web";
    const web = createNativePush(options());
    await web.start(false);
    expect(mocks.register).not.toHaveBeenCalled();
    web.stop();
    mocks.platform = "ios";
    const native = createNativePush(options());
    await native.start(false);
    mocks.getSession.mockResolvedValue({
      data: { session: { user: { id: "other" } } },
    });
    mocks.callbacks.registration({ value: "ab".repeat(32) });
    await vi.waitFor(() => expect(mocks.getSession).toHaveBeenCalled());
    expect(mocks.rpc).not.toHaveBeenCalled();
    native.stop();
  });
  it("allows sign-out when notifications were never enabled on this launch", async () => {
    mocks.clear.mockRejectedValueOnce(
      new Error("APNs registration not called"),
    );
    await expect(unregisterCurrentPushDevice()).resolves.toBeUndefined();
    expect(mocks.unregister).toHaveBeenCalledOnce();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("rejects malformed notification navigation", () => {
    expect(
      pushConversation(
        {
          recipientUserId: "recipient",
          conversationId: "https://external.example",
        },
        "recipient",
      ),
    ).toBeUndefined();
  });
});
