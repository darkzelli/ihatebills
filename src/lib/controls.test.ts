import { describe, expect, it } from "vitest";
import { DEFAULT_FIELDS } from "../fields";
import type { Bill, ControlStep, FieldDef } from "../types";
import { condHolds, controlUsesDeletedField, describeOwe, describeStep, oweAmount, oweUsesDeletedField, runSteps, shiftDate } from "./controls";
import { leafFields } from "../fields";
import { today } from "./id";

const due: FieldDef = {
  key: "due", label: "Due", type: "combined", builtin: false, group: "Custom",
  parts: [{ key: "dueAmt", label: "Amount", type: "money" }, { key: "dueDay", label: "Date", type: "date" }],
};
const defs = [...DEFAULT_FIELDS, due];
const bill = (values: Bill["values"], looks?: Bill["looks"]): Bill =>
  ({ id: "b", categoryId: null, order: 0, values, looks, attachments: [], createdAt: "", updatedAt: "" });

describe("shiftDate", () => {
  it("moves by days, weeks, months and years", () => {
    expect(shiftDate("2026-12-28", 5, "day")).toBe("2027-01-02");
    expect(shiftDate("2026-03-01", -1, "week")).toBe("2026-02-22");
    expect(shiftDate("2026-11-15", 1, "month")).toBe("2026-12-15");
    expect(shiftDate("2026-12-15", 1, "month")).toBe("2027-01-15");
    expect(shiftDate("2026-01-15", -1, "month")).toBe("2025-12-15");
    expect(shiftDate("2028-02-29", 1, "year")).toBe("2029-02-28");
  });
  it("clamps to the end of a shorter month", () => {
    expect(shiftDate("2026-01-31", 1, "month")).toBe("2026-02-28");
  });
});

describe("runSteps", () => {
  it("pays a combined due field and moves it to next month", () => {
    const steps: ControlStep[] = [
      { kind: "value", field: "dueAmt", op: "subtract", value: 10000 },
      { kind: "value", field: "dueDay", op: "shift", value: 1, unit: "month" },
    ];
    const out = runSteps(bill({ dueAmt: 45000, dueDay: "2026-11-01" }), steps, defs);
    expect(out.values).toMatchObject({ dueAmt: 35000, dueDay: "2026-12-01" });
  });

  it("sets, copies and clears several fields; later steps see earlier ones", () => {
    const steps: ControlStep[] = [
      { kind: "value", field: "status", op: "set", value: "Paid" },
      { kind: "value", field: "paidByAnotherSource", op: "copy", from: "yourResponsibility" },
      { kind: "value", field: "yourResponsibility", op: "clear" },
    ];
    const out = runSteps(bill({ status: "Pending", yourResponsibility: 2500 }), steps, defs);
    expect(out.values).toMatchObject({ status: "Paid", paidByAnotherSource: 2500, yourResponsibility: null });
  });

  it("treats a blank as 0 for add, and leaves a blank date alone", () => {
    const out = runSteps(bill({}), [
      { kind: "value", field: "copay", op: "add", value: 500 },
      { kind: "value", field: "dueDay", op: "shift", value: 1, unit: "month" },
    ], defs);
    expect(out.values.copay).toBe(500);
    expect(out.values.dueDay).toBeUndefined();
  });

  it("greys out, hides, toggles and shows fields", () => {
    const b = bill({}, { memberName: "hide" });
    const out = runSteps(b, [
      { kind: "look", field: "due", op: "dim" },
      { kind: "look", field: "copay", op: "toggleHide" },
      { kind: "look", field: "memberName", op: "show" },
    ], defs);
    expect(out.looks).toEqual({ due: "dim", copay: "hide" });
    expect(runSteps(bill({}, out.looks), [{ kind: "look", field: "copay", op: "toggleHide" }], defs).looks).toEqual({ due: "dim" });
  });

  it("skips steps on deleted fields or that don't fit the field type", () => {
    const out = runSteps(bill({ memberName: "Ann" }), [
      { kind: "value", field: "gone", op: "set", value: 1 },
      { kind: "value", field: "memberName", op: "subtract", value: 1 },
      { kind: "look", field: "gone", op: "hide" },
    ], defs);
    expect(out.values).toEqual({ memberName: "Ann" });
    expect(out.looks).toEqual({});
  });
});

describe("describing controls", () => {
  it("reads steps as sentences", () => {
    expect(describeStep({ kind: "value", field: "dueAmt", op: "subtract", value: 10000 }, defs)).toBe("Due · Amount: subtract $100.00");
    expect(describeStep({ kind: "value", field: "dueDay", op: "shift", value: 1, unit: "month" }, defs)).toBe("Due · Date: move ahead 1 month");
    expect(describeStep({ kind: "look", field: "due", op: "dim" }, defs)).toBe("Grey out Due");
  });
  it("flags deleted fields", () => {
    const c = { id: "c", label: "Pay", fields: ["due"], confirm: false, steps: [{ kind: "value", field: "dueAmt", op: "clear" } as ControlStep] };
    expect(controlUsesDeletedField(c, defs)).toBe(false);
    expect(controlUsesDeletedField(c, DEFAULT_FIELDS)).toBe(true);
  });
});

