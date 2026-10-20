export type FieldType = "text" | "money" | "number" | "date" | "status";
export type FieldGroup = "Visit" | "Claim" | "Amounts" | "Tracking" | "Custom";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  builtin: boolean;
  group: FieldGroup;
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

export type StatusColor = "gray" | "green" | "blue" | "yellow" | "orange" | "red" | "purple" | "pink";

export interface DB {
  version: 1;
  bills: Bill[];
  categories: Category[];
  fieldDefs: FieldDef[];
  statuses: string[];
  /** Pill color per status name; statuses without an entry use a default. */
  statusColors: Record<string, StatusColor>;
  totals: TotalDef[];
  /** User-made bill list filters; the per-status ones are built from `statuses`. */
  filters: FilterDef[];
}
