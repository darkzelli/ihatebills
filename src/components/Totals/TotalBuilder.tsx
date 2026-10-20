// Point-and-click editor for a total: pick a calculation, then optionally
// add + − × ÷ steps with another calculation or a plain number.
import { ask } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { isNumeric, leafFields } from "../../fields";
import { uid } from "../../lib/id";
import { formatCents, formatNumber } from "../../lib/money";
import { describe, evaluate, formula, formulaValues, looksLikeMoney, usesDeletedField } from "../../lib/totals";
import { sortedCategories, useDb } from "../../store/db";
import type { AggFn, Aggregate, FieldDef, Operand, StepOp, TotalDef, Where, WhereOp } from "../../types";
import { Dialog } from "../ui/Dialog";

const FNS: { fn: AggFn; label: string; hint: string }[] = [
  { fn: "sum", label: "Sum", hint: "Add up a field across bills" },
  { fn: "count", label: "Count", hint: "How many bills" },
  { fn: "avg", label: "Average", hint: "Average of a field" },
  { fn: "min", label: "Lowest", hint: "Smallest value of a field" },
  { fn: "max", label: "Highest", hint: "Largest value of a field" },
];
const OPS: { op: StepOp; sym: string; word: string }[] = [
  { op: "+", sym: "+", word: "plus" }, { op: "-", sym: "−", word: "minus" }, { op: "*", sym: "×", word: "times" }, { op: "/", sym: "÷", word: "divided by" },
];
export const WHERE_OPS: { op: WhereOp; label: string }[] = [
  { op: "eq", label: "is" }, { op: "neq", label: "is not" }, { op: "filled", label: "is filled in" }, { op: "empty", label: "is empty" },
];

function defaultWhere(fields: FieldDef[], statuses: string[]): Where {
  const status = fields.find((f) => f.type === "status");
  return status ? { field: status.key, op: "eq", value: statuses[0] ?? "" } : { field: fields[0]?.key ?? "", op: "filled" };
}

