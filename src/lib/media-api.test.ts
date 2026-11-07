import { describe, expect, it } from "vitest";
import { resolveMediaApiUrl } from "./media-api";
describe("media API routing", () => {
  it("routes native package uploads to the deployed server", () => {
    expect(resolveMediaApiUrl("/profile-media/package-upload", true)).toBe(
      "https://travelbuddy.shalinda.com/profile-media/package-upload",
    );
  });
  it("keeps website uploads on their own origin", () => {
    expect(resolveMediaApiUrl("/profile-media/upload", false)).toBe(
      "/profile-media/upload",
    );
  });
  it("supports an HTTPS native override and rejects insecure origins", () => {
    expect(
      resolveMediaApiUrl(
        "/profile-media/upload",
        true,
        "https://other.example/",
      ),
    ).toBe("https://other.example/profile-media/upload");
    expect(() =>
      resolveMediaApiUrl("/profile-media/upload", true, "http://other.example"),
    ).toThrow("HTTPS");
  });
});
