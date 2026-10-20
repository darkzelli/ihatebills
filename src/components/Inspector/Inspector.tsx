// Details for the selected bill, grouped into collapsible, reorderable sections.
import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ask } from "@tauri-apps/plugin-dialog";
import { useMemo, useState } from "react";
import { billTitle, formatDate } from "../../lib/format";
import { controlUsesField } from "../../lib/controls";
import { formatCents } from "../../lib/money";
import { scheduleByDay } from "../../lib/schedule";
import { totalFields } from "../../lib/totals";
import { sortedCategories, useDb } from "../../store/db";
import { type SectionId, useUi } from "../../store/ui";
import { fieldKeys } from "../../fields";
import type { Bill, FieldDef, FieldType, PartType } from "../../types";
import { PaneHead } from "../ui/PaneHead";
import { TrashIcon } from "../ui/TrashIcon";
import { Attachments } from "./Attachments";
import { StatusPill } from "../ui/StatusPill";
import { FieldInput, ScheduleToggle } from "./FieldEditor";
import { Section } from "./Section";
import { StatusDialog } from "./StatusDialog";

const PART_TYPES: { t: PartType; label: string }[] = [
  { t: "text", label: "Text" }, { t: "money", label: "Money" }, { t: "number", label: "Number" }, { t: "date", label: "Date" },
];
const TYPES: { t: FieldType; label: string }[] = [...PART_TYPES, { t: "combined", label: "Combined" }];

/** One value input, with the schedule toggle beside it for dates. */
function ValueCell({ bill, def, onEditStatuses }: { bill: Bill; def: FieldDef; onEditStatuses(): void }) {
  const setValue = useDb((s) => s.setValue);
  const input = <FieldInput def={def} value={bill.values[def.key]} onChange={(v) => setValue(bill.id, def.key, v)} onEditStatuses={onEditStatuses} />;
  if (def.type !== "date") return input;
  return (
    <div className="date-cell">
      {input}
      <ScheduleToggle on={!!bill.scheduled?.includes(def.key)} onToggle={() => useDb.getState().toggleScheduled(bill.id, def.key)} />
    </div>
  );
}

