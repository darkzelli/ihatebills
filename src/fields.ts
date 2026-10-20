import type { DB, FieldDef, FieldGroup, OweTerm, TotalDef } from "./types";

const f = (key: string, label: string, type: FieldDef["type"], group: FieldGroup): FieldDef => ({ key, label, type, group, builtin: true });

export const DEFAULT_FIELDS: FieldDef[] = [
  f("from", "From (date of visit)", "date", "Visit"),
  f("to", "To (date of visit)", "date", "Visit"),
  f("memberName", "Member Name", "text", "Visit"),
  f("providerName", "Provider Name", "text", "Visit"),
  f("claimNumber", "Claim Number", "text", "Claim"),
  f("prescriptionNumber", "Prescription Number", "text", "Claim"),
  f("claimTotal", "Claim Total", "money", "Amounts"),
  f("notYourResponsibility", "Not Your Responsibility", "money", "Amounts"),
  f("paidByPlan", "Paid by Plan", "money", "Amounts"),
  f("discounts", "Discounts", "money", "Amounts"),
  f("paidByAnotherSource", "Paid by Another Source", "money", "Amounts"),
  f("yourResponsibility", "Your Responsibility", "money", "Amounts"),
  f("copay", "Copay", "money", "Amounts"),
  f("appliedTowardsDeductible", "Applied Towards Deductible", "money", "Amounts"),
  f("coinsurance", "Coinsurance", "money", "Amounts"),
  f("amountNotCovered", "Amount Not Covered", "money", "Amounts"),
  f("status", "Status", "status", "Tracking"),
  f("lastUpdated", "Last Updated", "date", "Tracking"),
];

export const GROUPS: FieldGroup[] = ["Visit", "Claim", "Amounts", "Tracking", "Custom"];

export const DEFAULT_STATUSES = ["Pending", "Processed", "Denied", "Appealed", "Paid", "Closed"];

export const DEFAULT_TOTALS: TotalDef[] = [
  { id: "t-billed", label: "Total Billed", categoryId: null, first: { fn: "sum", field: "claimTotal" }, steps: [], format: "money" },
  { id: "t-owe", label: "You Owe", categoryId: null, first: { fn: "sum", field: "yourResponsibility" }, steps: [], format: "money" },
  { id: "t-plan", label: "Plan Paid", categoryId: null, first: { fn: "sum", field: "paidByPlan" }, steps: [], format: "money" },
  { id: "t-count", label: "Bills", categoryId: null, first: { fn: "count" }, steps: [], format: "number" },
  { id: "t-unpaid", label: "Unpaid", categoryId: null, first: { fn: "count", where: { field: "status", op: "neq", value: "Paid" } }, steps: [], format: "number" },
];

export const DEFAULT_OWE: OweTerm[] = [{ sign: "+", field: "yourResponsibility" }];

export function emptyDb(): DB {
  return {
    version: 1,
    bills: [],
    categories: [],
    fieldDefs: DEFAULT_FIELDS,
    removedFields: [],
    statuses: DEFAULT_STATUSES,
    statusColors: {},
    totals: DEFAULT_TOTALS,
    filters: [],
    controls: [],
    owe: DEFAULT_OWE,
  };
}

/** Fill in anything a saved file from an older version is missing. */
export function migrate(raw: Partial<DB>): DB {
  const base = emptyDb();
  const fieldDefs = raw.fieldDefs ?? base.fieldDefs;
  const removedFields = raw.removedFields ?? [];
  for (const d of DEFAULT_FIELDS) if (!removedFields.includes(d.key) && !fieldDefs.some((x) => x.key === d.key)) fieldDefs.push(d);
  return {
    version: 1,
    bills: raw.bills ?? [],
    categories: raw.categories ?? [],
    fieldDefs,
    removedFields,
    statuses: raw.statuses?.length ? raw.statuses : base.statuses,
    statusColors: raw.statusColors ?? base.statusColors,
    totals: raw.totals ?? base.totals,
    filters: raw.filters ?? base.filters,
    controls: raw.controls ?? base.controls,
    owe: raw.owe ?? base.owe,
  };
}

export const isNumeric = (d: FieldDef) => d.type === "money" || d.type === "number";

const leafCache = new WeakMap<FieldDef[], FieldDef[]>();

/**
 * Field list with each combined field split into its parts (labelled "Due · Amount"), so totals,
 * filters, the schedule and import can treat every part as an ordinary field. Cached per array.
 */
export function leafFields(defs: FieldDef[]): FieldDef[] {
  let out = leafCache.get(defs);
  if (!out) {
    out = defs.flatMap((d) => d.type === "combined"
      ? (d.parts ?? []).map((p): FieldDef => ({ key: p.key, label: `${d.label} · ${p.label}`, type: p.type, builtin: false, group: d.group }))
      : [d]);
    leafCache.set(defs, out);
  }
  return out;
}

/** Every value key a field owns: its own, or its parts' for a combined field. */
export const fieldKeys = (d: FieldDef) => (d.type === "combined" ? (d.parts ?? []).map((p) => p.key) : [d.key]);
