import { describe, expect, it } from "vitest";
import type { Bill, FilterDef } from "../types";
import { filterTest, statusFilterId } from "./filters";

const bill = (values: Bill["values"]): Bill => ({ id: crypto.randomUUID(), categoryId: null, order: 0, values, attachments: [], createdAt: "", updatedAt: "" });
const bills = [bill({ status: "Paid", memberName: "Ann" }), bill({ status: "Pending", memberName: "Ann" }), bill({ status: "Pending" })];
const filters: FilterDef[] = [{ id: "f1", label: "Ann unpaid", conditions: [{ field: "memberName", op: "eq", value: "Ann" }, { field: "status", op: "neq", value: "Paid" }] }];

describe("filters", () => {
  it("matches a status", () => expect(bills.filter(filterTest(statusFilterId("Pending"), filters, ["Pending"])!)).toHaveLength(2));
  it("needs every condition of a custom filter", () => expect(bills.filter(filterTest("f1", filters, [])!)).toEqual([bills[1]]));
  it("is null for filters that are gone", () => {
    expect(filterTest(statusFilterId("Gone"), filters, ["Pending"])).toBeNull();
    expect(filterTest("nope", filters, [])).toBeNull();
  });
});
