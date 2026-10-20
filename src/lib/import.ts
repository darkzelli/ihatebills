// Turns a spreadsheet or claims export into bills: read the file into tables, find the
// header row, guess which column is which field, then convert each row's cells.
import { uid } from "./id";
import { parseCents } from "./money";
import type { Bill, FieldDef, FieldType, FieldValue } from "../types";

/** Dates come out of spreadsheets already as YYYY-MM-DD strings. */
export type Cell = string | number | boolean | null;
export interface Table { name: string; rows: Cell[][] }

export const DELIMITED = ["csv", "tsv", "tab", "txt"];
export const SPREADSHEET = ["xlsx", "xlsm", "xlsb", "xls", "ods", "numbers"];
export const JSONISH = ["json", "ndjson"];
export const IMPORT_EXTENSIONS = [...DELIMITED, ...SPREADSHEET, ...JSONISH];

export const extOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

/** Every table in the file (one per sheet for workbooks). */
export async function readTables(bytes: Uint8Array, fileName: string): Promise<Table[]> {
  const ext = extOf(fileName);
  if (DELIMITED.includes(ext)) return [{ name: fileName, rows: parseDelimited(decodeText(bytes)) }];
  if (JSONISH.includes(ext)) return [{ name: fileName, rows: jsonToRows(decodeText(bytes)) }];
  if (SPREADSHEET.includes(ext)) return readWorkbook(bytes);
  throw new Error(`Can't import .${ext} files. Try CSV, TSV, Excel (.xlsx/.xls), OpenDocument (.ods) or JSON.`);
}

async function readWorkbook(bytes: Uint8Array): Promise<Table[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(bytes, { type: "array", cellNF: true, cellDates: false });
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    const rows: Cell[][] = [];
    if (!ws["!ref"]) return { name, rows };
    const r = XLSX.utils.decode_range(ws["!ref"]);
    for (let y = r.s.r; y <= r.e.r; y++) {
      const row: Cell[] = [];
      for (let x = r.s.c; x <= r.e.c; x++) {
        const c = ws[XLSX.utils.encode_cell({ r: y, c: x })];
        if (!c || c.t === "e" || c.t === "z") row.push(null);
        else if (c.t === "n" && c.z && XLSX.SSF.is_date(c.z)) {
          // Read the calendar date straight from the serial so time zones can't shift it.
          const d = XLSX.SSF.parse_date_code(c.v as number);
          row.push(d ? ymd(d.y, d.m, d.d) : null);
        } else if (c.t === "d") row.push(c.v instanceof Date ? ymd(c.v.getFullYear(), c.v.getMonth() + 1, c.v.getDate()) : null);
        else row.push(c.v as Cell);
      }
      rows.push(row);
    }
    return { name, rows };
  });
}

/** UTF-8, UTF-16 (Excel's "Unicode Text"), or Windows-1252 as a last resort. */
export function decodeText(b: Uint8Array): string {
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder("utf-16be").decode(b.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(b);
  } catch {
    return new TextDecoder("windows-1252").decode(b);
  }
}

/** Picks whichever of , tab ; | splits the first lines into the most consistent column count. */
export function sniffDelimiter(text: string): string {
  const lines = text.split(/\r?\n/).filter((l) => l.trim()).slice(0, 20);
  let best = ",", bestScore = 0;
  for (const d of [",", "\t", ";", "|"]) {
    const counts = lines.map((l) => l.split(d).length - 1);
    const freq = new Map<number, number>();
    for (const c of counts) if (c > 0) freq.set(c, (freq.get(c) ?? 0) + 1);
    const score = Math.max(0, ...freq.values());
    if (score > bestScore) { best = d; bestScore = score; }
  }
  return best;
}

/** RFC 4180-ish: quoted fields, "" escapes, newlines inside quotes, CRLF or LF. */
export function parseDelimited(text: string, delim = sniffDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === delim) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

// ---------- JSON: FHIR ExplanationOfBenefit (Blue Button, insurer APIs) or a plain array of objects ----------

