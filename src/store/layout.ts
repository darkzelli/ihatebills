// Dock layout: a tree of splits and tab groups (see lib/dock). Drag a pane's grip
// or tab onto another group to make it a tab, onto a group's edge to split it, or
// onto the workspace edge to dock it full-width/height. Survives restarts.
import { create } from "zustand";
import { activate, addMissingPanes, canDrop, DEFAULT_TREE, DOCK_SIZE, type DockNode, type DropTarget, type Edge, isValid, movePane, type PaneId } from "../lib/dock";

export type { PaneId } from "../lib/dock";

const KEY = "ihatebills.layout.tree.v1";
const LEGACY = ["ihatebills.layout.slots.v3"];

function load(): DockNode {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (isValid(v)) return v;
    const upgraded = v && addMissingPanes(v);
    if (isValid(upgraded)) return upgraded;
  } catch { /* storage unavailable */ }
  return structuredClone(DEFAULT_TREE); // saveSizes mutates in place
}
function save(tree: DockNode) {
  try { localStorage.setItem(KEY, JSON.stringify(tree)); } catch { /* ignore */ }
}

export const PANE_TITLES: Record<PaneId, string> = { list: "Bills", inspector: "Inspector", viewer: "Viewer", totals: "Totals", schedule: "Schedule" };

/** Outline of the space a dropped pane would take, in viewport px. */
export interface DropHint { target: DropTarget; rect: { left: number; top: number; width: number; height: number }; label: string }

interface LayoutState {
  tree: DockNode;
  maximized: PaneId | null;
  drag: { pane: PaneId; x: number; y: number; hint: DropHint | null } | null;
  startDrag(pane: PaneId, e: React.PointerEvent, onClick?: () => void): void;
  activate(node: string, pane: PaneId): void;
  /** Remember split sizes without re-rendering (they're only read when a group remounts). */
  saveSizes(node: string, sizes: number[]): void;
  toggleMax(p: PaneId): void;
  resetLayout(): void;
}

/** Pixels from the workspace border that dock along the whole edge instead of splitting one group. */
const DOCK_BAND = 18;
const EDGE_LABEL: Record<Edge, string> = { left: "left", right: "right", top: "top", bottom: "bottom" };

function hitTest(tree: DockNode, pane: PaneId, x: number, y: number): DropHint | null {
  const ws = document.querySelector<HTMLElement>(".workspace")?.getBoundingClientRect();
  if (!ws || x < ws.left || x > ws.right || y < ws.top || y > ws.bottom) return null;

  const wsEdge = ([["left", x - ws.left], ["right", ws.right - x], ["top", y - ws.top], ["bottom", ws.bottom - y]] as [Edge, number][])
    .filter(([, d]) => d < DOCK_BAND).sort((a, b) => a[1] - b[1])[0]?.[0];
  if (wsEdge) {
    const target: DropTarget = { kind: "dock", edge: wsEdge };
    if (!canDrop(tree, pane, target)) return null;
    const f = DOCK_SIZE / 100;
    const rect = { left: ws.left, top: ws.top, width: ws.width, height: ws.height };
    if (wsEdge === "left" || wsEdge === "right") rect.width = ws.width * f;
    else rect.height = ws.height * f;
    if (wsEdge === "right") rect.left = ws.right - rect.width;
    if (wsEdge === "bottom") rect.top = ws.bottom - rect.height;
    return { target, rect, label: `Dock ${EDGE_LABEL[wsEdge]}` };
  }

  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-node]");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const node = el.dataset.node!;
  // Outer band of each group splits it (nearest edge wins); the middle adds a tab.
  const tx = Math.min(r.width * 0.3, 140);
  const ty = Math.min(r.height * 0.3, 140);
  const edge = ([["left", (x - r.left) / tx], ["right", (r.right - x) / tx], ["top", (y - r.top) / ty], ["bottom", (r.bottom - y) / ty]] as [Edge, number][])
    .filter(([, d]) => d < 1).sort((a, b) => a[1] - b[1])[0]?.[0];
  const target: DropTarget = edge ? { kind: "split", node, edge } : { kind: "tab", node };
  if (!canDrop(tree, pane, target)) return null;
  const rect = { left: r.left, top: r.top, width: r.width, height: r.height };
  if (edge === "left" || edge === "right") rect.width /= 2;
  if (edge === "top" || edge === "bottom") rect.height /= 2;
  if (edge === "right") rect.left += rect.width;
  if (edge === "bottom") rect.top += rect.height;
  return { target, rect, label: edge ? `Split ${EDGE_LABEL[edge]}` : "Add as tab" };
}

export const useLayout = create<LayoutState>((set, get) => ({
  tree: load(),
  maximized: null,
  drag: null,
  startDrag(pane, e, onClick) {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY;
    let started = false;
    const move = (ev: PointerEvent) => {
      // Small threshold so clicking a tab still just switches to it.
      if (!started && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4) return;
      started = true;
      set({ maximized: null, drag: { pane, x: ev.clientX, y: ev.clientY, hint: hitTest(get().tree, pane, ev.clientX, ev.clientY) } });
    };
    const end = (ev: Event) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("keydown", key);
      const hint = get().drag?.hint;
      set({ drag: null });
      if (!started) { if (ev.type === "pointerup") onClick?.(); return; }
      if (ev.type !== "pointerup" || !hint) return;
      const tree = movePane(get().tree, pane, hint.target);
      save(tree);
      set({ tree });
    };
    const key = (ev: KeyboardEvent) => { if (ev.key === "Escape") end(ev); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("keydown", key);
  },
  activate(node, pane) {
    const tree = activate(get().tree, node, pane);
    save(tree);
    set({ tree });
  },
  saveSizes(node, sizes) {
    const walk = (n: DockNode) => {
      if (n.type !== "split") return;
      if (n.id === node && sizes.length === n.children.length) n.sizes = sizes;
      n.children.forEach(walk);
    };
    walk(get().tree);
    save(get().tree);
  },
  toggleMax(p) { set({ maximized: get().maximized === p ? null : p }); },
  resetLayout() {
    try {
      for (const k of [KEY, ...LEGACY]) localStorage.removeItem(k);
      for (const k of Object.keys(localStorage)) if (k.startsWith("react-resizable-panels:ihatebills")) localStorage.removeItem(k);
    } catch { /* ignore */ }
    location.reload();
  },
}));