describe("conditions", () => {
  const leaves = new Map(leafFields(defs).map((d) => [d.key, d]));
  const pay: ControlStep[] = [
    { kind: "value", field: "dueAmt", op: "subtract", value: 10000 },
    { kind: "value", field: "dueDay", op: "shift", value: 1, unit: "month", when: [{ field: "dueAmt", op: "gt", value: 0 }] },
    { kind: "look", field: "due", op: "dim", when: [{ field: "dueAmt", op: "lt", value: 1 }] },
  ];

  it("only move the date while something is still owed; grey out once paid off", () => {
    const partly = runSteps(bill({ dueAmt: 25000, dueDay: "2026-11-01" }), pay, defs);
    expect(partly.values).toMatchObject({ dueAmt: 15000, dueDay: "2026-12-01" });
    expect(partly.looks).toEqual({});
    // Conditions see the earlier steps' result: this payment brings it to $0.
    const last = runSteps(bill({ dueAmt: 10000, dueDay: "2026-11-01" }), pay, defs);
    expect(last.values).toMatchObject({ dueAmt: 0, dueDay: "2026-11-01" });
    expect(last.looks).toEqual({ due: "dim" });
  });

  it("all conditions on a step must hold", () => {
    const step: ControlStep = { kind: "value", field: "status", op: "set", value: "Paid", when: [
      { field: "yourResponsibility", op: "eq", value: 0 }, { field: "status", op: "neq", value: "Closed" },
    ] };
    expect(runSteps(bill({ yourResponsibility: 0, status: "Pending" }), [step], defs).values.status).toBe("Paid");
    expect(runSteps(bill({ yourResponsibility: 0, status: "Closed" }), [step], defs).values.status).toBe("Closed");
  });

  it("compares dates, including against today", () => {
    expect(condHolds({ field: "dueDay", op: "lt", value: "today" }, { dueDay: "2000-01-01" }, leaves)).toBe(true);
    expect(condHolds({ field: "dueDay", op: "gt", value: "today" }, { dueDay: today() }, leaves)).toBe(false);
    expect(condHolds({ field: "dueDay", op: "gt", value: "2026-01-01" }, { dueDay: "2026-02-01" }, leaves)).toBe(true);
  });

  it("blanks are filled/empty but never more or less than anything; deleted fields never hold", () => {
    expect(condHolds({ field: "copay", op: "empty" }, {}, leaves)).toBe(true);
    expect(condHolds({ field: "copay", op: "gt", value: -1 }, {}, leaves)).toBe(false);
    expect(condHolds({ field: "copay", op: "eq", value: null }, { copay: null }, leaves)).toBe(true);
    expect(condHolds({ field: "gone", op: "empty" }, {}, leaves)).toBe(false);
  });

  it("describes and flags conditions", () => {
    expect(describeStep(pay[1], defs)).toBe("Due · Date: move ahead 1 month, only if Due · Amount is more than $0.00");
    expect(describeStep({ kind: "look", field: "due", op: "hide", when: [{ field: "dueDay", op: "lt", value: "today" }] }, defs))
      .toBe("Hide Due, only if Due · Date is before today");
    const c = { id: "c", label: "x", fields: [], confirm: false, steps: [{ kind: "look", field: "copay", op: "dim", when: [{ field: "gone", op: "filled" }] } as ControlStep] };
    expect(controlUsesDeletedField(c, defs)).toBe(true);
  });
});

describe("you owe", () => {
  it("adds and subtracts fields, counting blanks as 0", () => {
    const terms = [{ sign: "+", field: "yourResponsibility" }, { sign: "-", field: "paidByAnotherSource" }] as const;
    expect(oweAmount(bill({ yourResponsibility: 5000, paidByAnotherSource: 1200 }), [...terms])).toBe(3800);
    expect(oweAmount(bill({ yourResponsibility: 5000 }), [...terms])).toBe(5000);
    expect(oweAmount(bill({ paidByAnotherSource: 1200 }), [...terms])).toBe(-1200);
  });
  it("is null when every value is blank or there are no fields", () => {
    expect(oweAmount(bill({}), [{ sign: "+", field: "yourResponsibility" }])).toBeNull();
    expect(oweAmount(bill({ yourResponsibility: 5000 }), [])).toBeNull();
  });
  it("describes and flags deleted fields", () => {
    expect(describeOwe([{ sign: "+", field: "yourResponsibility" }, { sign: "-", field: "dueAmt" }], defs)).toBe("Your Responsibility − Due · Amount");
    expect(oweUsesDeletedField([{ sign: "+", field: "gone" }], defs)).toBe(true);
    expect(oweUsesDeletedField([{ sign: "+", field: "dueAmt" }], defs)).toBe(false);
  });
});
