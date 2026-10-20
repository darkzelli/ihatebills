// Totals pane: cards wrap into a grid that scrolls down; a pane too short for two rows becomes a single
// strip that scrolls sideways. Click a card to edit it; drag ⠿ to reorder.
import { closestCenter, DndContext, type DragEndEvent, type Modifier, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, horizontalListSortingStrategy, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState } from "react";
import { formatCents, formatNumber } from "../../lib/money";
import { evaluate, formula, usesDeletedField } from "../../lib/totals";
import { leafFields } from "../../fields";
import { useDb } from "../../store/db";
import type { TotalDef } from "../../types";
import { PaneHead } from "../ui/PaneHead";
import { TotalBuilder } from "./TotalBuilder";

/** Cards only slide left/right while dragging. */
const horizontalOnly: Modifier = ({ transform }) => ({ ...transform, y: 0 });

function Card({ t, onEdit }: { t: TotalDef; onEdit(): void }) {
  const bills = useDb((s) => s.bills);
  const fields = useDb((s) => leafFields(s.fieldDefs));
  const catName = useDb((s) => (t.categoryId ? s.categories.find((c) => c.id === t.categoryId)?.name : null));
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: t.id });
  const v = evaluate(t, bills);
  const shown = Number.isNaN(v) ? "—" : t.format === "money" ? formatCents(v) : formatNumber(v);
  const desc = formula(t, fields) + (catName ? ` · ${catName}` : "");
  const broken = usesDeletedField(t, fields);
  return (
    <div ref={setNodeRef} className={`total-card ${isDragging ? "dragging" : ""} ${broken ? "broken" : ""}`} onClick={onEdit}
      title={`${broken ? "Uses a deleted field. Click to fix.\n" : ""}${desc}\nClick to edit`}
      style={{ transform: CSS.Translate.toString(transform), transition }}>
      <span className="grip" onClick={(e) => e.stopPropagation()} {...attributes} {...listeners}>⠿</span>
      <span className="label">{broken && <span className="flag" aria-label="Uses a deleted field">⚠ </span>}{t.label}</span>
      <span className={`value ${v < 0 ? "neg" : ""}`}>{shown}</span>
      <span className="desc">{desc}</span>
    </div>
  );
}

export function TotalsBar() {
  const totals = useDb((s) => s.totals);
  const [editing, setEditing] = useState<TotalDef | "new" | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const ids = totals.map((t) => t.id);
    useDb.getState().reorderTotals(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  // Short pane (room for only one row of cards) → horizontal strip; anything taller → wrapping grid that
  // scrolls down. Measured on the strip's border box, which a scrollbar appearing doesn't change, so the
  // layout can't flip back and forth.
  const strip = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(true);
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const check = () => {
      const card = el.querySelector<HTMLElement>(".total-card")?.offsetHeight || 64;
      const cs = getComputedStyle(el);
      const room = el.getBoundingClientRect().height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      setWide(room < card * 2 + parseFloat(cs.rowGap || "8"));
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [totals.length]);
  // In the strip, a plain mouse wheel scrolls sideways.
  useEffect(() => {
    const el = strip.current;
    if (!el || !wide) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [wide]);
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PaneHead pane="totals" title="Totals">
        <button className="btn sm ghost" onClick={() => setEditing("new")}>+ Total</button>
        <span className="spacer" />
      </PaneHead>
      <div className={`totals ${wide ? "" : "wrap"}`} ref={strip}>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
          modifiers={wide ? [horizontalOnly] : []} autoScroll={{ threshold: wide ? { x: 0.2, y: 0 } : { x: 0, y: 0.2 } }}>
          <SortableContext items={totals.map((t) => t.id)} strategy={wide ? horizontalListSortingStrategy : rectSortingStrategy}>
            {totals.map((t) => <Card key={t.id} t={t} onEdit={() => setEditing(t)} />)}
          </SortableContext>
        </DndContext>
      </div>
      {editing && <TotalBuilder initial={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
