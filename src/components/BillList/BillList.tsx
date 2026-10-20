// Scrollable bill list grouped into collapsible categories.
// Drag a category's ⠿ to reorder categories; drag a bill within or between categories.
import {
  type CollisionDetection, closestCenter, DndContext, type DragEndEvent, type DragOverEvent, DragOverlay,
  type DragStartEvent, KeyboardSensor, PointerSensor, pointerWithin, useSensor, useSensors,
} from "@dnd-kit/core";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useEffect, useMemo, useState } from "react";
import { extOf, IMPORT_EXTENSIONS, readTables, type Table } from "../../lib/import";
import * as core from "../../lib/tauri";
import { billsIn, sortedCategories, useDb } from "../../store/db";
import { useUi } from "../../store/ui";
import type { Bill } from "../../types";
import { filterTest } from "../../lib/filters";
import { FilterBar } from "../Filters/FilterBar";
import { FiltersMenu } from "../Filters/FiltersMenu";
import { PaneHead } from "../ui/PaneHead";
import { BillRowView } from "./BillRow";
import { CategoryOverlay, SortableCategory, UncategorizedGroup } from "./CategoryGroup";
import { ImportDialog } from "./ImportDialog";

const isCat = (id: unknown) => String(id).startsWith("c:");
const catOf = (id: string) => (id === "c:none" ? null : id.slice(2));

function matchesSearch(b: Bill, q: string) {
  if (!q) return true;
  return Object.values(b.values).some((v) => v != null && String(v).toLowerCase().includes(q));
}

/** Categories only collide with categories; bills prefer the bill under the pointer, then the category. */
const collision: CollisionDetection = (args) => {
  if (isCat(args.active.id)) {
    return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => isCat(c.id) && c.id !== "c:none") });
  }
  const hits = pointerWithin(args);
  const billHits = hits.filter((h) => !isCat(h.id));
  if (billHits.length) return billHits;
  if (hits.length) return hits;
  return closestCenter({ ...args, droppableContainers: args.droppableContainers.filter((c) => !isCat(c.id)) });
};

