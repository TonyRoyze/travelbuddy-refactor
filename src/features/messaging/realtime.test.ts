import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  userId: "user-1" as string | undefined,
  effect: undefined as (() => void | (() => void)) | undefined,
  receive: undefined as (() => void) | undefined,
  status: undefined as ((status: string) => void) | undefined,
  invalidateQueries: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(),
}));
vi.mock("react", () => ({
  useEffect: (effect: () => void | (() => void)) => {
    mocks.effect = effect;
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));
vi.mock("@/features/auth/session", () => ({
  useSession: () => ({
    session: mocks.userId ? { user: { id: mocks.userId } } : null,
  }),
}));
const channel = {
  on: vi.fn((_type, _filter, receive) => {
    mocks.receive = receive;
    return channel;
  }),
  subscribe: vi.fn((status) => {
    mocks.status = status;
    return channel;
  }),
};
vi.mock("@/lib/supabase", () => ({
  supabase: { channel: mocks.channel, removeChannel: mocks.removeChannel },
}));
import { useMessageUpdates } from "./realtime";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.userId = "user-1";
  mocks.channel.mockReturnValue(channel);
});
describe("message Realtime subscription", () => {
  it("uses a private user topic, refreshes messages and unread counts, and cleans up", () => {
    useMessageUpdates();
    const cleanup = mocks.effect?.();
    expect(mocks.channel).toHaveBeenCalledWith("chat:user-1", {
      config: { private: true },
    });
    mocks.receive?.();
    expect(
      mocks.invalidateQueries.mock.calls.map(([query]) => query.queryKey),
    ).toEqual([["messages"], ["conversations"], ["provider-dashboard"]]);
    if (cleanup) cleanup();
    expect(mocks.removeChannel).toHaveBeenCalledWith(channel);
  });
  it("resynchronizes after joining or reconnecting", () => {
    useMessageUpdates();
    mocks.effect?.();
    mocks.status?.("SUBSCRIBED");
    mocks.status?.("SUBSCRIBED");
    expect(mocks.invalidateQueries).toHaveBeenCalledTimes(6);
  });
  it("does not subscribe while signed out", () => {
    mocks.userId = undefined;
    useMessageUpdates();
    mocks.effect?.();
    expect(mocks.channel).not.toHaveBeenCalled();
  });
});
