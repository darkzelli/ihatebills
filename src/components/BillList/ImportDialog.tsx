// Map the columns of a spreadsheet / claims export onto bill fields, preview, then add the bills.
import { useMemo, useState } from "react";
import { GROUPS, leafFields } from "../../fields";
import { display } from "../../lib/format";
import { autoMap, type Cell, findHeaderRow, type Mapping, NEW_FIELD, planImport, type Table } from "../../lib/import";
import { sortedCategories, useDb } from "../../store/db";
import { useUi } from "../../store/ui";
import { Dialog } from "../ui/Dialog";

const filled = (c: Cell | undefined) => c != null && String(c).trim() !== "";

export function ImportDialog({ fileName, tables, onClose }: { fileName: string; tables: Table[]; onClose(): void }) {
  const fieldDefs = useDb((s) => leafFields(s.fieldDefs));
  const statuses = useDb((s) => s.statuses);
  const bills = useDb((s) => s.bills);
  const categories = useDb((s) => s.categories);

  const firstSheet = Math.max(0, tables.findIndex((t) => t.rows.length > 1));
  const setup = (i: number, header = findHeaderRow(tables[i].rows, fieldDefs)) =>
    ({ sheet: i, header, mapping: autoMap(tables[i].rows[header] ?? [], fieldDefs) as Mapping });
  const [s, setS] = useState(() => setup(firstSheet));
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const table = tables[s.sheet];
  const headers = table.rows[s.header] ?? [];
  const body = table.rows.slice(s.header + 1);
  const width = Math.max(headers.length, ...body.slice(0, 50).map((r) => r.length));
  const cols = [...Array(width).keys()].filter((i) => filled(headers[i]) || body.some((r) => filled(r[i])));

  const plan = useMemo(
    () => planImport(table, s.header, s.mapping, { fieldDefs, statuses, existing: bills, skipDuplicates }),
    [table, s, fieldDefs, statuses, bills, skipDuplicates],
  );
  const shownDefs = [...fieldDefs, ...plan.newFields].filter((d) => plan.rows.some((r) => r[d.key] != null));

  const setTarget = (col: number, key: string) => {
    const mapping = [...s.mapping];
    // One column per field: taking a field away from another column un-maps that one.
    if (key && key !== NEW_FIELD) mapping.forEach((m, i) => { if (m === key) mapping[i] = null; });
    mapping[col] = key || null;
    setS({ ...s, mapping });
  };

  const run = () => {
    const ids = useDb.getState().importBills(plan.rows, categoryId, plan.newFields, plan.newStatuses);
    if (ids[0]) useUi.getState().select(ids[0]);
    onClose();
  };

  const n = plan.rows.length;
  return (
    <Dialog className="import" title={<>Import <span className="muted" style={{ fontWeight: 400 }}>{fileName}</span></>} onClose={onClose}
      footer={<>
        <span className="tb-hint" style={{ alignSelf: "center" }}>
          {plan.duplicates > 0 && `${plan.duplicates} already in your list, skipped. `}
          {plan.newFields.length > 0 && `Adds ${plan.newFields.length} new field${plan.newFields.length > 1 ? "s" : ""}.`}
        </span>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" disabled={!n} onClick={run}>Import {n} bill{n === 1 ? "" : "s"}</button>
      </>}>
      <div className="tb-line">
        {tables.length > 1 && (
          <select className="input" value={s.sheet} onChange={(e) => setS(setup(+e.target.value))} title="Sheet">
            {tables.map((t, i) => <option key={i} value={i}>{t.name}</option>)}
          </select>
        )}
        <span className="muted">Headings are in row</span>
        <select className="input" value={s.header} onChange={(e) => setS(setup(s.sheet, +e.target.value))}>
          {table.rows.slice(0, 30).map((r, i) => (
            <option key={i} value={i}>{i + 1}: {r.filter(filled).slice(0, 4).join(", ").slice(0, 60)}</option>
          ))}
        </select>
        <span className="spacer" />
        <span className="muted">into</span>
        <select className="input" value={categoryId ?? ""} onChange={(e) => setCategoryId(e.target.value || null)}>
          <option value="">Uncategorized</option>
          {sortedCategories(categories).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div className="imp-map">
        <div className="imp-row imp-headrow"><span className="label">Column</span><span className="label">Example</span><span className="label">Goes into</span></div>
        {cols.map((i) => {
          const samples = body.map((r) => r[i]).filter(filled).slice(0, 3).map(String);
          const m = s.mapping[i] ?? "";
          return (
            <div key={i} className={`imp-row ${m ? "" : "off"}`}>
              <span className="imp-col">{filled(headers[i]) ? String(headers[i]) : <span className="dim">Column {i + 1}</span>}</span>
              <span className="imp-sample mono">{samples.join(" · ") || "—"}</span>
              <select className="input" value={m} onChange={(e) => setTarget(i, e.target.value)}>
                <option value="">Don't import</option>
                <option value={NEW_FIELD}>New field “{filled(headers[i]) ? String(headers[i]) : `Column ${i + 1}`}”</option>
                {GROUPS.map((g) => {
                  const defs = fieldDefs.filter((d) => d.group === g);
                  return defs.length ? <optgroup key={g} label={g}>{defs.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}</optgroup> : null;
                })}
              </select>
            </div>
          );
        })}
      </div>

      <label className="tb-line" style={{ cursor: "pointer" }}>
        <input type="checkbox" checked={skipDuplicates} onChange={(e) => setSkipDuplicates(e.target.checked)} />
        <span>Skip bills that are already in your list (same claim number, date and amounts)</span>
      </label>

      {n > 0 ? (
        <div className="imp-preview">
          <span className="label">Preview{n > 5 ? ` · first 5 of ${n}` : ""}</span>
          <div className="imp-table-wrap">
            <table className="imp-table">
              <thead><tr>{shownDefs.map((d) => <th key={d.key}>{d.label}</th>)}</tr></thead>
              <tbody>
                {plan.rows.slice(0, 5).map((r, i) => (
                  <tr key={i}>{shownDefs.map((d) => <td key={d.key} className={d.type === "money" || d.type === "number" ? "num" : ""}>{display(d, r[d.key])}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="tb-hint">
          {s.mapping.some(Boolean) ? "No rows with data under those headings." : "Pick where at least one column goes."}
        </div>
      )}
    </Dialog>
  );
}