/* eslint-disable @typescript-eslint/no-explicit-any */
function jsonToRows(text: string): Cell[][] {
  let data: any;
  try { data = JSON.parse(text); } catch {
    data = text.split(/\r?\n/).filter((l) => l.trim()).map((l) => JSON.parse(l)); // NDJSON
  }
  const items: any[] = Array.isArray(data) ? data
    : data?.resourceType === "Bundle" ? (data.entry ?? []).map((e: any) => e.resource)
    : data?.resourceType ? [data]
    : (Object.values(data ?? {}).find(Array.isArray) as any[] | undefined) ?? [data];
  const eobs = items.filter((r) => r?.resourceType === "ExplanationOfBenefit");
  if (eobs.length) return eobRows(eobs);

  const objs = items.filter((o) => o && typeof o === "object");
  const keys = [...new Set(objs.flatMap((o) => Object.keys(o)))];
  const cell = (v: any): Cell => (v == null ? null : typeof v === "object" ? JSON.stringify(v) : v);
  return [keys, ...objs.map((o) => keys.map((k) => cell(o[k])))];
}

// FHIR / CARIN Blue Button adjudication codes → our fields.
const EOB_CODES: Record<string, string> = {
  submitted: "claimTotal", benefit: "paidByPlan", paidtoprovider: "paidByPlan", copay: "copay",
  deductible: "appliedTowardsDeductible", coinsurance: "coinsurance", memberliability: "yourResponsibility",
  paidbypatient: "yourResponsibility", noncovered: "amountNotCovered", priorpayerpaid: "paidByAnotherSource", discount: "discounts",
};
const EOB_COLS = ["from", "to", "memberName", "providerName", "claimNumber", "claimTotal", "paidByPlan", "discounts",
  "paidByAnotherSource", "yourResponsibility", "copay", "appliedTowardsDeductible", "coinsurance", "amountNotCovered", "status"];
// Header text the auto-mapper will match exactly.
const EOB_HEADERS: Record<string, string> = {
  from: "From", to: "To", memberName: "Member Name", providerName: "Provider Name", claimNumber: "Claim Number",
  claimTotal: "Claim Total", paidByPlan: "Paid by Plan", discounts: "Discounts", paidByAnotherSource: "Paid by Another Source",
  yourResponsibility: "Your Responsibility", copay: "Copay", appliedTowardsDeductible: "Applied Towards Deductible",
  coinsurance: "Coinsurance", amountNotCovered: "Amount Not Covered", status: "Status",
};

