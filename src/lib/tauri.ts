// Typed wrappers around the Rust commands in src-tauri/src/commands.rs.
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import type { Attachment } from "../types";

export const loadDb = () => invoke<string | null>("load_db");
export const saveDb = (json: string) => invoke<void>("save_db", { json });
export const importAttachment = (path: string) => invoke<Attachment>("import_attachment", { path });
export const readImportFile = async (path: string) => new Uint8Array(await invoke<ArrayBuffer>("read_import_file", { path }));
export const deleteAttachment = (file: string) => invoke<void>("delete_attachment", { file });
export const exportAttachment = (file: string, dest: string) => invoke<void>("export_attachment", { file, dest });

let dir: Promise<string> | null = null;
export const attachmentsDir = () => (dir ??= invoke<string>("attachments_dir"));

/** Absolute path and webview URL for an attachment. */
export async function attachmentPath(a: Attachment) {
  const d = await attachmentsDir();
  const sep = d.includes("\\") ? "\\" : "/";
  return `${d}${sep}${a.file}`;
}
export const attachmentUrl = async (a: Attachment) => convertFileSrc(await attachmentPath(a));
