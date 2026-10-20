import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import { type SectionId, useUi } from "../../store/ui";

/** Collapsible inspector section (collapse state remembered); drag ⠿ to reorder sections. */
export function Section({ id, title, extra, children }: { id: SectionId; title: ReactNode; extra?: ReactNode; children: ReactNode }) {
  const collapsed = useUi((s) => !!s.collapsed[`sec:${id}`]);
  const toggle = useUi((s) => s.toggleCollapsed);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div ref={setNodeRef} className={`section ${isDragging ? "dragging" : ""}`} style={{ transform: CSS.Translate.toString(transform), transition }}>
      <div className="section-head" onClick={() => toggle(`sec:${id}`)}>
        <span className="grip" title="Drag to reorder sections" onClick={(e) => e.stopPropagation()} {...attributes} {...listeners}>⠿</span>
        <span className={`chev ${collapsed ? "closed" : ""}`}>▾</span>
        <span className="label">{title}</span>
        <span className="spacer" />
        {extra && <span className="mono dim" style={{ fontSize: 12 }} onClick={(e) => e.stopPropagation()}>{extra}</span>}
      </div>
      {!collapsed && <div className="section-body">{children}</div>}
    </div>
  );
}
