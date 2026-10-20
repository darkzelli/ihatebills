// All bill data. Every change is saved (debounced) through src/lib/storage.ts, encrypted when that's on.
import { create } from "zustand";
import { DEFAULT_FIELDS, emptyDb, fieldKeys, migrate } from "../fields";
import { uid, today } from "../lib/id";
import { runSteps } from "../lib/controls";
import * as storage from "../lib/storage";
import type { Attachment, Bill, Category, ControlDef, DB, FieldDef, FieldPart, FieldType, FieldValue, FilterDef, LookMode, OweTerm, StatusColor, TotalDef } from "../types";

interface DbState extends DB {
  loaded: boolean;
  error: string | null;
  load(): Promise<void>;

  addBill(categoryId: string | null): string;
  setValue(billId: string, key: string, value: FieldValue): void;
  deleteBill(id: string): void;
  /** Show or hide one of a bill's date fields on the schedule. */
  toggleScheduled(billId: string, key: string): void;
  /** Adds many bills at once (plus any fields/statuses the import created); returns their ids. */
  importBills(rows: Record<string, FieldValue>[], categoryId: string | null, newFields: FieldDef[], newStatuses: string[]): string[];
  /** Move a bill into a category (null = Uncategorized) at an index within that category. */
  moveBill(id: string, categoryId: string | null, index: number): void;

  addCategory(name: string): string;
  renameCategory(id: string, name: string): void;
  deleteCategory(id: string): void;
  toggleCategory(id: string): void;
  reorderCategories(ids: string[]): void;

  /** For a "combined" field, pass its parts (keys are filled in here). */
  addField(label: string, type: FieldType, parts?: Omit<FieldPart, "key">[]): void;
  renameField(key: string, label: string): void;
  deleteField(key: string): void;
  restoreDefaultFields(): void;
  /** Swap a field with its neighbour in the same section (dir -1 = up, 1 = down). */
  moveField(key: string, dir: -1 | 1): void;

  addAttachment(billId: string, a: Attachment): void;
  removeAttachment(billId: string, attId: string): void;
  moveAttachment(billId: string, attId: string, dir: -1 | 1): void;

  saveTotal(t: TotalDef): void;
  deleteTotal(id: string): void;
  reorderTotals(ids: string[]): void;

  setStatuses(s: string[], colors: Record<string, StatusColor>): void;

  saveFilter(f: FilterDef): void;
  deleteFilter(id: string): void;

  saveControl(c: ControlDef): void;
  deleteControl(id: string): void;
  setOwe(terms: OweTerm[]): void;
  /** Runs a control on a bill; returns the bill as it was before, for undo. */
  runControl(billId: string, controlId: string): Bill | undefined;
  /** Puts a bill back exactly as given (undo). */
  restoreBill(b: Bill): void;
  /** Grey out / hide a field on one bill in the viewer; null shows it normally. */
  setLook(billId: string, key: string, look: LookMode | null): void;
}