function FieldRow({ bill, def, first, last, onEditStatuses }: { bill: Bill; def: FieldDef; first: boolean; last: boolean; onEditStatuses(): void }) {
  const [renaming, setRenaming] = useState(false);
  const { renameField, deleteField, moveField } = useDb.getState();
  const remove = async () => {
    const { totals, filters, controls, owe } = useDb.getState();
    const keys = fieldKeys(def);
    const usedBy = [
      ...totals.filter((t) => totalFields(t).some((k) => keys.includes(k))).map((t) => `• Total: ${t.label}`),
      ...filters.filter((f) => f.conditions.some((w) => keys.includes(w.field))).map((f) => `• Filter: ${f.label}`),
      ...controls.filter((c) => controlUsesField(c, def)).map((c) => `• Control: ${c.label}`),
      ...(owe.some((t) => keys.includes(t.field)) ? ["• Control: You owe"] : []),
    ];
    const msg = `Delete the field “${def.label}”? Its value is removed from every bill.`
      + (usedBy.length ? `\n\nThese use it and will be flagged until you edit them:\n${usedBy.join("\n")}` : "");
    if (await ask(msg, { title: "Delete field", kind: "warning", okLabel: "Delete" })) deleteField(def.key);
  };
  return (
    <div className="field">
      {renaming ? (
        <input className="input" autoFocus defaultValue={def.label}
          onBlur={(e) => { renameField(def.key, e.target.value.trim() || def.label); setRenaming(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(false); }} />
      ) : <label onDoubleClick={() => !def.builtin && setRenaming(true)}>{def.label}</label>}
      {def.type === "combined" ? (
        <div className="combo-cell">
          {(def.parts ?? []).map((p) => (
            <div key={p.key} className="combo-part">
              <span className="combo-label">{p.label}</span>
              <ValueCell bill={bill} def={{ ...p, builtin: false, group: def.group }} onEditStatuses={onEditStatuses} />
            </div>
          ))}
        </div>
      ) : <ValueCell bill={bill} def={def} onEditStatuses={onEditStatuses} />}
      <span className="field-actions">
        <button className="icon-btn" title="Move up" disabled={first} onClick={() => moveField(def.key, -1)}>↑</button>
        <button className="icon-btn" title="Move down" disabled={last} onClick={() => moveField(def.key, 1)}>↓</button>
        {!def.builtin && <button className="icon-btn" title="Rename field" onClick={() => setRenaming(true)}>✎</button>}
        <button className="icon-btn danger" title="Delete field" onClick={remove}>✕</button>
      </span>
    </div>
  );
}

const DEFAULT_PARTS: { label: string; type: PartType }[] = [{ label: "Amount", type: "money" }, { label: "Date", type: "date" }];

function AddField() {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const [parts, setParts] = useState(DEFAULT_PARTS);
  const combined = type === "combined";
  const ok = !!label.trim() && (!combined || (parts.length > 0 && parts.every((p) => p.label.trim())));
  const add = () => {
    if (!ok) return;
    useDb.getState().addField(label.trim(), type, combined ? parts.map((p) => ({ ...p, label: p.label.trim() })) : undefined);
    setLabel("");
    setParts(DEFAULT_PARTS);
  };
  const setPart = (i: number, p: Partial<(typeof parts)[number]>) => setParts(parts.map((x, j) => (j === i ? { ...x, ...p } : x)));
  return (
    <div className="add-field">
      <input className="input" placeholder="New field name…" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
      <div className="seg">{TYPES.map((x) => <button key={x.t} className={type === x.t ? "on" : ""} onClick={() => setType(x.t)}>{x.label}</button>)}</div>
      {combined && (
        <div className="add-parts">
          <span className="tb-hint">Parts of this field — each one can be used in totals, filters and the schedule.</span>
          {parts.map((p, i) => (
            <div key={i} className="add-part">
              <input className="input" placeholder="Part name…" value={p.label} onChange={(e) => setPart(i, { label: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
              <div className="seg">{PART_TYPES.map((x) => <button key={x.t} className={p.type === x.t ? "on" : ""} onClick={() => setPart(i, { type: x.t })}>{x.label}</button>)}</div>
              <button className="icon-btn danger" title="Remove part" disabled={parts.length === 1} onClick={() => setParts(parts.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <button className="btn sm ghost" style={{ alignSelf: "flex-start" }} onClick={() => setParts([...parts, { label: "", type: "text" }])}>+ Add part</button>
        </div>
      )}
      <button className="btn sm primary" onClick={add} disabled={!ok}>Add field</button>
    </div>
  );
}

/** Everything on the schedule for one day; click an entry to open that bill. */
function DayView({ date }: { date: string }) {
  const bills = useDb((s) => s.bills);
  const fieldDefs = useDb((s) => s.fieldDefs);
  const entries = useMemo(() => scheduleByDay(bills, fieldDefs).get(date) ?? [], [bills, fieldDefs, date]);
  const { select, selectDate } = useUi.getState();
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PaneHead pane="inspector" title="Inspector">
        <span className="insp-title">{formatDate(date)}</span>
        <span className="spacer" />
        <button className="icon-btn" title="Close this day" onClick={() => selectDate(null)}>✕</button>
      </PaneHead>
      <div className="scroll">
        {entries.length === 0 ? (
          <div className="empty"><span className="big">Nothing scheduled</span><span>Turn on the calendar icon next to a bill's date to show it on this day.</span></div>
        ) : (
          <div className="day-list">
            <span className="label">{entries.length} on this day</span>
            {entries.map(({ bill, field }) => {
              const v = bill.values;
              const sub = [v.memberName as string, v.claimNumber ? `#${v.claimNumber}` : null].filter(Boolean).join(" · ");
              return (
                <button key={`${bill.id}:${field.key}`} className="day-item" onClick={() => select(bill.id)} title="Open this bill">
                  <span className="day-item-title">{billTitle(bill)}</span>
                  <span className="day-item-amt" title="Your Responsibility">{typeof v.yourResponsibility === "number" ? formatCents(v.yourResponsibility) : "—"}</span>
                  <span className="day-item-field">{field.label}{sub && ` · ${sub}`}</span>
                  {v.status ? <StatusPill status={v.status as string} /> : <span />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function Inspector() {
  const selectedDate = useUi((s) => s.selectedDate);
  return selectedDate ? <DayView date={selectedDate} /> : <BillInspector />;
}

function BillInspector() {
  const selectedId = useUi((s) => s.selectedId);
  const bill = useDb((s) => s.bills.find((b) => b.id === selectedId));
  const fieldDefs = useDb((s) => s.fieldDefs);
  const removedFields = useDb((s) => s.removedFields);
  const categories = useDb((s) => s.categories);
  const order = useUi((s) => s.sectionOrder);
  const setOrder = useUi((s) => s.setSectionOrder);
  const [statusOpen, setStatusOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  if (!bill) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <PaneHead pane="inspector" title="Inspector"><span className="spacer" /></PaneHead>
        <div className="empty"><span className="big">No bill selected</span><span>Pick a bill on the list to see and edit its details.</span></div>
      </div>
    );
  }

  const remove = async () => {
    if (await ask(`Delete “${billTitle(bill)}” and its scans? This can't be undone.`, { title: "Delete bill", kind: "warning" })) {
      useDb.getState().deleteBill(bill.id);
      useUi.getState().select(null);
    }
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    setOrder(arrayMove(order, order.indexOf(active.id as SectionId), order.indexOf(over.id as SectionId)));
  };

  const fieldsIn = (g: SectionId) => fieldDefs.filter((f) => f.group === g);
  const fieldRows = (g: SectionId) => fieldsIn(g).map((f, i, all) => (
    <FieldRow key={f.key} bill={bill} def={f} first={i === 0} last={i === all.length - 1} onEditStatuses={() => setStatusOpen(true)} />
  ));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PaneHead pane="inspector" title="Inspector">
        <span className="insp-title">{billTitle(bill)}</span>
        <span className="spacer" />
        <select className="input" style={{ height: 26, maxWidth: 160 }} value={bill.categoryId ?? ""} title="Category"
          onChange={(e) => { const c = e.target.value || null; useDb.getState().moveBill(bill.id, c, Infinity); }}>
          <option value="">Uncategorized</option>
          {sortedCategories(categories).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button className="icon-btn danger" title="Delete bill" onClick={remove}><TrashIcon /></button>
      </PaneHead>
      {error && <div className="error-bar"><span className="spacer">{error}</span><button className="icon-btn" onClick={() => setError(null)}>✕</button></div>}
      <div className="scroll">
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={order} strategy={verticalListSortingStrategy}>
            {order.map((id) => id === "Attachments" ? (
              <Section key={id} id={id} title="Scans" extra={bill.attachments.length || undefined}>
                <Attachments bill={bill} onError={setError} />
              </Section>
            ) : id === "Custom" ? (
              <Section key={id} id={id} title="Custom fields" extra={fieldsIn(id).length || undefined}>
                {fieldRows(id)}
                {fieldsIn(id).length === 0 && <span className="tb-hint">Add your own fields. They show up on every bill and can be used in totals.</span>}
                <AddField />
                {removedFields.length > 0 && (
                  <button className="btn sm ghost" onClick={() => useDb.getState().restoreDefaultFields()}>
                    Restore {removedFields.length} deleted default field{removedFields.length === 1 ? "" : "s"}
                  </button>
                )}
              </Section>
            ) : (
              fieldsIn(id).length > 0 && <Section key={id} id={id} title={id}>
                {fieldRows(id)}
              </Section>
            ))}
          </SortableContext>
        </DndContext>
      </div>
      {statusOpen && <StatusDialog onClose={() => setStatusOpen(false)} />}
    </div>
  );
}
