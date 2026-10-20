import type { Bill, FieldDef, FieldValue, StatusColor } from "../types";
import { formatCents, formatNumber } from "./money";

export function display(def: FieldDef | undefined, v: FieldValue | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  if (def?.type === "money" && typeof v === "number") return formatCents(v);
  if (def?.type === "number" && typeof v === "number") return formatNumber(v);
  if (def?.type === "date" && typeof v === "string") return formatDate(v);
  return String(v);
}

export function formatDate(s: string): string {
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return s;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export const billTitle = (b: Bill) => (b.values.providerName as string) || (b.values.claimNumber ? `Claim ${b.values.claimNumber}` : "Untitled bill");

export const STATUS_COLORS: StatusColor[] = ["gray", "green", "blue", "yellow", "orange", "red", "purple", "pink"];

/** The user's chosen color for a status, else a guess from its name. */
export function statusColor(s: string | undefined, colors: Record<string, StatusColor>): StatusColor {
  if (s && colors[s]) return colors[s];
  switch ((s ?? "").toLowerCase()) {
    case "paid": case "closed": return "green";
    case "denied": return "red";
    case "appealed": return "yellow";
    case "processed": return "blue";
    default: return "gray";
  }
}