const now = () => new Date().toISOString();
/** Starting values for a new bill, skipping any default the user deleted. */
function newBillValues(fieldDefs: FieldDef[]): Record<string, FieldValue> {
  const values: Record<string, FieldValue> = { status: "Pending", lastUpdated: today() };
  for (const k of Object.keys(values)) if (!fieldDefs.some((f) => f.key === k)) delete values[k];
  return values;
}

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
        const raw = await storage.loadDb();
        set({ ...(raw ? migrate(JSON.parse(raw)) : emptyDb()), loaded: true });
      } catch (e) {
        set({ error: `Could not load your bills: ${e}`, loaded: true });
      }
    },

    addBill(categoryId) {
      const id = uid();
      const order = billsIn(get().bills, categoryId).length;
      const t = now();
      set({ bills: [...get().bills, { id, categoryId, order, values: newBillValues(get().fieldDefs), attachments: [], createdAt: t, updatedAt: t }] });
      return id;
    },
    setValue(billId, key, value) {
      const stamp = key !== "lastUpdated" && get().fieldDefs.some((f) => f.key === "lastUpdated");
      touch(billId, (b) => ({ ...b, values: { ...b.values, [key]: value, ...(stamp ? { lastUpdated: today() } : {}) } }));
    },
    importBills(rows, categoryId, newFields, newStatuses) {
      const start = billsIn(get().bills, categoryId).length;
      const t = now();
      const added: Bill[] = rows.map((values, i) => ({
        id: uid(), categoryId, order: start + i, values: { ...newBillValues(get().fieldDefs), ...values }, attachments: [], createdAt: t, updatedAt: t,
      }));
      set({
        bills: [...get().bills, ...added],
        fieldDefs: newFields.length ? [...get().fieldDefs, ...newFields] : get().fieldDefs,
        statuses: newStatuses.length ? [...get().statuses, ...newStatuses] : get().statuses,
      });
      return added.map((b) => b.id);
    },
    toggleScheduled(billId, key) {
      touch(billId, (b) => {
        const on = b.scheduled ?? [];
        return { ...b, scheduled: on.includes(key) ? on.filter((k) => k !== key) : [...on, key] };
      });
    },
    deleteBill(id) {
      const b = get().bills.find((x) => x.id === id);
      b?.attachments.forEach((a) => storage.deleteAttachment(a.file).catch(() => {}));
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

    addField(label, type, parts) {
      const newKey = () => `custom_${uid().slice(0, 8)}`;
      const def: FieldDef = { key: newKey(), label, type, builtin: false, group: "Custom" };
      if (type === "combined") def.parts = (parts ?? []).map((p) => ({ ...p, key: newKey() }));
      set({ fieldDefs: [...get().fieldDefs, def] });
    },
    renameField(key, label) {
      set({ fieldDefs: get().fieldDefs.map((f) => (f.key === key ? { ...f, label } : f)) });
    },
    deleteField(key) {
      const def = get().fieldDefs.find((f) => f.key === key);
      const keys = def ? fieldKeys(def) : [key];
      set({
        fieldDefs: get().fieldDefs.filter((f) => f.key !== key),
        ...(def?.builtin ? { removedFields: [...get().removedFields, key] } : {}),
        bills: get().bills.map((b) => {
          if (!keys.some((k) => k in b.values || b.scheduled?.includes(k)) && !(b.looks && key in b.looks)) return b;
          const values = { ...b.values };
          for (const k of keys) delete values[k];
          const looks = { ...b.looks };
          delete looks[key];
          return { ...b, values, looks, scheduled: b.scheduled?.filter((k) => !keys.includes(k)) };
        }),
        controls: get().controls.map((c) => (c.fields.includes(key) ? { ...c, fields: c.fields.filter((k) => k !== key) } : c)),
      });
    },
    restoreDefaultFields() {
      const { fieldDefs, removedFields } = get();
      const back = DEFAULT_FIELDS.filter((d) => removedFields.includes(d.key) && !fieldDefs.some((f) => f.key === d.key));
      // Keep the user's order; restored defaults go after the others, ahead of custom fields.
      set({ fieldDefs: [...fieldDefs.filter((f) => f.builtin), ...back, ...fieldDefs.filter((f) => !f.builtin)], removedFields: [] });
    },
    moveField(key, dir) {
      const defs = [...get().fieldDefs];
      const i = defs.findIndex((f) => f.key === key);
      if (i < 0) return;
      let j = i + dir;
      while (j >= 0 && j < defs.length && defs[j].group !== defs[i].group) j += dir;
      if (j < 0 || j >= defs.length) return;
      [defs[i], defs[j]] = [defs[j], defs[i]];
      set({ fieldDefs: defs });
    },

    addAttachment(billId, a) {
      touch(billId, (b) => ({ ...b, attachments: [...b.attachments, a] }));
    },
    removeAttachment(billId, attId) {
      const a = get().bills.find((b) => b.id === billId)?.attachments.find((x) => x.id === attId);
      if (a) storage.deleteAttachment(a.file).catch(() => {});
      touch(billId, (b) => ({ ...b, attachments: b.attachments.filter((x) => x.id !== attId) }));
    },
    moveAttachment(billId, attId, dir) {
      touch(billId, (b) => {
        const atts = [...b.attachments];
        const i = atts.findIndex((x) => x.id === attId);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= atts.length) return b;
        [atts[i], atts[j]] = [atts[j], atts[i]];
        return { ...b, attachments: atts };
      });
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

    saveControl(c) {
      const exists = get().controls.some((x) => x.id === c.id);
      set({ controls: exists ? get().controls.map((x) => (x.id === c.id ? c : x)) : [...get().controls, c] });
    },
    deleteControl(id) {
      set({ controls: get().controls.filter((c) => c.id !== id) });
    },
    setOwe(owe) {
      set({ owe });
    },
    runControl(billId, controlId) {
      const { bills, controls, fieldDefs } = get();
      const bill = bills.find((b) => b.id === billId);
      const control = controls.find((c) => c.id === controlId);
      if (!bill || !control) return undefined;
      const { values, looks } = runSteps(bill, control.steps, fieldDefs);
      const changed = Object.keys({ ...values, ...bill.values }).some((k) => values[k] !== bill.values[k]);
      // Same "last updated" stamp as editing by hand, unless a step set it itself.
      const stamp = changed && fieldDefs.some((f) => f.key === "lastUpdated") && !control.steps.some((s) => s.kind === "value" && s.field === "lastUpdated");
      touch(billId, (b) => ({ ...b, values: stamp ? { ...values, lastUpdated: today() } : values, looks }));
      return bill;
    },
    restoreBill(bill) {
      set({ bills: get().bills.map((b) => (b.id === bill.id ? bill : b)) });
    },
    setLook(billId, key, look) {
      touch(billId, (b) => {
        const looks = { ...b.looks };
        if (look) looks[key] = look;
        else delete looks[key];
        return { ...b, looks };
      });
    },
  };
});

// Debounced save of the persisted part of the state.
let timer: ReturnType<typeof setTimeout> | undefined;
let pending = false;
const snapshot = (): DB => {
  const { bills, categories, fieldDefs, removedFields, statuses, statusColors, totals, filters, controls, owe } = useDb.getState();
  return { version: 1, bills, categories, fieldDefs, removedFields, statuses, statusColors, totals, filters, controls, owe };
};
export const snapshotJson = () => JSON.stringify(snapshot(), null, 1);
export function flush() {
  clearTimeout(timer);
  if (!pending) return;
  pending = false;
  storage.saveDb(snapshotJson()).catch((e) => useDb.setState({ error: `Could not save: ${e}` }));
}
useDb.subscribe((s, prev) => {
  if (!s.loaded || !prev.loaded) return;
  if (s.bills === prev.bills && s.categories === prev.categories && s.fieldDefs === prev.fieldDefs && s.removedFields === prev.removedFields && s.statuses === prev.statuses && s.statusColors === prev.statusColors && s.totals === prev.totals && s.filters === prev.filters && s.controls === prev.controls && s.owe === prev.owe) return;
  pending = true;
  clearTimeout(timer);
  timer = setTimeout(flush, 300);
});
window.addEventListener("beforeunload", flush);