function AggEditor({ agg, onChange, fields }: { agg: Aggregate; onChange(a: Aggregate): void; fields: FieldDef[] }) {
  const statuses = useDb((s) => s.statuses);
  const numeric = fields.filter(isNumeric);
  const setFn = (fn: AggFn) => onChange({ ...agg, fn, field: fn === "count" ? undefined : agg.field ?? numeric[0]?.key });
  const w = agg.where;
  const wField = fields.find((f) => f.key === w?.field);
  return (
    <>
      <div className="tb-line">
        <div className="seg">{FNS.map((f) => <button key={f.fn} className={agg.fn === f.fn ? "on" : ""} title={f.hint} onClick={() => setFn(f.fn)}>{f.label}</button>)}</div>
        {agg.fn !== "count" && (
          <>
            <span className="muted">of</span>
            <select className="input" value={agg.field ?? ""} onChange={(e) => onChange({ ...agg, field: e.target.value })}>
              {!fields.some((f) => f.key === agg.field) && <option value={agg.field ?? ""} disabled>(deleted field)</option>}
              {numeric.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
            </select>
          </>
        )}
        {agg.fn === "count" && <span className="muted">bills</span>}
      </div>
      {w ? (
        <div className="tb-line">
          <span className="muted">only where</span>
          <select className="input" value={w.field} onChange={(e) => onChange({ ...agg, where: { ...w, field: e.target.value, value: "" } })}>
            {!wField && <option value={w.field} disabled>(deleted field)</option>}
            {fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
          </select>
          <select className="input" value={w.op} onChange={(e) => onChange({ ...agg, where: { ...w, op: e.target.value as WhereOp } })}>
            {WHERE_OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
          </select>
          {(w.op === "eq" || w.op === "neq") && (wField?.type === "status" ? (
            <select className="input" value={w.value ?? ""} onChange={(e) => onChange({ ...agg, where: { ...w, value: e.target.value } })}>
              <option value="">—</option>
              {statuses.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          ) : (
            <input className="input" style={{ width: 140 }} placeholder="value" value={w.value ?? ""} onChange={(e) => onChange({ ...agg, where: { ...w, value: e.target.value } })} />
          ))}
          <button className="icon-btn danger" title="Remove condition" onClick={() => onChange({ ...agg, where: undefined })}>✕</button>
        </div>
      ) : (
        <div className="tb-line">
          <button className="btn sm ghost" onClick={() => onChange({ ...agg, where: defaultWhere(fields, statuses) })}>+ Only count some bills…</button>
        </div>
      )}
    </>
  );
}

export function TotalBuilder({ initial, onClose }: { initial: TotalDef | null; onClose(): void }) {
  const fields = useDb((s) => leafFields(s.fieldDefs));
  const bills = useDb((s) => s.bills);
  const categories = useDb((s) => s.categories);
  const [t, setT] = useState<TotalDef>(initial ?? {
    id: uid(), label: "", categoryId: null, first: { fn: "sum", field: (fields.find((f) => f.key === "yourResponsibility") ?? fields.find(isNumeric))?.key }, steps: [], format: "money",
  });
  const [formatTouched, setFormatTouched] = useState(!!initial);

  const update = (patch: Partial<TotalDef>) => setT((prev) => {
    const next = { ...prev, ...patch };
    if (!formatTouched) next.format = looksLikeMoney(next, fields) ? "money" : "number";
    return next;
  });
  const setStep = (i: number, s: TotalDef["steps"][number]) => update({ steps: t.steps.map((x, j) => (j === i ? s : x)) });
  const stepField = fields.find((f) => f.key === "paidByPlan")?.key ?? fields.find(isNumeric)?.key;
  const addStep = () => update({ steps: [...t.steps, { op: "-", operand: { kind: "agg", agg: { fn: "sum", field: stepField } } }] });

  const value = evaluate(t, bills);
  const shown = Number.isNaN(value) ? "—" : t.format === "money" ? formatCents(value) : formatNumber(value);
  const sentence = describe(t, fields);

  const save = () => { useDb.getState().saveTotal({ ...t, label: t.label.trim() || sentence }); onClose(); };
  const remove = async () => {
    if (await ask(`Delete the total “${t.label}”?`, { title: "Delete total", kind: "warning" })) { useDb.getState().deleteTotal(t.id); onClose(); }
  };

  return (
    <Dialog title={initial ? "Edit total" : "New total"} onClose={onClose}
      footer={<>
        {initial && <button className="btn danger" onClick={remove}>Delete</button>}
        <span className="spacer" />
        <button className="btn" onClick={onClose}>Cancel</button>
        <button className="btn primary" onClick={save}>{initial ? "Save" : "Add total"}</button>
      </>}>
      <div className="tb-preview">
        <div className="tb-formula">{formula(t, fields)}</div>
        {t.steps.length > 0 && <div className="tb-formula dim">= {formulaValues(t, fields, bills)}</div>}
        <div className="tb-formula">= <b>{shown}</b></div>
        {t.steps.length > 1 && <div className="tb-hint">Steps are worked out top to bottom.</div>}
      </div>
      {usesDeletedField(t, fields) && <div className="tb-warn">⚠ This total uses a field that was deleted. Pick another field or remove that step.</div>}
      <div className="tb-line">
        <input className="input" style={{ flex: 1 }} placeholder="Name (e.g. Still owe)" value={t.label} onChange={(e) => update({ label: e.target.value })} autoFocus />
        <select className="input" value={t.categoryId ?? ""} onChange={(e) => update({ categoryId: e.target.value || null })} title="Which bills to include">
          <option value="">All bills</option>
          {sortedCategories(categories).map((c) => <option key={c.id} value={c.id}>Only {c.name}</option>)}
        </select>
      </div>

      <div className="tb-row">
        <span className="label">Start with</span>
        <AggEditor agg={t.first} fields={fields} onChange={(first) => update({ first })} />
      </div>

      {t.steps.map((s, i) => (
        <div className="tb-row" key={i}>
          <div className="tb-line">
            <div className="tb-op">{OPS.map((o) => <button key={o.op} className={`btn ${s.op === o.op ? "on" : ""}`} title={o.word} onClick={() => setStep(i, { ...s, op: o.op })}>{o.sym}</button>)}</div>
            <div className="seg">
              <button className={s.operand.kind === "agg" ? "on" : ""} onClick={() => setStep(i, { ...s, operand: { kind: "agg", agg: { fn: "sum", field: stepField } } })}>A calculation</button>
              <button className={s.operand.kind === "const" ? "on" : ""} onClick={() => setStep(i, { ...s, operand: { kind: "const", value: 0 } })}>A number</button>
            </div>
            <span className="spacer" />
            <button className="icon-btn danger" title="Remove step" onClick={() => update({ steps: t.steps.filter((_, j) => j !== i) })}>✕</button>
          </div>
          {s.operand.kind === "agg"
            ? <AggEditor agg={s.operand.agg} fields={fields} onChange={(agg) => setStep(i, { ...s, operand: { kind: "agg", agg } as Operand })} />
            : <div className="tb-line">
                <input className="input num" style={{ width: 140 }} type="number" step="any" value={s.operand.value}
                  onKeyDown={(e) => { if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && !/[0-9.\-]/.test(e.key)) e.preventDefault(); }}
                  onChange={(e) => setStep(i, { ...s, operand: { kind: "const", value: Number(e.target.value) || 0 } })} />
                {t.format === "money" && (s.op === "+" || s.op === "-") && <span className="tb-hint">dollars</span>}
              </div>}
        </div>
      ))}
      <div className="tb-line">
        <button className="btn sm" onClick={addStep}>+ Add a step (+ − × ÷)</button>
        <span className="spacer" />
        <span className="muted">Show as</span>
        <div className="seg">
          <button className={t.format === "money" ? "on" : ""} onClick={() => { setFormatTouched(true); setT({ ...t, format: "money" }); }}>$ Money</button>
          <button className={t.format === "number" ? "on" : ""} onClick={() => { setFormatTouched(true); setT({ ...t, format: "number" }); }}># Number</button>
        </div>
      </div>
    </Dialog>
  );
}
