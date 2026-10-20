// Runs a control's steps against one bill, and describes them in words for the editor.
import { fieldKeys, isNumeric, leafFields } from "../fields";
import { formatDate } from "./format";
import { today } from "./id";
import { formatCents, formatNumber } from "./money";
import type { Bill, CondOp, ControlCond, ControlDef, ControlStep, DateUnit, FieldDef, FieldValue, LookMode, LookOp, OweTerm, ValueOp } from "../types";

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");

/** Moves a YYYY-MM-DD date by n units. Months and years keep the day, clamped to the month's end (Jan 31 + 1 month = Feb 28). */
export function shiftDate(iso: string, n: number, unit: DateUnit): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (unit === "day" || unit === "week") {
    const t = new Date(Date.UTC(y, m - 1, d + n * (unit === "week" ? 7 : 1)));
    return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
  }
  const months = (y * 12 + m - 1) + n * (unit === "year" ? 12 : 1);
  const ny = Math.floor(months / 12), nm = months - ny * 12;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  return `${ny}-${pad(nm + 1)}-${pad(Math.min(d, last))}`;
}

/** Which ops make sense for a field type, in menu order; the first is the default. */
export function opsFor(type: FieldDef["type"] | undefined): { op: ValueOp; label: string }[] {
  const tail = [{ op: "copy" as const, label: "copy from" }, { op: "clear" as const, label: "clear" }];
  if (type === "money" || type === "number") {
    return [{ op: "subtract", label: "subtract" }, { op: "add", label: "add" }, { op: "set", label: "set to" }, ...tail];
  }
  if (type === "date") return [{ op: "shift", label: "move by" }, { op: "today", label: "set to today" }, { op: "set", label: "set to" }, ...tail];
  return [{ op: "set", label: "set to" }, ...tail];
}

export const LOOK_OPS: { op: LookOp; label: string }[] = [
  { op: "dim", label: "Grey out" },
  { op: "hide", label: "Hide" },
  { op: "show", label: "Show normally" },
  { op: "toggleDim", label: "Toggle greyed out" },
  { op: "toggleHide", label: "Toggle hidden" },
];

/** A fresh value step for a field, with the default op and a sensible starting amount. */
export function valueStep(def: FieldDef | undefined): ControlStep {
  const op = opsFor(def?.type)[0].op;
  return { kind: "value", field: def?.key ?? "", op, ...(op === "shift" ? { value: 1, unit: "month" as const } : {}) };
}

const isFilled = (v: FieldValue | undefined) => v !== null && v !== undefined && v !== "";

/** Which comparisons make sense for a field type, in menu order. */
export function condOpsFor(type: FieldDef["type"] | undefined): { op: CondOp; label: string }[] {
  const base: { op: CondOp; label: string }[] = [
    { op: "eq", label: "is" }, { op: "neq", label: "is not" }, { op: "filled", label: "is filled in" }, { op: "empty", label: "is empty" },
  ];
  if (type === "money" || type === "number") return [{ op: "gt", label: "is more than" }, { op: "lt", label: "is less than" }, ...base];
  if (type === "date") return [{ op: "lt", label: "is before" }, { op: "gt", label: "is after" }, ...base];
  return base;
}

/** A fresh condition on a field: "more than 0" for amounts, "before today" for dates, else "is filled in". */
export function newCond(def: FieldDef | undefined): ControlCond {
  if (def && isNumeric(def)) return { field: def.key, op: "gt", value: 0 };
  if (def?.type === "date") return { field: def.key, op: "lt", value: "today" };
  return { field: def?.key ?? "", op: "filled" };
}

/** Whether a condition holds for these values. A condition on a deleted field never holds; blanks are never more or less than anything. */
export function condHolds(c: ControlCond, values: Record<string, FieldValue>, leaves: Map<string, FieldDef>): boolean {
  const def = leaves.get(c.field);
  if (!def) return false;
  const v = values[c.field];
  const want = def.type === "date" && c.value === "today" ? today() : c.value;
  switch (c.op) {
    case "filled": return isFilled(v);
    case "empty": return !isFilled(v);
    case "eq": case "neq": {
      const same = isNumeric(def) ? (isFilled(v) ? v : null) === (isFilled(want) ? want : null) : String(v ?? "") === String(want ?? "");
      return c.op === "eq" ? same : !same;
    }
    case "gt": case "lt": {
      if (!isFilled(v) || !isFilled(want)) return false;
      const cmp = isNumeric(def) ? Number(v) - Number(want) : String(v).localeCompare(String(want));
      return c.op === "gt" ? cmp > 0 : cmp < 0;
    }
  }
}

/**
 * The bill's values and looks after running the steps. Steps on a deleted field, or that don't fit
 * the field's type, are skipped. Add/subtract treat a blank as 0; moving a blank date does nothing.
 */
