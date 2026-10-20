// Make and edit controls: buttons in the viewer that change a bill's values or grey out / hide fields,
// plus the built-in "You owe" control, which has no button and sets what adds up to You owe.
import { ask } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { DEFAULT_OWE, isNumeric, leafFields } from "../../fields";
import { condOpsFor, controlUsesDeletedField, describeOwe, describeStep, LOOK_OPS, newCond, opsFor, oweAmount, oweUsesDeletedField, valueStep } from "../../lib/controls";
import { uid } from "../../lib/id";
import { formatCents } from "../../lib/money";
import { useDb } from "../../store/db";
import { useUi } from "../../store/ui";
import type { CondOp, ControlCond, ControlDef, ControlStep, DateUnit, FieldDef, LookOp, OweTerm, ValueOp } from "../../types";
import { FieldInput } from "../Inspector/FieldEditor";
import { Dialog } from "../ui/Dialog";

const UNITS: DateUnit[] = ["day", "week", "month", "year"];

function DeletedOption({ known, value }: { known: boolean; value: string }) {
  return known ? null : <option value={value} disabled>(deleted field)</option>;
}

function ValueStepEditor({ step, onChange, leaves }: { step: Extract<ControlStep, { kind: "value" }>; onChange(s: ControlStep): void; leaves: FieldDef[] }) {
  const def = leaves.find((d) => d.key === step.field);
  const ops = opsFor(def?.type);
  const sources = leaves.filter((d) => d.key !== step.field && (d.type === def?.type || (def && isNumeric(def) && isNumeric(d))));
  const setOp = (op: ValueOp) => onChange({
    kind: "value", field: step.field, op, when: step.when,
    ...(op === "shift" ? { value: 1, unit: "month" as const } : {}),
    ...(op === "copy" ? { from: sources[0]?.key } : {}),
  });
  return (
    <div className="tb-line">
      <select className="input" value={step.field} onChange={(e) => onChange({ ...valueStep(leaves.find((d) => d.key === e.target.value)), when: step.when })}>
        <DeletedOption known={!!def} value={step.field} />
        {leaves.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
      </select>
      <select className="input" value={step.op} onChange={(e) => setOp(e.target.value as ValueOp)}>
        {!ops.some((o) => o.op === step.op) && <option value={step.op} disabled>{step.op}</option>}
        {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
      </select>
      {def && (step.op === "set" || step.op === "add" || step.op === "subtract") && (
        <div style={{ width: 160 }}>
          <FieldInput def={def} value={step.value} onChange={(value) => onChange({ ...step, value })} onEditStatuses={() => {}} />
        </div>
      )}
      {step.op === "shift" && (
        <>
          <input className="input num" style={{ width: 70 }} type="number" step={1} value={Number(step.value) || 0}
            onChange={(e) => onChange({ ...step, value: Math.trunc(Number(e.target.value)) || 0 })} />
          <select className="input" value={step.unit ?? "month"} onChange={(e) => onChange({ ...step, unit: e.target.value as DateUnit })}>
            {UNITS.map((u) => <option key={u} value={u}>{u}{Math.abs(Number(step.value)) === 1 ? "" : "s"}</option>)}
          </select>
          <span className="tb-hint">use a minus number to move back</span>
        </>
      )}
      {step.op === "copy" && (
        <select className="input" value={step.from ?? ""} onChange={(e) => onChange({ ...step, from: e.target.value })}>
          {!sources.some((d) => d.key === step.from) && <option value={step.from ?? ""} disabled>{step.from ? "(deleted field)" : "pick a field"}</option>}
          {sources.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
        </select>
      )}
    </div>
  );
}

function LookStepEditor({ step, onChange, fields }: { step: Extract<ControlStep, { kind: "look" }>; onChange(s: ControlStep): void; fields: FieldDef[] }) {
  return (
    <div className="tb-line">
      <select className="input" value={step.op} onChange={(e) => onChange({ ...step, op: e.target.value as LookOp })}>
        {LOOK_OPS.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
      </select>
      <select className="input" value={step.field} onChange={(e) => onChange({ ...step, field: e.target.value })}>
        <DeletedOption known={fields.some((d) => d.key === step.field)} value={step.field} />
        {fields.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
      </select>
      <span className="tb-hint">in the viewer, on this bill</span>
    </div>
  );
}

function CondEditor({ cond, onChange, onRemove, leaves, first }: {
  cond: ControlCond; onChange(c: ControlCond): void; onRemove(): void; leaves: FieldDef[]; first: boolean;
}) {
  const def = leaves.find((d) => d.key === cond.field);
  const ops = condOpsFor(def?.type);
  const needsValue = cond.op !== "filled" && cond.op !== "empty";
  const isToday = def?.type === "date" && cond.value === "today";
  return (
    <div className="tb-line ctl-cond">
      <span className="muted">{first ? "only if" : "and"}</span>
      <select className="input" value={cond.field} onChange={(e) => onChange(newCond(leaves.find((d) => d.key === e.target.value)))}>
        <DeletedOption known={!!def} value={cond.field} />
        {leaves.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
      </select>
      <select className="input" value={cond.op} onChange={(e) => onChange({ ...cond, op: e.target.value as CondOp })}>
        {!ops.some((o) => o.op === cond.op) && <option value={cond.op} disabled>{cond.op}</option>}
        {ops.map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
      </select>
      {def && needsValue && def.type === "date" && (
        <div className="seg">
          <button className={isToday ? "on" : ""} onClick={() => onChange({ ...cond, value: "today" })}>Today</button>
          <button className={isToday ? "" : "on"} onClick={() => isToday && onChange({ ...cond, value: null })}>A date</button>
        </div>
      )}
      {def && needsValue && !isToday && (
        <div style={{ width: 160 }}>
          <FieldInput def={def} value={cond.value} onChange={(value) => onChange({ ...cond, value })} onEditStatuses={() => {}} />
        </div>
      )}
      <span className="spacer" />
      <button className="icon-btn danger" title="Remove condition" onClick={onRemove}>✕</button>
    </div>
  );
}

/** The "only if …" lines under a step. */
function CondsEditor({ conds, onChange, leaves, defaultField }: { conds: ControlCond[]; onChange(c: ControlCond[]): void; leaves: FieldDef[]; defaultField?: FieldDef }) {
  return (
    <>
      {conds.map((w, i) => (
        <CondEditor key={i} cond={w} leaves={leaves} first={i === 0}
          onChange={(x) => onChange(conds.map((y, j) => (j === i ? x : y)))}
          onRemove={() => onChange(conds.filter((_, j) => j !== i))} />
      ))}
      <div className="tb-line">
        <button className="btn sm ghost ctl-add-cond" onClick={() => onChange([...conds, newCond(defaultField)])}>
          {conds.length ? "+ And…" : "+ Only if…"}
        </button>
      </div>
    </>
  );
}

function ControlEditor({ initial, onDone }: { initial: ControlDef | null; onDone(): void }) {
  const fieldDefs = useDb((s) => s.fieldDefs);
  const leaves = leafFields(fieldDefs);
  const [c, setC] = useState<ControlDef>(initial ?? {
    id: uid(), label: "", fields: [], confirm: false,
    steps: [valueStep(leaves.find((d) => d.type === "money"))],
  });
  const setStep = (i: number, s: ControlStep) => setC({ ...c, steps: c.steps.map((x, j) => (j === i ? s : x)) });
  const toggleField = (key: string) => setC({ ...c, fields: c.fields.includes(key) ? c.fields.filter((k) => k !== key) : [...c.fields, key] });
  const ok = !!c.label.trim() && c.steps.length > 0;

  const save = () => { if (ok) { useDb.getState().saveControl({ ...c, label: c.label.trim() }); onDone(); } };
  const remove = async () => {
    if (await ask(`Delete the control “${c.label}”?`, { title: "Delete control", kind: "warning" })) { useDb.getState().deleteControl(c.id); onDone(); }
  };

  return (
    <Dialog title={initial ? "Edit control" : "New control"} onClose={onDone}
      footer={<>
        {initial && <button className="btn danger" onClick={remove}>Delete</button>}
        <span className="spacer" />
        <button className="btn" onClick={onDone}>Cancel</button>
        <button className="btn primary" onClick={save} disabled={!ok}>{initial ? "Save" : "Add control"}</button>
      </>}>
      <div className="tb-preview">
        <div className="tb-formula">When <b>{c.label.trim() || "this button"}</b> is clicked:</div>
        {c.steps.length ? c.steps.map((s, i) => <div key={i} className="tb-formula dim">{i + 1}. {describeStep(s, fieldDefs)}</div>)
          : <div className="tb-formula dim">Nothing yet. Add a step below.</div>}
      </div>
      {controlUsesDeletedField(c, fieldDefs) && <div className="tb-warn">⚠ This control uses a field that was deleted. Pick another field or remove that step.</div>}
      <input className="input" placeholder="Button name (e.g. Paid this month)" value={c.label} onChange={(e) => setC({ ...c, label: e.target.value })} autoFocus />

      <div className="tb-row">
        <span className="label">Show the button next to</span>
        <div className="ctl-fields">
          {fieldDefs.map((d) => (
            <button key={d.key} className={`chip ${c.fields.includes(d.key) ? "on" : ""}`} onClick={() => toggleField(d.key)}>{d.label}</button>
          ))}
        </div>
        {c.fields.length === 0 && <span className="tb-hint">Pick at least one field, or the button won't show anywhere.</span>}
      </div>

      <div className="tb-row">
        <span className="label">When clicked</span>
        {c.steps.map((s, i) => (
          <div key={i} className="ctl-step">
            <div className="tb-line">
              <span className="ctl-n mono">{i + 1}</span>
              <div className="seg">
                <button className={s.kind === "value" ? "on" : ""} onClick={() => s.kind !== "value" && setStep(i, { ...valueStep(leaves.find((d) => d.type === "money")), when: s.when })}>Change a value</button>
                <button className={s.kind === "look" ? "on" : ""} onClick={() => s.kind !== "look" && setStep(i, { kind: "look", field: c.fields[0] ?? fieldDefs[0]?.key ?? "", op: "dim", when: s.when })}>Grey out / hide</button>
              </div>
              <span className="spacer" />
              <button className="icon-btn danger" title="Remove step" onClick={() => setC({ ...c, steps: c.steps.filter((_, j) => j !== i) })}>✕</button>
            </div>
            {s.kind === "value"
              ? <ValueStepEditor step={s} leaves={leaves} onChange={(x) => setStep(i, x)} />
              : <LookStepEditor step={s} fields={fieldDefs} onChange={(x) => setStep(i, x)} />}
            <CondsEditor conds={s.when ?? []} leaves={leaves} onChange={(when) => setStep(i, { ...s, when: when.length ? when : undefined })}
              // Default to checking the field this step changes, when it's a plain value.
              defaultField={leaves.find((d) => d.key === s.field) ?? leaves.find((d) => d.type === "money")} />
          </div>
        ))}
        <div className="tb-line">
          <button className="btn sm ghost" onClick={() => setC({ ...c, steps: [...c.steps, valueStep(leaves.find((d) => d.type === "date"))] })}>+ Add a step</button>
          {c.steps.length > 1 && <span className="tb-hint">Steps run top to bottom.</span>}
        </div>
      </div>

      <label className="sec-ack">
        <input type="checkbox" checked={c.confirm} onChange={(e) => setC({ ...c, confirm: e.target.checked })} />
        Ask before running
      </label>
    </Dialog>
  );
}

/** The built-in "You owe" control: money and number fields added or subtracted, like a total's steps but per bill. */
function OweEditor({ onDone }: { onDone(): void }) {
  const fieldDefs = useDb((s) => s.fieldDefs);
  const selectedId = useUi((s) => s.selectedId);
  const bill = useDb((s) => s.bills.find((b) => b.id === selectedId));
  const numeric = leafFields(fieldDefs).filter(isNumeric);
  const [terms, setTerms] = useState<OweTerm[]>(useDb.getState().owe);
  const setTerm = (i: number, t: OweTerm) => setTerms(terms.map((x, j) => (j === i ? t : x)));
  const next = numeric.find((d) => !terms.some((t) => t.field === d.key)) ?? numeric[0];
  const value = bill ? oweAmount(bill, terms) : null;
  const save = () => { useDb.getState().setOwe(terms); onDone(); };

  return (
    <Dialog title="You owe" onClose={onDone}
      footer={<>
        <button className="btn" onClick={() => setTerms(DEFAULT_OWE)}>Reset to default</button>
        <span className="spacer" />
        <button className="btn" onClick={onDone}>Cancel</button>
        <button className="btn primary" onClick={save}>Save</button>
      </>}>
      <div className="tb-preview">
        <div className="tb-formula">You owe = {describeOwe(terms, fieldDefs)}</div>
        {bill && <div className="tb-formula">= <b>{value === null ? "—" : formatCents(value)}</b> <span className="dim">on this bill</span></div>}
      </div>
      {oweUsesDeletedField(terms, fieldDefs) && <div className="tb-warn">⚠ This uses a field that was deleted. Pick another field or remove that line.</div>}
      <span className="tb-hint">This control has no button. It sets which values add up to the You owe amount in the viewer. Blank values count as $0.</span>
      <div className="tb-row">
        {terms.map((t, i) => (
          <div key={i} className="tb-line">
            <div className="tb-op">
              <button className={`btn ${t.sign === "+" ? "on" : ""}`} title="add" onClick={() => setTerm(i, { ...t, sign: "+" })}>+</button>
              <button className={`btn ${t.sign === "-" ? "on" : ""}`} title="subtract" onClick={() => setTerm(i, { ...t, sign: "-" })}>−</button>
            </div>
            <select className="input" value={t.field} onChange={(e) => setTerm(i, { ...t, field: e.target.value })}>
              <DeletedOption known={numeric.some((d) => d.key === t.field)} value={t.field} />
              {numeric.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            <span className="spacer" />
            <button className="icon-btn danger" title="Remove" onClick={() => setTerms(terms.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        {terms.length === 0 && <span className="tb-hint">Nothing adds up to You owe, so it shows —.</span>}
        <div className="tb-line">
          <button className="btn sm" disabled={!next} onClick={() => next && setTerms([...terms, { sign: terms.length ? "-" : "+", field: next.key }])}>+ Add a field (+ −)</button>
        </div>
      </div>
    </Dialog>
  );
}

/** List of controls; pick one to edit or start a new one. */
export function ControlsDialog({ onClose }: { onClose(): void }) {
  const controls = useDb((s) => s.controls);
  const fieldDefs = useDb((s) => s.fieldDefs);
  const owe = useDb((s) => s.owe);
  const [editing, setEditing] = useState<ControlDef | "new" | "owe" | null>(null);
  if (editing === "owe") return <OweEditor onDone={() => setEditing(null)} />;
  if (editing) return <ControlEditor initial={editing === "new" ? null : editing} onDone={() => setEditing(null)} />;
  const label = (k: string) => fieldDefs.find((d) => d.key === k)?.label;
  return (
    <Dialog title="Controls" onClose={onClose}
      footer={<><span className="spacer" /><button className="btn primary" onClick={() => setEditing("new")}>+ New control</button></>}>
      <span className="tb-hint">Controls are buttons in the viewer, next to the fields you pick. Clicking one changes this bill's values (e.g. subtract a payment and move the due date a month ahead) or greys out / hides fields. The built-in <b>You owe</b> control has no button; it sets which values add up to You owe.</span>
      <div className="ctl-list">
        <button className={`ctl-item ${oweUsesDeletedField(owe, fieldDefs) ? "broken" : ""}`} onClick={() => setEditing("owe")}>
          <span className="ctl-btn">{oweUsesDeletedField(owe, fieldDefs) && <span className="flag">⚠ </span>}You owe</span>
          <span className="ctl-sub">Built in · no button</span>
          <span className="ctl-sub">You owe = {describeOwe(owe, fieldDefs)}</span>
        </button>
        {controls.map((c) => {
          const broken = controlUsesDeletedField(c, fieldDefs);
          const where = c.fields.map(label).filter(Boolean).join(", ") || "not shown anywhere";
          return (
            <button key={c.id} className={`ctl-item ${broken ? "broken" : ""}`} onClick={() => setEditing(c)}>
              <span className="ctl-btn">{broken && <span className="flag">⚠ </span>}{c.label}</span>
              <span className="ctl-sub">Next to {where}</span>
              <span className="ctl-sub">{c.steps.map((s) => describeStep(s, fieldDefs)).join(" → ")}</span>
            </button>
          );
        })}
      </div>
    </Dialog>
  );
}
