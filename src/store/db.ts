// All bill data. Every change is saved (debounced) to bills.json via Rust.
import { create } from "zustand";
import { emptyDb, migrate } from "../fields";
import { uid, today } from "../lib/id";
import * as core from "../lib/tauri";
import type { Attachment, Bill, Category, DB, FieldDef, FieldType, FieldValue, FilterDef, StatusColor, TotalDef } from "../types";

interface DbState extends DB {
  loaded: boolean;
  error: string | null;
  load(): Promise<void>;

  addBill(categoryId: string | null): string;
  setValue(billId: string, key: string, value: FieldValue): void;
  deleteBill(id: string): void;
  /** Adds many bills at once (plus any fields/statuses the import created); returns their ids. */
  importBills(rows: Record<string, FieldValue>[], categoryId: string | null, newFields: FieldDef[], newStatuses: string[]): string[];
  /** Move a bill into a category (null = Uncategorized) at an index within that category. */
  moveBill(id: string, categoryId: string | null, index: number): void;

  addCategory(name: string): string;
  renameCategory(id: string, name: string): void;
  deleteCategory(id: string): void;
  toggleCategory(id: string): void;
  reorderCategories(ids: string[]): void;

  addField(label: string, type: FieldType): void;
  renameField(key: string, label: string): void;
  deleteField(key: string): void;

  addAttachment(billId: string, a: Attachment): void;
  removeAttachment(billId: string, attId: string): void;

  saveTotal(t: TotalDef): void;
  deleteTotal(id: string): void;
  reorderTotals(ids: string[]): void;

  setStatuses(s: string[], colors: Record<string, StatusColor>): void;

  saveFilter(f: FilterDef): void;
  deleteFilter(id: string): void;
}

const now = () => new Date().toISOString();
const byOrder = <T extends { order: number }>(a: T, b: T) => a.order - b.order;

/** Bills in one category, in display order. */
export const billsIn = (bills: Bill[], categoryId: string | null) => bills.filter((b) => b.categoryId === categoryId).sort(byOrder);
export const sortedCategories = (cats: Category[]) => [...cats].sort(byOrder);

