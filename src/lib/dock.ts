// Dock layout tree: splits (rows/columns of children with % sizes) and tab groups
// (one or more panes, one shown). Pure functions; every op returns a new tree.

export type PaneId = "list" | "inspector" | "viewer" | "totals";
export type Edge = "left" | "right" | "top" | "bottom";

export interface TabsNode { type: "tabs"; id: string; panes: PaneId[]; active: PaneId }
export interface SplitNode { type: "split"; id: string; dir: "row" | "col"; children: DockNode[]; sizes: number[] }
export type DockNode = TabsNode | SplitNode;

/** Where a dragged pane lands: as a tab of a group, beside a group, or along a whole workspace edge. */
export type DropTarget =
  | { kind: "tab"; node: string }
  | { kind: "split"; node: string; edge: Edge }
  | { kind: "dock"; edge: Edge };

export const ALL_PANES: PaneId[] = ["totals", "list", "inspector", "viewer"];
/** Share of the workspace a pane docked along an edge takes. */
export const DOCK_SIZE = 30;

let seq = 0;
const uid = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export const tabs = (panes: PaneId[], id = uid("t")): TabsNode => ({ type: "tabs", id, panes, active: panes[0] });
export const split = (dir: "row" | "col", children: DockNode[], sizes: number[], id = uid("s")): SplitNode =>
  ({ type: "split", id, dir, children, sizes });

export const DEFAULT_TREE: DockNode = split("col", [
  tabs(["totals"], "t-totals"),
  split("row", [tabs(["list"], "t-list"), tabs(["inspector"], "t-insp"), tabs(["viewer"], "t-view")], [28, 34, 38], "s-cols"),
], [22, 78], "s-root");

const dirOf = (e: Edge) => (e === "left" || e === "right" ? "row" : "col");
const before = (e: Edge) => e === "left" || e === "top";

export function findTabs(n: DockNode, pred: (t: TabsNode) => boolean): TabsNode | null {
  if (n.type === "tabs") return pred(n) ? n : null;
  for (const c of n.children) { const f = findTabs(c, pred); if (f) return f; }
  return null;
}

export function panesIn(n: DockNode): PaneId[] {
  return n.type === "tabs" ? n.panes : n.children.flatMap(panesIn);
}

/** Every pane exactly once, every split with matching sizes. Guards against corrupt saved layouts. */
export function isValid(n: unknown): n is DockNode {
  const ok = (x: any): boolean =>
    x && typeof x.id === "string" && (
      (x.type === "tabs" && Array.isArray(x.panes) && x.panes.length > 0 && x.panes.includes(x.active)) ||
      (x.type === "split" && (x.dir === "row" || x.dir === "col") && Array.isArray(x.children) && x.children.length > 1 &&
        Array.isArray(x.sizes) && x.sizes.length === x.children.length && x.children.every(ok)));
  return ok(n) && panesIn(n as DockNode).sort().join() === [...ALL_PANES].sort().join();
}

/** Tidy after removals: drop empty groups, unwrap one-child splits, merge same-direction nested splits. */
function normalize(n: DockNode): DockNode | null {
  if (n.type === "tabs") return n.panes.length ? n : null;
  const kids: DockNode[] = [];
  const sizes: number[] = [];
  n.children.forEach((c, i) => {
    const k = normalize(c);
    if (!k) return;
    if (k.type === "split" && k.dir === n.dir) {
      const total = k.sizes.reduce((a, b) => a + b, 0);
      k.children.forEach((g, j) => { kids.push(g); sizes.push((n.sizes[i] * k.sizes[j]) / total); });
    } else { kids.push(k); sizes.push(n.sizes[i]); }
  });
  if (!kids.length) return null;
  if (kids.length === 1) return kids[0];
  const total = sizes.reduce((a, b) => a + b, 0);
  return { ...n, children: kids, sizes: sizes.map((s) => (s * 100) / total) };
}

function removePane(n: DockNode, pane: PaneId): DockNode {
  const strip = (x: DockNode): DockNode => {
    if (x.type === "split") return { ...x, children: x.children.map(strip) };
    if (!x.panes.includes(pane)) return x;
    const panes = x.panes.filter((p) => p !== pane);
    const i = x.panes.indexOf(pane);
    return { ...x, panes, active: x.active === pane ? panes[Math.min(i, panes.length - 1)] : x.active };
  };
  return normalize(strip(n))!;
}

/** Replace the node with `id` by whatever `fn` returns, passing its parent split (if any). */
function mapNode(n: DockNode, id: string, fn: (x: DockNode) => DockNode): DockNode {
  if (n.id === id) return fn(n);
  if (n.type === "tabs") return n;
  return { ...n, children: n.children.map((c) => mapNode(c, id, fn)) };
}

/** Whether dropping `pane` on `t` would change anything (a lone pane can't be dropped onto its own group). */
export function canDrop(root: DockNode, pane: PaneId, t: DropTarget): boolean {
  if (t.kind === "dock") return panesIn(root).length > 1;
  const node = findTabs(root, (x) => x.id === t.node);
  if (!node) return false;
  if (!node.panes.includes(pane)) return true;
  return t.kind === "split" && node.panes.length > 1;
}

export function movePane(root: DockNode, pane: PaneId, t: DropTarget): DockNode {
  if (!canDrop(root, pane, t)) return root;
  const tree = removePane(root, pane);
  const fresh = tabs([pane]);

  if (t.kind === "tab") {
    return mapNode(tree, t.node, (x) => x.type === "tabs" ? { ...x, panes: [...x.panes, pane], active: pane } : x);
  }

  if (t.kind === "dock") {
    const dir = dirOf(t.edge);
    if (tree.type === "split" && tree.dir === dir) {
      const scaled = tree.sizes.map((s) => (s * (100 - DOCK_SIZE)) / 100);
      return before(t.edge)
        ? { ...tree, children: [fresh, ...tree.children], sizes: [DOCK_SIZE, ...scaled] }
        : { ...tree, children: [...tree.children, fresh], sizes: [...scaled, DOCK_SIZE] };
    }
    return before(t.edge)
      ? split(dir, [fresh, tree], [DOCK_SIZE, 100 - DOCK_SIZE])
      : split(dir, [tree, fresh], [100 - DOCK_SIZE, DOCK_SIZE]);
  }

  // Split beside a group: join its parent split when the direction matches, otherwise wrap the group.
  const dir = dirOf(t.edge);
  const intoParent = (n: DockNode): DockNode | null => {
    if (n.type === "tabs") return null;
    const i = n.children.findIndex((c) => c.id === t.node);
    if (i >= 0 && n.dir === dir) {
      const half = n.sizes[i] / 2;
      const at = before(t.edge) ? i : i + 1;
      const children = [...n.children];
      const sizes = [...n.sizes];
      sizes[i] = half;
      children.splice(at, 0, fresh);
      sizes.splice(at, 0, half);
      return { ...n, children, sizes };
    }
    for (let j = 0; j < n.children.length; j++) {
      const r = intoParent(n.children[j]);
      if (r) return { ...n, children: n.children.map((c, k) => (k === j ? r : c)) };
    }
    return null;
  };
  return intoParent(tree) ?? mapNode(tree, t.node, (x) =>
    split(dir, before(t.edge) ? [fresh, x] : [x, fresh], [50, 50]));
}

export function activate(root: DockNode, node: string, pane: PaneId): DockNode {
  return mapNode(root, node, (x) => (x.type === "tabs" ? { ...x, active: pane } : x));
}
