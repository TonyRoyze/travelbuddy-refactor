import { expect, it } from "vitest";
import { compareSriLankanNames } from "./names";

it.each([
  ["H.M. Kasun Silva", "Herath Mudiyanselage Kasun Silva"],
  ["h m kasun silva", "H.M. Kasun Silva"],
  ["Kasun Sliva", "Kasun Silva"],
  ["Kasun Siva", "Kasun Silva"],
  ["කසුන් සිල්වා", "කසුන් සිල්වා"],
])("accepts a consistent name pair %s / %s", (a, b) => {
  expect(compareSriLankanNames(a, b)).toBe(true);
  expect(compareSriLankanNames(b, a)).toBe(true);
});

it.each([
  ["H.M. Kasun Silva", "S.M. Kasun Silva"],
  ["A.B.", "Anura Banda"],
  ["Kasun Silva", "Other Person"],
  ["", ""],
])("routes inconsistent or weak name evidence to review", (a, b) => {
  expect(compareSriLankanNames(a, b)).toBe(false);
});