export const useDb = create<DbState>((set, get) => {
  const touch = (id: string, fn: (b: Bill) => Bill) =>
    set({ bills: get().bills.map((b) => (b.id === id ? { ...fn(b), updatedAt: now() } : b)) });

  return {
    ...emptyDb(),
    loaded: false,
    error: null,

    async load() {
      try {
        const raw = await core.loadDb();
        set({ ...(raw ? migrate(JSON.parse(raw)) : emptyDb()), loaded: true });
      } catch (e) {
        set({ error: `Could not load your bills: ${e}`, loaded: true });
      }
    },

    addBill(categoryId) {
      const id = uid();
      const order = billsIn(get().bills, categoryId).length;
      const t = now();
      set({ bills: [...get().bills, { id, categoryId, order, values: { status: "Pending", lastUpdated: today() }, attachments: [], createdAt: t, updatedAt: t }] });
      return id;
    },
    setValue(billId, key, value) {
      touch(billId, (b) => ({ ...b, values: { ...b.values, [key]: value, ...(key === "lastUpdated" ? {} : { lastUpdated: today() }) } }));
    },
    importBills(rows, categoryId, newFields, newStatuses) {
      const start = billsIn(get().bills, categoryId).length;
      const t = now();
      const added: Bill[] = rows.map((values, i) => ({
        id: uid(), categoryId, order: start + i, values: { status: "Pending", lastUpdated: today(), ...values }, attachments: [], createdAt: t, updatedAt: t,
      }));
      set({
        bills: [...get().bills, ...added],
        fieldDefs: newFields.length ? [...get().fieldDefs, ...newFields] : get().fieldDefs,
        statuses: newStatuses.length ? [...get().statuses, ...newStatuses] : get().statuses,
      });
      return added.map((b) => b.id);
    },
    deleteBill(id) {
      const b = get().bills.find((x) => x.id === id);
      b?.attachments.forEach((a) => core.deleteAttachment(a.file).catch(() => {}));
      set({ bills: get().bills.filter((x) => x.id !== id) });
    },
    moveBill(id, categoryId, index) {
      const bills = get().bills;
      const moving = bills.find((b) => b.id === id);
      if (!moving) return;
      const target = billsIn(bills, categoryId).filter((b) => b.id !== id);
      target.splice(Math.max(0, Math.min(index, target.length)), 0, { ...moving, categoryId });
      const order = new Map(target.map((b, i) => [b.id, i]));
      // Re-number the category it left, too.
      const source = moving.categoryId === categoryId ? [] : billsIn(bills, moving.categoryId).filter((b) => b.id !== id);
      source.forEach((b, i) => order.set(b.id, i));
      set({
        bills: bills.map((b) => {
          if (b.id === id) return { ...b, categoryId, order: order.get(id)! };
          return order.has(b.id) ? { ...b, order: order.get(b.id)! } : b;
        }),
      });
    },

    addCategory(name) {
      const id = uid();
      set({ categories: [...get().categories, { id, name, order: get().categories.length, collapsed: false }] });
      return id;
    },
    renameCategory(id, name) {
      set({ categories: get().categories.map((c) => (c.id === id ? { ...c, name } : c)) });
    },
    deleteCategory(id) {
      const tail = billsIn(get().bills, null).length;
      let i = 0;
      set({
        categories: get().categories.filter((c) => c.id !== id),
        bills: get().bills.map((b) => (b.categoryId === id ? { ...b, categoryId: null, order: tail + i++ } : b)),
        totals: get().totals.map((t) => (t.categoryId === id ? { ...t, categoryId: null } : t)),
      });
    },
    toggleCategory(id) {
      set({ categories: get().categories.map((c) => (c.id === id ? { ...c, collapsed: !c.collapsed } : c)) });
    },
    reorderCategories(ids) {
      const pos = new Map(ids.map((id, i) => [id, i]));
      set({ categories: get().categories.map((c) => ({ ...c, order: pos.get(c.id) ?? c.order })) });
    },

    addField(label, type) {
      const key = `custom_${uid().slice(0, 8)}`;
      const def: FieldDef = { key, label, type, builtin: false, group: "Custom" };
      set({ fieldDefs: [...get().fieldDefs, def] });
    },
    renameField(key, label) {
      set({ fieldDefs: get().fieldDefs.map((f) => (f.key === key ? { ...f, label } : f)) });
    },
    deleteField(key) {
      set({
        fieldDefs: get().fieldDefs.filter((f) => f.key !== key),
        bills: get().bills.map((b) => {
          if (!(key in b.values)) return b;
          const { [key]: _drop, ...values } = b.values;
          return { ...b, values };
        }),
      });
    },

    addAttachment(billId, a) {
      touch(billId, (b) => ({ ...b, attachments: [...b.attachments, a] }));
    },
    removeAttachment(billId, attId) {
      const a = get().bills.find((b) => b.id === billId)?.attachments.find((x) => x.id === attId);
      if (a) core.deleteAttachment(a.file).catch(() => {});
      touch(billId, (b) => ({ ...b, attachments: b.attachments.filter((x) => x.id !== attId) }));
    },

    saveTotal(t) {
      const exists = get().totals.some((x) => x.id === t.id);
      set({ totals: exists ? get().totals.map((x) => (x.id === t.id ? t : x)) : [...get().totals, t] });
    },
    deleteTotal(id) {
      set({ totals: get().totals.filter((t) => t.id !== id) });
    },
    reorderTotals(ids) {
      const map = new Map(get().totals.map((t) => [t.id, t]));
      set({ totals: ids.map((id) => map.get(id)!).filter(Boolean) });
    },

    setStatuses(statuses, statusColors) {
      set({ statuses, statusColors });
    },

    saveFilter(f) {
      const exists = get().filters.some((x) => x.id === f.id);
      set({ filters: exists ? get().filters.map((x) => (x.id === f.id ? f : x)) : [...get().filters, f] });
    },
    deleteFilter(id) {
      set({ filters: get().filters.filter((f) => f.id !== id) });
    },
  };
});

// Debounced save of the persisted part of the state.
let timer: ReturnType<typeof setTimeout> | undefined;
let pending = false;
const snapshot = (): DB => {
  const { bills, categories, fieldDefs, statuses, statusColors, totals, filters } = useDb.getState();
  return { version: 1, bills, categories, fieldDefs, statuses, statusColors, totals, filters };
};
export function flush() {
  clearTimeout(timer);
  if (!pending) return;
  pending = false;
  core.saveDb(JSON.stringify(snapshot(), null, 1)).catch((e) => useDb.setState({ error: `Could not save: ${e}` }));
}
useDb.subscribe((s, prev) => {
  if (!s.loaded || !prev.loaded) return;
  if (s.bills === prev.bills && s.categories === prev.categories && s.fieldDefs === prev.fieldDefs && s.statuses === prev.statuses && s.statusColors === prev.statusColors && s.totals === prev.totals && s.filters === prev.filters) return;
  pending = true;
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
});
window.addEventListener("beforeunload", flush);
