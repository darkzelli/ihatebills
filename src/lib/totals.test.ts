import { describe, expect, it } from "vitest";
import type { Bill, TotalDef } from "../types";
import { DEFAULT_FIELDS } from "../fields";
import { aggregate, describe as say, evaluate, formula, formulaValues, looksLikeMoney } from "./totals";

const bill = (values: Bill["values"], categoryId: string | null = null): Bill => ({
  id: crypto.randomUUID(), categoryId, order: 0, values, attachments: [], createdAt: "", updatedAt: "",
});
const bills = [
  bill({ claimTotal: 10000, paidByPlan: 8000, status: "Paid" }, "a"),
  bill({ claimTotal: 2550, paidByPlan: 0, status: "Pending" }, "b"),
  bill({ claimTotal: null, status: "" }),
];
const T = (p: Partial<TotalDef>): TotalDef => ({ id: "x", label: "x", categoryId: null, first: { fn: "count" }, steps: [], format: "number", ...p });

describe("totals", () => {
  it("sums cents exactly", () => expect(aggregate({ fn: "sum", field: "claimTotal" }, bills)).toBe(12550));
  it("counts with where filters", () => {
    expect(aggregate({ fn: "count", where: { field: "status", op: "neq", value: "Paid" } }, bills)).toBe(2);
    expect(aggregate({ fn: "count", where: { field: "claimTotal", op: "filled" } }, bills)).toBe(2);
    expect(aggregate({ fn: "count", where: { field: "status", op: "empty" } }, bills)).toBe(1);
  });
  it("avg/min/max ignore blanks; empty set is NaN", () => {
    expect(aggregate({ fn: "avg", field: "claimTotal" }, bills)).toBe(6275);
    expect(aggregate({ fn: "min", field: "claimTotal" }, bills)).toBe(2550);
    expect(aggregate({ fn: "max", field: "claimTotal" }, [])).toBeNaN();
  });
  it("chains steps left to right", () => {
    const t = T({ first: { fn: "sum", field: "claimTotal" }, steps: [{ op: "-", operand: { kind: "agg", agg: { fn: "sum", field: "paidByPlan" } } }], format: "money" });
    expect(evaluate(t, bills)).toBe(4550);
    expect(say(t, DEFAULT_FIELDS)).toBe("Sum of Claim Total minus Sum of Paid by Plan");
    expect(looksLikeMoney(t, DEFAULT_FIELDS)).toBe(true);
  });
  it("money constants are dollars for +/−, plain for ×/÷", () => {
    const base = { first: { fn: "sum" as const, field: "claimTotal" }, format: "money" as const };
    expect(evaluate(T({ ...base, steps: [{ op: "+", operand: { kind: "const", value: 5 } }] }), bills)).toBe(13050);
    expect(evaluate(T({ ...base, steps: [{ op: "/", operand: { kind: "const", value: 2 } }] }), bills)).toBe(6275);
  });
  it("renders a formula, bracketing earlier +/− before ×/÷", () => {
    const t = T({ first: { fn: "sum", field: "claimTotal" }, format: "money", steps: [
      { op: "-", operand: { kind: "agg", agg: { fn: "sum", field: "paidByPlan" } } },
      { op: "/", operand: { kind: "agg", agg: { fn: "count", where: { field: "status", op: "neq", value: "Paid" } } } },
    ] });
    expect(formula(t, DEFAULT_FIELDS)).toBe("(SUM(Claim Total) − SUM(Paid by Plan)) ÷ COUNT(bills where Status ≠ “Paid”)");
    expect(formulaValues(t, DEFAULT_FIELDS, bills)).toBe("($125.50 − $80.00) ÷ 2");
  });
  it("divide by zero is NaN", () => expect(evaluate(T({ steps: [{ op: "/", operand: { kind: "const", value: 0 } }] }), bills)).toBeNaN());
  it("scopes to a category", () => expect(evaluate(T({ categoryId: "a" }), bills)).toBe(1));
});
