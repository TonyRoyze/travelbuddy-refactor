import { describe, it, expect } from "vitest";
import { profileSchema, validateProfileFile } from "./profile-model";
const profile = {
  displayName: " Maya ",
  profileDetails: {
    bio: "Tea lover",
    homeBase: "Ella",
    languages: "Sinhala",
    interests: "Hiking",
    travelStyle: "Slow",
    specialties: "Tea",
    yearsExperience: 4,
  },
};
describe("profile inputs", () => {
  it("trims names and retains all legacy profile fields", () => {
    expect(profileSchema.parse(profile).displayName).toBe("Maya");
    expect(profileSchema.parse(profile).profileDetails).toEqual({
      ...profile.profileDetails,
      displayCurrency: "LKR",
    });
  });
  it("rejects oversized text, fractional or out-of-range years", () => {
    expect(
      profileSchema.safeParse({
        ...profile,
        profileDetails: {
          ...{ ...profile.profileDetails, displayCurrency: "LKR" },
          bio: "a".repeat(501),
        },
      }).success,
    ).toBe(false);
    for (const yearsExperience of [1.5, -1, 81])
      expect(
        profileSchema.safeParse({
          ...profile,
          profileDetails: {
            ...{ ...profile.profileDetails, displayCurrency: "LKR" },
            yearsExperience,
          },
        }).success,
      ).toBe(false);
  });
  it("bounds photo/video input before uploading while leaving content validation to the server", () => {
    expect(
      validateProfileFile({ type: "image/webp", size: 100 }, "photo"),
    ).toBe("");
    expect(
      validateProfileFile({ type: "image/svg+xml", size: 100 }, "photo"),
    ).not.toBe("");
    expect(
      validateProfileFile(
        { type: "image/png", size: 6 * 1024 * 1024 },
        "photo",
      ),
    ).not.toBe("");
    expect(
      validateProfileFile(
        { type: "video/mp4", size: 26 * 1024 * 1024 },
        "video",
      ),
    ).not.toBe("");
    expect(validateProfileFile({ type: "video/webm", size: 1 }, "video")).toBe(
      "",
    );
  });
});
