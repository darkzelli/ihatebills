// Bill list filters: one built-in per status, plus the user's own (every condition must match).
import type { Bill, FieldDef, FilterDef, Where } from "../types";
import { fieldLabel, matches } from "./totals";

export const statusFilterId = (status: string) => `status:${status}`;

/** The test for a filter id, or null if it no longer exists (e.g. a deleted filter or status). */
export function filterTest(id: string, filters: FilterDef[], statuses: string[]): ((b: Bill) => boolean) | null {
  if (id.startsWith("status:")) {
    const s = id.slice(7);
    return statuses.includes(s) ? (b) => b.values.status === s : null;
  }
  const f = filters.find((x) => x.id === id);
  return f ? (b) => f.conditions.every((w) => matches(b, w)) : null;
}

/** Whether a filter checks a field that no longer exists. */
export const filterUsesDeletedField = (f: FilterDef, fields: FieldDef[]) => f.conditions.some((w) => !fields.some((d) => d.key === w.field));

export function describeWhere(w: Where, fields: FieldDef[]): string {
  const label = fieldLabel(w.field, fields);
  const cond = w.op === "filled" ? "is filled in" : w.op === "empty" ? "is empty" : w.op === "eq" ? `is “${w.value ?? ""}”` : `is not “${w.value ?? ""}”`;
  return `${label} ${cond}`;
}

export const describeFilter = (f: FilterDef, fields: FieldDef[]) =>
  f.conditions.length ? f.conditions.map((w) => describeWhere(w, fields)).join(" and ") : "All bills";