function eobRows(eobs: any[]): Cell[][] {
  const codeOf = (x: any) => (x?.category?.coding ?? []).map((c: any) => String(c.code ?? "").toLowerCase()).find((c: string) => EOB_CODES[c]);
  const rows = eobs.map((e) => {
    const v: Record<string, Cell> = {
      from: e.billablePeriod?.start?.slice(0, 10) ?? e.item?.[0]?.servicedDate ?? null,
      to: e.billablePeriod?.end?.slice(0, 10) ?? null,
      memberName: e.patient?.display ?? null,
      providerName: e.provider?.display ?? e.facility?.display ?? e.careTeam?.[0]?.provider?.display ?? null,
      claimNumber: e.identifier?.[0]?.value ?? e.id ?? null,
      status: e.outcome === "complete" ? "Processed" : e.outcome === "queued" ? "Pending" : null,
    };
    const add = (code: string | undefined, amount: any) => {
      const n = Number(amount?.value);
      if (!code || !Number.isFinite(n)) return;
      const k = EOB_CODES[code];
      v[k] = ((v[k] as number | null) ?? 0) + n;
    };
    if (e.total?.length) for (const t of e.total) add(codeOf(t), t.amount);
    else for (const it of e.item ?? []) for (const a of it.adjudication ?? []) add(codeOf(a), a.amount);
    if (v.paidByPlan == null && e.payment?.amount) v.paidByPlan = Number(e.payment.amount.value);
    return EOB_COLS.map((k) => v[k] ?? null);
  });
  return [EOB_COLS.map((k) => EOB_HEADERS[k]), ...rows];
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ---------- Column → field matching ----------

export const norm = (s: string) => s.toLowerCase().replace(/&/g, " and ").replace(/#/g, " number ").replace(/[^a-z0-9]+/g, " ").trim()
  .replace(/\b(no|num|nbr)\b/g, "number").replace(/\bamt\b/g, "amount").replace(/\bresp\b/g, "responsibility");

// Header wording seen in insurer, pharmacy and HSA exports. Matched after norm(), with or without "amount"/"total".
const SYNONYMS: Record<string, string[]> = {
  from: ["from", "date of service", "dates of service", "service date", "service dates", "date of visit", "visit date", "dos", "dos from", "from date",
    "start date", "service start", "service from", "service start date", "date of service from", "first date of service", "begin date",
    "date", "fill date", "date filled", "claim date", "date received", "incurred date"],
  to: ["to", "to date", "end date", "service end", "service to", "service end date", "date of service to", "dos to", "through", "thru",
    "last date of service", "through date"],
  memberName: ["member", "member name", "patient", "patient name", "subscriber", "subscriber name", "family member", "dependent",
    "for", "name", "person", "insured"],
  providerName: ["provider", "provider name", "doctor", "physician", "facility", "facility name", "rendering provider", "billing provider",
    "pharmacy", "pharmacy name", "seen by", "provider facility", "servicing provider", "payee", "merchant", "vendor", "clinic"],
  claimNumber: ["claim", "claim number", "claim id", "claim reference", "reference number", "claim ref", "icn", "claim control number"],
  prescriptionNumber: ["rx", "rx number", "prescription", "prescription number", "script number"],
  claimTotal: ["billed", "amount billed", "billed amount", "total billed", "claim total", "charges", "total charges", "charge", "charged",
    "amount charged", "provider charges", "provider billed", "submitted", "submitted charges", "submitted amount", "billed charges",
    "total charge", "retail price", "drug cost", "total cost"],
  notYourResponsibility: ["not your responsibility", "not member responsibility", "not patient responsibility", "not your resp"],
  paidByPlan: ["paid by plan", "plan paid", "plan payment", "plan pays", "amount paid", "paid amount", "paid", "insurance paid",
    "paid by insurance", "insurer paid", "benefit", "benefits paid", "health plan paid", "plan paid amount", "payment", "plan share",
    "amount plan paid", "paid to provider", "plan cost"],
  discounts: ["discount", "discounts", "network discount", "savings", "network savings", "plan discount", "provider discount",
    "amount saved", "your savings", "discount amount", "plan discounts"],
  paidByAnotherSource: ["paid by another source", "other insurance", "other insurance paid", "paid by other insurance", "cob",
    "other payer", "other payer paid", "medicare paid", "secondary paid"],
  yourResponsibility: ["your responsibility", "you owe", "what you owe", "you may owe", "amount you owe", "your share", "your cost",
    "patient responsibility", "member responsibility", "patient owes", "patient pay", "patient paid", "member pays", "out of pocket",
    "your total cost", "patient portion", "your portion", "balance", "balance due", "amount due", "you pay", "member cost", "copay coinsurance"],
  copay: ["copay", "co pay", "copayment", "co payment", "copay amount"],
  appliedTowardsDeductible: ["deductible", "applied to deductible", "applied towards deductible", "applied toward deductible",
    "deductible amount", "deductible applied", "amount applied to deductible"],
  coinsurance: ["coinsurance", "co insurance", "coins", "coinsurance amount"],
  amountNotCovered: ["not covered", "amount not covered", "non covered", "noncovered", "not covered amount", "ineligible",
    "ineligible amount", "denied amount", "excluded"],
  status: ["status", "claim status", "processing status", "state"],
  lastUpdated: ["last updated", "updated", "date processed", "processed date", "processed", "status date", "process date", "last modified"],
};
const STRIP = /^(total )|( amount| amt| \$| usd)$/g;

/** The field a header names, matching labels of custom fields too. */
function matchHeader(header: string, defs: FieldDef[]): string | null {
  const h = norm(header);
  if (!h) return null;
  const bare = h.replace(STRIP, "").trim();
  for (const d of defs) if (norm(d.label) === h || norm(d.key) === h) return d.key;
  for (const pass of [h, bare]) {
    for (const [key, syns] of Object.entries(SYNONYMS)) {
      if (defs.some((d) => d.key === key) && syns.includes(pass)) return key;
    }
  }
  return null;
}

/** Field key (or null to skip) for each column; each field is used by the first column that names it. */
export function autoMap(headers: Cell[], defs: FieldDef[]): (string | null)[] {
  const taken = new Set<string>();
  return headers.map((h) => {
    const k = h == null ? null : matchHeader(String(h), defs);
    if (!k || taken.has(k)) return null;
    taken.add(k);
    return k;
  });
}

/** Exports often start with a title or account block; the header is the early row that best looks like one. */
export function findHeaderRow(rows: Cell[][], defs: FieldDef[]): number {
  let best = 0, bestScore = -1;
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const cells = rows[i].filter((c) => c != null && String(c).trim() !== "");
    if (cells.length < 2) continue;
    const text = cells.filter((c) => typeof c === "string" && !/^[\d$.,()\-\s/]+$/.test(c));
    const known = autoMap(rows[i], defs).filter(Boolean).length;
    const score = known * 3 + text.length - (cells.length - text.length) * 2;
    if (score > bestScore) { best = i; bestScore = score; }
  }
  return best;
}

// ---------- Cell conversion ----------

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function valid(y: number, m: number, d: number) {
  if (y < 100) y += y < 70 ? 2000 : 1900;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d ? ymd(y, m, d) : null;
}

/** "2024-03-05", "3/5/24", "03-05-2024", "Mar 5, 2024", "5-Mar-2024", "20240305", or an Excel serial number. */
export function parseDate(v: Cell): string | null {
  if (v == null || typeof v === "boolean") return null;
  if (typeof v === "number") {
    if (v >= 19000101 && v <= 21001231 && Number.isInteger(v)) return parseDate(String(v));
    if (v > 20000 && v < 80000) {
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 864e5);
      return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    }
    return null;
  }
  const s = v.trim().toLowerCase();
  let m: RegExpMatchArray | null;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:$|[t\s])/))) return valid(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return valid(+m[1], +m[2], +m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})(?:$|\s)/))) {
    // US order unless the first number can't be a month.
    return +m[1] > 12 ? valid(+m[3], +m[2], +m[1]) : valid(+m[3], +m[1], +m[2]);
  }
  const mon = (w: string) => MONTHS.indexOf(w.slice(0, 3)) + 1;
  if ((m = s.match(/^(?:[a-z]+,?\s+)?([a-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})/)) && mon(m[1])) return valid(+m[3], mon(m[1]), +m[2]);
  if ((m = s.match(/^(\d{1,2})[-\s]([a-z]{3,9})\.?[-\s,]+(\d{4}|\d{2})/)) && mon(m[2])) return valid(+m[3], mon(m[2]), +m[1]);
  return null;
}

