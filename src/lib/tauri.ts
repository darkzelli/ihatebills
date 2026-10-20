// Typed wrappers around the Rust commands in src-tauri/src/commands.rs.
import { invoke } from "@tauri-apps/api/core";
import type { Bytes } from "./crypto";
import type { Backend } from "./storage";

const NOT_FOUND = "not found";
const bytes = async (p: Promise<ArrayBuffer>) => new Uint8Array(await p);

export const tauriBackend: Backend = {
  async read(key) {
    try {
      return await bytes(invoke<ArrayBuffer>("store_read", { key }));
    } catch (e) {
      if (e === NOT_FOUND) return null;
      throw e;
    }
  },
  write: (key, data) => invoke<void>("store_write", data, { headers: { key: encodeURIComponent(key) } }),
  remove: (key) => invoke<void>("store_delete", { key }),
  listAttachments: () => invoke<string[]>("store_list_attachments"),
};

export const readScanFile = (path: string) => bytes(invoke<ArrayBuffer>("read_scan_file", { path }));
export const readImportFile = (path: string) => bytes(invoke<ArrayBuffer>("read_import_file", { path }));
export const exportFile = (dest: string, data: Bytes) => invoke<void>("export_file", data, { headers: { dest: encodeURIComponent(dest) } });

let dir: Promise<string> | null = null;
const attachmentsDir = () => (dir ??= invoke<string>("attachments_dir"));

/** Absolute path of a stored scan, for opening it in the default app. */
export async function attachmentPath(file: string) {
  const d = await attachmentsDir();
  const sep = d.includes("\\") ? "\\" : "/";
  return `${d}${sep}${file}`;
}
