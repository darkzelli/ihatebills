// Dates shown on the schedule: each bill date field the user toggled on, keyed by day.
import { leafFields } from "../fields";
import type { Bill, FieldDef } from "../types";

export interface ScheduleEntry { bill: Bill; field: FieldDef }

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** YYYY-MM-DD → entries on that day, skipping toggles whose field was deleted or whose date is blank. */
export function scheduleByDay(bills: Bill[], fieldDefs: FieldDef[]): Map<string, ScheduleEntry[]> {
  const out = new Map<string, ScheduleEntry[]>();
  for (const bill of bills) {
    for (const key of bill.scheduled ?? []) {
      const field = leafFields(fieldDefs).find((f) => f.key === key && f.type === "date");
      const day = bill.values[key];
      if (!field || typeof day !== "string" || !DAY.test(day)) continue;
      const list = out.get(day);
      if (list) list.push({ bill, field });
      else out.set(day, [{ bill, field }]);
    }
  }
  return out;
}

export const dayKey = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
