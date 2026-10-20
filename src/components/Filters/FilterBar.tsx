// The row of filter chips under the Bills header: All, one per status, then the user's own.
// Click a chip to filter the list, click it again (or All) to clear; double-click your own to edit.
import { useEffect, useRef, useState } from "react";
import { statusColor } from "../../lib/format";
import { describeFilter, filterTest, filterUsesDeletedField, statusFilterId } from "../../lib/filters";
import { leafFields } from "../../fields";
import { useDb } from "../../store/db";
import { useUi } from "../../store/ui";
import type { FilterDef } from "../../types";
import { FilterEditor } from "./FilterEditor";

export function FilterBar() {
  const bills = useDb((s) => s.bills);
  const statuses = useDb((s) => s.statuses);
  const statusColors = useDb((s) => s.statusColors);
  const filters = useDb((s) => s.filters);
  const fields = useDb((s) => leafFields(s.fieldDefs));
  const active = useUi((s) => s.filter);
  const setFilter = useUi((s) => s.setFilter);
  const [editing, setEditing] = useState<FilterDef | "new" | null>(null);

  // A plain mouse wheel scrolls the row sideways.
  const row = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  const count = (id: string) => {
    const test = filterTest(id, filters, statuses);
    return test ? bills.filter(test).length : 0;
  };
  const toggle = (id: string) => setFilter(active === id ? null : id);

  return (
    <div className="filter-row" ref={row}>
      <button className={`chip ${active === null ? "on" : ""}`} onClick={() => setFilter(null)}>
        All <span className="chip-n">{bills.length}</span>
      </button>
      {statuses.map((s) => {
        const id = statusFilterId(s);
        return (
          <button key={id} className={`chip c-${statusColor(s, statusColors)} ${active === id ? "on" : ""}`} onClick={() => toggle(id)} title={`Status is “${s}”`}>
            <span className="chip-dot" />{s} <span className="chip-n">{count(id)}</span>
          </button>
        );
      })}
      {filters.length > 0 && <span className="filter-sep" />}
      {filters.map((f) => {
        const broken = filterUsesDeletedField(f, fields);
        return (
          <button key={f.id} className={`chip ${active === f.id ? "on" : ""} ${broken ? "broken" : ""}`} onClick={() => toggle(f.id)}
            onDoubleClick={() => setEditing(f)}
            title={`${broken ? "Uses a deleted field. Double-click to fix.\n" : ""}${describeFilter(f, fields)}\nDouble-click to edit`}>
            {broken && <span className="flag">⚠</span>}{f.label} <span className="chip-n">{count(f.id)}</span>
          </button>
        );
      })}
      <button className="chip add" onClick={() => setEditing("new")} title="Make your own filter">＋ Filter</button>
      {editing && <FilterEditor initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
