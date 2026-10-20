// Details for the selected bill, grouped into collapsible, reorderable sections.
import { closestCenter, DndContext, type DragEndEvent, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { ask } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { billTitle } from "../../lib/format";
import { sortedCategories, useDb } from "../../store/db";
import { type SectionId, useUi } from "../../store/ui";
import type { Bill, FieldDef, FieldType } from "../../types";
import { PaneHead } from "../ui/PaneHead";
import { TrashIcon } from "../ui/TrashIcon";
import { Attachments } from "./Attachments";
import { FieldInput } from "./FieldEditor";
import { Section } from "./Section";
import { StatusDialog } from "./StatusDialog";

const TYPES: { t: FieldType; label: string }[] = [
  { t: "text", label: "Text" }, { t: "money", label: "Money" }, { t: "number", label: "Number" }, { t: "date", label: "Date" },
];

function FieldRow({ bill, def, onEditStatuses }: { bill: Bill; def: FieldDef; onEditStatuses(): void }) {
  const setValue = useDb((s) => s.setValue);
  const [renaming, setRenaming] = useState(false);
  const { renameField, deleteField } = useDb.getState();
  const remove = async () => {
    if (await ask(`Delete the field “${def.label}”? Its value is removed from every bill.`, { title: "Delete field", kind: "warning" })) deleteField(def.key);
  };
  return (
    <div className="field">
      {renaming ? (
        <input className="input" autoFocus defaultValue={def.label}
          onBlur={(e) => { renameField(def.key, e.target.value.trim() || def.label); setRenaming(false); }}
          onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(false); }} />
      ) : <label onDoubleClick={() => !def.builtin && setRenaming(true)}>{def.label}</label>}
      <FieldInput def={def} value={bill.values[def.key]} onChange={(v) => setValue(bill.id, def.key, v)} onEditStatuses={onEditStatuses} />
      <span className="field-actions">
        {!def.builtin && <>
          <button className="icon-btn" title="Rename field" onClick={() => setRenaming(true)}>✎</button>
          <button className="icon-btn danger" title="Delete field" onClick={remove}>✕</button>
        </>}
      </span>
    </div>
  );
}

function AddField() {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldType>("text");
  const add = () => { if (label.trim()) { useDb.getState().addField(label.trim(), type); setLabel(""); } };
  return (
    <div className="add-field">
      <input className="input" placeholder="New field name…" value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
      <div className="seg">{TYPES.map((x) => <button key={x.t} className={type === x.t ? "on" : ""} onClick={() => setType(x.t)}>{x.label}</button>)}</div>
      <button className="btn sm primary" onClick={add} disabled={!label.trim()}>Add field</button>
    </div>
  );
}

export function Inspector() {
  const selectedId = useUi((s) => s.selectedId);
  const bill = useDb((s) => s.bills.find((b) => b.id === selectedId));
  const fieldDefs = useDb((s) => s.fieldDefs);
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
                {fieldsIn(id).map((f) => <FieldRow key={f.key} bill={bill} def={f} onEditStatuses={() => setStatusOpen(true)} />)}
                {fieldsIn(id).length === 0 && <span className="tb-hint">Add your own fields. They show up on every bill and can be used in totals.</span>}
                <AddField />
              </Section>
            ) : (
              <Section key={id} id={id} title={id}>
                {fieldsIn(id).map((f) => <FieldRow key={f.key} bill={bill} def={f} onEditStatuses={() => setStatusOpen(true)} />)}
              </Section>
            ))}
          </SortableContext>
        </DndContext>
      </div>
      {statusOpen && <StatusDialog onClose={() => setStatusOpen(false)} />}
    </div>
  );
}
