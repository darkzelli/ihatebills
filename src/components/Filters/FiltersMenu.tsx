// What the Filters button opens: show/hide the filter row and manage your own filters.
import { useState } from "react";
import { statusColor } from "../../lib/format";
import { describeFilter } from "../../lib/filters";
import { useDb } from "../../store/db";
import { useUi } from "../../store/ui";
import type { FilterDef } from "../../types";
import { StatusDialog } from "../Inspector/StatusDialog";
import { Dialog } from "../ui/Dialog";
import { FilterEditor } from "./FilterEditor";

export function FiltersMenu({ onClose }: { onClose(): void }) {
  const showFilters = useUi((s) => s.showFilters);
  const setShowFilters = useUi((s) => s.setShowFilters);
  const filters = useDb((s) => s.filters);
  const fields = useDb((s) => s.fieldDefs);
  const statuses = useDb((s) => s.statuses);
  const statusColors = useDb((s) => s.statusColors);
  const [editing, setEditing] = useState<FilterDef | "new" | null>(null);
  const [editStatuses, setEditStatuses] = useState(false);

  if (editStatuses) return <StatusDialog onClose={() => setEditStatuses(false)} />;
  if (editing) return <FilterEditor initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />;
  return (
    <Dialog title="Filters" onClose={onClose}
      footer={<><button className="btn" onClick={() => setEditing("new")}>+ New filter</button><span className="spacer" /><button className="btn primary" onClick={onClose}>Done</button></>}>
      <label className="tb-line" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={showFilters} onChange={(e) => setShowFilters(e.target.checked)} />
        <span>Show the filter row under the Bills header</span>
      </label>
      <div className="tb-row">
        <span className="label">Status filters</span>
        <div className="tb-line">
          {statuses.map((s) => <span key={s} className={`pill c-${statusColor(s, statusColors)}`}>{s}</span>)}
        </div>
        <div className="tb-line">
          <span className="tb-hint" style={{ flex: 1 }}>One per status, always there.</span>
          <button className="btn sm" onClick={() => setEditStatuses(true)}>Edit statuses…</button>
        </div>
      </div>
      <div className="tb-row">
        <span className="label">Your filters</span>
        {filters.length === 0 && <span className="tb-hint">None yet. Make one to quickly find, say, a family member's unpaid bills.</span>}
        {filters.map((f) => (
          <div key={f.id} className="tb-line">
            <span style={{ fontWeight: 500 }}>{f.label}</span>
            <span className="tb-hint" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{describeFilter(f, fields)}</span>
            <button className="icon-btn" title="Edit" onClick={() => setEditing(f)}>✎</button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
