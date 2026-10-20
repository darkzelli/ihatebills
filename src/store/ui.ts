// View state that isn't bill data: selection, search, inspector section order/collapse.
import { create } from "zustand";
import { GROUPS } from "../fields";

export type SectionId = (typeof GROUPS)[number] | "Attachments";
const DEFAULT_SECTIONS: SectionId[] = ["Visit", "Claim", "Amounts", "Tracking", "Custom", "Attachments"];

const KEY = "ihatebills.ui";
interface Saved { sectionOrder: SectionId[]; collapsed: Record<string, boolean>; showFilters: boolean }
function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
    if (v) {
      const sectionOrder = [...v.sectionOrder].sort().join() === [...DEFAULT_SECTIONS].sort().join() ? v.sectionOrder : DEFAULT_SECTIONS;
      return { ...v, sectionOrder, showFilters: v.showFilters ?? true };
    }
  } catch { /* storage unavailable */ }
  return { sectionOrder: DEFAULT_SECTIONS, collapsed: {}, showFilters: true };
}
const saved = load();

interface UiState extends Saved {
  selectedId: string | null;
  /** A day picked on the schedule (YYYY-MM-DD); the inspector lists its bills instead of one bill. */
  selectedDate: string | null;
  search: string;
  /** Active bill list filter: `status:<name>` or a custom filter's id; null = all bills. */
  filter: string | null;
  select(id: string | null): void;
  selectDate(d: string | null): void;
  setSearch(s: string): void;
  setFilter(f: string | null): void;
  /** Show or hide the filter row; hiding it also clears the active filter. */
  setShowFilters(on: boolean): void;
  setSectionOrder(o: SectionId[]): void;
  /** Collapse flags for inspector sections and the Uncategorized group. */
  toggleCollapsed(id: string): void;
}

export const useUi = create<UiState>((set, get) => {
  const persist = () => {
    const { sectionOrder, collapsed, showFilters } = get();
    try { localStorage.setItem(KEY, JSON.stringify({ sectionOrder, collapsed, showFilters })); } catch { /* ignore */ }
  };
  return {
    ...saved,
    selectedId: null,
    selectedDate: null,
    search: "",
    filter: null,
    select: (selectedId) => set({ selectedId, selectedDate: null }),
    selectDate: (selectedDate) => set(selectedDate ? { selectedDate, selectedId: null } : { selectedDate }),
    setSearch: (search) => set({ search }),
    setFilter: (filter) => set({ filter }),
    setShowFilters(showFilters) { set({ showFilters, ...(showFilters ? {} : { filter: null }) }); persist(); },
    setSectionOrder(sectionOrder) { set({ sectionOrder }); persist(); },
    toggleCollapsed(id) { set({ collapsed: { ...get().collapsed, [id]: !get().collapsed[id] } }); persist(); },
  };
});
