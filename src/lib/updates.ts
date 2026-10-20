// Where updates come from: the repo set in Settings, turned into the address of its release feed.
// The release workflow (.github/workflows/release.yml) attaches latest.json to every GitHub release.
import { Channel, invoke } from "@tauri-apps/api/core";

const NAME = /^[A-Za-z0-9_-][A-Za-z0-9._-]*$/;

/**
 * Release feed URL for what the user typed, or null if it isn't usable. Accepts a GitHub repo
 * (`owner/repo`, `github.com/owner/repo`, any github.com URL inside the repo) or a direct
 * https link to a latest.json hosted elsewhere.
 */
export function updateEndpoint(input: string): string | null {
  const s = input.trim().replace(/\/+$/, "");
  if (/^https:\/\/\S+\.json(\?\S*)?$/i.test(s) && !/^https:\/\/(www\.)?github\.com\//i.test(s)) return s;
  const path = s.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "");
  if (/^[a-z]+:\/\//i.test(path)) return null;
  const [owner, repo] = path.split("/");
  const name = repo?.replace(/\.git$/i, "");
  if (!owner || !name || !NAME.test(owner) || !NAME.test(name)) return null;
  return `https://github.com/${owner}/${name}/releases/latest/download/latest.json`;
}

export interface UpdateInfo { version: string; currentVersion: string; notes: string | null }
export type Progress = { event: "chunk"; len: number; total: number | null } | { event: "installing" };

export const checkForUpdate = (endpoint: string) => invoke<UpdateInfo | null>("update_check", { endpoint });

/** Resolves only on failure: on success the app restarts into the new version. */
export function installUpdate(onProgress: (p: Progress) => void) {
  const ch = new Channel<Progress>();
  ch.onmessage = onProgress;
  return invoke<void>("update_install", { onProgress: ch });
}

/** The updater's errors are terse; say what they usually mean. */
export function updateError(e: unknown) {
  const m = String(e instanceof Error ? e.message : e);
  if (/valid release JSON|404|Not Found/i.test(m)) return "No release was found there. Check the repo address, and that it has a published (not draft) release with latest.json attached.";
  if (/signature/i.test(m)) return "The update's signature didn't match this app, so it wasn't installed. It may have been built with a different signing key.";
  if (/platform/i.test(m)) return "That release doesn't include a build for this computer.";
  if (/dns|connect|network|timed out|offline/i.test(m)) return "Couldn't reach the update server. Check your internet connection.";
  return m;
}
