export type FieldType = "text" | "money" | "number" | "date" | "status" | "combined";
/** Types a part of a combined field can have. */
export type PartType = "text" | "money" | "number" | "date";

/** One piece of a combined field. Its value is stored on the bill under its own key, like any other field. */
export interface FieldPart {
  key: string;
  label: string;
  type: PartType;
}
export type FieldGroup = "Visit" | "Claim" | "Amounts" | "Tracking" | "Custom";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  builtin: boolean;
  group: FieldGroup;
  /** Only for "combined" fields: the pieces it's made of, e.g. Due = an amount and a date. */
  parts?: FieldPart[];
}

export interface Category {
  id: string;
  name: string;
  order: number;
  collapsed: boolean;
}

/** Money values are integer cents; dates are YYYY-MM-DD strings. */
export type FieldValue = string | number | null;

export interface Attachment {
  id: string;
  name: string;
  mime: string;
  /** File name inside the app's attachments dir. */
  file: string;
}

export interface Bill {
  id: string;
  categoryId: string | null;
  order: number;
  values: Record<string, FieldValue>;
  attachments: Attachment[];
  /** Keys of this bill's date fields that show on the schedule. */
  scheduled?: string[];
  /** Fields a control greyed out or hid on this bill (top-level field key → how). Viewer only. */
  looks?: Record<string, LookMode>;
  createdAt: string;
  updatedAt: string;
}

export type AggFn = "sum" | "count" | "avg" | "min" | "max";
export type WhereOp = "filled" | "empty" | "eq" | "neq";

export interface Where {
  field: string;
  op: WhereOp;
  value?: string;
}

export interface Aggregate {
  fn: AggFn;
  /** Required for everything except count. */
  field?: string;
  where?: Where;
}

export type StepOp = "+" | "-" | "*" | "/";
export type Operand = { kind: "agg"; agg: Aggregate } | { kind: "const"; value: number };

export interface TotalDef {
  id: string;
  label: string;
  /** null = all bills. */
  categoryId: string | null;
  first: Aggregate;
  steps: { op: StepOp; operand: Operand }[];
  format: "money" | "number";
}

/** A saved bill list filter: a bill shows when it meets every condition. */
export interface FilterDef {
  id: string;
  label: string;
  conditions: Where[];
}

export type LookMode = "hide" | "dim";
export type DateUnit = "day" | "week" | "month" | "year";
/** set/clear/copy work on any field; add/subtract on money and numbers; today/shift on dates. */
export type ValueOp = "set" | "add" | "subtract" | "clear" | "today" | "shift" | "copy";
export type LookOp = "dim" | "hide" | "show" | "toggleDim" | "toggleHide";

/** gt/lt are "more/less than" for money and numbers, "after/before" for dates. */
export type CondOp = "filled" | "empty" | "eq" | "neq" | "gt" | "lt";

/** "Only if Due · Amount is more than $0". `field` is a value key; money `value` is cents; a date `value` of "today" means the day it runs. */
export interface ControlCond {
  field: string;
  op: CondOp;
  value?: FieldValue;
}

/** One thing a control does when clicked. Steps run top to bottom, each seeing the last one's result. */
export type ControlStep = (
  /** `field` is a value key (a combined field's part, not the combined field). For money, `value` is cents;
   *  for shift it's how many `unit`s (negative moves back); for copy, `from` is the source key. */
  | { kind: "value"; field: string; op: ValueOp; value?: FieldValue; unit?: DateUnit; from?: string }
  /** `field` is a top-level field key. */
  | { kind: "look"; field: string; op: LookOp }
) & {
  /** The step only runs when every condition holds (checked after the steps before it). */
  when?: ControlCond[];
};

/** A button shown in the viewer next to each of `fields` (top-level keys) that runs `steps` on the bill. */
export interface ControlDef {
  id: string;
  label: string;
  fields: string[];
  steps: ControlStep[];
  /** Ask "Run …?" before doing anything. */
  confirm: boolean;
}

/** One line of the "You owe" control: add or subtract a money/number value key (a combined field's part, not the combined field). */
export interface OweTerm {
  sign: "+" | "-";
  field: string;
}

export type StatusColor = "gray" | "green" | "blue" | "yellow" | "orange" | "red" | "purple" | "pink";

export interface DB {
  version: 1;
  bills: Bill[];
  categories: Category[];
  fieldDefs: FieldDef[];
  /** Keys of built-in fields the user deleted, so loading doesn't add them back. */
  removedFields: string[];
  statuses: string[];
  /** Pill color per status name; statuses without an entry use a default. */
  statusColors: Record<string, StatusColor>;
  totals: TotalDef[];
  /** User-made bill list filters; the per-status ones are built from `statuses`. */
  filters: FilterDef[];
  controls: ControlDef[];
  /** The built-in "You owe" control: what adds up to the You owe amount in the viewer. */
  owe: OweTerm[];
}
