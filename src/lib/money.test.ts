import { describe, expect, it } from "vitest";
import { centsToInput, numericOnly, parseCents } from "./money";

it("parses typed amounts into cents", () => {
  expect(parseCents("$1,234.56")).toBe(123456);
  expect(parseCents("0.1")).toBe(10);
  expect(parseCents("19.999")).toBe(2000);
  expect(parseCents("(12)")).toBe(-1200);
  expect(parseCents("-3")).toBe(-300);
  expect(parseCents("")).toBeNull();
  expect(parseCents("abc")).toBeNull();
  expect(parseCents("1.2.3")).toBeNull();
});
it("round-trips", () => expect(parseCents(centsToInput(4550))).toBe(4550));

describe("numericOnly", () => {
  it("strips letters as they're typed", () => {
    expect(numericOnly("12a3.4b")).toBe("123.4");
    expect(numericOnly("$1,2x00.50", true)).toBe("$1,200.50");
    expect(numericOnly("$5")).toBe("5");
    expect(numericOnly("(12)", true)).toBe("(12)");
  });
});