export function runSteps(bill: Bill, steps: ControlStep[], fieldDefs: FieldDef[]): { values: Record<string, FieldValue>; looks: Record<string, LookMode> } {
  const leaves = new Map(leafFields(fieldDefs).map((d) => [d.key, d]));
  const tops = new Set(fieldDefs.map((d) => d.key));
  const values = { ...bill.values };
  const looks = { ...bill.looks };
  for (const s of steps) {
    if (s.when?.some((c) => !condHolds(c, values, leaves))) continue;
    if (s.kind === "look") {
      if (!tops.has(s.field)) continue;
      const cur = looks[s.field];
      const next: LookMode | undefined =
        s.op === "dim" ? "dim" : s.op === "hide" ? "hide" : s.op === "show" ? undefined
        : s.op === "toggleDim" ? (cur === "dim" ? undefined : "dim") : (cur === "hide" ? undefined : "hide");
      if (next) looks[s.field] = next;
      else delete looks[s.field];
      continue;
    }
    const def = leaves.get(s.field);
    if (!def || !opsFor(def.type).some((o) => o.op === s.op)) continue;
    const cur = values[s.field];
    switch (s.op) {
      case "set": values[s.field] = s.value ?? null; break;
      case "clear": values[s.field] = null; break;
      case "today": values[s.field] = today(); break;
      case "copy": if (s.from && leaves.has(s.from)) values[s.field] = values[s.from] ?? null; break;
      case "add": case "subtract": {
        const base = typeof cur === "number" ? cur : 0;
        const by = typeof s.value === "number" ? s.value : 0;
        values[s.field] = s.op === "add" ? base + by : base - by;
        break;
      }
      case "shift":
        if (typeof cur === "string" && DAY.test(cur)) values[s.field] = shiftDate(cur, Number(s.value) || 0, s.unit ?? "month");
        break;
    }
  }
  return { values, looks };
}

/** Every field key a control mentions. */
export const controlFields = (c: ControlDef) => [...new Set([
  ...c.fields,
  ...c.steps.flatMap((s) => [
    ...(s.kind === "value" && s.op === "copy" && s.from ? [s.field, s.from] : [s.field]),
    ...(s.when ?? []).map((w) => w.field),
  ]),
])];

/** Whether a control mentions a field that no longer exists. */
export function controlUsesDeletedField(c: ControlDef, fieldDefs: FieldDef[]): boolean {
  const known = new Set([...fieldDefs.map((d) => d.key), ...leafFields(fieldDefs).map((d) => d.key)]);
  return controlFields(c).some((k) => !known.has(k));
}

/** Whether a control touches any of a field's keys (for the delete-field warning). */
export const controlUsesField = (c: ControlDef, def: FieldDef) => {
  const keys = [def.key, ...fieldKeys(def)];
  return controlFields(c).some((k) => keys.includes(k));
};

function amount(def: FieldDef | undefined, v: FieldValue | undefined): string {
  if (!isFilled(v)) return "blank";
  if (def?.type === "money" && typeof v === "number") return formatCents(v);
  if (def && isNumeric(def) && typeof v === "number") return formatNumber(v);
  if (def?.type === "date" && typeof v === "string") return formatDate(v);
  return `“${v}”`;
}

/** "Due · Amount is more than $0.00". */
export function describeCond(c: ControlCond, fieldDefs: FieldDef[]): string {
  const def = leafFields(fieldDefs).find((d) => d.key === c.field);
  const op = condOpsFor(def?.type).find((o) => o.op === c.op)?.label ?? c.op;
  const name = def?.label ?? "(deleted field)";
  if (c.op === "filled" || c.op === "empty") return `${name} ${op}`;
  return `${name} ${op} ${def?.type === "date" && c.value === "today" ? "today" : amount(def, c.value)}`;
}

/** "Due · Date: move ahead 1 month, only if Due · Amount is more than $0.00", "Grey out Due". */
export function describeStep(s: ControlStep, fieldDefs: FieldDef[]): string {
  const action = describeAction(s, fieldDefs);
  return s.when?.length ? `${action}, only if ${s.when.map((c) => describeCond(c, fieldDefs)).join(" and ")}` : action;
}

function describeAction(s: ControlStep, fieldDefs: FieldDef[]): string {
  if (s.kind === "look") {
    const name = fieldDefs.find((d) => d.key === s.field)?.label ?? "(deleted field)";
    return `${LOOK_OPS.find((o) => o.op === s.op)?.label ?? s.op} ${name}`;
  }
  const leaves = leafFields(fieldDefs);
  const def = leaves.find((d) => d.key === s.field);
  const name = def?.label ?? "(deleted field)";
  switch (s.op) {
    case "set": return `${name}: set to ${amount(def, s.value)}`;
    case "clear": return `${name}: clear`;
    case "today": return `${name}: set to today`;
    case "add": return `${name}: add ${amount(def, s.value ?? 0)}`;
    case "subtract": return `${name}: subtract ${amount(def, s.value ?? 0)}`;
    case "copy": return `${name}: copy from ${leaves.find((d) => d.key === s.from)?.label ?? "(deleted field)"}`;
    case "shift": {
      const n = Number(s.value) || 0;
      const unit = s.unit ?? "month";
      return `${name}: move ${n < 0 ? "back" : "ahead"} ${Math.abs(n)} ${unit}${Math.abs(n) === 1 ? "" : "s"}`;
    }
  }
}

/** The bill's "You owe" amount from the built-in control's terms. Blanks count as 0; null when every term is blank (or there are none). */
export function oweAmount(bill: Bill, terms: OweTerm[]): number | null {
  let total = 0, any = false;
  for (const t of terms) {
    const v = bill.values[t.field];
    if (typeof v !== "number") continue;
    any = true;
    total += t.sign === "+" ? v : -v;
  }
  return any ? total : null;
}

/** e.g. "Your Responsibility − Discounts". */
export function describeOwe(terms: OweTerm[], fieldDefs: FieldDef[]): string {
  if (!terms.length) return "Nothing yet";
  const leaves = leafFields(fieldDefs);
  return terms.map((t, i) => {
    const name = leaves.find((d) => d.key === t.field)?.label ?? "(deleted field)";
    return i === 0 ? (t.sign === "-" ? `− ${name}` : name) : `${t.sign === "+" ? "+" : "−"} ${name}`;
  }).join(" ");
}

/** Whether the "You owe" control uses a field that no longer exists. */
export const oweUsesDeletedField = (terms: OweTerm[], fieldDefs: FieldDef[]) =>
  terms.some((t) => !leafFields(fieldDefs).some((d) => d.key === t.field));
