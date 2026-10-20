// Create or edit a custom filter: a name and one or more "field is / is not / filled / empty" conditions.
import { ask } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { describeFilter, filterTest } from "../../lib/filters";
import { uid } from "../../lib/id";
import { useDb } from "../../store/db";
import { useUi } from "../../store/ui";
import type { FilterDef, Where, WhereOp } from "../../types";
import { WHERE_OPS } from "../Totals/TotalBuilder";
import { Dialog } from "../ui/Dialog";

export function FilterEditor({ initial, onClose }: { initial: FilterDef | null; onClose(): void }) {
  const fields = useDb((s) => s.fieldDefs);
  const statuses = useDb((s) => s.statuses);
  const bills = useDb((s) => s.bills);
  const [f, setF] = useState<FilterDef>(initial ?? { id: uid(), label: "", conditions: [{ field: "status", op: "neq", value: statuses[0] ?? "" }] });

  const setCond = (i: number, patch: Partial<Where>) => setF({ ...f, conditions: f.conditions.map((w, j) => (j === i ? { ...w, ...patch } : w)) });
  const addCond = () => setF({ ...f, conditions: [...f.conditions, { field: "memberName", op: "eq", value: "" }] });
  const sentence = describeFilter(f, fields);
  const n = bills.filter(filterTest(f.id, [f], [])!).length;

  const save = () => {
    useDb.getState().saveFilter({ ...f, label: f.label.trim() || sentence });
    useUi.getState().setFilter(f.id);
    onClose();
  };
  const remove = async () => {
    if (!(await ask(`Delete the filter “${f.label}”?`, { title: "Delete filter", kind: "warning" }))) return;
    if (useUi.getState().filter === f.id) useUi.getState().setFilter(null);
    useDb.getState().deleteFilter(f.id);
    onClose();
  };

  return (
    <Dialog title={initial ? "Edit filter" : "New filter"} onClose={onClose}
      footer={<>
        {initial && <button className="btn danger" onClick={remove}>Delete</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>{initial ? "Save" : "Add filter"}</button>
      </>}>
      <div className="tb-preview">
        <div className="tb-formula">{sentence}</div>
        <div className="tb-formula">= <b>{n}</b> bill{n === 1 ? "" : "s"} right now</div>
      </div>
      <input className="input" placeholder="Name (e.g. Ann's unpaid)" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} autoFocus />
      <div className="tb-row">
        <span className="label">Show bills where</span>
        {f.conditions.map((w, i) => {
          const def = fields.find((d) => d.key === w.field);
          return (
            <div className="tb-line" key={i}>
              {i > 0 && <span className="muted">and</span>}
              <select className="input" value={w.field} onChange={(e) => setCond(i, { field: e.target.value, value: "" })}>
                {fields.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
              <select className="input" value={w.op} onChange={(e) => setCond(i, { op: e.target.value as WhereOp })}>
                {WHERE_OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
              </select>
              {(w.op === "eq" || w.op === "neq") && (def?.type === "status" ? (
                <select className="input" value={w.value ?? ""} onChange={(e) => setCond(i, { value: e.target.value })}>
                  <option value="">—</option>
                  {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              ) : (
                <input className="input" style={{ width: 140 }} placeholder="value" value={w.value ?? ""} onChange={(e) => setCond(i, { value: e.target.value })} />
              ))}
              <span className="spacer" />
              <button className="icon-btn danger" title="Remove condition" onClick={() => setF({ ...f, conditions: f.conditions.filter((_, j) => j !== i) })}>✕</button>
            </div>
          );
        })}
        <div className="tb-line"><button className="btn sm ghost" onClick={addCond}>+ Add a condition</button></div>
      </div>
    </Dialog>
  );
}
