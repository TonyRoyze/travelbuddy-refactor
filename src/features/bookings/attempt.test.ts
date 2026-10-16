import { describe, it, expect } from "vitest";
import { readAttempt, saveAttempt } from "./attempt";
describe("checkout retry identity", () => {
  it("survives a reload and rotates only when submitted details change", () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => {
        data.set(key, value);
      },
      removeItem: (key: string) => {
        data.delete(key);
      },
    };
    const initial = readAttempt("trip", storage);
    const saved = saveAttempt("trip", initial, "same details", storage);
    const reloaded = readAttempt("trip", storage);
    expect(reloaded).toEqual(saved);
    expect(saveAttempt("trip", reloaded, "same details", storage).key).toBe(
      initial.key,
    );
    const edited = saveAttempt("trip", reloaded, "changed contact", storage);
    expect(edited.key).not.toBe(initial.key);
    expect(edited.item).toBe(initial.item);
  });
});
