import { describe, expect, it } from "vitest";
import { DEFAULT_FIELDS, fieldKeys, leafFields, migrate } from "./fields";
import { scheduleByDay } from "./lib/schedule";
import { aggregate } from "./lib/totals";
import type { Bill, FieldDef } from "./types";

describe("migrate", () => {
  it("adds back defaults an older file is missing", () => {
    const db = migrate({ fieldDefs: DEFAULT_FIELDS.filter((f) => f.key !== "copay") });
    expect(db.fieldDefs.some((f) => f.key === "copay")).toBe(true);
  });

  it("leaves out defaults the user deleted", () => {
    const db = migrate({ fieldDefs: DEFAULT_FIELDS.filter((f) => f.key !== "copay"), removedFields: ["copay"] });
    expect(db.fieldDefs.some((f) => f.key === "copay")).toBe(false);
    expect(db.removedFields).toEqual(["copay"]);
  });
});

const due: FieldDef = {
  key: "custom_due", label: "Due", type: "combined", builtin: false, group: "Custom",
  parts: [{ key: "custom_amt", label: "Amount", type: "money" }, { key: "custom_day", label: "Date", type: "date" }],
};

describe("combined fields", () => {
  it("split into one field per part", () => {
    const leaves = leafFields([...DEFAULT_FIELDS, due]);
    expect(leaves.filter((f) => f.key.startsWith("custom_")).map((f) => [f.key, f.label, f.type]))
      .toEqual([["custom_amt", "Due · Amount", "money"], ["custom_day", "Due · Date", "date"]]);
    expect(leaves.some((f) => f.type === "combined")).toBe(false);
    expect(fieldKeys(due)).toEqual(["custom_amt", "custom_day"]);
  });

  it("parts work in totals and on the schedule", () => {
    const b = (id: string, amt: number): Bill =>
      ({ id, categoryId: null, order: 0, values: { custom_amt: amt, custom_day: "2026-11-01" }, attachments: [], scheduled: ["custom_day"], createdAt: "", updatedAt: "" });
    const bills = [b("a", 1000), b("b", 250)];
    expect(aggregate({ fn: "sum", field: "custom_amt" }, bills)).toBe(1250);
    expect(scheduleByDay(bills, [due]).get("2026-11-01")?.map((e) => e.field.label)).toEqual(["Due · Date", "Due · Date"]);
  });
});
