// Everything ihatebills keeps on disk goes through here. When encryption is on, bytes are sealed
// before they reach the backend and opened after they come back, so the backend (Rust on desktop,
// or any key/value store in a browser) only ever holds ciphertext.
import { create } from "zustand";
import { type Bytes, createKeyFile, isSealed, type KeyFile, rewrapKeyFile, seal, unlockKeyFile, unseal } from "./crypto";
import { uid } from "./id";
import type { Attachment } from "../types";

/** Where bytes live. Desktop: src/lib/tauri.ts. A web build only has to provide these four. */
export interface Backend {
  /** null when the key doesn't exist. */
  read(key: string): Promise<Bytes | null>;
  /** Must be atomic: readers see the old bytes or the new ones, never a mix. */
  write(key: string, data: Bytes): Promise<void>;
  remove(key: string): Promise<void>;
  /** File names stored under "attachments/". */
  listAttachments(): Promise<string[]>;
}

/** off: stored as plain files. locked: encrypted, waiting for the password. on: encrypted and unlocked. */
export type VaultStatus = "loading" | "off" | "locked" | "on";
export const useVault = create<{ status: VaultStatus }>(() => ({ status: "loading" }));

const DB_PLAIN = "bills.json";
const DB_SEALED = "bills.enc";
const VAULT = "vault.json";
const attKey = (file: string) => `attachments/${file}`;
const attCtx = (file: string) => `att:${file}`;
const DB_CTX = "db";

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

let backend: Backend;
let keyFile: KeyFile | null = null;
/** The data key; only ever in memory, and only while unlocked. */
let key: CryptoKey | null = null;

// Every write goes through one queue so saves can't land out of order or interleave with a
// switch between plain and encrypted.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}
/** Resolves once every write queued so far has finished. */
export const settled = () => serial(async () => {});

const setStatus = (status: VaultStatus) => useVault.setState({ status });
const needKey = () => {
  if (!key) throw new Error("Your bills are locked.");
  return key;
};

export async function init(b: Backend) {
  backend = b;
  key = null;
  const raw = await backend.read(VAULT);
  keyFile = raw ? (JSON.parse(fromUtf8.decode(raw)) as KeyFile) : null;
  setStatus(keyFile ? "locked" : "off");
}

/** Throws WrongPassword. */
export async function unlock(password: string) {
  if (!keyFile) return;
  key = await unlockKeyFile(keyFile, password);
  await serial(finishEncrypting);
  setStatus("on");
}

/**
 * Brings every file in line with encryption being on. A plain bills.json next to the vault means a
 * switch was interrupted (both directions write it first), so this also resumes a crashed
 * "turn on" and rolls back a crashed "turn off".
 */
async function finishEncrypting() {
  const k = needKey();
  const plainDb = await backend.read(DB_PLAIN);
  if (!plainDb) return;
  for (const f of await backend.listAttachments()) {
    const data = await backend.read(attKey(f));
    if (data && !isSealed(data)) await backend.write(attKey(f), await seal(k, data, attCtx(f)));
  }
  if (!(await backend.read(DB_SEALED))) await backend.write(DB_SEALED, await seal(k, plainDb, DB_CTX));
  await backend.remove(DB_PLAIN);
}

/** The database JSON, or null on first launch. */
export async function loadDb(): Promise<string | null> {
  if (keyFile) {
    const data = await backend.read(DB_SEALED);
    return data && fromUtf8.decode(await unseal(needKey(), data, DB_CTX));
  }
  const data = await backend.read(DB_PLAIN);
  return data && fromUtf8.decode(data);
}

export const saveDb = (json: string) => serial(async () => {
  if (keyFile) await backend.write(DB_SEALED, await seal(needKey(), utf8.encode(json), DB_CTX));
  else await backend.write(DB_PLAIN, utf8.encode(json));
});

const MIME: Record<string, string> = { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };

/** Stores a copy of a scan the user picked; `name` is its original file name. */
export async function addAttachment(name: string, data: Bytes): Promise<Attachment> {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const mime = MIME[ext];
  if (!mime) throw new Error(`Only PDF, PNG and JPEG files can be attached (got .${ext})`);
  const id = uid();
  const file = `${id}.${ext}`;
  await serial(async () => backend.write(attKey(file), keyFile ? await seal(needKey(), data, attCtx(file)) : data));
  return { id, name, mime, file };
}

/** The scan's plain bytes. */
export async function readAttachment(a: Attachment): Promise<Bytes> {
  const data = await backend.read(attKey(a.file));
  if (!data) throw new Error(`“${a.name}” is missing from the attachments folder.`);
  return isSealed(data) ? unseal(needKey(), data, attCtx(a.file)) : data;
}

export const deleteAttachment = (file: string) => serial(() => backend.remove(attKey(file)));

/** Turns encryption on. `json` is the current database. */
export const enable = (password: string, json: string) => serial(async () => {
  // bills.json first: if we crash from here on, the next unlock sees it and finishes the job.
  await backend.write(DB_PLAIN, utf8.encode(json));
  await backend.remove(DB_SEALED);
  const made = await createKeyFile(password);
  await backend.write(VAULT, utf8.encode(JSON.stringify(made.file)));
  keyFile = made.file;
  key = made.key;
  setStatus("on");
  await finishEncrypting();
});

/** Turns encryption off after re-checking the password. Throws WrongPassword. */
export const disable = (password: string, json: string) => serial(async () => {
  if (!keyFile) return;
  await unlockKeyFile(keyFile, password);
  const k = needKey();
  try {
    await backend.write(DB_PLAIN, utf8.encode(json));
    for (const f of await backend.listAttachments()) {
      const data = await backend.read(attKey(f));
      if (data && isSealed(data)) await backend.write(attKey(f), await unseal(k, data, attCtx(f)));
    }
    await backend.remove(DB_SEALED);
  } catch (e) {
    await finishEncrypting(); // put everything back the way it was
    throw e;
  }
  // Last step: until the vault is gone, a crash rolls back to encrypted.
  await backend.remove(VAULT);
  keyFile = null;
  key = null;
  setStatus("off");
});

/** Re-wraps the data key; nothing else is rewritten. Throws WrongPassword. */
export const changePassword = (current: string, next: string) => serial(async () => {
  if (!keyFile) return;
  const file = await rewrapKeyFile(keyFile, current, next);
  await backend.write(VAULT, utf8.encode(JSON.stringify(file)));
  keyFile = file;
});

/** Plaintext and the key live only in page memory, so reloading the page is the lock. */
export async function lock() {
  await settled();
  location.reload();
}