/** "01/02/2024 - 01/05/2024" → both dates; a single date → [date, null]. */
export function parseDateRange(v: Cell): [string | null, string | null] {
  if (typeof v !== "string") return [parseDate(v), null];
  const parts = v.split(/\s*(?:–|—|\bto\b|\bthru\b|\bthrough\b)\s*|\s+-\s+/i).filter(Boolean);
  if (parts.length === 2) {
    const [a, b] = parts.map(parseDate);
    if (a && b) return [a, b];
  }
  const found = v.match(/\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}/g);
  if (found?.length === 2) {
    const [a, b] = found.map(parseDate);
    if (a && b) return [a, b];
  }
  return [parseDate(v), null];
}

const text = (v: Cell) => (v == null ? "" : String(v).trim());

export function toValue(type: FieldType, v: Cell, statuses: string[] = []): FieldValue {
  if (v == null || text(v) === "") return null;
  switch (type) {
    case "money": return typeof v === "number" ? Math.round(v * 100) : parseCents(String(v));
    case "number": {
      if (typeof v === "number") return v;
      const n = Number(String(v).replace(/[,\s$%]/g, ""));
      return Number.isFinite(n) ? n : null;
    }
    case "date": return parseDate(v);
    case "status": return statuses.find((s) => s.toLowerCase() === text(v).toLowerCase()) ?? text(v);
    default: return text(v);
  }
}

