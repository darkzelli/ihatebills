import { beforeEach, describe, expect, it } from "vitest";
import type { Bytes } from "./crypto";
import { WrongPassword } from "./crypto";
import * as storage from "./storage";

const PW = "correct horse battery";
const DB = JSON.stringify({ version: 1, bills: [{ id: "b1", values: { providerName: "St. Secret Hospital" } }] });
const SCAN = new TextEncoder().encode("%PDF-1.7 patient: Jane Example");

/** In-memory backend; `failAfter` makes the nth write from now throw, like a crash. */
class Memory implements storage.Backend {
  files = new Map<string, Bytes>();
  failAfter = Infinity;
  async read(key: string) { return this.files.get(key) ?? null; }
  async write(key: string, data: Bytes) {
    if (this.failAfter-- <= 0) throw new Error("crash");
    this.files.set(key, data.slice());
  }
  async remove(key: string) { this.files.delete(key); }
  async listAttachments() { return [...this.files.keys()].filter((k) => k.startsWith("attachments/")).map((k) => k.slice(12)); }
  /** True if any stored byte string contains `needle`. */
  leaks(needle: string) { return [...this.files.values()].some((b) => new TextDecoder("latin1").decode(b).includes(needle)); }
}

let mem: Memory;
beforeEach(async () => {
  mem = new Memory();
  await storage.init(mem);
});

async function withData() {
  await storage.saveDb(DB);
  return storage.addAttachment("bill.pdf", SCAN);
}

describe("storage", () => {
  it("stores plain files while encryption is off", async () => {
    const a = await withData();
    expect(storage.useVault.getState().status).toBe("off");
    expect(await storage.loadDb()).toBe(DB);
    expect(await storage.readAttachment(a)).toEqual(SCAN);
    expect(mem.leaks("St. Secret Hospital")).toBe(true);
  });

  it("turning on encrypts everything already there", async () => {
    const a = await withData();
    await storage.enable(PW, DB);
    expect(storage.useVault.getState().status).toBe("on");
    expect(mem.files.has("bills.json")).toBe(false);
    expect(mem.leaks("St. Secret Hospital")).toBe(false);
    expect(mem.leaks("Jane Example")).toBe(false);
    expect(await storage.loadDb()).toBe(DB);
    expect(await storage.readAttachment(a)).toEqual(SCAN);
  });

  it("new saves and scans are encrypted, and need the password after a restart", async () => {
    await storage.enable(PW, "{}");
    await storage.saveDb(DB);
    const a = await storage.addAttachment("bill.pdf", SCAN);
    expect(mem.leaks("St. Secret Hospital") || mem.leaks("Jane Example")).toBe(false);

    await storage.init(mem);
    expect(storage.useVault.getState().status).toBe("locked");
    await expect(storage.loadDb()).rejects.toThrow(/locked/);
    await expect(storage.unlock("nope nope nope")).rejects.toBeInstanceOf(WrongPassword);
    await storage.unlock(PW);
    expect(await storage.loadDb()).toBe(DB);
    expect(await storage.readAttachment(a)).toEqual(SCAN);
  });

  it("turning off needs the password and decrypts everything", async () => {
    const a = await withData();
    await storage.enable(PW, DB);
    await expect(storage.disable("wrong wrong", DB)).rejects.toBeInstanceOf(WrongPassword);
    expect(storage.useVault.getState().status).toBe("on");
    await storage.disable(PW, DB);
    expect(storage.useVault.getState().status).toBe("off");
    expect([...mem.files.keys()].sort()).toEqual(["attachments/" + a.file, "bills.json"]);
    expect(mem.leaks("Jane Example")).toBe(true);

    await storage.init(mem);
    expect(storage.useVault.getState().status).toBe("off");
    expect(await storage.loadDb()).toBe(DB);
  });

  it("changing the password keeps the data readable", async () => {
    await withData();
    await storage.enable(PW, DB);
    await expect(storage.changePassword("wrong wrong", "new password")).rejects.toBeInstanceOf(WrongPassword);
    await storage.changePassword(PW, "new password");
    await storage.init(mem);
    await expect(storage.unlock(PW)).rejects.toBeInstanceOf(WrongPassword);
    await storage.unlock("new password");
    expect(await storage.loadDb()).toBe(DB);
  });

  it("finishes a 'turn on' that crashed partway, at the next unlock", async () => {
    const scans = [await withData(), await storage.addAttachment("b.png", SCAN), await storage.addAttachment("c.jpg", SCAN)];
    for (let n = 2; n <= 5; n++) {
      mem = new Memory();
      await storage.init(mem);
      await storage.saveDb(DB);
      for (const s of scans) await mem.write(`attachments/${s.file}`, SCAN);
      mem.failAfter = n; // bills.json + vault.json, then dies among the scans / db
      await expect(storage.enable(PW, DB)).rejects.toThrow("crash");
      mem.failAfter = Infinity;
      await storage.init(mem);
      expect(storage.useVault.getState().status).toBe("locked");
      await storage.unlock(PW);
      expect(mem.leaks("Jane Example") || mem.leaks("St. Secret Hospital")).toBe(false);
      expect(await storage.loadDb()).toBe(DB);
      for (const s of scans) expect(await storage.readAttachment(s)).toEqual(SCAN);
    }
  });

  it("rolls back a 'turn off' that crashed partway, at the next unlock", async () => {
    const scans = [await withData(), await storage.addAttachment("b.png", SCAN)];
    await storage.enable(PW, DB);
    mem.failAfter = 2; // bills.json, one scan decrypted, then dies
    await expect(storage.disable(PW, DB)).rejects.toThrow("crash");
    // The in-session rollback also hit the "crash"; a restart has to sort it out.
    mem.failAfter = Infinity;
    await storage.init(mem);
    expect(storage.useVault.getState().status).toBe("locked");
    await storage.unlock(PW);
    expect(mem.leaks("Jane Example") || mem.leaks("St. Secret Hospital")).toBe(false);
    expect(await storage.loadDb()).toBe(DB);
    for (const s of scans) expect(await storage.readAttachment(s)).toEqual(SCAN);
  });

  it("serializes saves so the last one wins", async () => {
    await storage.enable(PW, "{}");
    await Promise.all([storage.saveDb("1"), storage.saveDb("2"), storage.saveDb("3")]);
    expect(await storage.loadDb()).toBe("3");
  });
});
