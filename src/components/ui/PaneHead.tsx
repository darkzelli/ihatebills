import type { ReactNode } from "react";
import { type PaneId, useLayout } from "../../store/layout";

/** Header for a layout pane: drag the grip to tab, split or dock it, double-click or ⤢ to maximise. */
export function PaneHead({ pane, title, children }: { pane: PaneId; title?: ReactNode; children?: ReactNode }) {
  const max = useLayout((s) => s.maximized === pane);
  const toggleMax = useLayout((s) => s.toggleMax);
  const startDrag = useLayout((s) => s.startDrag);
  return (
    <div className="panel-head" onDoubleClick={(e) => { if (e.target === e.currentTarget) toggleMax(pane); }}>
      <span className="pane-grip" onPointerDown={(e) => startDrag(pane, e)} title="Drag to another panel: middle adds a tab, edges split, workspace border docks">⠿</span>
      {title && <span className="label">{title}</span>}
      {children}
      <button className="pane-max-btn" onClick={() => toggleMax(pane)}
        title={max ? "Restore (Esc)" : "Maximise (double-click the header)"}>{max ? "⤡" : "⤢"}</button>
    </div>
  );
}
