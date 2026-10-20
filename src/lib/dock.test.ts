import { describe, expect, it } from "vitest";
import { addMissingPanes, DEFAULT_TREE, type DockNode, findTabs, isValid, movePane, panesIn, split, tabs } from "./dock";

const shape = (n: DockNode): unknown =>
  n.type === "tabs" ? n.panes.join("+") : { [n.dir]: n.children.map(shape) };
const idOf = (root: DockNode, pane: string) => findTabs(root, (t) => t.panes.includes(pane as never))!.id;

describe("dock tree", () => {
  it("default layout is valid", () => {
    expect(isValid(DEFAULT_TREE)).toBe(true);
    expect(shape(DEFAULT_TREE)).toEqual({ col: ["totals", { row: ["list", "inspector", "viewer+schedule"] }] });
  });

  it("adds panes missing from an older saved layout", () => {
    const old = split("row", [tabs(["totals", "list"]), tabs(["inspector"]), tabs(["viewer"])], [30, 30, 40]);
    expect(isValid(old)).toBe(false);
    const t = addMissingPanes(old);
    expect(shape(t)).toEqual({ row: ["totals+list", "inspector", "viewer+schedule"] });
    expect(isValid(t)).toBe(true);
  });

  it("drops a pane into another group as a tab", () => {
    const t = movePane(DEFAULT_TREE, "viewer", { kind: "tab", node: idOf(DEFAULT_TREE, "inspector") });
    expect(shape(t)).toEqual({ col: ["totals", { row: ["list", "inspector+viewer", "schedule"] }] });
    expect(findTabs(t, (x) => x.panes.includes("viewer"))!.active).toBe("viewer");
    expect(isValid(t)).toBe(true);
  });

  it("splits beside a group, joining the parent when directions match", () => {
    const t = movePane(DEFAULT_TREE, "totals", { kind: "split", node: idOf(DEFAULT_TREE, "list"), edge: "right" });
    expect(shape(t)).toEqual({ row: ["list", "totals", "inspector", "viewer+schedule"] });
    expect(isValid(t)).toBe(true);
  });

  it("splits a group across when directions differ", () => {
    const t = movePane(DEFAULT_TREE, "viewer", { kind: "split", node: idOf(DEFAULT_TREE, "list"), edge: "bottom" });
    expect(shape(t)).toEqual({ col: ["totals", { row: [{ col: ["list", "viewer"] }, "inspector", "schedule"] }] });
  });

  it("docks along a whole workspace edge", () => {
    const t = movePane(DEFAULT_TREE, "totals", { kind: "dock", edge: "bottom" });
    expect(shape(t)).toEqual({ col: [{ row: ["list", "inspector", "viewer+schedule"] }, "totals"] });
    const sizes = (t as { sizes: number[] }).sizes;
    expect(sizes[1]).toBe(30);
    expect(sizes[0] + sizes[1]).toBeCloseTo(100);
  });

  it("pulls a tab back out of a group", () => {
    const merged = movePane(DEFAULT_TREE, "viewer", { kind: "tab", node: idOf(DEFAULT_TREE, "inspector") });
    const t = movePane(merged, "viewer", { kind: "split", node: idOf(merged, "inspector"), edge: "top" });
    expect(shape(t)).toEqual({ col: ["totals", { row: ["list", { col: ["viewer", "inspector"] }, "schedule"] }] });
  });

  it("ignores dropping a lone pane onto itself", () => {
    const id = idOf(DEFAULT_TREE, "list");
    expect(movePane(DEFAULT_TREE, "list", { kind: "tab", node: id })).toBe(DEFAULT_TREE);
    expect(movePane(DEFAULT_TREE, "list", { kind: "split", node: id, edge: "left" })).toBe(DEFAULT_TREE);
  });

  it("rejects corrupt layouts", () => {
    expect(isValid(split("row", [tabs(["list"]), tabs(["list"])], [50, 50]))).toBe(false);
    expect(isValid({ type: "tabs", id: "x", panes: [], active: "list" })).toBe(false);
    expect(panesIn(DEFAULT_TREE).length).toBe(5);
  });
});
