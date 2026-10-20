// Update settings (the repo to update from, check on launch) and the state of the current check.
// Shared so the top bar can show "Update available" from the launch check.
import { getVersion } from "@tauri-apps/api/app";
import { create } from "zustand";
import { checkForUpdate, installUpdate, type UpdateInfo, updateEndpoint, updateError } from "../lib/updates";

const KEY = "ihatebills.updates";
interface Saved { repo: string; auto: boolean }
const saved: Saved = (() => {
  try { return { repo: "", auto: true, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { repo: "", auto: true }; }
})();

export type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "current"; at: Date }
  | { kind: "available"; info: UpdateInfo }
  | { kind: "installing"; info: UpdateInfo; done: number; total: number | null; verifying: boolean }
  | { kind: "error"; message: string };

interface UpdatesState extends Saved {
  version: string;
  status: UpdateStatus;
  setRepo(repo: string): void;
  setAuto(auto: boolean): void;
  check(): Promise<void>;
  install(): Promise<void>;
}

export const useUpdates = create<UpdatesState>((set, get) => {
  const persist = () => {
    const { repo, auto } = get();
    try { localStorage.setItem(KEY, JSON.stringify({ repo, auto })); } catch { /* ignore */ }
  };
  return {
    ...saved,
    version: "",
    status: { kind: "idle" },
    setRepo(repo) { set({ repo: repo.trim(), status: { kind: "idle" } }); persist(); },
    setAuto(auto) { set({ auto }); persist(); },
    async check() {
      const endpoint = updateEndpoint(get().repo);
      if (!endpoint) { set({ status: { kind: "error", message: "Enter a GitHub repo first, like github.com/you/ihatebills." } }); return; }
      set({ status: { kind: "checking" } });
      try {
        const info = await checkForUpdate(endpoint);
        set({ status: info ? { kind: "available", info } : { kind: "current", at: new Date() } });
      } catch (e) {
        set({ status: { kind: "error", message: updateError(e) } });
      }
    },
    async install() {
      const s = get().status;
      if (s.kind !== "available") return;
      const info = s.info;
      set({ status: { kind: "installing", info, done: 0, total: null, verifying: false } });
      try {
        await installUpdate((p) => {
          const cur = get().status;
          if (cur.kind !== "installing") return;
          set({ status: p.event === "chunk" ? { ...cur, done: cur.done + p.len, total: p.total ?? cur.total } : { ...cur, verifying: true } });
        });
      } catch (e) {
        set({ status: { kind: "error", message: updateError(e) } });
      }
    },
  };
});

getVersion().then((version) => useUpdates.setState({ version })).catch(() => {});

/** Quiet check when the app opens; problems only show up in Settings. */
export function checkOnLaunch() {
  const { repo, auto, check } = useUpdates.getState();
  if (auto && updateEndpoint(repo)) void check();
}
