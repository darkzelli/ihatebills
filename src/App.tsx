import { ask } from "@tauri-apps/plugin-dialog";
import { Fragment, useEffect } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { BillList } from "./components/BillList/BillList";
import { Inspector } from "./components/Inspector/Inspector";
import { ThemeToggle } from "./components/ThemeToggle";
import { TotalsBar } from "./components/Totals/TotalsBar";
import { Viewer } from "./components/Viewer/Viewer";
import { billTitle } from "./lib/format";
import { useDb } from "./store/db";
import type { DockNode, TabsNode } from "./lib/dock";
import { PANE_TITLES, type PaneId, useLayout } from "./store/layout";
import { useUi } from "./store/ui";

const PANES: Record<PaneId, () => React.ReactElement> = {
  list: () => <BillList />,
  inspector: () => <Inspector />,
  viewer: () => <Viewer />,
  totals: () => <TotalsBar />,
};

function TabGroup({ node }: { node: TabsNode }) {
  const max = useLayout((s) => s.maximized === node.active);
  const draggingPane = useLayout((s) => s.drag?.pane);
  const { startDrag, activate } = useLayout.getState();
  return (
    <div className="dock-group" data-node={node.id}>
      {node.panes.length > 1 && (
        <div className="tabbar">
          {node.panes.map((p) => (
            <button key={p} className={`tab ${p === node.active ? "on" : ""} ${draggingPane === p ? "tab-dragging" : ""}`}
              onPointerDown={(e) => startDrag(p, e, () => activate(node.id, p))} title="Drag to move this tab">
              {PANE_TITLES[p]}
            </button>
          ))}
        </div>
      )}
      <div key={node.active} className={`pane ${max ? "pane-max" : ""} ${draggingPane === node.active ? "pane-dragging" : ""}`}>
        {PANES[node.active]()}
      </div>
    </div>
  );
}

function DockView({ node }: { node: DockNode }) {
  if (node.type === "tabs") return <TabGroup node={node} />;
  const vertical = node.dir === "col";
  // Keyed on the children so a structural change remounts with the stored sizes.
  return (
    <PanelGroup key={node.children.map((c) => c.id).join()} direction={vertical ? "vertical" : "horizontal"}
      onLayout={(sizes) => useLayout.getState().saveSizes(node.id, sizes)}>
      {node.children.map((c, i) => (
        <Fragment key={c.id}>
          {i > 0 && <PanelResizeHandle className={`resize-handle ${vertical ? "v" : "h"}`} />}
          <Panel id={c.id} order={i} defaultSize={node.sizes[i]} minSize={8}><DockView node={c} /></Panel>
        </Fragment>
      ))}
    </PanelGroup>
  );
}

/** Label that follows the cursor plus a dotted outline of where the pane will land. */
function DragGhost() {
  const drag = useLayout((s) => s.drag);
  if (!drag) return null;
  const h = drag.hint;
  return (
    <>
      {h && <div className="drop-hint" style={h.rect}><span>{h.label}</span></div>}
      <div className="drag-ghost" style={{ left: drag.x + 12, top: drag.y + 12 }}>⠿ {PANE_TITLES[drag.pane]}</div>
    </>
  );
}

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Bill ids in the order they appear on screen (skips collapsed groups). */
function visibleBillIds() {
  return [...document.querySelectorAll<HTMLElement>("[data-bill]")].map((el) => el.dataset.bill!);
}

export default function App() {
  const loaded = useDb((s) => s.loaded);
  const error = useDb((s) => s.error);
  const dragging = useLayout((s) => !!s.drag);
  const tree = useLayout((s) => s.tree);

  useEffect(() => { useDb.getState().load(); }, []);

  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      if (document.querySelector(".scrim")) return;
      if (e.key === "Escape" && useLayout.getState().maximized) { useLayout.setState({ maximized: null }); return; }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "n") {
        e.preventDefault();
        useUi.getState().select(useDb.getState().addBill(null));
        return;
      }
      if (typing(e.target)) return;
      const { selectedId, select } = useUi.getState();
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        const ids = visibleBillIds();
        if (!ids.length) return;
        e.preventDefault();
        const i = selectedId ? ids.indexOf(selectedId) : -1;
        const next = ids[Math.max(0, Math.min(ids.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))];
        select(next);
        document.querySelector(`[data-bill="${next}"]`)?.scrollIntoView({ block: "nearest" });
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        const b = useDb.getState().bills.find((x) => x.id === selectedId);
        if (b && await ask(`Delete “${billTitle(b)}” and its scans? This can't be undone.`, { title: "Delete bill", kind: "warning" })) {
          useDb.getState().deleteBill(b.id);
          select(null);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <div className="topbar">
        <span className="brand">i<b>hate</b>bills</span>
        <span className="spacer" />
        <button className="btn sm ghost" onClick={() => useLayout.getState().resetLayout()} title="Put the panels back where they started">Reset layout</button>
        <ThemeToggle />
      </div>
      <div>
        {error && <div className="error-bar"><span className="spacer">{error}</span><button className="icon-btn" onClick={() => useDb.setState({ error: null })}>✕</button></div>}
      </div>
      <div className={`workspace ${dragging ? "workspace-dragging" : ""}`}>
        {loaded && (
          <DockView node={tree} />
        )}
      </div>
      <DragGhost />
    </div>
  );
}
