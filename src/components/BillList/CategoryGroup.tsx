import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ask } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { formatCents } from "../../lib/money";
import { useDb } from "../../store/db";
import { useUi } from "../../store/ui";
import type { Bill, Category } from "../../types";
import { TrashIcon } from "../ui/TrashIcon";
import { BillRow } from "./BillRow";

interface GroupProps {
  category: Category | null;
  bills: Bill[];
  collapsed: boolean;
  dragDisabled: boolean;
  hot?: boolean;
}

function owed(bills: Bill[]) {
  return bills.reduce((s, b) => s + (typeof b.values.yourResponsibility === "number" ? b.values.yourResponsibility : 0), 0);
}

/** The header + bill list for one category; `sortable` props come from the wrapper. */
function GroupView({ category, bills, collapsed, dragDisabled, hot, nodeRef, style, handle, className = "" }: GroupProps & {
  nodeRef?: (el: HTMLElement | null) => void; style?: React.CSSProperties; handle?: React.HTMLAttributes<HTMLSpanElement>; className?: string;
}) {
  const { toggleCategory, renameCategory, deleteCategory, addBill } = useDb.getState();
  const toggleUi = useUi((s) => s.toggleCollapsed);
  const select = useUi((s) => s.select);
  const [editing, setEditing] = useState(false);
  const name = category?.name ?? "Uncategorized";
  const toggle = () => (category ? toggleCategory(category.id) : toggleUi("cat:none"));

  const remove = async () => {
    if (!category) return;
    const ok = await ask(`Delete the category “${name}”? Its ${bills.length} bill(s) will move to Uncategorized.`, { title: "Delete category", kind: "warning" });
    if (ok) deleteCategory(category.id);
  };

  return (
    <div ref={nodeRef} style={style} className={`cat ${hot ? "cat-drop" : ""} ${className}`}>
      <div className="cat-head" onClick={toggle}>
        {category ? <span className="grip" title="Drag to reorder categories" onClick={(e) => e.stopPropagation()} {...handle}>⠿</span> : <span style={{ width: 18 }} />}
        <span className={`chev ${collapsed ? "closed" : ""}`}>▾</span>
        {editing && category ? (
          <input className="input cat-name-input" autoFocus defaultValue={name} onClick={(e) => e.stopPropagation()}
            onBlur={(e) => { renameCategory(category.id, e.target.value.trim() || name); setEditing(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(false); }} />
        ) : (
          <span className="cat-name" onDoubleClick={(e) => { e.stopPropagation(); if (category) setEditing(true); }}
            title={category ? "Double-click to rename" : undefined}>{name}</span>
        )}
        <span className="cat-count">{bills.length}</span>
        <span className="spacer" />
        <span className="cat-actions" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" title="Add a bill here" onClick={() => select(addBill(category?.id ?? null))}>＋</button>
          {category && <button className="icon-btn" title="Rename" onClick={() => setEditing(true)}>✎</button>}
          {category && <button className="icon-btn danger" title="Delete category" onClick={remove}><TrashIcon /></button>}
        </span>
        <span className="cat-sum" title="Your Responsibility in this category">{formatCents(owed(bills))}</span>
      </div>
      {!collapsed && (
        <SortableContext items={bills.map((b) => `b:${b.id}`)} strategy={verticalListSortingStrategy}>
          {bills.map((b) => <BillRow key={b.id} bill={b} disabled={dragDisabled} />)}
          {bills.length === 0 && <div className="cat-empty">Drag bills here</div>}
        </SortableContext>
      )}
    </div>
  );
}

export function SortableCategory(props: GroupProps & { category: Category }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `c:${props.category.id}`, disabled: props.dragDisabled });
  return (
    <GroupView {...props} nodeRef={setNodeRef} className={isDragging ? "dragging" : ""}
      style={{ transform: CSS.Translate.toString(transform), transition }} handle={{ ...attributes, ...listeners }} />
  );
}

export function UncategorizedGroup(props: Omit<GroupProps, "category">) {
  const { setNodeRef } = useDroppable({ id: "c:none" });
  return <GroupView {...props} category={null} nodeRef={setNodeRef} />;
}

/** Static copy shown under the cursor while a category is dragged. */
export function CategoryOverlay({ category, bills }: { category: Category; bills: Bill[] }) {
  return (
    <div className="cat-overlay">
      <div className="cat-head">
        <span className="grip">⠿</span><span className="chev closed">▾</span>
        <span className="cat-name">{category.name}</span><span className="cat-count">{bills.length}</span>
        <span className="spacer" /><span className="cat-sum">{formatCents(owed(bills))}</span>
      </div>
    </div>
  );
}
