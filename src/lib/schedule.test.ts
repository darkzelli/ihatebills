import { describe, expect, it } from "vitest";
import { DEFAULT_FIELDS } from "../fields";
import type { Bill } from "../types";
import { dayKey, scheduleByDay } from "./schedule";

const bill = (id: string, values: Bill["values"], scheduled?: string[]): Bill =>
  ({ id, categoryId: null, order: 0, values, attachments: [], scheduled, createdAt: "", updatedAt: "" });

describe("scheduleByDay", () => {
  it("groups toggled date fields by day", () => {
    const m = scheduleByDay([
      bill("a", { from: "2026-03-04", to: "2026-03-05" }, ["from", "to"]),
      bill("b", { from: "2026-03-04" }, ["from"]),
      bill("c", { from: "2026-03-04" }),
    ], DEFAULT_FIELDS);
    expect(m.get("2026-03-04")!.map((e) => `${e.bill.id}:${e.field.key}`)).toEqual(["a:from", "b:from"]);
    expect(m.get("2026-03-05")!.map((e) => e.bill.id)).toEqual(["a"]);
  });

  it("skips blank dates, deleted fields and non-date fields", () => {
    const m = scheduleByDay([bill("a", { from: null, gone: "2026-01-01", memberName: "2026-01-02" }, ["from", "gone", "memberName"])], DEFAULT_FIELDS);
    expect(m.size).toBe(0);
  });

  it("formats day keys", () => expect(dayKey(2026, 0, 5)).toBe("2026-01-05"));
});
