// Light/dark/system. CSS reads <html data-theme="light|dark"> (tokens.css);
// the native window theme follows so the title bar matches.
import { getCurrentWindow } from "@tauri-apps/api/window";
import { create } from "zustand";

export type ThemeMode = "system" | "light" | "dark";
const KEY = "ihatebills.theme";
const media = window.matchMedia("(prefers-color-scheme: dark)");

function apply(mode: ThemeMode) {
  const dark = mode === "dark" || (mode === "system" && media.matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  getCurrentWindow().setTheme(mode === "system" ? null : mode).catch(() => {});
}

const saved: ThemeMode = (() => {
  try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "system"; } catch { return "system"; }
})();
apply(saved);

interface ThemeState { mode: ThemeMode; setMode(m: ThemeMode): void }

export const useTheme = create<ThemeState>((set) => ({
  mode: saved,
  setMode(mode) {
    apply(mode);
    try { localStorage.setItem(KEY, mode); } catch { /* ignore */ }
    set({ mode });
  },
}));

media.addEventListener("change", () => { if (useTheme.getState().mode === "system") apply("system"); });
