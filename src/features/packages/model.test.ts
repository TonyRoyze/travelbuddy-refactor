import { describe, it, expect } from "vitest";
import { emptyPackage, packageEditorSchema } from "./model";
import { defaultSchedule, scheduleSchema } from "./schedule-model";
describe("package editor validation", () => {
  it("keeps drafts saveable while enforcing a cover and complete story for publishing", () => {
    const draft = { ...emptyPackage(), title: "Tea trails" };
    expect(packageEditorSchema.safeParse(draft).success).toBe(true);
    expect(
      packageEditorSchema.safeParse({ ...draft, published: true }).success,
    ).toBe(false);
    expect(
      packageEditorSchema.safeParse({
        ...draft,
        published: true,
        destination: "Ella",
        country: "Sri Lanka",
        category: "Tours",
        meetingPoint: "Station",
        description: "An easy morning with a local host.",
        imageIds: ["https://example.test/legacy-cover.jpg"],
      }).success,
    ).toBe(true);
  });
  it("rejects invalid times, excess capacity and duplicate schedule exceptions", () => {
    const draft = { ...emptyPackage(), title: "Tea trails" };
    expect(
      packageEditorSchema.safeParse({
        ...draft,
        options: [{ ...draft.options[0], times: ["25:00"] }],
      }).success,
    ).toBe(false);
    expect(
      packageEditorSchema.safeParse({
        ...draft,
        options: [{ ...draft.options[0], capacity: 13 }],
      }).success,
    ).toBe(false);
    const schedule = defaultSchedule();
    expect(
      scheduleSchema.safeParse({
        ...schedule,
        exceptions: [
          { date: schedule.startDate, closed: true },
          { date: schedule.startDate, closed: false },
        ],
      }).success,
    ).toBe(false);
  });
});
