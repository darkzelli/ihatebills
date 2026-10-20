import { describe, expect, it } from "vitest";
import { createKeyFile, isSealed, rewrapKeyFile, seal, unlockKeyFile, unseal, WrongPassword } from "./crypto";

const text = (s: string) => new TextEncoder().encode(s);
const str = (b: Uint8Array) => new TextDecoder().decode(b);

describe("crypto", () => {
  it("seals and opens", async () => {
    const { key } = await createKeyFile("correct horse");
    const sealed = await seal(key, text("hello bills"), "db");
    expect(isSealed(sealed)).toBe(true);
    expect(str(sealed)).not.toContain("hello");
    expect(str(await unseal(key, sealed, "db"))).toBe("hello bills");
  });

  it("uses a fresh IV every time", async () => {
    const { key } = await createKeyFile("correct horse");
    const a = await seal(key, text("same"), "db");
    const b = await seal(key, text("same"), "db");
    expect(a).not.toEqual(b);
  });

  it("rejects a blob opened under another context", async () => {
    const { key } = await createKeyFile("correct horse");
    const sealed = await seal(key, text("scan"), "att:a.pdf");
    await expect(unseal(key, sealed, "att:b.pdf")).rejects.toThrow(/damaged/);
  });

  it("rejects tampered bytes", async () => {
    const { key } = await createKeyFile("correct horse");
    const sealed = await seal(key, text("scan"), "db");
    sealed[sealed.length - 1] ^= 1;
    await expect(unseal(key, sealed, "db")).rejects.toThrow(/damaged/);
  });

  it("unlocks with the right password only", async () => {
    const { file, key } = await createKeyFile("correct horse");
    const sealed = await seal(key, text("secret"), "db");
    await expect(unlockKeyFile(file, "wrong horse")).rejects.toBeInstanceOf(WrongPassword);
    const again = await unlockKeyFile(file, "correct horse");
    expect(str(await unseal(again, sealed, "db"))).toBe("secret");
  });

  it("keeps the data key across a password change", async () => {
    const { file, key } = await createKeyFile("old password");
    const sealed = await seal(key, text("secret"), "db");
    const next = await rewrapKeyFile(file, "old password", "new password");
    expect(next.kdf.salt).not.toBe(file.kdf.salt);
    await expect(unlockKeyFile(next, "old password")).rejects.toBeInstanceOf(WrongPassword);
    expect(str(await unseal(await unlockKeyFile(next, "new password"), sealed, "db"))).toBe("secret");
  });

  it("never hands out the data key's bytes", async () => {
    const { file, key } = await createKeyFile("correct horse");
    expect(key.extractable).toBe(false);
    expect(JSON.stringify(file)).toMatch(/"name":"argon2id"/);
  });

  it("doesn't mistake ordinary files for sealed ones", () => {
    expect(isSealed(text("%PDF-1.7 ......................................"))).toBe(false);
    expect(isSealed(new Uint8Array([0x89, 0x50, 0x4e, 0x47, ...new Array(40).fill(0)]))).toBe(false);
  });
});
