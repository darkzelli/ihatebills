// Encryption at rest. Everything here is WebCrypto + a WASM Argon2id, so the exact same code
// runs in the Tauri webview (WKWebView on macOS, WebView2 on Windows) and in a browser.
//
// Envelope scheme:
//   password ──Argon2id(salt)──▶ KEK ──AES-256-GCM──▶ wraps a random 256-bit data key (DEK)
//   DEK ──AES-256-GCM, fresh 96-bit IV per write, AAD = context──▶ bills database and every scan
// Changing the password only re-wraps the DEK; the data itself never has to be re-encrypted.
import { argon2id } from "hash-wasm";

/** Stored next to the data (vault.json). Holds nothing secret on its own. */
export interface KeyFile {
  v: 1;
  kdf: { name: "argon2id"; m: number; t: number; p: number; salt: string };
  /** The DEK, AES-GCM encrypted under the KEK. */
  wrapped: { iv: string; ct: string };
}

/** Bytes backed by a plain ArrayBuffer, which is what WebCrypto accepts. */
export type Bytes = Uint8Array<ArrayBuffer>;

export class WrongPassword extends Error {
  constructor() { super("Wrong password"); }
}

// RFC 9106 §4 second recommended option: 64 MiB, 3 passes, 4 lanes.
const KDF = { m: 64 * 1024, t: 3, p: 4 };
const WRAP_AAD = "ihatebills/dek/v1";
/** Sealed blobs start with "IHB" + format version; no PDF, PNG, JPEG or JSON file does. */
const MAGIC = new Uint8Array([0x49, 0x48, 0x42, 0x01]);
const IV_LEN = 12;

const enc = new TextEncoder();
const subtle = () => {
  if (!globalThis.crypto?.subtle) throw new Error("Encryption needs a secure context (HTTPS or the desktop app).");
  return globalThis.crypto.subtle;
};
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const b64 = (b: Bytes) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKek(password: string, kdf: KeyFile["kdf"]): Promise<CryptoKey> {
  const raw = (await argon2id({
    password: password.normalize("NFC"),
    salt: unb64(kdf.salt),
    memorySize: kdf.m,
    iterations: kdf.t,
    parallelism: kdf.p,
    hashLength: 32,
    outputType: "binary",
  })) as Bytes;
  try {
    return await subtle().importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
  } finally {
    raw.fill(0);
  }
}

/** The DEK as a non-extractable key: page code can use it but never read its bytes. */
const importDek = (raw: Bytes) => subtle().importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);

async function wrap(raw: Bytes, password: string): Promise<KeyFile> {
  const kdf = { name: "argon2id" as const, ...KDF, salt: b64(random(16)) };
  const kek = await deriveKek(password, kdf);
  const iv = random(IV_LEN);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(WRAP_AAD) }, kek, raw));
  return { v: 1, kdf, wrapped: { iv: b64(iv), ct: b64(ct) } };
}

async function unwrapRaw(file: KeyFile, password: string): Promise<Bytes> {
  if (file.v !== 1 || file.kdf.name !== "argon2id") throw new Error("This vault was made by a newer version of ihatebills.");
  const kek = await deriveKek(password, file.kdf);
  try {
    const raw = await subtle().decrypt(
      { name: "AES-GCM", iv: unb64(file.wrapped.iv), additionalData: enc.encode(WRAP_AAD) }, kek, unb64(file.wrapped.ct));
    return new Uint8Array(raw);
  } catch {
    throw new WrongPassword(); // GCM tag mismatch: wrong password or a tampered key file
  }
}

/** A brand-new random data key, wrapped under `password`. */
export async function createKeyFile(password: string): Promise<{ file: KeyFile; key: CryptoKey }> {
  const raw = random(32);
  try {
    return { file: await wrap(raw, password), key: await importDek(raw) };
  } finally {
    raw.fill(0);
  }
}

/** Throws WrongPassword. */
export async function unlockKeyFile(file: KeyFile, password: string): Promise<CryptoKey> {
  const raw = await unwrapRaw(file, password);
  try { return await importDek(raw); } finally { raw.fill(0); }
}

/** Same data key under a new password (new salt). Throws WrongPassword. */
export async function rewrapKeyFile(file: KeyFile, oldPassword: string, newPassword: string): Promise<KeyFile> {
  const raw = await unwrapRaw(file, oldPassword);
  try { return await wrap(raw, newPassword); } finally { raw.fill(0); }
}

/** `context` (e.g. "db" or "att:<file>") is authenticated, so a blob can't be swapped for another one. */
export async function seal(key: CryptoKey, data: Bytes, context: string): Promise<Bytes> {
  const iv = random(IV_LEN);
  const ct = await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad(context) }, key, data);
  const out = new Uint8Array(MAGIC.length + IV_LEN + ct.byteLength);
  out.set(MAGIC);
  out.set(iv, MAGIC.length);
  out.set(new Uint8Array(ct), MAGIC.length + IV_LEN);
  return out;
}

export async function unseal(key: CryptoKey, data: Bytes, context: string): Promise<Bytes> {
  if (!isSealed(data)) throw new Error("Not an encrypted file");
  const iv = data.subarray(MAGIC.length, MAGIC.length + IV_LEN);
  try {
    return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv, additionalData: aad(context) }, key, data.subarray(MAGIC.length + IV_LEN)));
  } catch {
    throw new Error("This file is damaged or was changed outside ihatebills.");
  }
}

export const isSealed = (data: Bytes) => data.length >= MAGIC.length + IV_LEN + 16 && MAGIC.every((b, i) => data[i] === b);

const aad = (context: string) => {
  const c = enc.encode(context);
  const out = new Uint8Array(MAGIC.length + c.length);
  out.set(MAGIC);
  out.set(c, MAGIC.length);
  return out;
};
