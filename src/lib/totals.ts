// Evaluates a TotalDef: one aggregate, then + − × ÷ steps applied left to right.
// Money fields are integer cents, so a "money" total is in cents too.
import { formatCents, formatNumber } from "./money";
import type { Aggregate, Bill, FieldDef, FieldValue, Operand, StepOp, TotalDef, Where } from "../types";

const filled = (v: FieldValue | undefined) => v !== null && v !== undefined && v !== "";

export function matches(b: Bill, w: Where | undefined): boolean {
  if (!w) return true;
  const v = b.values[w.field];
  switch (w.op) {
    case "filled": return filled(v);
    case "empty": return !filled(v);
    case "eq": return String(v ?? "") === (w.value ?? "");
    case "neq": return String(v ?? "") !== (w.value ?? "");
  }
}

/** A field's label, or a placeholder once the field has been deleted. */
export const fieldLabel = (k: string | undefined, fields: FieldDef[]) =>
  k === undefined ? "?" : fields.find((f) => f.key === k)?.label ?? "(deleted field)";

const aggFields = (a: Aggregate) => [a.field, a.where?.field].filter((k): k is string => !!k);

/** Every field key a total reads. */
export const totalFields = (t: TotalDef) =>
  [...new Set([...aggFields(t.first), ...t.steps.flatMap((s) => (s.operand.kind === "agg" ? aggFields(s.operand.agg) : []))])];

/** Whether a total reads a field that no longer exists. */
export const usesDeletedField = (t: TotalDef, fields: FieldDef[]) => totalFields(t).some((k) => !fields.some((f) => f.key === k));

/** NaN means "no answer" (average/min/max of nothing). */
export function aggregate(a: Aggregate, bills: Bill[]): number {
  const rows = bills.filter((b) => matches(b, a.where));
  if (a.fn === "count") return rows.length;
  if (!a.field) return NaN;
  const nums = rows.map((b) => b.values[a.field!]).filter((v): v is number => typeof v === "number");
  switch (a.fn) {
    case "sum": return nums.reduce((s, n) => s + n, 0);
    case "avg": return nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : NaN;
    case "min": return nums.length ? Math.min(...nums) : NaN;
    case "max": return nums.length ? Math.max(...nums) : NaN;
  }
}

function apply(op: StepOp, a: number, b: number): number {
  switch (op) {
    case "+": return a + b;
    case "-": return a - b;
    case "*": return a * b;
    case "/": return b === 0 ? NaN : a / b;
  }
}

/** Constants are typed in dollars; on a money total they're added/subtracted as cents. */
function operandValue(o: Operand, op: StepOp, t: TotalDef, bills: Bill[]): number {
  if (o.kind === "agg") return aggregate(o.agg, bills);
  return t.format === "money" && (op === "+" || op === "-") ? Math.round(o.value * 100) : o.value;
}

const scoped = (t: TotalDef, all: Bill[]) => (t.categoryId ? all.filter((b) => b.categoryId === t.categoryId) : all);

export function evaluate(t: TotalDef, all: Bill[]): number {
  const bills = scoped(t, all);
  let v = aggregate(t.first, bills);
  for (const s of t.steps) v = apply(s.op, v, operandValue(s.operand, s.op, t, bills));
  return v;
}

/** Whether a total of this shape produces money: any sum/avg/min/max of a money field. */
export function looksLikeMoney(t: Pick<TotalDef, "first" | "steps">, fields: FieldDef[]): boolean {
  const isMoney = (a: Aggregate) => a.fn !== "count" && fields.find((f) => f.key === a.field)?.type === "money";
  return isMoney(t.first) || t.steps.some((s) => s.operand.kind === "agg" && isMoney(s.operand.agg));
}

const FN_WORD: Record<Aggregate["fn"], string> = { sum: "Sum", count: "Count", avg: "Average", min: "Lowest", max: "Highest" };
const OP_WORD: Record<StepOp, string> = { "+": "plus", "-": "minus", "*": "times", "/": "divided by" };

export function describeAgg(a: Aggregate, fields: FieldDef[]): string {
  const label = (k?: string) => fieldLabel(k, fields);
  let s = a.fn === "count" ? "Count of bills" : `${FN_WORD[a.fn]} of ${label(a.field)}`;
  if (a.where) {
    const w = a.where;
    const cond = w.op === "filled" ? "is filled in" : w.op === "empty" ? "is empty" : w.op === "eq" ? `is “${w.value ?? ""}”` : `is not “${w.value ?? ""}”`;
    s += ` where ${label(w.field)} ${cond}`;
  }
  return s;
}

export function describe(t: TotalDef, fields: FieldDef[]): string {
  let s = describeAgg(t.first, fields);
  for (const st of t.steps) s += ` ${OP_WORD[st.op]} ${st.operand.kind === "const" ? st.operand.value : describeAgg(st.operand.agg, fields)}`;
  return s;
}

const FN_CODE: Record<Aggregate["fn"], string> = { sum: "SUM", count: "COUNT", avg: "AVG", min: "MIN", max: "MAX" };
const OP_SYM: Record<StepOp, string> = { "+": "+", "-": "−", "*": "×", "/": "÷" };
const PREC: Record<StepOp, number> = { "+": 1, "-": 1, "*": 2, "/": 2 };

export function formulaAgg(a: Aggregate, fields: FieldDef[]): string {
  const label = (k?: string) => fieldLabel(k, fields);
  let s = a.fn === "count" ? "bills" : label(a.field);
  if (a.where) {
    const w = a.where;
    const cond = w.op === "filled" ? "is filled in" : w.op === "empty" ? "is empty" : `${w.op === "eq" ? "=" : "≠"} “${w.value ?? ""}”`;
    s += ` where ${label(w.field)} ${cond}`;
  }
  return `${FN_CODE[a.fn]}(${s})`;
}

/** Steps run left to right, so an earlier + or − is bracketed before a × or ÷. */
function build(t: TotalDef, term: (a: Aggregate) => string, constant: (value: number, op: StepOp) => string): string {
  let s = term(t.first);
  let top = 0; // precedence of the loosest operator in s so far (0 = none)
  for (const st of t.steps) {
    if (top && top < PREC[st.op]) s = `(${s})`;
    s += ` ${OP_SYM[st.op]} ${st.operand.kind === "const" ? constant(st.operand.value, st.op) : term(st.operand.agg)}`;
    top = PREC[st.op];
  }
  return s;
}

const isMoneyAgg = (a: Aggregate, fields: FieldDef[]) => a.fn !== "count" && fields.find((f) => f.key === a.field)?.type === "money";
const moneyConst = (t: TotalDef, op: StepOp) => t.format === "money" && (op === "+" || op === "-");

/** e.g. SUM(Claim Total) − SUM(Paid by Plan) */
export function formula(t: TotalDef, fields: FieldDef[]): string {
  return build(t, (a) => formulaAgg(a, fields), (v, op) => (moneyConst(t, op) ? formatCents(Math.round(v * 100)) : formatNumber(v)));
}

/** The same formula with each calculation replaced by its current value, e.g. $125.50 − $80.00 */
export function formulaValues(t: TotalDef, fields: FieldDef[], all: Bill[]): string {
  const bills = scoped(t, all);
  return build(t, (a) => {
    const v = aggregate(a, bills);
    return Number.isNaN(v) ? "—" : isMoneyAgg(a, fields) ? formatCents(v) : formatNumber(v);
  }, (v, op) => (moneyConst(t, op) ? formatCents(Math.round(v * 100)) : formatNumber(v)));
}
