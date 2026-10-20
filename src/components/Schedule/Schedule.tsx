// Full-year calendar of the bill dates toggled onto the schedule; click a day to list it in the inspector.
import { memo, useMemo, useState } from "react";
import { billTitle, formatDate } from "../../lib/format";
import { today } from "../../lib/id";
import { dayKey, type ScheduleEntry, scheduleByDay } from "../../lib/schedule";
import { useDb } from "../../store/db";
import { useUi } from "../../store/ui";
import { PaneHead } from "../ui/PaneHead";

const MONTHS = Array.from({ length: 12 }, (_, m) => new Date(2000, m, 1).toLocaleDateString(undefined, { month: "long" }));
// Sunday-first, from a known Sunday (Jan 2 2000).
const WEEKDAYS = Array.from({ length: 7 }, (_, d) => new Date(2000, 0, 2 + d).toLocaleDateString(undefined, { weekday: "narrow" }));

const Month = memo(function Month({ year, month, byDay, selected, now, onPick }: {
  year: number; month: number; byDay: Map<string, ScheduleEntry[]>; selected: string | null; now: string; onPick(d: string): void;
}) {
  const lead = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  return (
    <div className="cal-month">
      <div className="cal-month-name">{MONTHS[month]}</div>
      <div className="cal-grid">
        {WEEKDAYS.map((w, i) => <span key={i} className="cal-wd">{w}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const d = dayKey(year, month, i + 1);
          const items = byDay.get(d);
          const tip = items?.map((e) => `${billTitle(e.bill)} · ${e.field.label}`).join("\n");
          return (
            <button key={d} className={`cal-day ${items ? "has" : ""} ${d === selected ? "sel" : ""} ${d === now ? "today" : ""}`}
              title={tip ? `${formatDate(d)}\n${tip}` : formatDate(d)} onClick={() => onPick(d)}>
              {i + 1}
              {items && items.length > 1 && <span className="cal-n">{items.length}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
});

export function Schedule() {
  const bills = useDb((s) => s.bills);
  const fieldDefs = useDb((s) => s.fieldDefs);
  const selected = useUi((s) => s.selectedDate);
  const selectDate = useUi((s) => s.selectDate);
  const now = today();
  const [year, setYear] = useState(() => Number((selected ?? now).slice(0, 4)));

  const byDay = useMemo(() => scheduleByDay(bills, fieldDefs), [bills, fieldDefs]);
  const inYear = useMemo(() => {
    let n = 0;
    for (const [d, list] of byDay) if (d.startsWith(`${year}-`)) n += list.length;
    return n;
  }, [byDay, year]);
  // Every year with something scheduled, plus a few either side of this one.
  const years = useMemo(() => {
    const thisYear = Number(now.slice(0, 4));
    const ys = new Set<number>([year]);
    for (let y = thisYear - 5; y <= thisYear + 5; y++) ys.add(y);
    for (const d of byDay.keys()) ys.add(Number(d.slice(0, 4)));
    return [...ys].sort((a, b) => a - b);
  }, [byDay, year, now]);

  const pick = (d: string) => selectDate(d === selected ? null : d);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PaneHead pane="schedule" title="Schedule">
        <span className="spacer" />
        <button className="icon-btn" onClick={() => setYear(year - 1)} title="Previous year" aria-label="Previous year">‹</button>
        <select className="input cal-year" value={year} onChange={(e) => setYear(Number(e.target.value))} title="Year">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className="icon-btn" onClick={() => setYear(year + 1)} title="Next year" aria-label="Next year">›</button>
        <button className="btn sm ghost" onClick={() => { setYear(Number(now.slice(0, 4))); selectDate(now); }}>Today</button>
      </PaneHead>
      <div className="scroll">
        {inYear === 0 && (
          <div className="cal-hint">Nothing scheduled in {year}. Turn on the calendar icon next to a date on a bill to show it here.</div>
        )}
        <div className="cal-year-grid">
          {MONTHS.map((_, m) => <Month key={m} year={year} month={m} byDay={byDay} selected={selected} now={now} onPick={pick} />)}
        </div>
      </div>
    </div>
  );
}
