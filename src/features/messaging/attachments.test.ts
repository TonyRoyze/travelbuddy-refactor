import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  getUser: vi.fn(),
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getUser: mocks.getUser },
    storage: { from: () => ({ upload: mocks.upload }) },
  },
  rpc: mocks.rpc,
}));
import { sendChatMessage, validateChatFiles } from "./attachments";
const image = (name = "photo.png") =>
  new File(["image"], name, { type: "image/png" });
beforeEach(() => {
  vi.resetAllMocks();
  mocks.getUser.mockResolvedValue({
    data: { user: { id: "user-1" } },
    error: null,
  });
  mocks.upload.mockResolvedValue({ error: null });
  mocks.rpc.mockResolvedValue("message-id");
});
describe("chat attachments", () => {
  it("rejects unsafe types, empty or oversized files and excess attachments", () => {
    expect(
      validateChatFiles([
        new File(["script"], "script.html", { type: "text/html" }),
      ]),
    ).toBeTruthy();
    expect(
      validateChatFiles([new File([], "empty.png", { type: "image/png" })]),
    ).toBeTruthy();
    expect(
      validateChatFiles([
        { name: "large.png", type: "image/png", size: 10485761 } as File,
      ]),
    ).toBeTruthy();
    expect(
      validateChatFiles(Array.from({ length: 5 }, () => image())),
    ).toBeTruthy();
    expect(validateChatFiles([image()])).toBeUndefined();
  });
  it("uploads to a conversation and user scoped path before sending", async () => {
    const file = image();
    await sendChatMessage("thread-1", " hello ", [file], "my-package");
    expect(mocks.upload).toHaveBeenCalledWith(
      expect.stringMatching(/^thread-1\/user-1\//),
      file,
      { contentType: "image/png", upsert: false },
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "send_chat_message",
      expect.objectContaining({
        conversation_id: "thread-1",
        body: "hello",
        package_id: "my-package",
        files: [
          expect.objectContaining({ name: "photo.png", type: "image/png" }),
        ],
      }),
    );
  });
  it("retains successful uploads for retry after a partial upload failure", async () => {
    const files = [image("one.png"), image("two.png")];
    mocks.upload
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "Upload failed" } });
    await expect(sendChatMessage("thread-2", "", files)).rejects.toThrow(
      "Upload failed",
    );
    expect(mocks.rpc).not.toHaveBeenCalled();
    await sendChatMessage("thread-2", "", files);
    expect(mocks.upload).toHaveBeenCalledTimes(3);
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("does not upload again when sending fails after the uploads finish", async () => {
    const file = image();
    mocks.rpc.mockRejectedValueOnce(new Error("Send failed"));
    await expect(sendChatMessage("retry-thread", "", [file])).rejects.toThrow(
      "Send failed",
    );
    await sendChatMessage("retry-thread", "", [file]);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
  });
  it("keeps plain text compatible with the existing message API", async () => {
    await sendChatMessage("plain-thread", " hello ", []);
    expect(mocks.rpc).toHaveBeenCalledWith("send_message", {
      conversation_id: "plain-thread",
      body: "hello",
    });
    expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("does not reuse uploaded files across conversations", async () => {
    const file = image();
    await sendChatMessage("first", "", [file]);
    await sendChatMessage("second", "", [file]);
    expect(mocks.upload).toHaveBeenCalledTimes(2);
  });
  it("supports a package without text or files and rejects invalid files before uploading", async () => {
    await sendChatMessage("thread-3", "", [], "my-package");
    expect(mocks.upload).not.toHaveBeenCalled();
    await expect(
      sendChatMessage("thread-3", "", [new File([], "bad")]),
    ).rejects.toThrow();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