const MONEYISH = /amount|amt|cost|paid|pay|charge|billed|owe|balance|price|fee|copay|deductible|coinsurance|discount|saving|\$/i;

/** Field type for a new custom field, from its header and a sample of its cells. */
export function guessType(header: string, cells: Cell[]): FieldType {
  const vals = cells.filter((c) => text(c) !== "").slice(0, 50);
  if (!vals.length) return "text";
  if (vals.every((c) => typeof c === "string" && parseDate(c))) return "date";
  const numeric = vals.every((c) => typeof c === "number" || /^\(?-?\$?\s*-?[\d,]*\.?\d+\)?$/.test(String(c).trim()));
  if (!numeric) return "text";
  return MONEYISH.test(header) || vals.some((c) => String(c).includes("$")) ? "money" : "number";
}

// ---------- Rows → bills ----------

/** Column target: a field key, null to skip, or NEW_FIELD to add a custom field named after the header. */
export const NEW_FIELD = "+new";
export type Mapping = (string | null)[];

export interface ImportPlan {
  rows: Record<string, FieldValue>[];
  newFields: FieldDef[];
  newStatuses: string[];
  duplicates: number;
}

const DUP_KEYS = ["claimNumber", "prescriptionNumber", "from", "providerName", "claimTotal", "yourResponsibility"];
/** Re-importing the same export shouldn't double up bills. Null when there isn't enough to tell. */
export function dupKey(v: Record<string, FieldValue>): string | null {
  if (!v.claimNumber && !v.prescriptionNumber && !(v.from && v.providerName)) return null;
  return DUP_KEYS.map((k) => v[k] ?? "").join("|");
}

const isTotalRow = (row: Cell[]) => /^(grand\s+)?totals?\b|^sum\b/i.test(text(row.find((c) => text(c) !== "") ?? null));

export function planImport(table: Table, headerRow: number, mapping: Mapping, ctx: {
  fieldDefs: FieldDef[]; statuses: string[]; existing: Bill[]; skipDuplicates: boolean;
}): ImportPlan {
  const headers = table.rows[headerRow] ?? [];
  const body = table.rows.slice(headerRow + 1).filter((r) => !isTotalRow(r));
  const newFields: FieldDef[] = [];
  const targets = mapping.map((m, i): FieldDef | null => {
    if (m === NEW_FIELD) {
      const label = text(headers[i] ?? null) || `Column ${i + 1}`;
      const def: FieldDef = { key: `custom_${uid().slice(0, 8)}`, label, type: guessType(label, body.map((r) => r[i] ?? null)), builtin: false, group: "Custom" };
      newFields.push(def);
      return def;
    }
    return ctx.fieldDefs.find((d) => d.key === m) ?? null;
  });
  const toMapped = mapping.includes("to");
  const statuses = [...ctx.statuses];
  const seen = new Set(ctx.skipDuplicates ? ctx.existing.map((b) => dupKey(b.values)).filter(Boolean) : []);
  let duplicates = 0;

  const rows: Record<string, FieldValue>[] = [];
  for (const r of body) {
    const values: Record<string, FieldValue> = {};
    targets.forEach((def, i) => {
      if (!def) return;
      if (def.key === "from" && !toMapped) {
        const [a, b] = parseDateRange(r[i] ?? null);
        if (a) values.from = a;
        if (b) values.to = b;
        return;
      }
      const v = toValue(def.type, r[i] ?? null, statuses);
      if (v == null) return;
      values[def.key] = v;
      if (def.type === "status" && !statuses.includes(v as string)) statuses.push(v as string);
    });
    if (!Object.keys(values).length) continue;
    const k = ctx.skipDuplicates ? dupKey(values) : null;
    if (k && seen.has(k)) { duplicates++; continue; }
    rows.push(values);
  }
  return { rows, newFields, newStatuses: statuses.slice(ctx.statuses.length), duplicates };
}