export function BillList() {
  const bills = useDb((s) => s.bills);
  const categories = useDb((s) => s.categories);
  const filters = useDb((s) => s.filters);
  const statuses = useDb((s) => s.statuses);
  const { addBill, addCategory, moveBill, reorderCategories } = useDb.getState();
  const search = useUi((s) => s.search);
  const setSearch = useUi((s) => s.setSearch);
  const select = useUi((s) => s.select);
  const filter = useUi((s) => s.filter);
  const showFilters = useUi((s) => s.showFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const noneCollapsed = useUi((s) => !!s.collapsed["cat:none"]);
  const [active, setActive] = useState<string | null>(null);
  const [overCat, setOverCat] = useState<string | null>(null);
  const [importing, setImporting] = useState<{ fileName: string; tables: Table[] } | null>(null);

  const importFile = async (path: string) => {
    const fileName = path.split(/[\\/]/).pop() ?? path;
    try {
      const tables = await readTables(await core.readImportFile(path), fileName);
      if (!tables.some((t) => t.rows.length > 1)) throw new Error("there are no rows in it");
      setImporting({ fileName, tables });
    } catch (e) {
      useDb.setState({ error: `Could not import ${fileName}: ${e instanceof Error ? e.message : e}` });
    }
  };
  const pickImport = async () => {
    const sel = await open({ multiple: false, filters: [{ name: "Spreadsheets & claim exports", extensions: IMPORT_EXTENSIONS }] });
    if (typeof sel === "string") importFile(sel);
  };
  // A spreadsheet dropped anywhere on the window opens the importer (scans still go to Attachments).
  useEffect(() => {
    const un = getCurrentWebview().onDragDropEvent((e) => {
      if (e.payload.type !== "drop") return;
      const p = e.payload.paths.find((x) => IMPORT_EXTENSIONS.includes(extOf(x)));
      if (p) importFile(p);
    });
    return () => { un.then((f) => f()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = search.trim().toLowerCase();
  const cats = useMemo(() => sortedCategories(categories), [categories]);
  // A filter that's been deleted (or whose status was removed) just stops filtering.
  const test = useMemo(() => (filter ? filterTest(filter, filters, statuses) : null), [filter, filters, statuses]);
  const groups = useMemo(() => {
    const m = new Map<string | null, Bill[]>();
    for (const id of [null, ...cats.map((c) => c.id)]) m.set(id, billsIn(bills, id).filter((b) => matchesSearch(b, q) && (!test || test(b))));
    return m;
  }, [bills, cats, q, test]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const billById = (id: string) => useDb.getState().bills.find((b) => `b:${b.id}` === id);
  const isCollapsed = (cat: string | null) => (cat === null ? noneCollapsed : !!categories.find((c) => c.id === cat)?.collapsed);

  const onStart = (e: DragStartEvent) => {
    const id = String(e.active.id);
    setActive(id);
    if (!isCat(id)) setOverCat(`c:${billById(id)?.categoryId ?? "none"}`);
  };

  // Cross-category moves happen live so the bill appears in its new group while dragging.
  const onOver = ({ active: a, over }: DragOverEvent) => {
    if (!over || isCat(a.id)) return;
    const bill = billById(String(a.id));
    if (!bill) return;
    const overId = String(over.id);
    const target = isCat(overId) ? catOf(overId) : billById(overId)?.categoryId ?? null;
    setOverCat(`c:${target ?? "none"}`);
    if (target === bill.categoryId || isCollapsed(target)) return;
    const list = billsIn(useDb.getState().bills, target);
    const idx = isCat(overId) ? list.length : list.findIndex((b) => `b:${b.id}` === overId);
    moveBill(bill.id, target, idx < 0 ? list.length : idx);
  };

  const onEnd = ({ active: a, over }: DragEndEvent) => {
    setActive(null);
    setOverCat(null);
    if (!over) return;
    const aid = String(a.id), oid = String(over.id);
    if (isCat(aid)) {
      const ids = cats.map((c) => `c:${c.id}`);
      const from = ids.indexOf(aid), to = ids.indexOf(oid);
      if (from >= 0 && to >= 0 && from !== to) reorderCategories(arrayMove(ids, from, to).map(catOf) as string[]);
      return;
    }
    const bill = billById(aid);
    if (!bill) return;
    if (isCat(oid)) {
      const target = catOf(oid);
      if (target !== bill.categoryId) moveBill(bill.id, target, billsIn(useDb.getState().bills, target).length);
      return;
    }
    const list = billsIn(useDb.getState().bills, bill.categoryId);
    const from = list.findIndex((b) => b.id === bill.id), to = list.findIndex((b) => `b:${b.id}` === oid);
    if (to >= 0 && from !== to) moveBill(bill.id, bill.categoryId, to);
  };

  const newBill = () => select(addBill(null));
  const newCategory = () => addCategory(`Category ${categories.length + 1}`);

  const activeBill = active && !isCat(active) ? billById(active) : undefined;
  const activeCat = active && isCat(active) ? cats.find((c) => `c:${c.id}` === active) : undefined;
  const dragDisabled = !!q || !!test;
  const none = groups.get(null) ?? [];

  return (
    <div className="pane-body" style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <PaneHead pane="list" title="Bills">
        <span className="spacer" />
        <button className={`btn sm ${test ? "on" : ""}`} onClick={() => setFiltersOpen(true)} title="Show or hide the filter row, and make your own filters">Filters</button>
        <button className="btn sm" onClick={pickImport} title="Import bills from CSV, Excel, OpenDocument or a claims JSON export">Import…</button>
        <button className="btn sm" onClick={newCategory}>+ Category</button>
        <button className="btn sm primary" onClick={newBill} title="New bill (⌘N)">+ Bill</button>
      </PaneHead>
      {showFilters && <FilterBar />}
      <div className="list-tools">
        <input className="input" placeholder="Search bills…" value={search} onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") setSearch(""); }} />
      </div>
      <div className="scroll">
        {bills.length === 0 ? (
          <div className="empty">
            <span className="big">No bills yet</span>
            <span>Add your first bill, then attach the scan and fill in the amounts.</span>
            <button className="btn primary" onClick={newBill}>+ Add a bill</button>
            <span>or <button className="btn sm" onClick={pickImport}>Import a spreadsheet…</button></span>
            <span className="tb-hint">CSV, TSV, Excel, OpenDocument, or a claims export (JSON) from your insurer.</span>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={collision} onDragStart={onStart} onDragOver={onOver} onDragEnd={onEnd}
            onDragCancel={() => { setActive(null); setOverCat(null); }}>
            <UncategorizedGroup bills={none} collapsed={noneCollapsed} dragDisabled={dragDisabled} hot={overCat === "c:none"} />
            <SortableContext items={cats.map((c) => `c:${c.id}`)} strategy={verticalListSortingStrategy}>
              {cats.map((c) => (
                <SortableCategory key={c.id} category={c} bills={groups.get(c.id) ?? []} collapsed={c.collapsed}
                  dragDisabled={dragDisabled} hot={overCat === `c:${c.id}`} />
              ))}
            </SortableContext>
            <DragOverlay dropAnimation={null}>
              {activeBill && <BillRowView bill={activeBill} overlay />}
              {activeCat && <CategoryOverlay category={activeCat} bills={groups.get(activeCat.id) ?? []} />}
            </DragOverlay>
          </DndContext>
        )}
      </div>
      {filtersOpen && <FiltersMenu onClose={() => setFiltersOpen(false)} />}
      {importing && <ImportDialog {...importing} onClose={() => setImporting(null)} />}
    </div>
  );
}
